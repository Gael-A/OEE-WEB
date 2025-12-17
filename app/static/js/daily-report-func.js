import { getShiftFirstPieceAt } from './modules/shift-schedules.js';

let noOpInput;
let noOpStartInput;
let noOpBalancingInput;

let firstPieceComment;
let lineWetComment;
let noOpBalancingComment;

let closeButton;

let firstPieceAtHour;
let firstPieceAtMinute;
let firstPieceAtMeridiem;

let isLineWet;

// -------------------------------------------------------------
// ESPERA CORRECTA PARA OBTENER SHIFT (PROMISE + CACHE)
// -------------------------------------------------------------
let cachedShiftFirstPiece = null;

function waitForShiftFirstPiece() {
    if (cachedShiftFirstPiece) {
        return Promise.resolve(cachedShiftFirstPiece);
    }

    return new Promise(resolve => {
        const check = () => {
            if (window.filters?.shift) {
                cachedShiftFirstPiece = getShiftFirstPieceAt(window.filters.shift, false);
                resolve(cachedShiftFirstPiece);
                return true;
            }
            return false;
        };

        if (check()) return;

        const interval = setInterval(() => {
            if (check()) clearInterval(interval);
        }, 100);
    });
}

// -------------------------------------------------------------
// DOM READY
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
    noOpInput = document.getElementById('no_op');
    noOpStartInput = document.getElementById('no_op_start');
    noOpBalancingInput = document.getElementById('no_op_balancing');

    firstPieceComment = document.getElementById('first_piece_comment');
    lineWetComment = document.getElementById('line_wet_comment');
    noOpBalancingComment = document.getElementById('no_op_balancing_comment');

    closeButton = document.getElementById('close-start-report-button');

    firstPieceAtHour = document.getElementById('first_piece_at_hour');
    firstPieceAtMinute = document.getElementById('first_piece_at_minute');
    firstPieceAtMeridiem = document.getElementById('first_piece_at_meridiem');

    isLineWet = document.getElementById('is_line_wet');

    console.log('Daily Report Func JS loaded');

    // -------------------------------------------------------------
    // NO OP
    // -------------------------------------------------------------
    if (noOpInput && noOpStartInput) {
        noOpInput.addEventListener('input', function () {
            noOpStartInput.value = this.value;
            updateNoOpBalancing();
            checkIfAllInputsAreFilled();
        });

        noOpStartInput.addEventListener('input', function () {
            noOpInput.value = this.value;
            updateNoOpBalancing();
            checkIfAllInputsAreFilled();
        });
    }

    if (noOpBalancingInput && noOpStartInput) {
        noOpBalancingInput.addEventListener('input', function () {
            updateNoOpBalancing();
            checkIfAllInputsAreFilled();
        });
    }

    function updateNoOpBalancing() {
        const start = Number(noOpStartInput.value);
        const bal = Number(noOpBalancingInput.value);

        if (start < bal || start <= 0) {
            noOpStartInput.classList.add('negative');
            noOpBalancingComment.classList.add('negative');

            if (!noOpStartInput.classList.contains('initial-loaded') && !noOpBalancingInput.classList.contains('initial-loaded')) {
                noOpBalancingComment.value = noOpBalancingComment.dataset.previousValue || '';
                noOpBalancingComment.dataset.previousValue = '';
            }
        } else {
            noOpStartInput.classList.remove('negative');
            noOpBalancingComment.classList.remove('negative');

            if (!noOpStartInput.classList.contains('initial-loaded') && !noOpBalancingInput.classList.contains('initial-loaded')) {
                if (noOpBalancingComment.value !== 'OK') {
                    noOpBalancingComment.dataset.previousValue = noOpBalancingComment.value;
                }
                noOpBalancingComment.value = 'OK';
            }
        }
    }

    // -------------------------------------------------------------
    // FIRST PIECE TIME (CORREGIDO)
    // -------------------------------------------------------------
    if (firstPieceAtHour && firstPieceAtMinute && firstPieceAtMeridiem) {

        async function checkTimeAndApplyNegativeClass() {
            const hour12 = parseInt(firstPieceAtHour.value, 10);
            const minute = parseInt(firstPieceAtMinute.value, 10);
            const meridiem = firstPieceAtMeridiem.value;

            let hour24 = hour12;
            if (meridiem === 'PM' && hour12 !== 12) hour24 += 12;
            else if (meridiem === 'AM' && hour12 === 12) hour24 = 0;

            const { hours: comparison_hour, minutes: comparison_minute } = await waitForShiftFirstPiece();
            
            const isAfterShift =
            hour24 > comparison_hour || (hour24 === comparison_hour && minute > comparison_minute);
       
            if (isAfterShift) {
                firstPieceAtHour.classList.add('negative');
                firstPieceAtMinute.classList.add('negative');
                firstPieceComment.classList.add('negative');

                if (!firstPieceAtHour.classList.contains('initial-loaded') &&
                    !firstPieceAtMinute.classList.contains('initial-loaded') &&
                    !firstPieceAtMeridiem.classList.contains('initial-loaded')) {
                    firstPieceComment.value = firstPieceComment.dataset.previousValue || '';
                    firstPieceComment.dataset.previousValue = '';
                }
            } else {
                firstPieceAtHour.classList.remove('negative');
                firstPieceAtMinute.classList.remove('negative');
                firstPieceComment.classList.remove('negative');

                if (!firstPieceAtHour.classList.contains('initial-loaded') &&
                    !firstPieceAtMinute.classList.contains('initial-loaded') &&
                    !firstPieceAtMeridiem.classList.contains('initial-loaded')) {
                    firstPieceComment.dataset.previousValue = firstPieceComment.value;
                    firstPieceComment.value = 'OK';
                }
            }
        }

        [firstPieceAtHour, firstPieceAtMinute, firstPieceAtMeridiem].forEach(input => {
            input.addEventListener('input', () => {
                checkTimeAndApplyNegativeClass();
                checkIfAllInputsAreFilled();
            });
            input.addEventListener('change', () => {
                checkTimeAndApplyNegativeClass();
                checkIfAllInputsAreFilled();
            });
        });

        firstPieceAtHour.addEventListener('input', function () {
            let value = parseInt(this.value, 10);
            if (value > 12) this.value = 12;
            if (value <= 0 || isNaN(value)) this.value = '';
        });

        firstPieceAtMinute.addEventListener('input', function () {
            let value = parseInt(this.value, 10);
            if (value > 59) this.value = 59;
            if (value < 0 || isNaN(value)) this.value = '';
        });
    }

    // -------------------------------------------------------------
    // IS LINE WET
    // -------------------------------------------------------------
    isLineWet.addEventListener('change', function () {
        if (isLineWet.value === '0') {
            isLineWet.classList.add('negative');
            lineWetComment.classList.add('negative');

            if (!isLineWet.classList.contains('initial-loaded')) {
                lineWetComment.value = lineWetComment.dataset.previousValue || '';
                lineWetComment.dataset.previousValue = '';
            }
        } else {
            isLineWet.classList.remove('negative');
            lineWetComment.classList.remove('negative');

            if (!isLineWet.classList.contains('initial-loaded')) {
                lineWetComment.dataset.previousValue = lineWetComment.value;
                lineWetComment.value = 'OK';
            }
        }
        checkIfAllInputsAreFilled();
    });

    // -------------------------------------------------------------
    // COMENTARIOS
    // -------------------------------------------------------------
    [firstPieceComment, lineWetComment, noOpBalancingComment].forEach(commentInput => {
        commentInput.addEventListener('input', checkIfAllInputsAreFilled);
    });

    // -------------------------------------------------------------
    // BOTÓN FINAL
    // -------------------------------------------------------------
    function checkIfAllInputsAreFilled() {
        const inputsToCheck = [
            noOpInput,
            noOpStartInput,
            noOpBalancingInput,
            firstPieceAtHour,
            firstPieceAtMinute,
            firstPieceAtMeridiem,
            isLineWet,
            firstPieceComment,
            lineWetComment,
            noOpBalancingComment
        ];

        const allFilled = inputsToCheck.every(input => input && input.value.trim() !== '');

        if (closeButton) {
            closeButton.classList.toggle('disabled', !allFilled);
        }
    }

    if (closeButton) {
        closeButton.addEventListener('click', function () {
            checkIfAllInputsAreFilled();

            if (this.classList.contains('disabled')) {
                showToast('Please fill in all required fields before closing the report.', false);
                return;
            }
            closeShiftStartReport();
        });
    }

    checkIfAllInputsAreFilled();
});