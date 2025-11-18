from flask import session, current_app
import json
import os

def load_translations():
    language = session.get('language', 'en')
    locales_path = os.path.join(current_app.root_path, 'static', 'locales', language, 'translation.json')

    if not os.path.exists(locales_path):
        current_app.logger.warning(f"Translation file for '{language}' not found, falling back to 'en'.")
        language = 'en'
        locales_path = os.path.join(current_app.root_path, 'static', 'locales', language, 'translation.json')

    try:
        with open(locales_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        current_app.logger.error(f"Error loading translation file '{locales_path}': {e}")
        return {}
