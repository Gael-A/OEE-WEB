
// -------------------------------------------------------------
// MÓDULO PARA MANEJAR EL ID DEL REPORTE DIARIO
// -------------------------------------------------------------
var dailyReportModule = (function() {
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
    let hour = parseInt(firstPieceAtHour.value, 10);
    const minute = firstPieceAtMinute.value.padStart(2, '0');
    const meridiem = firstPieceAtMeridiem.value;

    // Convertir a 24 horas
    if (meridiem === "PM" && hour !== 12) {
        hour += 12;
    } else if (meridiem === "AM" && hour === 12) {
        hour = 0;
    }

    const hour24 = String(hour).padStart(2, '0');

    return `${hour24}:${minute}:00`;
}


// -------------------------------------------------------------
// FUNCIÓN PARA CERRAR EL REPORTE DE INICIO DE TURNO
// -------------------------------------------------------------
async function closeShiftStartReport() {
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
            headers: { 'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            showToast(result.message, true);
            document.querySelectorAll('.daily-start-section input, .daily-start-section select').forEach(input => {
                input.disabled = true;
            });
            closeButton.classList.add('hidden');
        } else {
            showToast(result.error || 'Failed to close shift start report.', false);
        }
        
    } catch (error) {
        console.error('Error closing shift start report:', error);
        showToast('An error occurred while closing the shift start report.', false);
    }
}
