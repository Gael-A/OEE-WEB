from collections import defaultdict
from datetime import datetime, timedelta
import hashlib
from colorsys import hls_to_rgb
import math
import collections
from flask import session


def timedelta_to_hhmm(td):
    if td is None:
        return None
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    return f"{hours:02d}:{minutes:02d}"


def get_weekday(date_str: str, language = 'en'):
    dt = datetime.strptime(date_str, "%Y-%m-%d")

    if language == 'es':
        days = [
            "Lunes",
            "Martes",
            "Miércoles",
            "Jueves",
            "Viernes",
            "Sábado",
            "Domingo",
        ]

        return {
            "number": dt.weekday(),
            "name": days[dt.weekday()]
        }
    
    elif language == 'pl':
        days = [
            "Poniedziałek",
            "Wtorek",
            "Środa",
            "Czwartek",
            "Piątek",
            "Sobota",
            "Niedziela"
        ]

        return {
            "number": dt.weekday(),
            "name": days[dt.weekday()]
        }

    else:    
        return {
            "number": dt.weekday(),
            "name": dt.strftime("%A")
        }

def get_week_dates(date_str: str):
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    
    monday = dt - timedelta(days=dt.weekday())
    
    return [
        (monday + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(7)
    ]

def get_shift_times(fecha_base, shift):
    if shift == "1":
        return fecha_base.replace(hour=6, minute=30), fecha_base.replace(hour=16, minute=0)
    elif shift == "2":
        return fecha_base.replace(hour=16, minute=20), (fecha_base + timedelta(days=1)).replace(hour=0, minute=20)
    elif shift == "3":
        return fecha_base.replace(hour=0, minute=40), fecha_base.replace(hour=6, minute=0)
    else:
        return (fecha_base.replace(hour=0, minute=40), (fecha_base + timedelta(days=1)).replace(hour=0, minute=20))

def get_shift_times_tuple(fecha_base, shift):
    """
    Returns a list of tuples, each containing the start and end times for the specified shift(s).
    """
    if shift == "1":
        return [(fecha_base.replace(hour=6, minute=30), fecha_base.replace(hour=16, minute=0))]
    elif shift == "2":
        return [(fecha_base.replace(hour=16, minute=20), (fecha_base + timedelta(days=1)).replace(hour=0, minute=20))]
    elif shift == "3":
        return [(fecha_base.replace(hour=0, minute=40), fecha_base.replace(hour=6, minute=0))]
    else:
        # Returns all three shift ranges as a list of tuples for the "all shifts" case
        return [
            (fecha_base.replace(hour=6, minute=30), fecha_base.replace(hour=16, minute=0)),
            (fecha_base.replace(hour=16, minute=20), (fecha_base + timedelta(days=1)).replace(hour=0, minute=20)),
            (fecha_base.replace(hour=0, minute=40), fecha_base.replace(hour=6, minute=0))
        ]

def shift_time(shift_number):
    """
    Returns the total shift duration in hours based on the shift number.

    Args:
        shift_number (str): The shift number ('1', '2', '3').

    Returns:
        float: The duration of the shift in hours.
    """
    if shift_number == "1":
        return 9.5
    elif shift_number == "2":
        return 8.0
    elif shift_number == "3":
        return 5 + (1 / 3)
    else:
        return 24.0

def _calculate_target_per_hour(cursor, daily_id, part_no, rounded=True, updates=None):
    """
    Retorna el target_per_hour para el reporte daily_id y part_no.
    Si updates incluye 'op_no', lo toma de ahí; si no, lo lee de daily_production_report.
    """
    cursor.execute(
        "SELECT ideal_op_no, ideal_target_per_hour FROM part_no_rates WHERE part_no = %s",
        (part_no,),
    )
    rate_info = cursor.fetchone()
    if not rate_info:
        return None

    ideal_op_no = rate_info["ideal_op_no"]
    ideal_target_per_hour = rate_info["ideal_target_per_hour"]

    if updates and "op_no" in updates:
        op_no = updates["op_no"]
    else:
        cursor.execute(
            "SELECT op_no FROM daily_production_report WHERE id = %s", (daily_id,)
        )
        row = cursor.fetchone()
        op_no = row["op_no"] if row else None

    try:
        op_no = float(op_no)
        ideal_op_no = float(ideal_op_no)
        ideal_target_per_hour = float(ideal_target_per_hour)

        calculated_value = ideal_target_per_hour / ideal_op_no * op_no

        if rounded:
            # return round(calculated_value / 5) * 5
            # return math.ceil(calculated_value)
            return calculated_value
        else:
            return calculated_value

    except (TypeError, ValueError, ZeroDivisionError):
        return None

def derive_relevant_status(inactive, service):
    if inactive and service:
        return "both"
    elif not inactive and not service:
        return "irrelevant"
    elif not inactive and service:
        return "service"
    elif inactive and not service:
        return "inactive"
    else:
        return "irrelevant"

def format_timedelta(td):
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    return f"{hours:02}:{minutes:02}:{seconds:02}"

def compute_time_on_for_machine(cursor, machine_id, shift, shift_start, shift_end):
    """
    Devuelve time_on en segundos (tiempo con is_on=1) para la máquina en el turno.
    Se asume que al inicio del turno is_on=1.
    """
    cursor.execute(
        """
        SELECT is_on, changed_at
        FROM machines_working
        WHERE machine_id = %s
          AND shift = %s
          AND changed_at >= %s
          AND changed_at < %s
        ORDER BY changed_at ASC
        """,
        (machine_id, shift, shift_start, shift_end),
    )
    rows = cursor.fetchall()

    current_state = 1  # se asume on al inicio del turno
    current_time = shift_start
    time_on = timedelta()

    for row in rows:
        change_time = row["changed_at"]
        duration = change_time - current_time
        if current_state == 1:
            time_on += duration
        current_state = row["is_on"]
        current_time = change_time

    # cerrar hasta el final del turno
    final_duration = shift_end - current_time
    if current_state == 1:
        time_on += final_duration

    return int(time_on.total_seconds())  # segundos

def compute_availability_base_and_time_ok(cursor, pan_id, node_id, start, end):
    """
    Extrae availability_base (como porcentaje) y time_ok desde logged_data para un node dentro de un turno.
    """
    cursor.execute(
        """
        SELECT time_ok, time_in_service, time_inactive
        FROM logged_data
        WHERE pan_id = %s AND node_id = %s AND time >= %s AND time < %s
        ORDER BY time DESC
        LIMIT 1
        """,
        (pan_id, node_id, start, end),
    )
    logged = cursor.fetchone()
    if not logged:
        return 0.0, 0

    total = int(logged.get("time_ok") or 0)
    service = int(logged.get("time_in_service") or 0)
    inactive = int(logged.get("time_inactive") or 0)
    availability_base = 0.0
    if total > 0:
        availability_base = round((total - inactive - service) / total * 100)
    return availability_base, total

def adjusted_availability(availability_base, time_ok, time_on):
    """
    Aplica la fórmula: (availability_base * time_ok) / time_on
    Protege división por cero.
    """
    if time_on <= 0:
        return 0
    if time_ok > time_on:
        return availability_base
    print(
        f"availability_base: {availability_base}, time_ok: {time_ok}, time_on: {time_on}"
    )
    return int((availability_base * time_ok) / time_on)

def generate_color_from_id(id_string, fixed_saturation, fixed_lightness):
    hash_object = hashlib.md5(id_string.encode("utf-8"))
    hex_digest = hash_object.hexdigest()
    hue = int(hex_digest, 16) % 360

    r, g, b = hls_to_rgb(hue / 360, fixed_saturation, fixed_lightness)

    r = int(r * 255)
    g = int(g * 255)
    b = int(b * 255)

    return f"#{r:02x}{g:02x}{b:02x}"



def status_data_pan_internal(pan_id, fecha_base, shift, cursor):
    start, end = get_shift_times(fecha_base, shift)

    # --- Consultas a la base de datos ---
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

    if not all_logs:
        return {
            "inactive": 0,
            "time_ok": 0,
            "stops": 0,
        }

    last_log_time = all_logs[-1]["time"]

    cursor.execute(
        """
        SELECT machine_id, node_id
        FROM machines
        WHERE pan_id = %s
        """,
        (pan_id,),
    )
    node_to_machine = {row["node_id"]: row["machine_id"] for row in cursor.fetchall()}

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
            (tuple(machine_ids), shift, start, end),
        )
        for row in cursor.fetchall():
            working_logs_by_machine[row["machine_id"]].append(row)

    blocks, downtime, uptime, stops = process_logs_to_blocks(
        all_logs=all_logs,
        node_to_machine=node_to_machine,
        working_logs_by_machine=working_logs_by_machine,
        start=start,
        end=end,
        min_duration=timedelta(seconds=10),  # Aplica la duración mínima aquí
    )

    return {
        "downtime": downtime,
        "uptime": uptime,
        "stops": stops,
    }

