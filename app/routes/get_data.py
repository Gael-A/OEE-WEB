import collections
from flask import Blueprint, request, jsonify
from app.utils.db import get_connection
from app.utils.helpers import (
    get_shift_times,
    get_shift_times_tuple,
    derive_relevant_status,
    compute_time_on_for_machine,
    compute_availability_base_and_time_ok,
    adjusted_availability,
    status_data_pan_internal,
    generate_color_from_id,
    process_logs_to_blocks,
    process_machine_logs_to_blocks,
)
from datetime import datetime, timedelta
from collections import defaultdict

bp = Blueprint("data", __name__)


# Ruta para obtener todos los PAN IDs (áreas de producción) disponibles.
@bp.route("/available-panids")
def available_panids():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT pan_id FROM production_areas ORDER BY pan_id ASC")
    panids = [row["pan_id"] for row in cursor.fetchall()]
    conn.close()
    return jsonify(panids)

# Ruta para obtener los parametros de todos los PAN IDs
@bp.route("/pan-settings")
def pan_settings():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM production_areas")
    pan_settings = cursor.fetchall()
    conn.close()
    return jsonify(pan_settings)

# Ruta para obtener los parametros de un PAN ID en especifico
@bp.route("/pan-settings/<pan_id>")
def pan_setting(pan_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM production_areas WHERE pan_id = %s", (pan_id,))
    pan_setting = cursor.fetchone()
    conn.close()
    if pan_setting:
        return jsonify(pan_setting)
    return jsonify({"error": "PAN ID no encontrado"}), 404

################################################################################################

# Ruta para obtener el último valor de un atributo para cada máquina de un PAN ID.
@bp.route("/machine-attribute-data")
def machine_attribute_data():
    pan_id = request.args.get("pan")
    date_str = request.args.get("date")
    shift = request.args.get("shift", "")
    attribute = request.args.get("attribute", "")

    ALLOWED_ATTRIBUTES = {
        "availability",
        "availability_weighted",
        "time_inactive",
        "time_ok",
    }

    if not pan_id or not date_str or attribute not in ALLOWED_ATTRIBUTES:
        return jsonify([])

    fecha_base = datetime.strptime(date_str, "%Y-%m-%d")

    def get_data_for_shift(start, end):
        conn = get_connection()
        cursor = conn.cursor()
        results = []

        if attribute in {"availability", "availability_weighted"}:
            cursor.execute(
                """
                SELECT t1.node_id, t1.time_ok, t1.time_in_service, t1.time_inactive
                FROM logged_data t1
                INNER JOIN (
                    SELECT node_id, MAX(time) AS max_time
                    FROM logged_data
                    WHERE pan_id = %s AND time >= %s AND time < %s
                    GROUP BY node_id
                ) t2 ON t1.node_id = t2.node_id AND t1.time = t2.max_time
                WHERE t1.pan_id = %s
                ORDER BY t1.node_id ASC
                """,
                (pan_id, start, end, pan_id),
            )
            rows = cursor.fetchall()
            for row in rows:
                total = (row.get("time_ok") or 0) + (row.get("time_inactive") or 0)
                service = row.get("time_in_service") or 0
                availability = 0
                if total > 0:
                    availability = round((total - service) / total * 100)

                if attribute == "availability":
                    results.append({"id": row["node_id"], attribute: availability})
                else:  # availability_weighted
                    results.append({"id": row["node_id"], attribute: availability})

        elif attribute in {"time_inactive", "time_ok"}:
            cursor.execute(
                """
                SELECT node_id, status_code, time
                FROM logged_data
                WHERE pan_id = %s AND time BETWEEN %s AND %s AND NOT status_code = 0
                ORDER BY node_id, time ASC
                """,
                (pan_id, start, end),
            )
            all_logs = cursor.fetchall()
            
            if not all_logs:
                conn.close()
                return []

            cursor.execute(
                """
                SELECT mw.machine_id, mw.changed_at, mw.is_on, m.node_id
                FROM machines_working mw
                INNER JOIN machines m ON mw.machine_id = m.machine_id
                WHERE m.pan_id = %s AND mw.shift = %s AND mw.changed_at BETWEEN %s AND %s
                ORDER BY mw.machine_id, mw.changed_at ASC
                """,
                (pan_id, shift, start, end),
            )
            working_logs = cursor.fetchall()

            working_logs_map = collections.defaultdict(list)
            for row in working_logs:
                working_logs_map[row["node_id"]].append(
                    {"changed_at": row["changed_at"], "is_on": row["is_on"]}
                )

            cursor.execute(
                "SELECT machine_id, node_id FROM machines WHERE pan_id = %s", (pan_id,)
            )
            node_to_machine_id = {
                row["node_id"]: row["machine_id"] for row in cursor.fetchall()
            }

            node_logs = collections.defaultdict(list)
            for log in all_logs:
                node_logs[log["node_id"]].append(log)

            for node_id, logs_list in node_logs.items():
                machine_id = node_to_machine_id.get(node_id)
                
                blocks, downtime, uptime, total_stops = process_machine_logs_to_blocks(
                    logs=logs_list, 
                    working_logs=working_logs_map.get(node_id, []), 
                    machine_id=machine_id,
                    start=start,
                    end=end
                )

                results.append(
                    {
                        "id": node_id,
                        "time_inactive": downtime,
                        "time_ok": uptime,
                    }
                )

        else:
            cursor.execute(
                f"""
                SELECT t1.node_id, t1.{attribute}
                FROM logged_data t1
                INNER JOIN (
                    SELECT node_id, MAX(time) AS max_time
                    FROM logged_data
                    WHERE pan_id = %s AND time >= %s AND time < %s AND {attribute} >= 0
                    GROUP BY node_id
                ) t2 ON t1.node_id = t2.node_id AND t1.time = t2.max_time
                WHERE t1.pan_id = %s
                ORDER BY t1.node_id ASC
                """,
                (pan_id, start, end, pan_id),
            )
            rows = cursor.fetchall()
            results = [
                {"id": row["node_id"], attribute: row[attribute]} for row in rows
            ]

        conn.close()
        return results

    start, end = get_shift_times(fecha_base, shift)
    result = get_data_for_shift(start, end)

    return jsonify(result)

# Ruta para obtener el promedio de un atributo para un PAN ID completo.
@bp.route("/pan-attribute-data")
def pan_attribute_data():
    from flask import current_app

    pan_id = request.args.get("pan")
    date_str = request.args.get("date")
    shift = request.args.get("shift", "")
    attribute = request.args.get("attribute", "")

    if not pan_id or not date_str or not attribute:
        return jsonify({attribute: 0})

    fecha_base = datetime.strptime(date_str, "%Y-%m-%d")

    def calculate_average(values):
        if not values:
            return 0
        return round(sum(values) / len(values), 2)

    def get_shift_ranges():
        return get_shift_times_tuple(fecha_base, shift)

    def handle_logged_data_avg(attr):
        """Promedia el atributo más reciente por nodo en logged_data"""
        conn = get_connection()
        cursor = conn.cursor()

        values = []

        for start, end in get_shift_ranges():
            cursor.execute(
                f"""
                SELECT t1.node_id, t1.{attr}
                FROM logged_data t1
                INNER JOIN (
                    SELECT node_id, MAX(time) AS max_time
                    FROM logged_data
                    WHERE pan_id = %s AND time >= %s AND time < %s AND {attr} >= 0
                    GROUP BY node_id
                ) t2 ON t1.node_id = t2.node_id AND t1.time = t2.max_time
                WHERE t1.pan_id = %s
                """,
                (pan_id, start, end, pan_id),
            )
            rows = cursor.fetchall()
            values.extend([row[attr] for row in rows if row.get(attr) is not None])

        conn.close()
        return calculate_average(values)

    def handle_availability():
        """Calcula availability como (total - service) / total * 100"""
        conn = get_connection()
        cursor = conn.cursor()
        values = []

        for start, end in get_shift_ranges():
            cursor.execute(
                """
                SELECT t1.node_id, t1.time_ok, t1.time_in_service
                FROM logged_data t1
                INNER JOIN (
                    SELECT node_id, MAX(time) AS max_time
                    FROM logged_data
                    WHERE pan_id = %s AND time >= %s AND time < %s
                    GROUP BY node_id
                ) t2 ON t1.node_id = t2.node_id AND t1.time = t2.max_time
                WHERE t1.pan_id = %s
                """,
                (pan_id, start, end, pan_id),
            )
            rows = cursor.fetchall()
            for row in rows:
                total = row.get("time_ok") or 0
                service = row.get("time_in_service") or 0
                if total > 0:
                    values.append((total - service) / total * 100)

        conn.close()
        return calculate_average(values)

    def handle_availability_weighted():
        """Promedia availability ajustada por máquina en el PAN"""
        from collections import defaultdict

        conn = get_connection()
        cursor = conn.cursor()

        shift_ranges = get_shift_ranges()
        if not shift_ranges:
            return 0

        total_vals = []
        for start, end in shift_ranges:
            cursor.execute(
                """
                SELECT machine_id, node_id
                FROM machines
                WHERE pan_id = %s
                """,
                (pan_id,),
            )
            machines = cursor.fetchall()

            for m in machines:
                machine_id = m["machine_id"]
                node_id = m["node_id"]

                availability_base, time_ok = compute_availability_base_and_time_ok(
                    cursor, pan_id, node_id, start, end
                )
                time_on = compute_time_on_for_machine(
                    cursor, machine_id, shift, start, end
                )

                adjusted = adjusted_availability(availability_base, time_ok, time_on)
                total_vals.append(adjusted)

        conn.close()
        return round(sum(total_vals) / len(total_vals), 2) if total_vals else 0

    def get_year_to_date_availability():
        """
        Calcula la disponibilidad utilizando la fórmula (time_ok - time_in_service)
        dividido por el tiempo total transcurrido del año hasta ahora.
        """
        from datetime import datetime, timedelta
        conn = get_connection()
        cursor = conn.cursor()

        now = datetime.now()
        start_of_year = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        total_elapsed_seconds = (now - start_of_year).total_seconds()

        if total_elapsed_seconds <= 0:
            conn.close()
            return 0.0

        total_ok_sum = 0
        total_service_sum = 0

        # Obtiene los últimos valores de time_ok y time_in_service para cada nodo
        # dentro del PAN ID para el período del año hasta ahora.
        cursor.execute(
            """
            SELECT t1.time_ok, t1.time_in_service
            FROM logged_data t1
            INNER JOIN (
                SELECT node_id, MAX(time) AS max_time
                FROM logged_data
                WHERE pan_id = %s AND time >= %s AND time <= %s
                GROUP BY node_id
            ) t2 ON t1.node_id = t2.node_id AND t1.time = t2.max_time
            WHERE t1.pan_id = %s
            """,
            (pan_id, start_of_year, now, pan_id)
        )
        rows = cursor.fetchall()

        for row in rows:
            total_ok_sum += row.get('time_ok', 0)
            total_service_sum += row.get('time_in_service', 0)

        conn.close()

        availability = ((total_ok_sum - total_service_sum) / total_elapsed_seconds) * 100
        return round(availability, 2)

    def handle_prod_efficiency():
        """Calcula eficiencia de producción = producción / meta * 100, sumando todos los daily_reports"""
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT id FROM daily_production_report
            WHERE date = %s AND pan = %s AND shift = %s
            """,
            (date_str, pan_id, shift),
        )
        reports = cursor.fetchall()
        if not reports:
            return 0

        total_prod = 0
        total_target = 0
        for report in reports:
            daily_id = report["id"]
            cursor.execute(
                "SELECT production, target FROM hourly_production_report WHERE daily_id = %s",
                (daily_id,),
            )
            rows = cursor.fetchall()
            total_prod += sum(row["production"] or 0 for row in rows)
            total_target += sum(row["target"] or 0 for row in rows)

        conn.close()
        return round((total_prod / total_target) * 100, 2) if total_target > 0 else 0

    def handle_quality():
        """Calcula calidad = (1 - defects / production) * 100, sumando todos los daily_reports"""
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT id FROM daily_production_report
            WHERE date = %s AND pan = %s AND shift = %s
            """,
            (date_str, pan_id, shift),
        )
        reports = cursor.fetchall()
        if not reports:
            return 0

        total_prod = 0
        total_defects = 0
        for report in reports:
            daily_id = report["id"]
            cursor.execute(
                "SELECT production, defects FROM hourly_production_report WHERE daily_id = %s",
                (daily_id,),
            )
            rows = cursor.fetchall()
            total_prod += sum(row["production"] or 0 for row in rows)
            total_defects += sum(row["defects"] or 0 for row in rows)

        conn.close()
        if total_prod == 0:
            return 0

        return round((1 - (total_defects / total_prod)) * 100, 2)

    def handle_oee():
        """Calcula OEE = availability x performance x quality"""
        try:
            availability = get_year_to_date_availability()
            performance = handle_prod_efficiency()
            quality = handle_quality()

            oee = (availability / 100) * (performance / 100) * (quality / 100) * 100
            return round(oee, 2)
        except Exception as e:
            current_app.logger.error(f"Error calculando OEE: {e}")
            return 0

    def handle_moee():
        """Calcula OEE = availability x performance x quality"""
        try:
            availability = handle_availability()
            performance = handle_prod_efficiency()
            quality = handle_quality()

            oee = (availability / 100) * (performance / 100) * (quality / 100) * 100
            return round(oee, 2)
        except Exception as e:
            current_app.logger.error(f"Error calculando mOEE: {e}")
            return 0

    def handle_target():
        """Suma total del target de todos los daily_reports del turno"""
        conn = get_connection()
        cursor = conn.cursor()

        total_target = 0
        cursor.execute(
            """
            SELECT id FROM daily_production_report
            WHERE date = %s AND pan = %s AND shift = %s
            """,
            (date_str, pan_id, shift),
        )
        reports = cursor.fetchall()

        for report in reports:
            daily_id = report["id"]
            cursor.execute(
                """
                SELECT SUM(target) AS total_target
                FROM hourly_production_report
                WHERE daily_id = %s
                """,
                (daily_id,),
            )
            result = cursor.fetchone()
            if result and result["total_target"]:
                total_target += result["total_target"]

        conn.close()
        return total_target

    def handle_production():
        """Suma total de producción de todos los daily_reports del turno"""
        conn = get_connection()
        cursor = conn.cursor()

        total_production = 0
        cursor.execute(
            """
            SELECT id FROM daily_production_report
            WHERE date = %s AND pan = %s AND shift = %s
            """,
            (date_str, pan_id, shift),
        )
        reports = cursor.fetchall()

        for report in reports:
            daily_id = report["id"]
            cursor.execute(
                """
                SELECT SUM(production) AS total_production
                FROM hourly_production_report
                WHERE daily_id = %s
                """,
                (daily_id,),
            )
            result = cursor.fetchone()
            if result and result["total_production"]:
                total_production += result["total_production"]

        conn.close()
        return total_production

    def handle_real_production():
        """Obtiene el último valor de counter para node_id='CORTADORA_A' en el/los shift(s)"""
        conn = get_connection()
        cursor = conn.cursor()

        last_value = 0
        last_time = datetime.min

        for start, end in get_shift_ranges():
            cursor.execute(
                """
                SELECT counter, time
                FROM logged_data
                WHERE pan_id = %s
                AND node_id = 'CORTADORA_A'
                AND time >= %s
                AND time < %s
                ORDER BY time DESC
                LIMIT 1
                """,
                (pan_id, start, end),
            )
            row = cursor.fetchone()
            if row and row.get("time") and row.get("counter") is not None:
                if row["time"] > last_time:
                    last_time = row["time"]
                    last_value = row["counter"]

        conn.close()
        return last_value

    def handle_defects():
        """Suma total de defectos de todos los daily_reports del turno"""
        conn = get_connection()
        cursor = conn.cursor()

        total_defects = 0
        cursor.execute(
            """
            SELECT id FROM daily_production_report
            WHERE date = %s AND pan = %s AND shift = %s
            """,
            (date_str, pan_id, shift),
        )
        reports = cursor.fetchall()

        for report in reports:
            daily_id = report["id"]
            cursor.execute(
                """
                SELECT SUM(defects) AS total_defects
                FROM hourly_production_report
                WHERE daily_id = %s
                """,
                (daily_id,),
            )
            result = cursor.fetchone()
            if result and result["total_defects"]:
                total_defects += result["total_defects"]

        conn.close()
        return total_defects

    def handle_difference():
        """Diferencia entre producción y target"""
        total_production = handle_production()
        total_target = handle_target()
        return total_production - total_target

    def handle_time_ok():
        conn = get_connection()
        cursor = conn.cursor()
        data = status_data_pan_internal(pan_id, fecha_base, shift, cursor)
        conn.close()
        return data["uptime"]

    def handle_time_inactive():
        conn = get_connection()
        cursor = conn.cursor()
        data = status_data_pan_internal(pan_id, fecha_base, shift, cursor)
        conn.close()
        return data["downtime"]

    ATTRIBUTE_HANDLERS = {
        "efficiency": lambda: handle_logged_data_avg("efficiency"),
        "time_ok": handle_time_ok,
        "time_inactive": handle_time_inactive,
        "counter": lambda: handle_logged_data_avg("counter"),
        "availability": handle_availability,
        "availability_weighted": handle_availability_weighted,
        "prod-efficiency": handle_prod_efficiency,
        "quality": handle_quality,
        "oee": handle_oee,
        "moee": handle_moee,
        "target": handle_target,
        "production": handle_production,
        "real_production": handle_real_production,
        "defects": handle_defects,
        "difference": handle_difference,
    }

    handler = ATTRIBUTE_HANDLERS.get(attribute)
    if not handler:
        return jsonify({attribute: 0})

    try:
        value = handler()
        return jsonify({attribute: value})
    except Exception as e:
        current_app.logger.error(f"Error al calcular '{attribute}': {e}")
        return jsonify({attribute: 0, "error": str(e)}), 500

