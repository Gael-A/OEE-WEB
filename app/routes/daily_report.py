from flask import Blueprint, request, jsonify, session
from app.utils.db import get_connection
from app.utils.decorators import login_required
from app.utils.helpers import format_timedelta, get_shift_times, _calculate_target_per_hour, shift_time, get_week_dates, get_weekday, timedelta_to_hhmm
from datetime import timedelta, datetime
import decimal
from math import ceil

bp = Blueprint("set_report", __name__)


@bp.route("/create-daily-report", methods=["POST"])
@login_required
def create_daily_report():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Petición inválida, se esperaba JSON."}), 400

    pan = data.get("pan")
    shift = data.get("shift")
    report_date = data.get("date")
    part_no = data.get("part_no")
    order = data.get("order")
    quantity = data.get("quantity")
    op_no = data.get("op_no")
    created_by = session.get("user_id")

    if not all([report_date, pan, shift, part_no, order, quantity, op_no, created_by]):
        return jsonify({"error": "Faltan campos obligatorios en el encabezado."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        last_end_hour = None
        find_prev_sql = """
            SELECT id FROM daily_production_report
            WHERE date = %s AND pan = %s AND shift = %s
            ORDER BY created_at DESC
            LIMIT 1
        """
        cursor.execute(find_prev_sql, (report_date, pan, shift))
        prev_report = cursor.fetchone()

        if prev_report:
            prev_report_id = prev_report["id"]
            find_last_hour_sql = "SELECT MAX(end_hour) as last_hour FROM hourly_production_report WHERE daily_id = %s"
            cursor.execute(find_last_hour_sql, (prev_report_id,))
            last_hour_result = cursor.fetchone()
            if last_hour_result and last_hour_result["last_hour"]:
                td = last_hour_result["last_hour"]
                if isinstance(td, timedelta):
                    total_seconds = int(td.total_seconds())
                    hours, remainder = divmod(total_seconds, 3600)
                    minutes, seconds = divmod(remainder, 60)
                    last_end_hour = f"{hours:02d}:{minutes:02d}:{seconds:02d}"


        sql = """
            INSERT INTO daily_production_report (date, pan, shift, part_no, `order`, quantity, op_no, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        values = (report_date, pan, shift, part_no, order, quantity, op_no, created_by)

        cursor.execute(sql, values)
        daily_report_id = cursor.lastrowid
        
        target_per_hour = None
        if part_no:
            target_per_hour = _calculate_target_per_hour(cursor, daily_report_id, part_no, True, updates={"op_no": op_no})
            real_target_per_hour = _calculate_target_per_hour(cursor, daily_report_id, part_no, False, updates={"op_no": op_no})

        conn.commit()

        return (
            jsonify(
                {
                    "message": "Reporte diario creado.",
                    "daily_id": daily_report_id,
                    "last_end_hour": last_end_hour,
                    "target_per_hour": target_per_hour,
                    "real_target_per_hour": real_target_per_hour,
                }
            ),
            201,
        )

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/get-open-daily-report", methods=["GET"])
def get_open_daily_report():
    report_date = request.args.get("date")
    pan = request.args.get("pan")
    shift = request.args.get("shift")

    if not all([report_date, pan, shift]):
        return jsonify({"error": "Faltan parámetros (date, pan, shift)."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT dr.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
            FROM daily_production_report dr
            LEFT JOIN users u ON dr.created_by = u.id
            WHERE dr.date = %s AND dr.pan = %s AND dr.shift = %s AND dr.is_closed = 0
            ORDER BY dr.created_at DESC
            LIMIT 1
        """, (report_date, pan, shift))

        report_header = cursor.fetchone()

        if not report_header:
            return jsonify({"report_header": None}), 200

        target_per_hour = None
        if report_header.get("part_no"):
            target_per_hour = _calculate_target_per_hour(cursor, report_header["id"], report_header["part_no"])
            real_target_per_hour = _calculate_target_per_hour(cursor, report_header["id"], report_header["part_no"], False)

        daily_report_id = report_header["id"]

        cursor.execute("""
            SELECT * FROM hourly_production_report 
            WHERE daily_id = %s 
            ORDER BY start_hour ASC
        """, (daily_report_id,))
        
        hourly_rows = cursor.fetchall()

        if hourly_rows:
            cursor.execute("SELECT MAX(created_at) AS last_update FROM hourly_production_report WHERE daily_id = %s", (daily_report_id,))
            last_update_result = cursor.fetchone()
            last_update_timestamp = (
                last_update_result["last_update"].strftime("%d/%m/%y %H:%M")
                if last_update_result and last_update_result["last_update"]
                else None
            )
        else:
            last_update_timestamp = report_header["created_at"].strftime("%d/%m/%y %H:%M")

        last_end_hour = None

        if hourly_rows:
            last_end_hour = hourly_rows[-1]["end_hour"]

            if isinstance(last_end_hour, timedelta):
                total_seconds = int(last_end_hour.total_seconds())
                h, r = divmod(total_seconds, 3600)
                m, _ = divmod(r, 60)
                last_end_hour = f"{h:02d}:{m:02d}"

        else:
            report_created_at = report_header["created_at"]

            cursor.execute("""
                SELECT id FROM daily_production_report
                WHERE date = %s AND pan = %s AND shift = %s AND created_at < %s
                ORDER BY created_at DESC
                LIMIT 1
            """, (report_date, pan, shift, report_created_at))
            
            prev_report = cursor.fetchone()

            if prev_report:
                cursor.execute("""
                    SELECT MAX(end_hour) AS last_hour 
                    FROM hourly_production_report 
                    WHERE daily_id = %s
                """, (prev_report["id"],))
                
                last_hour_result = cursor.fetchone()
                
                if last_hour_result and last_hour_result["last_hour"]:
                    td = last_hour_result["last_hour"]
                    total_seconds = int(td.total_seconds())
                    h, r = divmod(total_seconds, 3600)
                    m, _ = divmod(r, 60)
                    last_end_hour = f"{h:02d}:{m:02d}"

        accumulated = 0

        for row in hourly_rows:
            for key, value in row.items():
                if isinstance(value, timedelta):
                    total_seconds = int(value.total_seconds())
                    h, r = divmod(total_seconds, 3600)
                    m, _ = divmod(r, 60)
                    row[key] = f"{h:02d}:{m:02d}"

            accumulated += row.get("production", 0) or 0
            row["accumulated"] = accumulated
            row["difference"] = (row.get("production") or 0) - (row.get("target") or 0)

        return jsonify({
            "report_header": report_header,
            "hourly_rows": hourly_rows,
            "last_end_hour": last_end_hour,
            "last_update_timestamp": last_update_timestamp,
            "target_per_hour": target_per_hour,
            "real_target_per_hour": real_target_per_hour
        }), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500

    finally:
        if conn:
            conn.close()

@bp.route("/get-daily-report-for-date", methods=["GET"])
@login_required
def get_daily_report_for_date():
    if session.get('role') != 'admin':
        return jsonify({"error": "Acceso no autorizado."}), 403

    report_date = request.args.get("date")
    pan = request.args.get("pan")
    shift = request.args.get("shift")

    if not all([report_date, pan, shift]):
        return jsonify({"error": "Faltan parámetros (date, pan, shift)."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT dr.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
            FROM daily_production_report dr
            LEFT JOIN users u ON dr.created_by = u.id
            WHERE dr.date = %s AND dr.pan = %s AND dr.shift = %s
            ORDER BY dr.created_at DESC
            LIMIT 1
        """, (report_date, pan, shift))

        report_header = cursor.fetchone()

        if not report_header:
            return jsonify({"report_header": None}), 200

        target_per_hour = None
        if report_header.get("part_no"):
            target_per_hour = _calculate_target_per_hour(cursor, report_header["id"], report_header["part_no"])

        daily_report_id = report_header["id"]
        cursor.execute("SELECT * FROM hourly_production_report WHERE daily_id = %s ORDER BY start_hour ASC", (daily_report_id,))
        hourly_rows = cursor.fetchall()

        last_update_timestamp = None
        if hourly_rows:
            cursor.execute("SELECT MAX(created_at) as last_update FROM hourly_production_report WHERE daily_id = %s", (daily_report_id,))
            last_update_result = cursor.fetchone()
            if last_update_result and last_update_result["last_update"]:
                last_update_timestamp = last_update_result["last_update"].strftime("%d/%m/%y %H:%M")
        else:
            last_update_timestamp = report_header["created_at"].strftime("%d/%m/%y %H:%M")

        last_end_hour = None
        if not hourly_rows:
            report_created_at = report_header["created_at"]
            cursor.execute("""
                SELECT id FROM daily_production_report
                WHERE date = %s AND pan = %s AND shift = %s AND created_at < %s
                ORDER BY created_at DESC
                LIMIT 1
            """, (report_date, pan, shift, report_created_at))
            prev_report = cursor.fetchone()

            if prev_report:
                cursor.execute("SELECT MAX(end_hour) as last_hour FROM hourly_production_report WHERE daily_id = %s", (prev_report["id"],))
                last_hour_result = cursor.fetchone()
                if last_hour_result and last_hour_result["last_hour"]:
                    td = last_hour_result["last_hour"]
                    total_seconds = int(td.total_seconds())
                    hours, remainder = divmod(total_seconds, 3600)
                    minutes, seconds = divmod(remainder, 60)
                    last_end_hour = f"{hours:02d}:{minutes:02d}:{seconds:02d}"

        accumulated = 0
        for row in hourly_rows:
            for key, value in row.items():
                if isinstance(value, timedelta):
                    total_seconds = int(value.total_seconds())
                    h, r = divmod(total_seconds, 3600)
                    m, _ = divmod(r, 60)
                    row[key] = f"{h:02d}:{m:02d}"

            accumulated += row.get("production", 0) or 0
            row["accumulated"] = accumulated
            row["difference"] = (row.get("production", 0) or 0) - (row.get("target", 0) or 0)

        return jsonify({
            "report_header": report_header,
            "hourly_rows": hourly_rows,
            "last_end_hour": last_end_hour,
            "last_update_timestamp": last_update_timestamp,
            "target_per_hour": target_per_hour
        }), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/get-last-daily-report", methods=["GET"])
def get_last_daily_report():
    report_date = request.args.get("date")
    pan = request.args.get("pan")
    shift = request.args.get("shift")

    if not all([report_date, pan, shift]):
        return jsonify({"error": "Faltan parámetros (date, pan, shift)."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT dr.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
            FROM daily_production_report dr
            LEFT JOIN users u ON dr.created_by = u.id
            WHERE dr.date = %s AND dr.pan = %s AND dr.shift = %s
            ORDER BY dr.created_at DESC
            LIMIT 1
        """, (report_date, pan, shift))

        report_header = cursor.fetchone()

        if not report_header:
            return jsonify({"report_header": None}), 200

        target_per_hour = None
        if report_header.get("part_no"):
            target_per_hour = _calculate_target_per_hour(cursor, report_header["id"], report_header["part_no"])

        daily_report_id = report_header["id"]
        cursor.execute("SELECT * FROM hourly_production_report WHERE daily_id = %s ORDER BY start_hour ASC", (daily_report_id,))
        hourly_rows = cursor.fetchall()

        last_update_timestamp = None
        if hourly_rows:
            cursor.execute("SELECT MAX(created_at) as last_update FROM hourly_production_report WHERE daily_id = %s", (daily_report_id,))
            last_update_result = cursor.fetchone()
            if last_update_result and last_update_result["last_update"]:
                last_update_timestamp = last_update_result["last_update"].strftime("%d/%m/%y %H:%M")
        else:
            last_update_timestamp = report_header["created_at"].strftime("%d/%m/%y %H:%M")

        last_end_hour = None
        if not hourly_rows:
            report_created_at = report_header["created_at"]
            cursor.execute("""
                SELECT id FROM daily_production_report
                WHERE date = %s AND pan = %s AND shift = %s AND created_at < %s
                ORDER BY created_at DESC
                LIMIT 1
            """, (report_date, pan, shift, report_created_at))
            prev_report = cursor.fetchone()

            if prev_report:
                cursor.execute("SELECT MAX(end_hour) as last_hour FROM hourly_production_report WHERE daily_id = %s", (prev_report["id"],))
                last_hour_result = cursor.fetchone()
                if last_hour_result and last_hour_result["last_hour"]:
                    td = last_hour_result["last_hour"]
                    total_seconds = int(td.total_seconds())
                    h, r = divmod(total_seconds, 3600)
                    m, s = divmod(r, 60)
                    last_end_hour = f"{h:02d}:{m:02d}:{s:02d}"

        accumulated = 0
        for row in hourly_rows:
            for key, value in row.items():
                if isinstance(value, timedelta):
                    total_seconds = int(value.total_seconds())
                    h, r = divmod(total_seconds, 3600)
                    m, _ = divmod(r, 60)
                    row[key] = f"{h:02d}:{m:02d}"

            accumulated += row.get("production", 0) or 0
            row["accumulated"] = accumulated
            row["difference"] = (row.get("production", 0) or 0) - (row.get("target", 0) or 0)

        return jsonify({
            "report_header": report_header,
            "hourly_rows": hourly_rows,
            "last_end_hour": last_end_hour,
            "last_update_timestamp": last_update_timestamp,
            "target_per_hour": target_per_hour
        }), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/get-closed-daily-reports", methods=["GET"])
def get_closed_daily_reports():
    report_date = request.args.get("date")
    pan = request.args.get("pan")
    shift = request.args.get("shift")

    if not all([report_date, pan, shift]):
        return jsonify({"error": "Faltan parámetros (date, pan, shift)."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT dr.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
            FROM daily_production_report dr
            LEFT JOIN users u ON dr.created_by = u.id
            WHERE dr.date = %s AND dr.pan = %s AND dr.shift = %s AND dr.is_closed = 1
            ORDER BY dr.created_at ASC
        """, (report_date, pan, shift))

        reports = cursor.fetchall()

        for report in reports:
            if report.get("part_no"):
                report["target_per_hour"] = _calculate_target_per_hour(cursor, report["id"], report["part_no"])

            for key, value in report.items():
                if isinstance(value, timedelta):
                    total_seconds = int(value.total_seconds())
                    h, r = divmod(total_seconds, 3600)
                    m, _ = divmod(r, 60)
                    report[key] = f"{h:02d}:{m:02d}"

        return jsonify(reports), 200
    except Exception as e:
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/get-daily-report/<int:daily_id>", methods=["GET"])
def get_daily_report_by_id(daily_id):
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM daily_production_report WHERE id = %s", (daily_id,))
        report = cursor.fetchone()

        if not report:
            return jsonify({"report": None}), 200

        report["target_per_hour"] = None
        if report.get("part_no"):
            report["target_per_hour"] = _calculate_target_per_hour(cursor, daily_id, report["part_no"])

        return jsonify({"report": report}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/update-daily-report", methods=["POST"])
@login_required
def update_daily_report():
    data = request.get_json()
    daily_id = data.get("daily_id")

    if not daily_id:
        return jsonify({"error": "Falta el ID del reporte."}), 400

    fields = ["pan", "shift", "part_no", "order", "quantity", "op_no"]
    updates = {f: data.get(f) for f in fields if data.get(f) is not None}

    if not updates:
        return jsonify({"error": "No hay datos para actualizar."}), 400

    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values())
    values.append(daily_id)

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        sql = f"UPDATE daily_production_report SET {set_clause} WHERE id = %s"
        cursor.execute(sql, values)
        
        target_per_hour = None
        if "part_no" in updates or "op_no" in updates:
            part_no_for_calc = updates.get("part_no", None)
            
            # Si part_no no está en los updates, lo obtenemos de la base de datos
            if not part_no_for_calc:
                cursor.execute("SELECT part_no FROM daily_production_report WHERE id = %s", (daily_id,))
                row = cursor.fetchone()
                part_no_for_calc = row["part_no"] if row else None
                
            if part_no_for_calc:
                target_per_hour = _calculate_target_per_hour(cursor, daily_id, part_no_for_calc, True,  updates=updates)

        conn.commit()

        return jsonify({"message": "Reporte diario actualizado.", "target_per_hour": target_per_hour}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/close-daily-report", methods=["POST"])
@login_required
def close_daily_report():
    data = request.get_json()
    daily_id = data.get("daily_id")

    if not daily_id:
        return jsonify({"error": "Falta el ID del reporte."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        sql = "UPDATE daily_production_report SET is_closed = 1 WHERE id = %s"
        cursor.execute(sql, (daily_id,))

        if cursor.rowcount == 0:
            return jsonify({"error": "No se encontró el reporte para cerrar."}), 404

        conn.commit()
        return jsonify({"message": "Reporte cerrado exitosamente."}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/cancel-daily-report", methods=["POST"])
@login_required
def cancel_daily_report():
    data = request.get_json()
    daily_id = data.get("daily_id")

    if not daily_id:
        return jsonify({"error": "Falta el ID del reporte."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        check_sql = "SELECT id FROM hourly_production_report WHERE daily_id = %s LIMIT 1"
        cursor.execute(check_sql, (daily_id,))
        if cursor.fetchone():
            return jsonify({"error": "No se puede cancelar el reporte porque ya contiene registros horarios."}), 409

        sql = "DELETE FROM daily_production_report WHERE id = %s"
        cursor.execute(sql, (daily_id,))
        
        conn.commit()
        return jsonify({"message": "Reporte cancelado exitosamente."}), 200

    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500
    finally:
        if conn: conn.close()

@bp.route("/get-daily-result")
def get_daily_report_result():
    report_date = request.args.get("date")
    pan = request.args.get("pan")
    shift = request.args.get("shift")

    if not all([report_date, pan, shift]):
        return jsonify({"error": "Faltan parámetros (date, pan, shift)."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id FROM daily_production_report
            WHERE date = %s AND pan = %s AND shift = %s
        """, (report_date, pan, shift))
        daily_reports = cursor.fetchall()

        if not daily_reports:
            return jsonify({
                "total_target": 0,
                "total_production": 0,
                "total_difference": 0,
                "total_defects": 0,
                "total_efficiency": 0
            }), 200

        daily_ids = [report['id'] for report in daily_reports]
        id_placeholders = ','.join(['%s'] * len(daily_ids))

        query = f"""
            SELECT
                SUM(target) as total_target,
                SUM(production) as total_production,
                SUM(defects) as total_defects
            FROM hourly_production_report
            WHERE daily_id IN ({id_placeholders})
        """
        cursor.execute(query, tuple(daily_ids))
        totals = cursor.fetchone()

        total_target = totals.get('total_target') or 0
        total_production = totals.get('total_production') or 0
        total_defects = totals.get('total_defects') or 0
        total_difference = total_production - total_target
        
        total_efficiency = 0
        if total_target > 0:
            total_efficiency = round((total_production / total_target) * 100, 2)

        return jsonify({
            "total_target": int(total_target),
            "total_production": int(total_production),
            "total_difference": int(total_difference),
            "total_defects": int(total_defects),
            "total_efficiency": total_efficiency
        }), 200

    except Exception as e:
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500
    finally:
        if conn:
            conn.close()

#############################################################################################

@bp.route("/add-hourly-report", methods=["POST"])
@login_required
def add_hourly_report():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Petición inválida, se esperaba JSON."}), 400

    daily_id = data.get("daily_id")
    time_range = data.get("time_range", "00:00 - 00:00").split(" - ")
    if len(time_range) != 2:
        return jsonify({"error": "Formato de time_range inválido."}), 400

    start_hour = f"{time_range[0]}:00"
    end_hour = f"{time_range[1]}:00"
    target = data.get("target")
    production = data.get("production")
    defects = data.get("defects")
    incident_notes = data.get("incident_notes")

    if not all([daily_id is not None, target is not None, production is not None]):
        return jsonify({"error": "Faltan campos obligatorios en la fila."}), 400

    try:
        target_val = float(target)
        production_val = float(production)
    except (ValueError, TypeError):
        return jsonify({"error": "Target y production deben ser números válidos."}), 400

    if defects == "":
        defects = 0

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        sql = """
            INSERT INTO hourly_production_report 
            (daily_id, start_hour, end_hour, target, production, defects, incident_notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """
        values = (
            daily_id,
            start_hour,
            end_hour,
            target_val,
            production_val,
            defects,
            incident_notes,
        )

        cursor.execute(sql, values)
        # Obtener ID recién insertado (MySQL-style)
        hourly_id = cursor.lastrowid
        conn.commit()

        return jsonify({
            "message": "Registro horario guardado.",
            "hourly_id": hourly_id
        }), 201

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/get-hourly-by-daily/<int:daily_id>", methods=["GET"])
def get_hourly_by_daily(daily_id):
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()  # ya es dictionary según dijiste

        cursor.execute("""
            SELECT id, start_hour, end_hour, target, production, defects, incident_notes
            FROM hourly_production_report
            WHERE daily_id = %s
            ORDER BY start_hour
        """, (daily_id,))

        rows = cursor.fetchall()

        def format_timedelta(td):
            if td is None:
                return None
            total_seconds = int(td.total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            seconds = total_seconds % 60
            return f"{hours:02}:{minutes:02}:{seconds:02}"

        accumulated = 0

        for row in rows:

            # Convertir TIME -> string (incluye 00:00:00)
            if row["start_hour"] is not None:
                row["start_hour"] = format_timedelta(row["start_hour"])

            if row["end_hour"] is not None:
                row["end_hour"] = format_timedelta(row["end_hour"])

            production = row["production"] or 0
            target = row["target"] or 0

            accumulated += production

            row["accumulated"] = accumulated
            row["difference"] = production - target

        return jsonify({"rows": rows}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if conn:
            conn.close()

@bp.route("/update-hourly-report", methods=["POST"])
@login_required
def update_hourly_report():
    data = request.get_json()
    hourly_id = data.get("id")

    if not hourly_id:
        return jsonify({"error": "Falta el ID del registro horario."}), 400

    fields = ["start_hour", "end_hour", "target", "production", "defects", "incident_notes"]
    updates = {}

    for field in fields:
        if field in data:
            value = data[field]
            if field in ["target", "production", "defects"]:
                if value in (None, '', 'undefined'):
                    updates[field] = 0
                else:
                    try:
                        updates[field] = int(value)
                    except (ValueError, TypeError):
                        return jsonify({"error": f"Valor inválido para el campo '{field}'. Se esperaba un número."}), 400
            else:
                updates[field] = value

    if not updates:
        return jsonify({"error": "No hay campos para actualizar."}), 400

    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values())
    values.append(hourly_id)

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        sql = f"UPDATE hourly_production_report SET {set_clause}, created_at = NOW() WHERE id = %s"
        cursor.execute(sql, values)
        conn.commit()
        
        cursor.execute("""
            SELECT daily_id, start_hour, end_hour, target, production, defects, incident_notes
            FROM hourly_production_report
            WHERE id = %s
        """, (hourly_id,))
        row = cursor.fetchone()

        cursor.execute("""
            SELECT SUM(production) as total_prev
            FROM hourly_production_report
            WHERE daily_id = %s AND start_hour <= %s
        """, (row["daily_id"], row["start_hour"]))
        total_prev = cursor.fetchone()["total_prev"] or 0

        row["accumulated"] = total_prev
        row["difference"] = row["production"] - row["target"]

        for key in ("start_hour", "end_hour"):
            if isinstance(row[key], timedelta):
                row[key] = format_timedelta(row[key])

        return jsonify({
            "message": "Registro horario actualizado.",
            "updated": row
        }), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/delete-hourly-report/<int:hourly_id>", methods=["DELETE"])
@login_required
def delete_hourly_report(hourly_id):
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM hourly_production_report WHERE id = %s", (hourly_id,))
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({"error": "Registro no encontrado."}), 404

        return jsonify({"message": "Registro horario eliminado."}), 200
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/report-attribute-data")
def get_report_attribute_data():
    date = request.args.get("date")
    pan = request.args.get("pan")
    shift = request.args.get("shift")
    attribute = request.args.get("attribute")
    target_key = request.args.get("target")
    selector = request.args.get("selector")

    if not all([date, pan, shift, attribute, target_key, selector]):
        return jsonify({"error": "Faltan parámetros (date, pan, shift, attribute, target, selector)."}), 400

    try:
        conn = get_connection()
        cursor = conn.cursor()

        valid_shifts = ["1", "2", "3"]
        shift_values = valid_shifts if shift not in valid_shifts else [shift]

        results = []

        # =========================
        # START SHIFT
        # =========================
        if attribute == "start_shift":

            if selector == "week":

                language = session.get("language", "en")
                
                SHIFT_TARGETS = {
                    '1': "6:45",
                    '2': "16:35",
                    '3': "00:55"
                }

                SHIFT_TEXT = {
                    "es": "Turno",
                    "en": "Shift",
                    "pl": "Zakręt"
                }

                for dt in get_week_dates(date):
                    cursor.execute(
                        """
                        SELECT
                            ssr.first_piece_at,
                            ssr.first_piece_comment,
                            dpr.shift
                        FROM sql_xct_db.shift_start_report ssr
                        INNER JOIN sql_xct_db.daily_production_report dpr
                            ON ssr.daily_id = dpr.id
                        WHERE
                            dpr.date = %s
                            AND dpr.pan = %s
                            AND dpr.shift = %s
                        ORDER BY ssr.id DESC
                        LIMIT 1;
                        """,
                        (dt, pan, shift),
                    )

                    row = cursor.fetchone()

                    if row:
                        first_piece_at = timedelta_to_hhmm(row["first_piece_at"])
                        comment = row["first_piece_comment"]
                    else:
                        first_piece_at = None
                        comment = "S/C"

                    results.append({
                        "id": f"{get_weekday(dt, language)['name']}-{SHIFT_TEXT[language]} {shift}",
                        "start_shift": first_piece_at,
                        "comment": comment,
                        "day": get_weekday(dt)['name'].lower(),
                        "target": SHIFT_TARGETS[str(shift)]
                    })

                conn.close()
                return jsonify(results)

            elif selector == "month":
                return jsonify({"error": "Selector 'month' aún no implementado"}), 400

            else:
                return jsonify({"error": "Selector inválido. Usa 'week' o 'month'."}), 400
        else:
            if selector == "hourly":
                cursor.execute(
                    f"""
                    SELECT id
                    FROM daily_production_report
                    WHERE date = %s AND pan = %s AND shift IN ({','.join(['%s'] * len(shift_values))})
                    """,
                    (date, pan, *shift_values),
                )
                daily_reports = cursor.fetchall()

                for report in daily_reports:
                    daily_id = report["id"]
                    cursor.execute(
                        f"""
                        SELECT start_hour, end_hour, {attribute} AS attr_val, {target_key} AS target_val
                        FROM hourly_production_report
                        WHERE daily_id = %s
                        """,
                        (daily_id,),
                    )
                    rows = cursor.fetchall()
                    for row in rows:
                        start = str(row['start_hour'])[:-3]
                        end = str(row['end_hour'])[:-3]
                        label = f"{start} {end}"
                        results.append({
                            "id": label,
                            attribute: row["attr_val"] or 0,
                            target_key: row["target_val"] or 0
                        })

            elif selector == "order":
                cursor.execute(
                    f"""
                    SELECT DISTINCT (`order` COLLATE utf8mb4_general_ci) AS `order`
                    FROM daily_production_report
                    WHERE date = %s
                        AND pan = %s
                        AND shift IN ({','.join(['%s'] * len(shift_values))});
                    """,
                    (date, pan, *shift_values),
                )
                active_orders = [row["order"] or "Sin orden" for row in cursor.fetchall()]

                if not active_orders:
                    return jsonify([])

                placeholders = ",".join(["%s"] * len(active_orders))
                
                cursor.execute(
                    f"""
                    SELECT
                        dpr.`order`,
                        dpr.quantity AS target_total,
                        SUM(hpr.{attribute}) AS attribute_total
                    FROM daily_production_report AS dpr
                    INNER JOIN hourly_production_report AS hpr ON hpr.daily_id = dpr.id
                    WHERE dpr.pan = %s
                        AND dpr.shift IN ({','.join(['%s'] * len(shift_values))})
                        AND dpr.`order` IN ({placeholders})
                    GROUP BY dpr.`order`, dpr.quantity;
                    """,
                    (pan, *shift_values, *active_orders),
                )
                
                results = []
                for row in cursor.fetchall():
                    results.append({
                        "id": row["order"].upper(),
                        attribute: row["attribute_total"] or 0,
                        target_key: row["target_total"] or 0
                    })

                return jsonify(results)
            
            elif selector == "total":
                cursor.execute(
                    f"""
                    SELECT id, part_no
                    FROM daily_production_report
                    WHERE date = %s
                        AND pan = %s
                        AND shift IN ({','.join(['%s'] * len(shift_values))})
                    """,
                    (date, pan, *shift_values),
                )
                reports = cursor.fetchall()

                if not reports:
                    return jsonify([])

                daily_ids = [r["id"] for r in reports]
                daily_report_ids = [r["id"] for r in reports]
                part_no_id = [r["part_no"] for r in reports][0] # Se toma el part_no del primer registro

                placeholders = ",".join(["%s"] * len(daily_ids))

                cursor.execute(
                    f"""
                    SELECT
                        SUM({attribute}) AS attr_sum
                    FROM hourly_production_report
                    WHERE daily_id IN ({placeholders})
                    """,
                    tuple(daily_ids),
                )
                row = cursor.fetchone()
                total_attribute = row["attr_sum"] or 0

                # Obtener target_per_hour
                target_per_hour = None
                if part_no_id:
                    target_per_hour = _calculate_target_per_hour(cursor, daily_report_ids, part_no_id, False)

                cursor.execute(
                    """
                    SELECT
                        SUM(duration) AS total_durations
                    FROM pan_schedule
                    WHERE pan_id = %s
                        AND NOT action = 'shift end';
                    """, (pan)
                )
                row = cursor.fetchone()
                total_duration = row["total_durations"] or 0

                total_target = (shift_time(shift) - (float(total_duration) / 60)) * target_per_hour

                results.append({
                    "id": pan,
                    attribute: total_attribute,
                    target_key: ceil(total_target / 5) * 5,
                    "excuses_time": total_duration,
                    "target_per_hour": target_per_hour,
                })

            else:
                return jsonify({"error": "Selector inválido. Usa 'hourly', 'total' u 'order'."}), 400

        conn.close()
        return jsonify(results)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

#############################################################################################

@bp.route("/machines-initial-status", methods=["GET"])
def get_machines_initial_status():
    date_str = request.args.get("date")
    shift = request.args.get("shift")
    pan = request.args.get("pan")

    if not all([date_str, shift, pan]):
        return jsonify({"error": "Faltan parámetros (date, shift, pan)."}), 400

    conn = None
    try:
        fecha_base = datetime.strptime(date_str, "%Y-%m-%d")
        start_time, end_time = get_shift_times(fecha_base, shift)

        user_id = session.get("user_id")
        now = datetime.now()

        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT machine_id, node_id FROM machines WHERE pan_id = %s", (pan,))
        machines = cursor.fetchall()

        machine_statuses = {}

        for machine in machines:
            machine_id = machine['machine_id']
            node_id = machine['node_id']

            cursor.execute("""
                SELECT is_on FROM machines_working
                WHERE machine_id = %s AND changed_at BETWEEN %s AND %s
                ORDER BY changed_at DESC LIMIT 1
            """, (machine_id, start_time, end_time))
            result = cursor.fetchone()

            if result is not None:
                machine_statuses[node_id] = bool(result['is_on'])
            else:
                cursor.execute("""
                    INSERT INTO machines_working (machine_id, changed_at, shift, is_on, changed_by)
                    VALUES (%s, %s, %s, %s, %s)
                """, (machine_id, now, shift, 1, user_id))
                machine_statuses[node_id] = True

        conn.commit()
        return jsonify(machine_statuses), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500

    finally:
        if conn:
            conn.close()

@bp.route("/machines-working", methods=["POST"])
@login_required
def create_machine_working():
    data = request.get_json()
    user_id = session.get("user_id")
    entries = data.get("entries", [])
    selected_date = data.get("selected_date")

    if not selected_date or not entries:
        return jsonify({"error": "Faltan datos requeridos"}), 400

    conn = get_connection()
    cursor = conn.cursor()

    try:
        now = datetime.now()
        inserted = []

        for entry in entries:
            node_id = entry.get("machine_id")
            is_on = entry.get("is_on")
            shift = entry.get("shift")

            if node_id is None or is_on is None or shift is None:
                continue

            cursor.execute("SELECT machine_id FROM machines WHERE node_id = %s", (node_id,))
            result = cursor.fetchone()
            if not result:
                continue

            machine_id = result['machine_id']

            query_last = """
                SELECT is_on FROM machines_working
                WHERE machine_id = %s AND shift = %s AND DATE(changed_at) = %s
                ORDER BY changed_at DESC
                LIMIT 1
            """
            cursor.execute(query_last, (machine_id, shift, selected_date))
            last = cursor.fetchone()

            if last is None or last['is_on'] != int(is_on):
                insert_query = """
                    INSERT INTO machines_working (machine_id, changed_at, shift, is_on, changed_by)
                    VALUES (%s, %s, %s, %s, %s)
                """
                cursor.execute(insert_query, (machine_id, now, shift, int(is_on), user_id))
                inserted.append(node_id)

        conn.commit()
        return jsonify({"message": "Cambios guardados", "inserted": inserted}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Error interno: {str(e)}"}), 500

    finally:
        cursor.close()
        conn.close()

@bp.route("/machines-working", methods=["GET"])
def get_all_machines_working():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM machines_working ORDER BY changed_at DESC")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)

@bp.route("/machines-working/<int:id>", methods=["GET"])
def get_machine_working(id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM machines_working WHERE id = %s", (id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if row:
        return jsonify(row)
    else:
        return jsonify({"error": "Registro no encontrado"}), 404

@bp.route("/machines-working/<int:id>", methods=["PUT"])
@login_required
def update_machine_working(id):
    data = request.get_json()
    shift = data.get("shift")
    is_on = data.get("is_on")
    user_id = session.get("user_id")

    if shift is None or is_on is None:
        return jsonify({"error": "Datos incompletos"}), 400

    query = """
        UPDATE machines_working
        SET shift = %s, is_on = %s, changed_by = %s
        WHERE id = %s
    """
    values = (shift, int(is_on), user_id, id)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(query, values)
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({"message": "Registro actualizado"})

@bp.route("/machines-working/<int:id>", methods=["DELETE"])
@login_required
def delete_machine_working(id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM machines_working WHERE id = %s", (id,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"message": "Registro eliminado"})

@bp.route("/machines-initial-status-view", methods=["GET"])
def view_machines_initial_status():
    date_str = request.args.get("date")
    shift = request.args.get("shift")
    pan = request.args.get("pan")

    if not all([date_str, shift, pan]):
        return jsonify({"error": "Faltan parámetros (date, shift, pan)."}), 400

    conn = None
    try:
        fecha_base = datetime.strptime(date_str, "%Y-%m-%d")
        start_time, end_time = get_shift_times(fecha_base, shift)

        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT machine_id, node_id FROM machines WHERE pan_id = %s", (pan,))
        machines = cursor.fetchall()

        machine_statuses = {}

        for machine in machines:
            machine_id = machine['machine_id']
            node_id = machine['node_id']

            cursor.execute("""
                SELECT is_on FROM machines_working
                WHERE machine_id = %s AND changed_at BETWEEN %s AND %s
                ORDER BY changed_at DESC LIMIT 1
            """, (machine_id, start_time, end_time))
            result = cursor.fetchone()

            machine_statuses[node_id] = bool(result['is_on']) if result else True

        return jsonify(machine_statuses), 200

    except Exception as e:
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500

    finally:
        if conn:
            conn.close()

#############################################################################################

"""
CREATE TABLE `shift_start_report` (
  `id` int NOT NULL AUTO_INCREMENT,
  `daily_id` int NOT NULL,
  `first_piece_at` time DEFAULT NULL,
  `first_piece_comment` text,
  `no_op_start` int DEFAULT NULL,
  `no_op_balancing` int DEFAULT NULL,
  `no_op_comment` text,
  `is_line_wet` tinyint(1) DEFAULT NULL,
  `is_line_wet_comment` text,
  PRIMARY KEY (`id`),
  KEY `fk_shift_start_daily` (`daily_id`),
  CONSTRAINT `fk_shift_start_daily` FOREIGN KEY (`daily_id`) REFERENCES `daily_production_report` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
"""

@bp.route("/create-shift-start-report", methods=["POST"])
@login_required
def create_shift_start_report():
    data = request.get_json()
    daily_id = data.get("daily_id")
    first_piece_at = data.get("first_piece_at")
    first_piece_comment = data.get("first_piece_comment")
    no_op_start = data.get("no_op_start")
    no_op_balancing = data.get("no_op_balancing")
    no_op_comment = data.get("no_op_comment")
    is_line_wet = data.get("is_line_wet")
    is_line_wet_comment = data.get("is_line_wet_comment")

    if not daily_id:
        return jsonify({"error": "Falta el ID del reporte diario."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        sql = """
            INSERT INTO shift_start_report 
            (daily_id, first_piece_at, first_piece_comment, no_op_start, no_op_balancing, no_op_comment, is_line_wet, is_line_wet_comment)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        values = (
            daily_id,
            first_piece_at,
            first_piece_comment,
            no_op_start,
            no_op_balancing,
            no_op_comment,
            is_line_wet,
            is_line_wet_comment,
        )

        cursor.execute(sql, values)
        conn.commit()

        return jsonify({"message": "Reporte de inicio de turno creado."}), 201

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/get-shift-start-report-by-daily-id", methods=["GET"])
@login_required
def get_shift_start_report_by_daily_id():
    daily_id = request.args.get("daily_id")

    if not daily_id:
        return jsonify({"error": "Falta el ID del reporte diario."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM shift_start_report WHERE daily_id = %s;", (daily_id,))        
        report = cursor.fetchone()

        if report and report.get("first_piece_at"):
            report["first_piece_at"] = str(report["first_piece_at"])

        if not report:
            return jsonify({"report": None}), 404

        return jsonify({"report": report}), 200

    except Exception as e:
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/get-shift-start-report", methods=["GET"])
@login_required
def get_shift_start_report():
    date_str = request.args.get("date")
    pan = request.args.get("pan")
    shift = request.args.get("shift")

    if not all([date_str, pan, shift]):
        return jsonify({"error": "Faltan parámetros (date, pan, shift)."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        """
        cursor.execute(""
            SELECT dpr.id AS daily_id
            FROM daily_production_report AS dpr
            WHERE dpr.date = %s AND dpr.pan = %s AND dpr.shift = %s
        "", (date_str, pan, shift))
        daily_report = cursor.fetchone()
        """

        cursor.execute("""
            SELECT
                ssr.id AS shift_start_id,
                ssr.first_piece_at,
                ssr.first_piece_comment,
                ssr.no_op_start,
                ssr.no_op_balancing,
                ssr.no_op_comment,
                ssr.is_line_wet,
                ssr.is_line_wet_comment,

                dpr.id AS daily_id,
                dpr.date,
                dpr.pan,
                dpr.part_no,
                dpr.`order`,
                dpr.quantity,
                dpr.op_no,
                dpr.shift,
                dpr.is_closed,
                dpr.created_at
            FROM shift_start_report ssr
            INNER JOIN daily_production_report dpr
                ON ssr.daily_id = dpr.id
            WHERE 
                `date` = %s AND
                pan = %s AND
                shift = %s
            ORDER BY shift_start_id DESC
            LIMIT 1;
            """, (date_str, pan, shift))
        daily_report = cursor.fetchone()

        if not daily_report:
            return jsonify({"report": None}), 404

        daily_id = daily_report["daily_id"]
        cursor.execute("SELECT * FROM shift_start_report WHERE daily_id = %s;", (daily_id,))        
        report = cursor.fetchone()
        if report and report.get("first_piece_at"):
            report["first_piece_at"] = str(report["first_piece_at"])
        if not report:
            return jsonify({"report": None}), 404
        return jsonify({"report": report}), 200
    except Exception as e:
        return jsonify({"error": f"Error interno del servidor: {e}"}), 500
    finally:
        if conn:
            conn.close()
            