def process_logs_to_blocks(all_logs, node_to_machine, working_logs_by_machine, start, end, min_duration=None):
    """
    Genera bloques de tiempo consolidados a partir de los logs de la base de datos.

    Args:
        all_logs (list): Lista de logs de todos los nodos.
        node_to_machine (dict): Mapeo de node_id a machine_id.
        working_logs_by_machine (defaultdict): Logs de encendido/apagado por máquina.
        start (datetime): Hora de inicio del período.
        end (datetime): Hora de fin del período.
        min_duration (timedelta, opcional): Duración mínima para considerar un bloque.

    Returns:
        tuple: (list of blocks, downtime, uptime, stops)
    """

    logs_by_node = collections.defaultdict(list)
    for log in all_logs:
        logs_by_node[log["node_id"]].append(log)

    current_is_on_state = {}
    step = timedelta(seconds=10)
    reference_times = []
    t = start
    while t <= end and t <= datetime.now():
        reference_times.append(t)
        t += step

    consolidated = []
    log_iterators = {node_id: iter(logs) for node_id, logs in logs_by_node.items()}
    next_logs = {node_id: next(logs, None) for node_id, logs in log_iterators.items()}

    for ref_time in reference_times:
        states = []
        for node_id in logs_by_node.keys():
            machine_id = node_to_machine.get(node_id)

            last_log = None
            while next_logs[node_id] and next_logs[node_id]["time"] <= ref_time:
                last_log = next_logs[node_id]
                next_logs[node_id] = next(log_iterators[node_id], None)

            if last_log:
                if machine_id:
                    if machine_id not in current_is_on_state:
                        initial_is_on = 1
                        node_working_logs = working_logs_by_machine.get(machine_id, [])
                        if node_working_logs and node_working_logs[0]["is_on"] == 0:
                            initial_is_on = 0
                        current_is_on_state[machine_id] = initial_is_on

                    while (
                        working_logs_by_machine.get(machine_id)
                        and working_logs_by_machine[machine_id][0]["changed_at"]
                        <= last_log["time"]
                    ):
                        current_is_on_state[machine_id] = working_logs_by_machine[
                            machine_id
                        ].pop(0)["is_on"]

                bits = bin(last_log["status_code"])[2:].zfill(8)[::-1]
                inactive = bits[2] == "1"

                rel_stat = "irrelevant"
                if inactive:
                    if machine_id and current_is_on_state.get(machine_id, 1) == 0:
                        rel_stat = "not_schedule"
                    else:
                        rel_stat = "inactive"
                states.append(rel_stat)

        if not states:
            continue

        if all(s == "inactive" for s in states):
            status = "inactive"
        elif all(s == "not_schedule" for s in states):
            status = "not_schedule"
        else:
            status = "irrelevant"

        consolidated.append((ref_time, status))

    blocks = []
    for ts, status in consolidated:
        ts_str = ts.strftime("%Y-%m-%d %H:%M:%S")
        if not blocks or blocks[-1]["relevant_status"] != status:
            blocks.append(
                {
                    "relevant_status": status,
                    "start_time": ts_str,
                    "_last_time_dt": ts,
                }
            )
        else:
            blocks[-1]["_last_time_dt"] = ts

    total_downtime = timedelta()
    total_uptime = timedelta()
    total_stops = 0
    cleaned_blocks = []

    for i, block in enumerate(blocks):
        start_b = datetime.strptime(block["start_time"], "%Y-%m-%d %H:%M:%S")

        if i + 1 < len(blocks):
            end_b = datetime.strptime(blocks[i + 1]["start_time"], "%Y-%m-%d %H:%M:%S")
        else:
            end_b = min(block["_last_time_dt"], end, datetime.now())
            if end_b == start_b:
                end_b += timedelta(seconds=10)

        dur = end_b - start_b
        block["end_time"] = end_b.strftime("%Y-%m-%d %H:%M:%S")

        if min_duration is None or dur >= min_duration:
            if block["relevant_status"] == "inactive":
                total_downtime += dur
                total_stops += 1
            elif block["relevant_status"] == "irrelevant":
                total_uptime += dur

            block.pop("_last_time_dt", None)
            cleaned_blocks.append(block)

    return (
        cleaned_blocks,
        int(total_downtime.total_seconds()),
        int(total_uptime.total_seconds()),
        total_stops,
    )

