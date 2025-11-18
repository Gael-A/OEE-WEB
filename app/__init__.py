from flask import Flask
from .routes import daily_report, main, get_data, auth, debug, users, chatbot, suggestions, pan_schedule
from datetime import timedelta

def create_app():
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    app.secret_key = '369147'

    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=9)

    app.register_blueprint(main.bp)
    app.register_blueprint(get_data.bp)
    app.register_blueprint(auth.bp)
    app.register_blueprint(debug.bp)
    app.register_blueprint(daily_report.bp)
    app.register_blueprint(users.bp)
    app.register_blueprint(chatbot.bp)
    app.register_blueprint(suggestions.bp)
    app.register_blueprint(pan_schedule.bp)

    return app
