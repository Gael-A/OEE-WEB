import os
import json
import re
from decimal import Decimal
from datetime import date, datetime
from flask import Blueprint, request, jsonify, current_app, session
import google.generativeai as genai
from dotenv import load_dotenv
from app.utils.db import get_connection

load_dotenv()

bp = Blueprint('chatbot', __name__, url_prefix='/api/chatbot')

try:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("No se encontró la variable de entorno GEMINI_API_KEY")

    genai.configure(api_key=api_key)

    generation_config = {
        "temperature": 0.7,
        "top_p": 1,
        "top_k": 1,
        "max_output_tokens": 2048,
    }

    # Modelo para detectar intención (consulta, duda de página o pregunta común)
    system_instruction_intention = """
Eres un asistente que detecta la intención del usuario para responder preguntas relacionadas con una base de datos industrial o con la interfaz de una página web.

Tu objetivo es:
- Identificar si la pregunta requiere una consulta SQL (tipo SELECT),
- Detectar si la pregunta es una duda sobre el uso o funcionamiento de la página,
- O si es una pregunta común teórica que no requiere base de datos.

REGLAS:
- Si es una pregunta que **sí requiere base de datos**, responde con un JSON que contenga:
  {
    "tipo": "consulta",
    "intencion": "<breve descripción>",
    "sql": "<consulta SQL SELECT>"
  }

- Si es una duda **sobre el funcionamiento de la página** o interfaz, responde con:
  {
    "tipo": "duda_pagina",
    "intencion": "<explicación breve de la duda>"
  }

- Si es una pregunta teórica o general, sin necesidad de consulta, responde con:
  {
    "tipo": "pregunta_comun",
    "intencion": "<explicación breve de la pregunta>"
  }

IMPORTANTE:
- Nunca uses comandos peligrosos como INSERT, UPDATE, DELETE, DROP o similares.
- Solo usa nombres de tablas y columnas provistos en el esquema cuando generes SQL.
- Si no puedes generar un SQL válido, opta por marcarlo como pregunta común.
"""

    intention_model = genai.GenerativeModel(
        model_name="gemini-2.0-flash-lite",
        generation_config=generation_config,
        system_instruction=system_instruction_intention
    )

    # Modelo para generar la respuesta final al usuario
    system_instruction_resp = (
        "Eres un asistente virtual experto en datos de producción industrial. "
        "Tu propósito es responder preguntas sobre métricas como OEE, eficiencia, disponibilidad y calidad, "
        "basándote en la información resultante de consultas SQL ejecutadas. Sé conciso y directo en tus respuestas. "
        "No incluyas prefijos como 'Asistente:' en tus respuestas, solo la respuesta clara y útil."
    )

    response_model = genai.GenerativeModel(
        model_name="gemini-2.0-flash-lite",
        generation_config=generation_config,
        system_instruction=system_instruction_resp
    )

except Exception as e:
    intention_model = None
    response_model = None
    current_app.logger.error(f"Error al configurar Gemini: {e}")