################################################################################################

# Ruta para obtener los datos de estado y la línea de tiempo para una máquina individual.
@bp.route("/status-data-tl-machine")
def status_data_machine():
    pan_id = request.args.get("pan")
    date_str = request.args.get("date")
    node_id = request.args.get("node")
    shift = request.args.get("shift", "")

    if not pan_id or not date_str or not node_id:
        return jsonify(
            {
                "blocks": [],
                "start": "",
                "end": "",
                "downtime": 0,
                "uptime": 0,
                "total_stops": 0,
                "real_downtime": None,
                "real_uptime": None,
            }
        )

    fecha_base = datetime.strptime(date_str, "%Y-%m-%d")
    start, end = get_shift_times(fecha_base, shift)

    conn = get_connection()
    cursor = conn.cursor()

    # --- Consultas a la base de datos ---
    cursor.execute(
        """
        SELECT node_id, status_code, time
        FROM logged_data
        WHERE NOT status_code=0 AND pan_id=%s AND node_id=%s AND time BETWEEN %s AND %s
        ORDER BY time
    """,
        (pan_id, node_id, start, end),
    )
    logs = cursor.fetchall()

    cursor.execute(
        """
        SELECT time_inactive, time_ok
        FROM logged_data
        WHERE pan_id=%s AND node_id=%s AND time BETWEEN %s AND %s
        ORDER BY time DESC
        LIMIT 1
    """,
        (pan_id, node_id, start, end),
    )
    last_status = cursor.fetchone()

    cursor.execute(
        """
        SELECT machine_id
        FROM machines
        WHERE pan_id=%s AND node_id=%s
        LIMIT 1
    """,
        (pan_id, node_id),
    )
    machine_row = cursor.fetchone()
    machine_id = machine_row["machine_id"] if machine_row else None

    working_logs = []
    if machine_id:
        cursor.execute(
            """
            SELECT changed_at, is_on
            FROM machines_working
            WHERE machine_id = %s AND shift = %s AND changed_at BETWEEN %s AND %s
            ORDER BY changed_at ASC
        """,
            (machine_id, shift, start, end),
        )
        working_logs = cursor.fetchall()
    conn.close()

    blocks, downtime, uptime, total_stops = process_machine_logs_to_blocks(
        logs, working_logs, machine_id, start, end
    )

    return jsonify(
        {
            "blocks": blocks,
            "start": start.strftime("%Y-%m-%d %H:%M:%S"),
            "end": end.strftime("%Y-%m-%d %H:%M:%S"),
            "downtime": downtime,
            "uptime": uptime,
            "total_stops": total_stops,
            "real_downtime": (
                int(last_status["time_inactive"])
                if last_status and last_status["time_inactive"] is not None
                else 0
            ),
            "real_uptime": (
                int(last_status["time_ok"])
                if last_status and last_status["time_ok"] is not None
                else 0
            ),
        }
    )

