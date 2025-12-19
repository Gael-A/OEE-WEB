// -------------------------------------------------------------
// MÓDULO PARA MANEJAR EL ID DEL REPORTE DIARIO
// -------------------------------------------------------------
var dailyReportModule = (function () {
    let currentReportId = null;

    function init(reportId) {
        currentReportId = reportId;
    }

    function getReportId() {
        return currentReportId;
    }

    return {
        init: init,
        getReportId: getReportId
    };
})();


// -------------------------------------------------------------
// FUNCIÓN PARA CONVERTIR LA HORA DE FIRST PIECE A FORMATO 24 HORAS
// -------------------------------------------------------------
function getFirstPieceAt24() {
    const firstPieceAtHour = document.getElementById('first_piece_at_hour');
    const firstPieceAtMinute = document.getElementById('first_piece_at_minute');
    const firstPieceAtMeridiem = document.getElementById('first_piece_at_meridiem');

    let hour = parseInt(firstPieceAtHour.value, 10);
    const minute = firstPieceAtMinute.value.padStart(2, '0');
    const meridiem = firstPieceAtMeridiem.value;

    if (meridiem === "PM" && hour !== 12) hour += 12;
    else if (meridiem === "AM" && hour === 12) hour = 0;

    return `${String(hour).padStart(2, '0')}:${minute}:00`;
}


// -------------------------------------------------------------
// FUNCIÓN PARA CERRAR EL REPORTE DE INICIO DE TURNO
// -------------------------------------------------------------
async function closeShiftStartReport() {
    const closeButton = document.getElementById('close-start-report-button');
    const firstPieceComment = document.getElementById('first_piece_comment');
    const noOpStartInput = document.getElementById('no_op_start');
    const noOpBalancingInput = document.getElementById('no_op_balancing');
    const noOpBalancingComment = document.getElementById('no_op_balancing_comment');
    const isLineWet = document.getElementById('is_line_wet');
    const lineWetComment = document.getElementById('line_wet_comment');

    if (closeButton.classList.contains('disabled')) {
        showToast('Please fill in all required fields before closing the report.', false);
        return;
    }

    try {
        const payload = {
            daily_id: dailyReportModule.getReportId(),
            first_piece_at: getFirstPieceAt24(),
            first_piece_comment: firstPieceComment.value,
            no_op_start: noOpStartInput.value,
            no_op_balancing: noOpBalancingInput.value,
            no_op_comment: noOpBalancingComment.value,
            is_line_wet: isLineWet.value,
            is_line_wet_comment: lineWetComment.value
        };

        const response = await fetch('/create-shift-start-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            showToast(result.message, true);

            document
                .querySelectorAll('.daily-start-section input, .daily-start-section select')
                .forEach(input => input.disabled = true);

            closeButton.classList.add('hidden');
        } else {
            showToast(result.error || 'Failed to close shift start report.', false);
        }

    } catch (error) {
        console.error('Error closing shift start report:', error);
        showToast('An error occurred while closing the shift start report.', false);
    }
}


// -------------------------------------------------------------
// CONFIRM PERSONALIZADO (YA EXISTENTE)
// -------------------------------------------------------------
function customConfirm(message, title = 'Confirmación') {
    return showDialog({
        title,
        message,
        type: 'confirm',
        buttons: [
            { text: 'Cancelar', class: 'secondary', value: false },
            { text: 'Confirmar', class: 'primary', value: true }
        ]
    });
}


// -------------------------------------------------------------
// AUTO-ALERTA SI PASA 1 MINUTO CON TODO LLENO
// -------------------------------------------------------------
let autoCloseTimer = null;
let autoCloseTriggered = false;


// Valida si todos los campos requeridos están llenos
function areAllStartReportInputsFilled() {
    const requiredInputs = [
        'first_piece_at_hour',
        'first_piece_at_minute',
        'first_piece_at_meridiem',
        'no_op_start',
        'no_op_balancing',
        'is_line_wet'
    ];

    return requiredInputs.every(id => {
        const el = document.getElementById(id);
        return el && el.value !== '' && el.value !== null;
    });
}


// Inicia el contador de 1 minuto
function startAutoCloseCountdown() {
    if (autoCloseTimer || autoCloseTriggered) return;

    autoCloseTimer = setTimeout(async () => {
        autoCloseTimer = null;

        const closeButton = document.getElementById('close-start-report-button');
        if (!closeButton || closeButton.classList.contains('hidden')) return;

        const confirm = await customConfirm(
            'Ya pasó más de un minuto desde que completaste el reporte.\n\n¿Deseas guardarlo y cerrar el reporte de inicio de turno?',
            'Cerrar reporte'
        );

        autoCloseTriggered = true;

        if (confirm) {
            closeShiftStartReport();
        }
    }, 60_000);
}


// Resetea el contador si el usuario vuelve a editar
function resetAutoCloseTimer() {
    if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
    }
    autoCloseTriggered = false;
}


// -------------------------------------------------------------
// INICIALIZADOR DE LISTENERS
// -------------------------------------------------------------
function initAutoCloseWatcher() {
    const inputs = document.querySelectorAll(
        '.daily-start-section input, .daily-start-section select'
    );

    inputs.forEach(input => {
        input.addEventListener('input', () => {
            resetAutoCloseTimer();
            if (areAllStartReportInputsFilled()) {
                startAutoCloseCountdown();
            }
        });

        input.addEventListener('change', () => {
            resetAutoCloseTimer();
            if (areAllStartReportInputsFilled()) {
                startAutoCloseCountdown();
            }
        });
    });
}


// -------------------------------------------------------------
// INIT GLOBAL
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initAutoCloseWatcher();
});