def convertir_decimal_y_fecha(obj):
    if isinstance(obj, list):
        return [convertir_decimal_y_fecha(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: convertir_decimal_y_fecha(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, (date, datetime)):
        return obj.isoformat()
    else:
        return obj


def obtener_esquema_y_ejemplos_sql():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES;")
        filas = cursor.fetchall()
        if not filas:
            return ""

        clave_tabla = list(filas[0].keys())[0]
        tablas = [row[clave_tabla] for row in filas]

        esquema = ""
        for tabla in tablas:
            esquema += f"Tabla: {tabla}\n"
            cursor.execute(f"DESCRIBE {tabla};")
            columnas = cursor.fetchall()
            for col in columnas:
                esquema += f"  - {col['Field']} ({col['Type']})\n"

            # Identificar columna de orden
            col_orden = None
            for col in columnas:
                if col['Field'].lower() in ['fecha', 'fecha_creacion', 'created_at', 'timestamp']:
                    col_orden = col['Field']
                    break
            if not col_orden:
                for col in columnas:
                    if col['Field'].lower() in ['id']:
                        col_orden = col['Field']
                        break

            # Ejemplo de fila más reciente
            ejemplo = {}
            if col_orden:
                try:
                    cursor.execute(f"SELECT * FROM {tabla} ORDER BY {col_orden} DESC LIMIT 1;")
                    ejemplo = cursor.fetchone()
                except Exception as e:
                    current_app.logger.warning(f"No se pudo obtener ejemplo para {tabla}: {e}")

            esquema += f"  Ejemplo de fila más reciente: {ejemplo}\n\n"

        conn.close()
        return esquema
    except Exception as e:
        current_app.logger.error(f"Error al obtener esquema y ejemplos SQL: {e}")
        return ""


def detectar_intencion_y_sql(prompt, esquema, history, pan, shift, date_str):
    try:
        history_text = ""
        for item in history:
            if isinstance(item, dict) and all(k in item for k in ['role', 'text']):
                role = "Usuario" if item['role'] == 'user' else "Asistente"
                history_text += f"{role}: {item['text']}\n"

        prompt_completo = f"""
Este es el esquema de la base de datos:

{esquema}

Parámetros actuales:
- Pan ID (Production Area): {pan}
- Shift: {shift}
- Date: {date_str}

Historial de conversación:
{history_text}

Usuario preguntó:
{prompt}

Por favor, responde únicamente con un JSON según las reglas de tu sistema de intención.
"""
        response = intention_model.generate_content(prompt_completo)
        texto = response.text.strip()

        current_app.logger.info(f"Respuesta IA de intenciones: {texto}")

        match = re.search(r'\{.*\}', texto, re.DOTALL)
        if not match:
            current_app.logger.error("No se encontró JSON en la respuesta del modelo de intención.")
            return None

        json_resp = json.loads(match.group())
        tipo = json_resp.get("tipo")

        if tipo == "consulta":
            sql = json_resp.get("sql", "").strip().lower()
            if not sql.startswith("select"):
                current_app.logger.error(f"Consulta SQL no válida: {sql}")
                return None
            for forbidden in ["insert", "update", "delete", "drop", "create", "alter"]:
                if forbidden in sql:
                    current_app.logger.error(f"Consulta SQL contiene palabra prohibida '{forbidden}': {sql}")
                    return None
            return json_resp

        elif tipo in ["duda_pagina", "pregunta_comun"]:
            return json_resp

        else:
            current_app.logger.error(f"Tipo de intención no reconocido: {tipo}")
            return None

    except Exception as e:
        current_app.logger.error(f"Error en detectar_intencion_y_sql: {e}")
        return None


def ejecutar_sql_y_formar_contexto(sql_query):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(sql_query)
        rows = cursor.fetchall()
        conn.close()
        return rows
    except Exception as e:
        current_app.logger.error(f"Error al ejecutar SQL: {e}")
        return []

@bp.route("/ask", methods=["POST"])
def ask_gemini():
    if not response_model or not intention_model:
        return jsonify({"error": "Los modelos de IA no están configurados correctamente."}), 503

    data = request.get_json()
    prompt = data.get("prompt")
    dom_context = data.get("dom_context", "")
    pan = request.args.get("pan")
    shift = request.args.get("shift")
    date_str = request.args.get("date")

    if not prompt:
        return jsonify({"error": "No se proporcionó un prompt."}), 400

    esquema = obtener_esquema_y_ejemplos_sql()
    if not esquema:
        return jsonify({"error": "No se pudo obtener el esquema de la base de datos."}), 500

    history = session.get('chat_history', [])
    analisis = detectar_intencion_y_sql(prompt, esquema, history, pan=pan, shift=shift, date_str=date_str)
    if not analisis:
        return jsonify({"error": "No se pudo interpretar la intención del usuario."}), 400

    tipo = analisis.get("tipo")

    if tipo == "consulta":
        sql = analisis["sql"]
        datos = ejecutar_sql_y_formar_contexto(sql)
        datos_serializables = convertir_decimal_y_fecha(datos)
        contexto_datos = f"Resultados de la consulta SQL (intención: {analisis.get('intencion', 'desconocida')}):\n{json.dumps(datos_serializables, ensure_ascii=False, indent=2)}\n\n"

    elif tipo in ["duda_pagina", "pregunta_comun"]:
        contexto_datos = f"Intención detectada: {analisis.get('intencion', 'Sin detalle')}\nNo se necesita consulta SQL.\n\n"

    else:
        return jsonify({"error": "Tipo de intención desconocido."}), 400

    # Preparar historial de la conversación para el modelo de respuesta
    history_text = ""
    for item in history:
        if isinstance(item, dict) and all(k in item for k in ['role', 'text']):
            role = "Usuario" if item['role'] == 'user' else "Asistente"
            history_text += f"{role}: {item['text']}\n"

    full_prompt = (
        f"CONTEXT:\n{dom_context}\n\n"
        f"DATA:\n{contexto_datos}"
        f"CURRENT_PARAMS:\nPan ID (Production Area): {pan}, Shift: {shift}, Date: {date_str}\n\n"
        f"HISTORY:\n{history_text}\n"
        f"ASK:\n{prompt}"
    )

    try:
        response = response_model.generate_content(full_prompt)
        response_text = response.text

        # Actualizar historial en sesión
        history.append({"role": "user", "text": prompt})
        history.append({"role": "model", "text": response_text})
        session['chat_history'] = history[-10:]
        session.modified = True

        return jsonify({"response": response_text})

    except Exception as e:
        current_app.logger.error(f"Error en generación de respuesta final: {e}")
        return jsonify({"error": "Hubo un problema al contactar al asistente de IA."}), 500


@bp.route("/reset", methods=['POST'])
def reset_chat():
    session.pop('chat_history', None)
    return jsonify({"status": "success", "message": "Historial de chat reiniciado."})