# Ruta para obtener los datos de estado y la línea de tiempo para un PAN ID completo
@bp.route("/status-data-tl-pan")
def status_data_pan():
    pan_id = request.args.get("pan")
    date_str = request.args.get("date")
    shift = request.args.get("shift", "")

    if not pan_id or not date_str:
        return jsonify(
            {
                "blocks": [],
                "start": "",
                "end": "",
                "downtime": 0,
                "uptime": 0,
                "total_stops": 0,
            }
        )

    fecha_base = datetime.strptime(date_str, "%Y-%m-%d")
    start, end = get_shift_times(fecha_base, shift)

    conn = get_connection()
    cursor = conn.cursor()

    # --- CONSULTAS MASIVAS A LA BASE DE DATOS ---

    cursor.execute(
        """
        SELECT node_id, time, status_code
        FROM logged_data
        WHERE pan_id = %s AND time BETWEEN %s AND %s AND NOT status_code = 0
        ORDER BY time ASC
        """,
        (pan_id, start, end),
    )
    all_logs = cursor.fetchall()
    
    cursor.execute(
        """
        SELECT machine_id, node_id
        FROM machines
        WHERE pan_id = %s
        """,
        (pan_id,),
    )
    node_to_machine = {row['node_id']: row['machine_id'] for row in cursor.fetchall()}

    machine_ids = list(node_to_machine.values())
    working_logs_by_machine = defaultdict(list)
    if machine_ids:
        cursor.execute(
            """
            SELECT machine_id, changed_at, is_on
            FROM machines_working
            WHERE machine_id IN %s AND shift = %s AND changed_at BETWEEN %s AND %s
            ORDER BY machine_id, changed_at ASC
            """,
            (tuple(machine_ids), shift, start, end)
        )
        for row in cursor.fetchall():
            working_logs_by_machine[row['machine_id']].append(row)

    conn.close()

    blocks, downtime, uptime, total_stops = process_logs_to_blocks(
        all_logs=all_logs,
        node_to_machine=node_to_machine,
        working_logs_by_machine=working_logs_by_machine,
        start=start,
        end=end,
        min_duration=timedelta(seconds=10)
    )

    return jsonify(
        {
            "blocks": blocks,
            "start": start.strftime("%Y-%m-%d %H:%M:%S"),
            "end": end.strftime("%Y-%m-%d %H:%M:%S"),
            "downtime": downtime,
            "uptime": uptime,
            "total_stops": total_stops,
        }
    )

