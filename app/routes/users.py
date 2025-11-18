from flask import Blueprint, request, jsonify, session, url_for
from app.utils.db import get_connection
from app.utils.decorators import admin_required
from werkzeug.security import generate_password_hash, check_password_hash
import time

# Create a new Blueprint for the user API
bp = Blueprint('users', __name__, url_prefix='/api/users')

@bp.route("/", methods=["GET"])
@admin_required
def get_users():
    """Obtiene una lista de todos los usuarios."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, first_name, last_name, role, email, language FROM users ORDER BY id ASC")
        users = cursor.fetchall()
        return jsonify(users), 200
    except Exception as e:
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/<string:user_id>", methods=["GET"])
@admin_required
def get_user(user_id):
    """Obtiene los detalles de un usuario específico."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, first_name, last_name, role, email, language FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if user:
            return jsonify(user), 200
        else:
            return jsonify({"error": "Usuario no encontrado."}), 404
    except Exception as e:
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/", methods=["POST"])
@admin_required
def create_user():
    """Crea un nuevo usuario."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Petición inválida, se esperaba JSON."}), 400

    user_id = data.get("id")
    first_name = data.get("first_name")
    last_name = data.get("last_name")
    email = data.get("email")
    role = data.get("role", "user")

    if not all([user_id, role]):
        return jsonify({"error": "ID y correo electrónico son campos obligatorios."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM users WHERE id = %s OR email = %s", (user_id, email))
        if cursor.fetchone():
            return jsonify({"error": "El ID de usuario o el correo electrónico ya están en uso."}), 409

        sql_query = "INSERT INTO users (id, first_name, last_name, role, email, language) VALUES (%s, %s, %s, %s, %s, %s)"
        values = (
            user_id,
            first_name if first_name else "",
            last_name if last_name else "",
            role if role else "",
            email if email else "",
            data.get("language", "es")  # Default to 'es' if not provided
        )

        cursor.execute(sql_query, values)
        conn.commit()

        # Fetch the newly created user to return in the response
        cursor.execute("SELECT id, first_name, last_name, role, email, language FROM users WHERE id = %s", (user_id,))
        new_user = cursor.fetchone()

        return jsonify({"message": "Usuario creado exitosamente.", "user": new_user}), 201
    
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    
    finally:
        if conn:
            conn.close()

@bp.route("/<string:user_id>", methods=["PUT"])
@admin_required
def update_user(user_id):
    """Actualiza los datos de un usuario existente."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Petición inválida, se esperaba JSON."}), 400

    # Prevent user from changing their own role
    if 'role' in data and str(session.get('id')) == str(user_id):
        return jsonify({"error": "No puedes cambiar tu propio rol."}), 403

    updates = {k: v for k, v in data.items() if k in ["first_name", "last_name", "role", "email", "language", "password"]}

    if not updates:
        return jsonify({"error": "No hay datos para actualizar."}), 400

    if "password" in updates and updates["password"]:
        updates["password"] = generate_password_hash(updates["password"])
    else:
        updates.pop("password", None)

    set_clause = ", ".join(f"{k} = %s" for k in updates.keys())
    values = list(updates.values())
    values.append(user_id)

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(f"UPDATE users SET {set_clause} WHERE id = %s", values)
        if cursor.rowcount == 0: 
            return jsonify({"error": "Usuario no encontrado."}), 404
        conn.commit()
        cursor.execute("SELECT id, first_name, last_name, role, email, language FROM users WHERE id = %s", (user_id,))
        return jsonify({"message": "Usuario actualizado exitosamente.", "user": cursor.fetchone()}), 200
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/<string:user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id):
    """Elimina un usuario."""
    # Prevent user from deleting themselves
    if str(session.get('id')) == str(user_id):
        return jsonify({"error": "No puedes eliminar tu propia cuenta."}), 403

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        if cursor.rowcount == 0: 
            return jsonify({"error": "Usuario no encontrado."}), 404
        conn.commit()
        return jsonify({"message": "Usuario eliminado exitosamente."}), 200
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"error": "Ocurrió un error interno en el servidor.", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

@bp.route("/login-user", methods=["POST"])
def login_user():
    """Autentica a un usuario y maneja la redirección para la primera vez que inicia sesión."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Petición inválida, se esperaba JSON."}), 400

    user_id = data.get("id")
    password = data.get("password")

    if not user_id or not password:
        return jsonify({"error": "Faltan el Número de Reloj o la Contraseña."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        # Fetch password and other user details
        cursor.execute("SELECT password, role, email, first_name, last_name, language FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()

        if user:
            # Check if the password field is empty, which indicates a new user
            if not user['password']:
                redirect_url = url_for('main.register', user_id=user_id)
                return jsonify({
                    "message": "Bienvenido, por favor establece tu contraseña.",
                    "redirect_url": redirect_url
                }), 200

            # If a password exists, proceed with standard authentication
            if check_password_hash(user['password'], password):
                session.permanent = True
                session['user_id'] = user_id
                session['id'] = user_id
                session['login_time'] = time.time()
                session['role'] = user['role']
                session['email'] = user['email']
                session['language'] = user['language']
                session['first_name'] = user['first_name']
                session['last_name'] = user['last_name']
                session['full_name'] = f"{user['first_name']} {user['last_name']}"

                if session['role'] == 'production_leader':
                    redirect_url = url_for('main.daily_production_report')
                else:
                    redirect_url = url_for('main.dashboard')

                return jsonify({"message": "Login exitoso.", "redirect_url": redirect_url}), 200
            else:
                return jsonify({"error": "ID de usuario o contraseña incorrectos."}), 401
        else:
            return jsonify({"error": "ID de usuario o contraseña incorrectos."}), 401

    except Exception as e:
        print(f"Error en login_user: {e}")
        return jsonify({"error": "Ocurrió un error interno en el servidor."}), 500

    finally:
        if conn:
            conn.close()