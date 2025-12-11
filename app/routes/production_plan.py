from flask import Blueprint, request, jsonify, session
from app.utils.db import get_connection
from app.utils.decorators import login_required
# from app.utils.helpers import format_timedelta, get_shift_times, _calculate_target_per_hour, shift_time

"""
CREATE TABLE `production_plan` (
    `id` int NOT NULL AUTO_INCREMENT,
    `pan_id` varchar(255) NOT NULL,
    `production_priorities` int DEFAULT NULL,
    `job_order` varchar(50) NOT NULL,
    `required_quantity` int DEFAULT NULL,
    `actual_quantity` int DEFAULT NULL,
    `delta` int GENERATED ALWAYS AS ((`required_quantity` - `actual_quantity`)) STORED,
    `comments` text,
    `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `closed_at` datetime DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_pan_job` (`pan_id`,`job_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
"""

bp = Blueprint("plan_production", __name__)

@bp.route("/production-plan/<string:pan_id>/jobs", methods=["GET"])
@login_required
def get_jobs(pan_id):
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM production_plan WHERE pan_id = %s ORDER BY production_priorities ASC", (pan_id,))
        jobs = cursor.fetchall()

        return jsonify({"status": "success", "data": jobs}), 200
    except Exception as e:
        print(f"Error fetching jobs: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500
    finally:
        cursor.close()
        conn.close()

@bp.route("/production-plan/<string:pan_id>/jobs/open", methods=["GET"])
@login_required
def get_open_jobs(pan_id):
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM production_plan WHERE pan_id = %s AND closed_at IS NULL ORDER BY production_priorities ASC;",(pan_id,))
        jobs = cursor.fetchall()

        return jsonify({"status": "success", "data": jobs}), 200
    except Exception as e:
        print(f"Error fetching jobs: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500
    finally:
        cursor.close()
        conn.close()

@bp.route("/production-plan/<string:pan_id>/jobs/closed", methods=["GET"])
@login_required
def get_closed_jobs(pan_id):
    limit = request.args.get("limit", default=10, type=int)

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT * FROM production_plan WHERE pan_id = %s AND closed_at IS NOT NULL "
            "ORDER BY closed_at DESC LIMIT %s;",
            (pan_id, limit),
        )
        rows = cursor.fetchall()
        jobs = []
        for r in rows:
            for dt_field in ("created_at", "updated_at", "closed_at"):
                if r.get(dt_field):
                    try:
                        r[dt_field] = r[dt_field].strftime("%Y-%m-%d %H:%M:%S")
                    except Exception:
                        r[dt_field] = str(r[dt_field])
            jobs.append(r)

        return jsonify({"status": "success", "data": jobs}), 200

    except Exception as e:
        print(f"Error fetching closed jobs: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500

    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()

@bp.route("/production-plan/add-job", methods=["POST"])
@login_required
def add_job():
    data = request.get_json()
    pan_id = data.get("pan")
    job_order = data.get("job")
    required_quantity = data.get("req")

    if not pan_id or not job_order or required_quantity is None:
        return jsonify({"status": "error", "message": "Missing required fields"}), 400
    
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM production_plan WHERE pan_id = %s AND job_order = %s", (pan_id, job_order))
        existing_job = cursor.fetchone()
        if existing_job:
            return jsonify({"status": "error", "message": "Job order already exists for this PAN"}), 400
        
        cursor.execute("SELECT COUNT(*) AS job_count FROM production_plan WHERE pan_id = %s", (pan_id,))
        job_count_result = cursor.fetchone()['job_count']

        cursor.execute(
            "INSERT INTO production_plan (pan_id, job_order, required_quantity, actual_quantity, production_priorities) VALUES (%s, %s, %s, %s, %s)",
            (pan_id, job_order, required_quantity, 0, job_count_result + 1)
        )

        new_job_id = cursor.lastrowid

        conn.commit()

        return jsonify({"status": "success", "message": "Job added successfully", "id": new_job_id}), 201
    except Exception as e:
        print(f"Error adding job: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500
    finally:
        cursor.close()
        conn.close()

@bp.route("/production-plan/update-job-data/<int:job_id>", methods=["PUT"])
@login_required
def update_job(job_id):
    data = request.get_json() or {}

    field = data.get("field")
    value = data.get("value")

    allowed_fields = {
        "actual_quantity": "actual_quantity",
        "comments": "comments",
    }

    if field not in allowed_fields:
        return jsonify({
            "status": "error",
            "message": f"Campo '{field}' no permitido."
        }), 400

    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id, required_quantity, actual_quantity, closed_at FROM production_plan WHERE id = %s;", (job_id,))
        job = cursor.fetchone()

        if not job:
            return jsonify({"status": "error", "message": "Job not found"}), 404

        if field == "actual_quantity":
            try:
                value = int(value)
            except:
                return jsonify({"status": "error", "message": "Actual quantity must be an integer"}), 400

            if value < 0:
                return jsonify({"status": "error", "message": "Actual quantity cannot be negative"}), 400

        updates = [(allowed_fields[field], value)]

        if field == "actual_quantity":
            if value >= job["required_quantity"]:
                updates.append(("closed_at", "NOW()"))
            else:
                updates.append(("closed_at", None))

        for column, val in updates:
            if val == "NOW()":
                cursor.execute(f"UPDATE production_plan SET {column} = NOW() WHERE id = %s;", (job_id,))
            else:
                cursor.execute(f"UPDATE production_plan SET {column} = %s WHERE id = %s;", (val, job_id))

        conn.commit()

        cursor.execute("SELECT * FROM production_plan WHERE id = %s;", (job_id,))
        updated = cursor.fetchone()

        return jsonify({
            "status": "success",
            "message": "Job updated successfully",
            "data": updated
        }), 200

    except Exception as e:
        print(f"Error updating job: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500

    finally:
        cursor.close()
        conn.close()

@bp.route("/production-plan/update-job-priorities/<int:job_id>", methods=["PUT"])
@login_required
def priorities(job_id):
    data = request.get_json()
    priorities = data.get("new_priorities")

    if priorities is None:
        return jsonify({"status": "error", "message": "Missing new position"}), 400
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("UPDATE production_plan SET production_priorities = %s WHERE id = %s", (priorities, job_id))
        
        conn.commit()
        return jsonify({"status": "success", "message": "Job priorities updated successfully"}), 200
    except Exception as e:
        print(f"Error updating job priorities: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500
    finally:
        cursor.close()
        conn.close()

@bp.route("/production-plan/delete-job", methods=["DELETE"])
@login_required
def delete_job():
    data = request.get_json()
    job_id = data.get("id")
    if not job_id:
        return jsonify({"status": "error", "message": "Missing job ID"}), 400
    
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM production_plan WHERE id = %s", (job_id,))
        conn.commit()

        return jsonify({"status": "success", "message": "Job deleted successfully"}), 200
    except Exception as e:
        print(f"Error deleting job: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500
    finally:
        cursor.close()
        conn.close()
