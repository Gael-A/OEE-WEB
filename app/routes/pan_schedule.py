from flask import Blueprint, request, jsonify
from app.utils.db import get_connection
from app.utils.decorators import admin_required, production_leader_required
from datetime import time, timedelta

bp = Blueprint('pan_schedule', __name__, url_prefix='/api/pan-schedule')

def format_schedule(schedule):
    """Convierte los objetos time o timedelta a string para la serialización JSON."""
    if schedule:
        for key in ['start_hour', 'end_hour']:
            value = schedule.get(key)
            if isinstance(value, timedelta):
                total_seconds = int(value.total_seconds())
                hours, remainder = divmod(total_seconds, 3600)
                minutes, seconds = divmod(remainder, 60)
                schedule[key] = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
            elif isinstance(value, time):
                schedule[key] = value.strftime('%H:%M:%S')
    return schedule

@bp.route("/", methods=["POST"])
@admin_required
def create_schedule():
    """Crea un nuevo registro en el horario del PAN."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Petición inválida, se esperaba JSON."}), 400

    start_hour = data.get("start_hour")
    end_hour = data.get("end_hour")
    action = data.get("action")
    duration = data.get("duration")
    pan_id = data.get("pan_id")

    if not all([start_hour, end_hour, action, duration, pan_id]):
        return jsonify({"error": "Faltan campos obligatorios."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        sql_query = """
            INSERT INTO pan_schedule (start_hour, end_hour, action, duration, pan_id) 
            VALUES (%s, %s, %s, %s, %s)
        """
        values = (start_hour, end_hour, action, duration, pan_id)

        cursor.execute(sql_query, values)
        conn.commit()

        return jsonify({"message": "Registro de horario creado exitosamente."}), 201
    
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    
    finally:
        if conn:
            conn.close()

@bp.route("/by-pan/<string:pan_id>", methods=["GET"])
@production_leader_required
def get_schedules_by_pan_id(pan_id):
    """Obtiene todos los horarios asociados a un pan_id específico."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM pan_schedule WHERE pan_id = %s ORDER BY start_hour ASC",
            (pan_id,)
        )
        schedules = cursor.fetchall()
        schedules = [format_schedule(s) for s in schedules]
        return jsonify(schedules), 200

    except Exception as e:
        return jsonify({"error": "Error interno del servidor", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/", methods=["GET"])
@admin_required
def get_all_schedules():
    """Obtiene todos los registros del horario."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM pan_schedule ORDER BY pan_id, start_hour ASC")
        schedules = cursor.fetchall()
        
        schedules = [format_schedule(s) for s in schedules]

        return jsonify(schedules), 200
    except Exception as e:
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/<int:schedule_id>", methods=["GET"])
@admin_required
def get_schedule(schedule_id):
    """Obtiene un registro de horario específico por su ID."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM pan_schedule WHERE id = %s", (schedule_id,))
        schedule = cursor.fetchone()
        if schedule:
            return jsonify(format_schedule(schedule)), 200
        else:
            return jsonify({"error": "Registro de horario no encontrado."}), 404
    except Exception as e:
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/<int:schedule_id>", methods=["PUT"])
@admin_required
def update_schedule(schedule_id):
    """Actualiza un registro de horario existente."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Petición inválida, se esperaba JSON."}), 400

    allowed_fields = ["start_hour", "end_hour", "action", "duration", "pan_id"]
    updates = {k: v for k, v in data.items() if k in allowed_fields and v is not None}

    if not updates:
        return jsonify({"error": "No hay datos para actualizar."}), 400

    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values())
    values.append(schedule_id)

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        sql = f"UPDATE pan_schedule SET {set_clause} WHERE id = %s"
        cursor.execute(sql, values)
        
        if cursor.rowcount == 0:
            return jsonify({"error": "Registro de horario no encontrado."}), 404
            
        conn.commit()
        return jsonify({"message": "Registro de horario actualizado exitosamente."}), 200
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/<int:schedule_id>", methods=["DELETE"])
@admin_required
def delete_schedule(schedule_id):
    """Elimina un registro de horario."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM pan_schedule WHERE id = %s", (schedule_id,))
        if cursor.rowcount == 0:
            return jsonify({"error": "Registro de horario no encontrado."}), 404
        conn.commit()
        return jsonify({"message": "Registro de horario eliminado exitosamente."}), 200
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()