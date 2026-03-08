const DEFAULT_SHIFT_TIMES = {
    1: [
        "06:30 - 07:30", "07:30 - 08:30", "08:30 - 09:30", "09:30 - 10:30",
        "10:30 - 11:30", "11:30 - 12:30", "12:30 - 13:30", "13:30 - 14:30",
        "14:30 - 15:30", "15:30 - 16:00"
    ],
    2: [
        "16:20 - 17:00", "17:00 - 18:00", "18:00 - 19:00", "19:00 - 20:00",
        "20:00 - 21:00", "21:00 - 22:00", "22:00 - 23:00", "23:00 - 00:00",
        "00:00 - 00:20"
    ],
    3: [
        "00:40 - 01:00", "01:00 - 02:00", "02:00 - 03:00", "03:00 - 04:00",
        "04:00 - 05:00", "05:00 - 06:00"
    ]
};

export async function fetchPanSchedule(panId) {
    try {
        const response = await fetch(`/api/pan-schedule/by-pan/${panId}`);
        if (!response.ok) throw new Error('Error al obtener horario');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error al obtener el horario del PAN:", error);
        return [];
    }
}

export function getShiftBreaksAdjust(shift) {
    switch (String(shift)) {
        case '1': return .83 / 9.5;
        case '2': return .83 / 8.3;
        case '3': return .83 / 5.3;
        default: return 0;
    }
}


export function generateShiftTimesFromSchedule(schedule) {
    return schedule
        .sort((a, b) => a.start_hour.localeCompare(b.start_hour))
        .map(item => ({
            label: `${item.start_hour.slice(0, 5)} - ${item.end_hour.slice(0, 5)}`,
            duration: item.duration
        }));
}

export function getShiftTimes(shift) {
    return DEFAULT_SHIFT_TIMES[shift] || [];
}

export function getShiftForTime(date) {
    const totalMins = date.getHours() * 60 + date.getMinutes();
    if (totalMins >= 40 && totalMins < 390) {
        return '3';
    }
    else if (totalMins >= 390 && totalMins < 980) {
        return '1';
    }
    else {
        return '2';
    }
}

export function getShiftInfo(shift) {
    switch (String(shift)) {
        case '1': return { number: '1', timeRange: '06:30 - 16:00' };
        case '2': return { number: '2', timeRange: '16:20 - 00:20' };
        case '3': return { number: '3', timeRange: '00:40 - 06:00' };
        default: return { number: '-', timeRange: 'N/A' };
    }
}

export function getShiftStart(shift, format) {
    switch (String(shift)) {
        case '1': return format ? '06:30' : { hours: 6, minutes: 30 };
        case '2': return format ? '16:20' : { hours: 16, minutes: 20 };
        case '3': return format ? '00:40' : { hours: 0, minutes: 40 };
        default: return format ? '--:--' : null;
    }
}

export function getShiftEnd(shift, format) {
    switch (String(shift)) {
        case '1': return format ? '16:00' : { hours: 16, minutes: 0 };
        case '2': return format ? '00:20' : { hours: 0, minutes: 20 };
        case '3': return format ? '06:00' : { hours: 6, minutes: 0 };
        default: return format ? '--:--' : null;
    }
}

export function getShiftFirstPieceAt(shift, format = true) {
    switch (String(shift)) {
        case '1': return format ? '06:45' : { hours: 6, minutes: 45 };
        case '2': return format ? '16:35' : { hours: 16, minutes: 35 };
        case '3': return format ? '00:55' : { hours: 0, minutes: 55 };
        default: return format ? '--:--' : null;
    }
}