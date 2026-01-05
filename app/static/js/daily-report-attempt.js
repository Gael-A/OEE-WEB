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
        showToast(window.translations.fillAllRequiredFields, false);
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

            resetAutoCloseTimer();
            resetMissingStartReportTimer();

            closeButton.classList.add('hidden');
        } else {
            showToast(result.error || window.translations.failedToCloseShiftStartReport, false);
        }

    } catch (error) {
        console.error('Error closing shift start report:', error);
        showToast(window.translations.errorClosingShiftStartReport, false);
    }
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
            window.translations.autoSaveConfirmation,
            window.translations.closeReport
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
// AUTO-ALERTA SI PASAN 30 MINUTOS SIN REPORTE DE INICIO COMPLETADO
// (Se dispara cuando AL MENOS UNO de los requiredInputs está vacío)
// -------------------------------------------------------------
let missingStartReportTimer = null;
let missingStartReportTriggered = false;

// Devuelve true si HAY ALGÚN campo requerido vacío
function hasAnyStartReportInputEmpty() {
    const requiredInputs = [
        'first_piece_at_hour',
        'first_piece_at_minute',
        'first_piece_at_meridiem',
        'no_op_start',
        'no_op_balancing',
        'is_line_wet'
    ];

    return requiredInputs.some(id => {
        const el = document.getElementById(id);
        return !el || el.value === '' || el.value === null;
    });
}

function startMissingStartReportCountdown() {
    if (missingStartReportTimer || missingStartReportTriggered) return;

    missingStartReportTimer = setTimeout(async () => {
        missingStartReportTimer = null;

        const closeButton = document.getElementById('close-start-report-button');
        if (!closeButton || closeButton.classList.contains('hidden')) return;

        missingStartReportTriggered = true;

        await customAlert(
            window.translations.shiftStartReportMissingWarning,
            window.translations.attention
        );

    }, 30 * 60_000 ); // 30 minutos
}

function resetMissingStartReportTimer() {
    if (missingStartReportTimer) {
        clearTimeout(missingStartReportTimer);
        missingStartReportTimer = null;
    }
    missingStartReportTriggered = false;
}


// -------------------------------------------------------------
// INICIALIZADOR DE LISTENERS
// -------------------------------------------------------------
function initAutoCloseWatcher() {
    const inputs = document.querySelectorAll(
        '.daily-start-section input, .daily-start-section select'
    );

    // Si desde el inicio hay campos vacíos, iniciar el contador de 30 min
    if (hasAnyStartReportInputEmpty()) {
        startMissingStartReportCountdown();
    }

    inputs.forEach(input => {
        input.addEventListener('input', () => {
            // Resetea ambos timers cuando el usuario edita
            resetAutoCloseTimer();
            resetMissingStartReportTimer();

            if (areAllStartReportInputsFilled()) {
                // Si ya está todo lleno, iniciamos el contador de 1 minuto
                startAutoCloseCountdown();
            } else {
                // Si hay al menos uno vacío, iniciamos el contador de 30 minutos
                startMissingStartReportCountdown();
            }
        });

        input.addEventListener('change', () => {
            // Resetea ambos timers cuando el usuario cambia un select o similar
            resetAutoCloseTimer();
            resetMissingStartReportTimer();

            if (areAllStartReportInputsFilled()) {
                startAutoCloseCountdown();
            } else {
                startMissingStartReportCountdown();
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