def process_machine_logs_to_blocks(logs, working_logs, machine_id, start, end):
    blocks = []
    current_is_on_state = 1
    if working_logs and working_logs[0]["is_on"] == 0:
        current_is_on_state = 0

    logs = sorted(logs, key=lambda x: x["time"])
    
    for r in logs:
        ts_dt = r["time"]
        ts_str = ts_dt.strftime("%Y-%m-%d %H:%M:%S")
        working_logs = sorted(working_logs, key=lambda x: x["changed_at"])
        while working_logs and working_logs[0]["changed_at"] <= ts_dt:
            current_is_on_state = working_logs.pop(0)["is_on"]

        bits = bin(r["status_code"])[2:].zfill(8)[::-1]
        inactive = bits[2] == "1"
        service = bits[3] == "1"

        rel_stat = "irrelevant"
        if service:
            rel_stat = "service"
        elif inactive:
            if machine_id and current_is_on_state == 0:
                rel_stat = "not_schedule"
            else:
                rel_stat = "inactive"


        if not blocks or blocks[-1]["relevant_status"] != rel_stat or (ts_dt - blocks[-1]["_last_time_dt"]) > timedelta(minutes=10):
            blocks.append(
                {
                    "relevant_status": rel_stat,
                    "inactive": inactive,
                    "service": service,
                    "status_code": r["status_code"],
                    "start_time": ts_str,
                    "_last_time_dt": ts_dt,
                    "real_end_time_dt": ts_dt,
                }
            )
        else:
            blocks[-1]["_last_time_dt"] = ts_dt
            blocks[-1]["real_end_time_dt"] = ts_dt  

    total_downtime = timedelta()
    total_uptime = timedelta()
    total_stops = 0

    if session.get("role") == "admin":
        # Lógica para el rol 'admin'
        for i, block in enumerate(blocks):
            start_b = datetime.strptime(block["start_time"], "%Y-%m-%d %H:%M:%S")
            end_b = block["real_end_time_dt"]
            
            if i + 1 >= len(blocks):
                end_b = min(end_b, end, datetime.now())
            
            dur = end_b - start_b
            
            if dur.total_seconds() <= 0:
                dur = timedelta(seconds=1)
            
            block["end_time"] = end_b.strftime("%Y-%m-%d %H:%M:%S")
            
            # Limpieza de datos
            block.pop("_last_time_dt", None)
            block.pop("real_end_time_dt", None)

            if block["relevant_status"] in {"inactive", "service"}:
                total_downtime += dur
                total_stops += 1
            elif block["relevant_status"] == "irrelevant":
                total_uptime += dur
    
    else:
        # Lógica para otros roles (no 'admin')
        for i, block in enumerate(blocks):
            start_b = datetime.strptime(block["start_time"], "%Y-%m-%d %H:%M:%S")
            
            if i + 1 < len(blocks):
                end_b = datetime.strptime(blocks[i + 1]["start_time"], "%Y-%m-%d %H:%M:%S")
            else:
                real_end_time_final = block["_last_time_dt"]
                end_b = min(real_end_time_final, end, datetime.now())
            
            if start_b == end_b:
                end_b += timedelta(seconds=1)
            
            real_end_b = block["real_end_time_dt"]
            
            dur = end_b - start_b
            block["end_time"] = end_b.strftime("%Y-%m-%d %H:%M:%S")
            block["real_end_time"] = real_end_b.strftime("%Y-%m-%d %H:%M:%S")
            
            # Limpieza de datos
            block.pop("_last_time_dt", None)
            block.pop("real_end_time_dt", None)
            
            if block["relevant_status"] in {"inactive", "service"}:
                total_downtime += dur
                total_stops += 1
            elif block["relevant_status"] == "irrelevant":
                total_uptime += dur

    return (
        blocks,
        int(total_downtime.total_seconds()),
        int(total_uptime.total_seconds()),
        total_stops,
    )


