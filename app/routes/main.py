from flask import Blueprint, render_template, request, send_from_directory, session, jsonify, current_app
from app.utils.db import get_connection
from app.utils.translation import load_translations
from app.utils.decorators import login_required, admin_required, production_leader_required, supervisor_required
import time
bp = Blueprint('main', __name__)

# This will run before each request to this blueprint
@bp.before_request
def set_language_from_param():
    lang_code = request.args.get('lang')
    if lang_code and lang_code in ['en', 'es', 'pl']:
        session['language'] = lang_code

# Ruta para el dashboard principal
@bp.route("/dashboard")
@login_required
def dashboard():
    pan_id = request.args.get("pan")

    conn = get_connection()
    cursor = conn.cursor()

    if not pan_id:
        cursor.execute("SELECT pan_id FROM machines ORDER BY pan_id ASC LIMIT 1;")
        result = cursor.fetchone()
        pan_id = result["pan_id"] if result else None

    machines = []
    if pan_id:
        cursor.execute("SELECT node_id FROM machines WHERE pan_id = %s ORDER BY node_id ASC;", (pan_id,))
        machines = [row["node_id"] for row in cursor.fetchall()]

    conn.close()

    session_lifetime = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    login_time = session.get('login_time', time.time())
    elapsed_time = time.time() - login_time
    remaining_time = max(0, session_lifetime - elapsed_time)

    translations = load_translations()
    lang = session.get('language', 'es')

    return render_template("dashboard.html", machines=machines, session_timeout=remaining_time, pan_id=pan_id, translations=translations, is_screen_mode=False, lang=lang)

# Ruta para el dashboard principal de pantalla
@bp.route("/")
@bp.route("/dashboard-screen")
def dashboard_screen():
    pan_id = request.args.get("pan")

    conn = get_connection()
    cursor = conn.cursor()

    if not pan_id:
        cursor.execute("SELECT pan_id FROM machines ORDER BY pan_id ASC LIMIT 1;")
        result = cursor.fetchone()
        pan_id = result["pan_id"] if result else None

    machines = []
    if pan_id:
        cursor.execute("SELECT node_id FROM machines WHERE pan_id = %s ORDER BY node_id ASC;", (pan_id,))
        machines = [row["node_id"] for row in cursor.fetchall()]
    conn.close()

    translations = load_translations()
    lang = session.get('language', 'es')

    return render_template("dashboard.html", machines=machines, pan_id=pan_id, translations=translations, is_screen_mode=True, lang=lang)

# Ruta para la página de creación de reportes
@bp.route("/daily-production-report")
@production_leader_required
@login_required
def daily_production_report():
    pan_id = request.args.get("pan")

    conn = get_connection()
    cursor = conn.cursor()

    if not pan_id:
        cursor.execute("SELECT pan_id FROM machines ORDER BY pan_id ASC LIMIT 1;")
        result = cursor.fetchone()
        pan_id = result["pan_id"] if result else None

    machines = []
    if pan_id:
        cursor.execute("SELECT node_id FROM machines WHERE pan_id = %s ORDER BY node_id ASC;", (pan_id,))
        machines = [row["node_id"] for row in cursor.fetchall()]

    part_nos = []
    if pan_id:
        cursor.execute("SELECT part_no FROM part_no_rates WHERE pan_id = %s;", (pan_id,))
        part_nos = [row["part_no"] for row in cursor.fetchall()]

    cursor.execute("SELECT suggestion, priority FROM production_report_templates ORDER BY CASE priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 4 END;")
    suggestions = cursor.fetchall()

    conn.close()

    # Calcular tiempo restante de sesión
    session_lifetime = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    login_time = session.get('login_time', time.time())
    elapsed_time = time.time() - login_time
    remaining_time = max(0, session_lifetime - elapsed_time)

    translations = load_translations()
    lang = session.get('language', 'es')

    return render_template("daily-production-report.html", machines=machines, part_nos=part_nos, suggestions=suggestions, session_timeout=remaining_time, translations=translations, lang=lang)

# Ruta para la página de visualización de reportes
@bp.route("/viewer-daily-production-report")
@supervisor_required
def viewer_daily_production_report():
    pan_id = request.args.get("pan")

    conn = get_connection()
    cursor = conn.cursor()

    if not pan_id:
        cursor.execute("SELECT pan_id FROM machines ORDER BY pan_id ASC LIMIT 1;")
        result = cursor.fetchone()
        pan_id = result["pan_id"] if result else None

    machines = []
    if pan_id:
        cursor.execute("SELECT node_id FROM machines WHERE pan_id = %s ORDER BY node_id ASC;", (pan_id,))
        machines = [row["node_id"] for row in cursor.fetchall()]

    conn.close()

    session_lifetime = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    login_time = session.get('login_time', time.time())
    elapsed_time = time.time() - login_time
    remaining_time = max(0, session_lifetime - elapsed_time)

    translations = load_translations()
    lang = session.get('language', 'es')

    return render_template("viewer-daily-production-report.html", machines=machines, session_timeout=remaining_time, translations=translations, lang=lang, pan_id=pan_id)

# Ruta para la página del plan de producción
@bp.route("/production-plan")
@login_required
def production_plan():
    session_lifetime = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    login_time = session.get('login_time', time.time())
    elapsed_time = time.time() - login_time
    remaining_time = max(0, session_lifetime - elapsed_time)

    translations = load_translations()
    lang = session.get('language', 'es')

    return render_template("production-plan.html", session_timeout=remaining_time, translations=translations, lang=lang)

