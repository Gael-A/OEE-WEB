from flask import Blueprint, request, jsonify, session, redirect, url_for
from app.utils.db import get_connection
from werkzeug.security import check_password_hash, generate_password_hash
import time

bp = Blueprint('auth', __name__)


@bp.route("/login-user", methods=["POST"])
def login_user():
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
        cursor.execute("SELECT password, role, email, first_name, last_name, language FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()

        if user:
            if not user['password']:
                redirect_url = url_for('bp.register', user_id=user_id)
                return jsonify({
                    "message": "Bienvenido, por favor establece tus datos.",
                    "redirect_url": redirect_url
                }), 200

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

@bp.route("/register-user", methods=["POST"])
def register_user():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Petición inválida, se esperaba JSON."}), 400
    
    user_id = data.get("id")
    first_name = data.get("first_name")
    last_name = data.get("last_name")
    password = data.get("password")
    email = data.get("email")
    language = data.get("language")

    if not all([user_id, first_name, last_name, password, email, language]):
        return jsonify({"error": "Faltan campos obligatorios."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        existing_user = cursor.fetchone()

        if existing_user:
            return jsonify({"error": "El ID de usuario ya está en uso."}), 400

        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        existing_email = cursor.fetchone()
        if existing_email:
            return jsonify({"error": "El correo electrónico ya está en uso."}), 400

        hashed_password = generate_password_hash(password)
        
        sql_query = "INSERT INTO users (id, first_name, last_name, role, password, email, language) VALUES (%s, %s, %s, %s, %s, %s, %s)"
        
        values = (user_id, first_name, last_name, "user", hashed_password, email, language)

        cursor.execute(sql_query, values)
        conn.commit()

        return jsonify({"message": "Registro exitoso."}), 201
    
    except Exception as e:
        return jsonify({"error": "Ocurrió un error interno en el servidor."}), 500
    
    finally:
        if conn:
            conn.close()

@bp.route("/logout-user")
def logout_user():
    """
    Limpia la sesión del usuario y lo redirige a la página de login.
    """
    session.clear()
    return redirect(url_for('main.login', expired='1'))

@bp.route("/update-profile", methods=["POST"])
def update_profile():
    if 'user_id' not in session:
        return jsonify({"error": "No autenticado."}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "Petición inválida, se esperaba JSON."}), 400

    user_id = session['user_id']
    first_name = data.get("first_name")
    last_name = data.get("last_name")
    email = data.get("email")
    language = data.get("language")
    password = data.get("password")

    if not all([first_name, last_name, email, language, password]):
        return jsonify({"error": "Faltan campos obligatorios."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT password FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if not user or not check_password_hash(user['password'], password):
            return jsonify({"error": "La contraseña es incorrecta."}), 403

        if email != session.get('email'):
            cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cursor.fetchone():
                return jsonify({"error": "El correo electrónico ya está en uso."}), 409

        sql_query = "UPDATE users SET first_name = %s, last_name = %s, email = %s, language = %s WHERE id = %s"
        values = (first_name, last_name, email, language, user_id)
        cursor.execute(sql_query, values)
        conn.commit()

        session['first_name'] = first_name
        session['last_name'] = last_name
        session['full_name'] = f"{first_name} {last_name}"
        session['email'] = email
        session['language'] = language

        return jsonify({"message": "Perfil actualizado exitosamente."}), 200

    except Exception as e:
        return jsonify({"error": "Ocurrió un error interno en el servidor."}), 500
    
    finally:
        if conn:
            conn.close()

@bp.route("/change-password", methods=["POST"])
def change_password():
    if 'user_id' not in session:
        return jsonify({"error": "No autenticado."}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "Petición inválida, se esperaba JSON."}), 400

    user_id = session['user_id']
    old_password = data.get("old_password")
    new_password = data.get("new_password")

    if not old_password or not new_password:
        return jsonify({"error": "Se requiere la contraseña antigua y la nueva."}), 400

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT password FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()

        if not user or not check_password_hash(user['password'], old_password):
            return jsonify({"error": "La contraseña antigua es incorrecta."}), 403

        hashed_new_password = generate_password_hash(new_password)

        sql_query = "UPDATE users SET password = %s WHERE id = %s"
        values = (hashed_new_password, user_id)
        cursor.execute(sql_query, values)
        conn.commit()

        return jsonify({"message": "Contraseña actualizada exitosamente.", "redirect_url": url_for('main.profile')}), 200

    except Exception as e:
        return jsonify({"error": "Ocurrió un error interno en el servidor."}), 500
    
    finally:
        if conn:
            conn.close()
