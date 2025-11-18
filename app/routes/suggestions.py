from flask import Blueprint, request, jsonify, session
from app.utils.db import get_connection
from app.utils.decorators import login_required, admin_required

bp = Blueprint('suggestions', __name__, url_prefix='/api/suggestions')

@bp.route("/", methods=["POST"])
@login_required
def create_suggestion():
    """Crea una nueva sugerencia en el buzón."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Petición inválida, se esperaba JSON."}), 400

    area = data.get("area")
    problem = data.get("problem")
    solution = data.get("solution", '')
    benefit = data.get("benefit", '')
    user_id = session.get('id')

    if not all([area, problem, user_id]):
        return jsonify({"error": "Faltan campos obligatorios."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        sql_query = """
            INSERT INTO suggestion_box (user_id, area, problem, solution, benefit) 
            VALUES (%s, %s, %s, %s, %s)
        """
        values = (user_id, area, problem, solution, benefit)

        cursor.execute(sql_query, values)
        conn.commit()

        return jsonify({"message": "Sugerencia enviada exitosamente."}), 201
    
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    
    finally:
        if conn:
            conn.close()

@bp.route("/", methods=["GET"])
@admin_required
def get_all_suggestions():
    """Obtiene todas las sugerencias."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, user_id, user_area, problem, solution, benefit, created_at, updated_at, status
            FROM suggestion_with_user
            ORDER BY created_at DESC
        """)
        suggestions = cursor.fetchall()
        return jsonify(suggestions), 200
    except Exception as e:
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/<int:suggestion_id>", methods=["GET"])
@admin_required
def get_suggestion(suggestion_id):
    """Obtiene una sugerencia específica por su ID (solo para administradores)."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.id, s.user_id, CONCAT(u.first_name, ' ', u.last_name) as user_name, u.email,
                   s.area, s.problem, s.solution, s.benefit, s.created_at
            FROM suggestion_box s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = %s
        """, (suggestion_id,))
        suggestion = cursor.fetchone()
        if suggestion:
            return jsonify(suggestion), 200
        else:
            return jsonify({"error": "Sugerencia no encontrada."}), 404
    except Exception as e:
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/user", methods=["GET"])
@login_required
def get_user_suggestions():
    """Obtiene todas las sugerencias del usuario actual."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        user_id = session.get('id')
        cursor.execute("""SELECT * FROM suggestion_box WHERE user_id = %s ORDER BY created_at DESC""", (user_id,))
        suggestions = cursor.fetchall()
        return jsonify(suggestions), 200
    except Exception as e:
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/<int:suggestion_id>", methods=["PUT"])
@login_required
def update_suggestion(suggestion_id):
    """Actualiza una sugerencia existente."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Petición inválida, se esperaba JSON."}), 400

    allowed_fields = ["area", "problem", "solution", "benefit", "status"]
    updates = {k: v for k, v in data.items() if k in allowed_fields and v is not None}

    if not updates:
        return jsonify({"error": "No hay datos para actualizar."}), 400
    
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT user_id, status FROM suggestion_box WHERE id = %s", (suggestion_id,))
        result = cursor.fetchone()
        if not result:
            return jsonify({"error": "Sugerencia no encontrada."}), 404

        suggestion_owner_id = result["user_id"]
        current_status = result["status"]
        
        is_admin = session.get('role') == 'admin'
        is_owner = int(session.get('id')) == suggestion_owner_id

        if not is_admin and not is_owner:
            return jsonify({"error": "No tienes permiso para actualizar esta sugerencia."}), 403

        if "status" in updates:
            if not is_admin:
                return jsonify({"error": "Solo un administrador puede actualizar el estado."}), 403

            new_status_value = updates["status"]
            
            status_steps = ["submitted", "in_review", "approved", "implemented"]

            if new_status_value == "rejected":
                updates["status"] = "rejected"
            elif new_status_value == "next_step":
                try:
                    current_status_index = status_steps.index(current_status)
                    if current_status_index < len(status_steps) - 1:
                        updates["status"] = status_steps[current_status_index + 1]
                    else:
                        return jsonify({"error": "No hay un siguiente paso disponible para el estado actual."}), 400
                except ValueError:
                    return jsonify({"error": f"No se puede avanzar desde el estado '{current_status}'."}), 400
            else:
                return jsonify({"error": f"Valor de estado inválido: '{new_status_value}'."}), 400
        
        set_clause = ", ".join(f"{k} = %s" for k in updates.keys())
        values = list(updates.values())
        values.append(suggestion_id)

        sql = f"UPDATE suggestion_box SET {set_clause} WHERE id = %s"
        cursor.execute(sql, values)

        if cursor.rowcount == 0:
            return jsonify({"error": "Sugerencia no encontrada o no se realizaron cambios."}), 404

        conn.commit()
        return jsonify({"message": "Sugerencia actualizada exitosamente."}), 200
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/<int:suggestion_id>", methods=["DELETE"])
@login_required
def delete_suggestion(suggestion_id):
    """Elimina una sugerencia."""
    conn = None

    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT user_id FROM suggestion_box WHERE id = %s", (suggestion_id,))
        result = cursor.fetchone()
        if not result:
            return jsonify({"error": "Sugerencia no encontrada."}), 404

        suggestion_owner_id = result["user_id"]
        if session.get('role') != 'admin' and int(session.get('id')) != suggestion_owner_id:
            return jsonify({"error": "No tienes permiso para eliminar esta sugerencia."}), 403

        cursor.execute("DELETE FROM suggestion_box WHERE id = %s", (suggestion_id,))
        if cursor.rowcount == 0:
            return jsonify({"error": "Sugerencia no encontrada."}), 404
        conn.commit()
        return jsonify({"message": "Sugerencia eliminada exitosamente."}), 200
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({
            "error": "Ocurrió un error interno en el servidor.",
            "details": str(e),
            "args": getattr(e, "args", [])
        }), 500
    finally:
        if conn:
            conn.close()