# Ruta para obtener el ultimo estado para un PAN ID completo
@bp.route("/last-status-pan")
def last_status_pan():
    pan_id = request.args.get("pan")
    date_str = request.args.get("date")
    shift = request.args.get("shift", "")

    if not pan_id or not date_str:
        return jsonify({"relevant_status": None})

    fecha_base = datetime.strptime(date_str, "%Y-%m-%d")
    start, end = get_shift_times(fecha_base, shift)

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT node_id, time, status_code
        FROM logged_data
        WHERE pan_id = %s
          AND time BETWEEN %s AND %s
          AND status_code <> 0
        ORDER BY node_id, time
    """,
        (pan_id, start, end),
    )
    rows = cursor.fetchall()

    if not rows:
        conn.close()
        return jsonify({"relevant_status": None})

    last_by_machine = {}
    for r in rows:
        node = r["node_id"]
        last_by_machine[node] = r

    def is_inactive(code: int) -> bool:
        bits = bin(code)[2:].zfill(8)[::-1]
        return bits[2] == "1"

    all_inactive = True
    inactives = []

    for r in last_by_machine.values():
        if is_inactive(r["status_code"]):
            inactives.append((r["node_id"], r["time"]))
        else:
            all_inactive = False
            break

    if not all_inactive:
        conn.close()
        return jsonify({"relevant_status": "irrelevant"})

    all_excused = True
    for node_id, log_time in inactives:
        cursor.execute(
            """
            SELECT machine_id
            FROM machines
            WHERE pan_id = %s AND node_id = %s
            LIMIT 1
        """,
            (pan_id, node_id),
        )
        result = cursor.fetchone()
        if not result:
            all_excused = False
            break
        machine_id = result["machine_id"]
        cursor.execute(
            """
            SELECT is_on
            FROM machines_working
            WHERE machine_id = %s AND shift = %s AND changed_at <= %s AND changed_at >= %s
            ORDER BY changed_at DESC
            LIMIT 1
        """,
            (machine_id, shift, log_time, start),
        )
        work = cursor.fetchone()
        if not work or work["is_on"] == 1:
            all_excused = False
            break

    conn.close()

    status = "not_schedule" if all_excused else "inactive"
    return jsonify({"relevant_status": status})

################################################################################################

# Ruta para obtener el contador de ciclos por hora para cada nodo.
@bp.route("/hourly-cycles")
def hourly_cycles():
    pan_id = request.args.get("pan")
    date_str = request.args.get("date")
    shift = request.args.get("shift", "")

    if not pan_id or not date_str:
        return jsonify({"data": {}, "start": None, "end": None}), 400

    try:
        fecha_base = datetime.strptime(date_str, "%Y-%m-%d")
        start, end = get_shift_times(fecha_base, shift)
    except ValueError:
        return jsonify({"data": {}, "start": None, "end": None}), 400

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT node_id FROM machines WHERE pan_id = %s ORDER BY node_id", (pan_id,)
    )
    nodes = [row["node_id"] for row in cursor.fetchall()]

    data = {}

    PRIMARY_SATURATION = 0.62
    PRIMARY_LIGHTNESS = 0.63
    SECONDARY_SATURATION = 0.43
    SECONDARY_LIGHTNESS = 0.46

    for node_id in nodes:
        node_cycles = []
        last_count = 0
        current_time = start

        node_cycles.append({"time": start.strftime("%H:%M:%S"), "cycles": 0})

        while current_time < end:
            hour_end = min(
                current_time.replace(minute=0, second=0, microsecond=0)
                + timedelta(hours=1),
                end,
            )

            cursor.execute(
                """
                SELECT counter FROM logged_data
                WHERE pan_id = %s AND node_id = %s AND time <= %s AND counter IS NOT NULL
                ORDER BY time DESC
                LIMIT 1
                """,
                (pan_id, node_id, hour_end),
            )
            row = cursor.fetchone()
            current_count = row["counter"] if row else last_count

            cycles_this_hour = current_count - last_count

            if cycles_this_hour < 0:
                cycles_this_hour = current_count

            node_cycles.append(
                {"time": hour_end.strftime("%H:%M:%S"), "cycles": cycles_this_hour}
            )

            last_count = current_count
            current_time = hour_end

        if any(item["cycles"] > 0 for item in node_cycles):
            primary_color_hex = generate_color_from_id(
                node_id, PRIMARY_SATURATION, PRIMARY_LIGHTNESS
            )
            secondary_color_hex = generate_color_from_id(
                node_id, SECONDARY_SATURATION, SECONDARY_LIGHTNESS
            )

            data[node_id] = {
                "primary": primary_color_hex,
                "secondary": secondary_color_hex,
                "cycles": node_cycles,
            }

    conn.close()

    return jsonify(
        {
            "data": data,
            "start": start.strftime("%Y-%m-%d %H:%M:%S"),
            "end": end.strftime("%Y-%m-%d %H:%M:%S"),
        }
    )


### RUTAS PARA DATOS ADMIN/DEBUG ###


# Ruta para obtener el contador de ciclos por día para cada nodo.
@bp.route("/daily-cycles")
def daily_cycles():
    pan_id = request.args.get("pan")
    date_str = request.args.get("date")
    shift = request.args.get("shift", "")

    if not pan_id or not date_str:
        return jsonify({"data": {}, "start": None, "end": None}), 400

    try:
        fecha_base = datetime.strptime(date_str, "%Y-%m-%d")
        start, end = get_shift_times(fecha_base, shift)
    except ValueError:
        return jsonify({"data": {}, "start": None, "end": None}), 400

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT node_id FROM machines WHERE pan_id = %s ORDER BY node_id", (pan_id,)
    )
    nodes = [row["node_id"] for row in cursor.fetchall()]

    data = {}

    PRIMARY_SATURATION = 0.62
    PRIMARY_LIGHTNESS = 0.63
    SECONDARY_SATURATION = 0.43
    SECONDARY_LIGHTNESS = 0.46

    for node_id in nodes:
        node_cycles = []
        current_time = start

        node_cycles.append({"time": start.strftime("%H:%M:%S"), "cycles": 0})

        while current_time < end:
            hour_end = min(
                current_time.replace(minute=0, second=0, microsecond=0)
                + timedelta(hours=1),
                end,
            )

            cursor.execute(
                """
                SELECT counter FROM logged_data
                WHERE pan_id = %s AND node_id = %s AND time <= %s AND counter IS NOT NULL
                ORDER BY time DESC
                LIMIT 1
                """,
                (pan_id, node_id, hour_end),
            )
            row = cursor.fetchone()
            current_count = (
                row["counter"]
                if row
                else (node_cycles[-1]["cycles"] if node_cycles else 0)
            )

            node_cycles.append(
                {"time": hour_end.strftime("%H:%M:%S"), "cycles": current_count}
            )

            current_time = hour_end

        if node_cycles[-1]["time"] != end.strftime("%H:%M:%S"):
            cursor.execute(
                """
                SELECT counter FROM logged_data
                WHERE pan_id = %s AND node_id = %s AND time <= %s AND counter IS NOT NULL
                ORDER BY time DESC
                LIMIT 1
                """,
                (pan_id, node_id, end),
            )
            last_row = cursor.fetchone()
            final_count = (
                last_row["counter"]
                if last_row
                else (node_cycles[-1]["cycles"] if node_cycles else 0)
            )

            node_cycles.append(
                {"time": end.strftime("%H:%M:%S"), "cycles": final_count}
            )

        if any(item["cycles"] > 0 for item in node_cycles):
            primary_color_hex = generate_color_from_id(
                node_id, PRIMARY_SATURATION, PRIMARY_LIGHTNESS
            )
            secondary_color_hex = generate_color_from_id(
                node_id, SECONDARY_SATURATION, SECONDARY_LIGHTNESS
            )

            data[node_id] = {
                "primary": primary_color_hex,
                "secondary": secondary_color_hex,
                "cycles": node_cycles,
            }

    conn.close()

    return jsonify(
        {
            "data": data,
            "start": start.strftime("%Y-%m-%d %H:%M:%S"),
            "end": end.strftime("%Y-%m-%d %H:%M:%S"),
        }
    )


# Ruta para obtener los datos de estado y la línea de tiempo para una máquina individual.
@bp.route("/debug-status-data-tl-machine")
def debug_status_data_machine():
    pan_id = request.args.get("pan")
    date_str = request.args.get("date")
    node_id = request.args.get("node")
    shift = request.args.get("shift", "")

    if not pan_id or not date_str or not node_id:
        return jsonify(
            {
                "blocks": [],
                "start": "",
                "end": "",
                "downtime": 0,
                "uptime": 0,
                "total_stops": 0,
                "real_downtime": None,
                "real_uptime": None,
            }
        )

    fecha_base = datetime.strptime(date_str, "%Y-%m-%d")
    start, end = get_shift_times(fecha_base, shift)

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT node_id, status_code, time
        FROM logged_data
        WHERE NOT status_code=0 AND pan_id=%s AND node_id=%s AND time BETWEEN %s AND %s
        ORDER BY time
    """,
        (pan_id, node_id, start, end),
    )
    rows = cursor.fetchall()

    cursor.execute(
        """
        SELECT time_inactive, time_ok
        FROM logged_data
        WHERE pan_id=%s AND node_id=%s AND time BETWEEN %s AND %s
        ORDER BY time DESC
        LIMIT 1
    """,
        (pan_id, node_id, start, end),
    )
    last_status = cursor.fetchone()

    cursor.execute(
        """
        SELECT machine_id
        FROM machines
        WHERE pan_id=%s AND node_id=%s
        LIMIT 1
    """,
        (pan_id, node_id),
    )
    machine_row = cursor.fetchone()
    machine_id = machine_row["machine_id"] if machine_row else None

    blocks = []
    previous_time = start

    for idx, r in enumerate(rows):
        ts_dt = r["time"]
        ts_str = ts_dt.strftime("%Y-%m-%d %H:%M:%S")

        if (ts_dt - previous_time) > timedelta(minutes=10):
            blocks.append(
                {
                    "relevant_status": "lost_signal",
                    "inactive": False,
                    "service": False,
                    "status_code": None,
                    "start_time": previous_time.strftime("%Y-%m-%d %H:%M:%S"),
                    "end_time": ts_str,
                }
            )

        bits = bin(r["status_code"])[2:].zfill(8)[::-1]
        inactive = bits[2] == "1"
        service = bits[3] == "1"

        rel_stat = "irrelevant"
        if inactive or service:
            if machine_id:
                cursor.execute(
                    """
                    SELECT is_on
                    FROM machines_working
                    WHERE machine_id = %s AND shift = %s AND changed_at <= %s AND changed_at >= %s
                    ORDER BY changed_at DESC
                    LIMIT 1
                """,
                    (machine_id, shift, ts_dt, start),
                )
                work_row = cursor.fetchone()
                if work_row and work_row["is_on"] == 0:
                    rel_stat = "not_schedule"
                else:
                    rel_stat = "inactive" if inactive else "both"
            else:
                rel_stat = "inactive" if inactive else "both"

        if not blocks or blocks[-1]["relevant_status"] != rel_stat:
            blocks.append(
                {
                    "relevant_status": rel_stat,
                    "inactive": inactive,
                    "service": service,
                    "status_code": r["status_code"],
                    "start_time": ts_str,
                    "real_end_time": ts_str,
                    "_last_time_dt": ts_dt,
                }
            )
        else:
            blocks[-1]["real_end_time"] = ts_str
            blocks[-1]["_last_time_dt"] = ts_dt

        previous_time = ts_dt

    for i in range(len(blocks) - 1):
        blocks[i]["end_time"] = blocks[i + 1]["start_time"]
    if blocks:
        last_block = blocks[-1]
        last_block["end_time"] = last_block["real_end_time"]
        final_time = datetime.strptime(last_block["end_time"], "%Y-%m-%d %H:%M:%S")
        if (end - final_time) > timedelta(minutes=10) and (
            datetime.now() - final_time
        ) > timedelta(minutes=10):
            lost_signal_end = min(final_time + timedelta(minutes=10), end)
            blocks.append(
                {
                    "relevant_status": "lost_signal",
                    "inactive": False,
                    "service": False,
                    "status_code": None,
                    "start_time": final_time.strftime("%Y-%m-%d %H:%M:%S"),
                    "end_time": lost_signal_end.strftime("%Y-%m-%d %H:%M:%S"),
                }
            )

    total_downtime = timedelta()
    total_uptime = timedelta()
    total_stops = 0

    for b in blocks:
        b.pop("_last_time_dt", None)
        start_b = datetime.strptime(b["start_time"], "%Y-%m-%d %H:%M:%S")
        end_b = datetime.strptime(b["end_time"], "%Y-%m-%d %H:%M:%S")
        if start_b == end_b:
            end_b += timedelta(seconds=10)
            b["end_time"] = end_b.strftime("%Y-%m-%d %H:%M:%S")
        dur = end_b - start_b
        if b["relevant_status"] in ("inactive", "both"):
            total_downtime += dur
            total_stops += 1
        elif b["relevant_status"] == "irrelevant":
            total_uptime += dur

    conn.close()

    return jsonify(
        {
            "blocks": blocks,
            "start": start.strftime("%Y-%m-%d %H:%M:%S"),
            "end": end.strftime("%Y-%m-%d %H:%M:%S"),
            "downtime": int(total_downtime.total_seconds()),
            "uptime": int(total_uptime.total_seconds()),
            "total_stops": total_stops,
            "real_downtime": int(last_status["time_inactive"]) if last_status else None,
            "real_uptime": int(last_status["time_ok"]) if last_status else None,
        }
    )