# Ruta para la página de login (ahora es la ruta principal)
@bp.route('/login')
def login():
    translations = load_translations()
    session['language'] = 'es'
    lang = session.get('language', 'es')
    return render_template('login.html', translations=translations, lang='es')

# Ruta para la página de registro
@bp.route('/register')
def register():
    translations = load_translations()
    lang = session.get('language', 'es')
    return render_template('register.html', translations=translations, lang='es')

# Ruta para el perfil de usuario
@bp.route("/profile")
@login_required
def profile():
    session_lifetime = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    login_time = session.get('login_time', time.time())
    elapsed = time.time() - login_time
    remaining = max(0, session_lifetime - elapsed)

    translations = load_translations()
    lang = session.get('language', 'es')

    return render_template("profile.html", session_timeout=remaining, translations=translations, lang=lang)

# Ruta para el cambio de contraseña
@bp.route("/change-password")
@login_required
def change_password_page():
    session_lifetime = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    login_time = session.get('login_time', time.time())
    elapsed_time = time.time() - login_time
    remaining_time = max(0, session_lifetime - elapsed_time)

    translations = load_translations()
    lang = session.get('language', 'es')

    return render_template("change-password.html", session_timeout=remaining_time, translations=translations, lang=lang)

# Ruta para un índice de navegación simple durante el desarrollo
@bp.route("/debug-index")
def debug_index():
    translations = load_translations()
    lang = session.get('language', 'es')
    return render_template("index.html", translations=translations, lang=lang)

# Ruta para la administración de usuarios
@bp.route("/user-administrator")
@login_required
@admin_required
def user_administrator():

    session_lifetime = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    login_time = session.get('login_time', time.time())
    elapsed_time = time.time() - login_time
    remaining_time = max(0, session_lifetime - elapsed_time)

    translations = load_translations()
    lang = session.get('language', 'es')

    return render_template("user-administrator.html", session_timeout=remaining_time, translations=translations, lang=lang, current_user_id=session.get('id'))

# Ruta para el buzón de sugerencias
@bp.route("/suggestion-box")
@login_required
def suggestion_box():
    session_lifetime = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    login_time = session.get('login_time', time.time())
    elapsed_time = time.time() - login_time
    remaining_time = max(0, session_lifetime - elapsed_time)

    translations = load_translations()
    lang = session.get('language', 'es')

    return render_template("suggestion-box.html", session_timeout=remaining_time, translations=translations, lang=lang)

# Ruta para editar una sugerencias
@bp.route("/suggestion-box/<int:suggestion_id>")
@login_required
def edit_suggestion_box(suggestion_id):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT user_id FROM suggestion_box WHERE id = %s", (suggestion_id,))
    suggestion = cursor.fetchone()

    if not suggestion:
        return jsonify({"error": "Suggestion not found"}), 404

    current_user_id = session.get('id')
    current_user_role = session.get('role')

    if suggestion['user_id'] != current_user_id and current_user_role != 'admin':
        return jsonify({"error": "Unauthorized to edit this suggestion"}), 403

    cursor.execute("SELECT area, problem, solution, benefit FROM suggestion_box WHERE id = %s", (suggestion_id,))
    suggestion_data = cursor.fetchone()

    if not suggestion_data:
        conn.close()
        return jsonify({"error": "Suggestion data not found"}), 404
    
    session_lifetime = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    login_time = session.get('login_time', time.time())
    elapsed_time = time.time() - login_time
    remaining_time = max(0, session_lifetime - elapsed_time)

    translations = load_translations()
    lang = session.get('language', 'es')

    conn.close()

    return render_template("suggestion-box.html", suggestion_id=suggestion_id, suggestion_data=suggestion_data, session_timeout=remaining_time, translations=translations, lang=lang)

# Ruta para el buzón de sugerencias (solo admin)
@bp.route("/suggestion-mailbox")
@login_required
@admin_required
def suggestion_mailbox():
    session_lifetime = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    login_time = session.get('login_time', time.time())
    elapsed_time = time.time() - login_time
    remaining_time = max(0, session_lifetime - elapsed_time)

    translations = load_translations()

    lang = session.get('language', 'es')

    return render_template("suggestion-mailbox.html", session_timeout=remaining_time, translations=translations, lang=lang)


### DEBUG ###

# Ruta para el dashboard de pruebas
@bp.route("/dashboard-debug")
@login_required
def dashboard_debug():
    pan_id = request.args.get("pan")

    conn = get_connection()
    cursor = conn.cursor()

    if not pan_id:
        cursor.execute("SELECT pan_id FROM machines ORDER BY pan_id ASC LIMIT 1;")
        result = cursor.fetchone()
        pan_id = result["pan_id"] if result else None

    machines = []
    if pan_id:
        cursor.execute("SELECT node_id FROM machines WHERE pan_id = %s ORDER BY node_id ASC;", (pan_id,))
        machines = [row["node_id"] for row in cursor.fetchall()]

    conn.close()

    session_lifetime = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    login_time = session.get('login_time', time.time())
    elapsed_time = time.time() - login_time
    remaining_time = max(0, session_lifetime - elapsed_time)

    translations = load_translations()
    lang = session.get('language', 'es')

    return render_template("dashboard-debug.html", machines=machines, session_timeout=remaining_time, pan_id=pan_id, translations=translations, lang=lang)

# Ruta auxiliar de ayuda para modulos JavaScript
@bp.route('/static/js/<path:filename>')
def custom_static_js(filename):
    return send_from_directory('static/js', filename, mimetype='text/javascript')
