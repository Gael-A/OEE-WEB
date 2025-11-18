from flask import Blueprint, request, jsonify
from datetime import datetime
from app.utils.db import get_connection
from app.utils.helpers import get_shift_times

bp = Blueprint('debug', __name__)

@bp.route("/all-data")
def all_data():
    pan_id = request.args.get("pan")
    date_str = request.args.get("date")
    shift = request.args.get("shift", "")
    
    if not pan_id or not date_str:
        return jsonify({"labels": [], "data": []})
    
    fecha_base = datetime.strptime(date_str, "%Y-%m-%d")
    start, end = get_shift_times(fecha_base, shift)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT * FROM logged_data 
        WHERE pan_id = %s AND time >= %s AND time <= %s 
        ORDER BY node_id, time
        """,
        (pan_id, start, end),
    )
    rows = cursor.fetchall()
    conn.close()

    data = [
        {
            "pan_id": row["pan_id"],
            "node_id": row["node_id"],
            "time": row["time"].strftime("%Y-%m-%d %H:%M:%S"),
            "efficiency": row["efficiency"],
            "status_code": row["status_code"],
            "time_inactive": row["time_inactive"],
        }
        for row in rows
    ]

    return jsonify(data)
