from functools import wraps
from flask import session, redirect, url_for, flash, request

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash("Por favor, inicia sesión para acceder a esta página.", "warning")
            return redirect(url_for('main.login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash("Por favor, inicia sesión para acceder a esta página.", "warning")
            return redirect(url_for('main.login'))
        if session.get('role') != 'admin':
            flash("No tienes los permisos necesarios para ver esta página.", "danger")
            return redirect(url_for('main.debug_index'))
        return f(*args, **kwargs)
    return decorated_function

def production_leader_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash("Por favor, inicia sesión para acceder a esta página.", "warning")
            return redirect(url_for('main.login'))
        # Un admin puede acceder a todo lo que un líder puede
        if session.get('role') not in ['production_leader', 'admin']:
            flash("No tienes los permisos necesarios para ver esta página.", "danger")
            return redirect(url_for('main.debug_index'))
        return f(*args, **kwargs)
    return decorated_function

def supervisor_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash("Por favor, inicia sesión para acceder a esta página.", "warning")
            return redirect(url_for('main.login'))
        if session.get('role') not in ['supervisor', 'admin']:
            flash("No tienes los permisos necesarios para ver esta página.", "danger")
            return redirect(url_for('main.debug_index'))
        return f(*args, **kwargs)
    return decorated_function