# Ruta para ontener los datos de estado y la línea de tiempo para un PAN ID completo
@bp.route("/debug-status-data-tl-pan")
def debug_status_data_pan():
    pan_id = request.args.get("pan")
    date_str = request.args.get("date")
    shift = request.args.get("shift", "")

    if not pan_id or not date_str:
        return jsonify(
            {
                "blocks": [],
                "start": "",
                "end": "",
                "downtime": 0,
                "uptime": 0,
                "total_stops": 0,
            }
        )

    fecha_base = datetime.strptime(date_str, "%Y-%m-%d")
    start, end = get_shift_times(fecha_base, shift)

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT node_id, time, status_code
        FROM logged_data
        WHERE pan_id = %s
          AND time BETWEEN %s AND %s
          AND status_code <> 0
        ORDER BY node_id, time
    """,
        (pan_id, start, end),
    )
    raw = cursor.fetchall()

    machine_data = defaultdict(list)
    for row in raw:
        machine_data[row["node_id"]].append(row)

    node_to_machine = {}
    for node in machine_data:
        cursor.execute(
            """
            SELECT machine_id
            FROM machines
            WHERE pan_id = %s AND node_id = %s
            LIMIT 1
        """,
            (pan_id, node),
        )
        res = cursor.fetchone()
        if res:
            node_to_machine[node] = res["machine_id"]

    conn.commit()

    step = timedelta(seconds=10)
    ref_times = []
    t = start
    now = datetime.now()
    while t <= end and t <= now:
        ref_times.append(t)
        t += step

    def derive_status(code):
        bits = bin(code)[2:].zfill(8)[::-1]
        return "inactive" if bits[2] == "1" else "irrelevant"

    LOST_SIGNAL_THRESHOLD = timedelta(minutes=10)

    consolidated = []
    for ref in ref_times:
        states = []
        inactives = []
        lost_signals = []

        for node, logs in machine_data.items():
            last = None
            for r in logs:
                if r["time"] <= ref:
                    last = r
                else:
                    break

            if last is None:
                lost_signals.append(node)
            else:
                if ref - last["time"] > LOST_SIGNAL_THRESHOLD:
                    lost_signals.append(node)
                else:
                    st = derive_status(last["status_code"])
                    states.append(st)
                    if st == "inactive":
                        inactives.append((node, last["time"]))

        total_machines = len(machine_data)
        lost_count = len(lost_signals)

        if total_machines == 0:
            consolidated.append((ref, "irrelevant"))
        elif lost_count == total_machines:
            consolidated.append((ref, "lost_signal"))
        else:
            if all(s == "inactive" for s in states):
                all_excused = True
                for node, log_time in inactives:
                    mid = node_to_machine.get(node)
                    if not mid:
                        all_excused = False
                        break
                    cursor.execute(
                        """
                        SELECT is_on
                        FROM machines_working
                        WHERE machine_id = %s
                        AND shift = %s
                        AND changed_at <= %s
                        AND changed_at >= %s
                        ORDER BY changed_at DESC
                        LIMIT 1
                    """,
                        (mid, shift, log_time, start),
                    )
                    w = cursor.fetchone()
                    if not w or w["is_on"] == 1:
                        all_excused = False
                        break
                status = "not_schedule" if all_excused else "inactive"
            else:
                status = "irrelevant"
            consolidated.append((ref, status))

    blocks = []
    prev_ts = None
    for ts, st in consolidated:
        ts_str = ts.strftime("%Y-%m-%d %H:%M:%S")

        if prev_ts and (ts - prev_ts) > timedelta(minutes=10):
            end_gap = min(prev_ts + timedelta(minutes=10), end)
            blocks.append(
                {
                    "relevant_status": "lost_signal",
                    "start_time": prev_ts.strftime("%Y-%m-%d %H:%M:%S"),
                    "end_time": end_gap.strftime("%Y-%m-%d %H:%M:%S"),
                }
            )

        if not blocks or blocks[-1]["relevant_status"] != st:
            blocks.append(
                {
                    "relevant_status": st,
                    "start_time": ts_str,
                    "real_end_time": ts_str,
                    "_last_time_dt": ts,
                }
            )
        else:
            blocks[-1]["real_end_time"] = ts_str
            blocks[-1]["_last_time_dt"] = ts

        prev_ts = ts

    cleaned = []
    total_down = timedelta()
    total_up = timedelta()
    stops = 0
    min_dur = timedelta(seconds=10)

    for i, b in enumerate(blocks):
        start_b = datetime.strptime(b["start_time"], "%Y-%m-%d %H:%M:%S")
        end_b = (
            datetime.strptime(blocks[i + 1]["start_time"], "%Y-%m-%d %H:%M:%S")
            if i + 1 < len(blocks)
            else datetime.strptime(b["real_end_time"], "%Y-%m-%d %H:%M:%S")
        )

        if end_b == start_b:
            end_b += min_dur

        dur = end_b - start_b
        b["end_time"] = end_b.strftime("%Y-%m-%d %H:%M:%S")

        if dur >= min_dur:
            if b["relevant_status"] == "inactive":
                total_down += dur
                stops += 1
            elif b["relevant_status"] == "irrelevant":
                total_up += dur
            elif b["relevant_status"] == "lost_signal":
                total_down += dur
            b.pop("_last_time_dt", None)
            b.pop("real_end_time", None)
            cleaned.append(b)

    conn.close()

    return jsonify(
        {
            "blocks": cleaned,
            "start": start.strftime("%Y-%m-%d %H:%M:%S"),
            "end": end.strftime("%Y-%m-%d %H:%M:%S"),
            "downtime": int(total_down.total_seconds()),
            "uptime": int(total_up.total_seconds()),
            "total_stops": stops,
        }
    )


# Ruta para obtener el ultimo estado para un PAN ID completo (debug)
@bp.route("/debug-last-status-pan")
def debug_last_status_pan():
    pan_id = request.args.get("pan")
    date_str = request.args.get("date")
    shift = request.args.get("shift", "")

    if not pan_id or not date_str:
        return jsonify({"relevant_status": None})

    fecha_base = datetime.strptime(date_str, "%Y-%m-%d")
    start, end = get_shift_times(fecha_base, shift)
    now = datetime.now()
    check_limit = min(end, now)

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT node_id, time, status_code
        FROM logged_data
        WHERE pan_id = %s
          AND time BETWEEN %s AND %s
          AND status_code <> 0
        ORDER BY node_id, time
    """,
        (pan_id, start, end),
    )
    rows = cursor.fetchall()

    if not rows:
        conn.close()
        return jsonify({"relevant_status": "lost_signal"})

    last_by_machine = {}
    for r in rows:
        node = r["node_id"]
        last_by_machine[node] = r

    all_lost_signal = True
    for r in last_by_machine.values():
        last_time = r["time"]
        if (check_limit - last_time) <= timedelta(minutes=10):
            all_lost_signal = False
            break

    if all_lost_signal:
        conn.close()
        return jsonify({"relevant_status": "lost_signal"})

    def is_inactive(code: int) -> bool:
        bits = bin(code)[2:].zfill(8)[::-1]
        return bits[2] == "1"

    all_inactive = True
    inactives = []

    for r in last_by_machine.values():
        if is_inactive(r["status_code"]):
            inactives.append((r["node_id"], r["time"]))
        else:
            all_inactive = False
            break

    if not all_inactive:
        conn.close()
        return jsonify({"relevant_status": "irrelevant"})

    all_excused = True
    for node_id, log_time in inactives:
        cursor.execute(
            """
            SELECT machine_id
            FROM machines
            WHERE pan_id = %s AND node_id = %s
            LIMIT 1
        """,
            (pan_id, node_id),
        )
        result = cursor.fetchone()
        if not result:
            all_excused = False
            break
        machine_id = result["machine_id"]
        cursor.execute(
            """
            SELECT is_on
            FROM machines_working
            WHERE machine_id = %s AND shift = %s AND changed_at <= %s AND changed_at >= %s
            ORDER BY changed_at DESC
            LIMIT 1
        """,
            (machine_id, shift, log_time, start),
        )
        work = cursor.fetchone()
        if not work or work["is_on"] == 1:
            all_excused = False
            break

    conn.close()

    status = "not_schedule" if all_excused else "inactive"
    return jsonify({"relevant_status": status})
