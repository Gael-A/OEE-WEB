document.addEventListener('DOMContentLoaded', function() {
    const noOpInput = document.getElementById('no_op');
    const noOpStartInput = document.getElementById('no_op_start');
    const noOpBalancingInput = document.getElementById('no_op_balancing');


    if (noOpInput && noOpStartInput) {
        noOpInput.addEventListener('input', function () {
            noOpStartInput.value = this.value;
            updateNoOpBalancing();
        });

        noOpStartInput.addEventListener('input', function () {
            noOpInput.value = this.value;
            updateNoOpBalancing();
        });
    }


    if (noOpBalancingInput && noOpStartInput) {
        noOpBalancingInput.addEventListener('input', updateNoOpBalancing);
    }


    function updateNoOpBalancing() {
        const start = Number(noOpStartInput.value);
        const bal = Number(noOpBalancingInput.value);

        if (start < bal || start <= 0) {
            noOpStartInput.classList.add("negative");
        } else {
            noOpStartInput.classList.remove("negative");
        }
    }


    const firstPieceAtHour = document.getElementById('first_piece_at_hour'); 
    const firstPieceAtMinute = document.getElementById('first_piece_at_minute'); 
    const firstPieceAtMeridiem = document.getElementById('first_piece_at_meridiem');

    if (firstPieceAtHour && firstPieceAtMinute && firstPieceAtMeridiem) {
        function checkTimeAndApplyNegativeClass() {
            const hour12 = parseInt(firstPieceAtHour.value, 10) || 0;
            const minute = parseInt(firstPieceAtMinute.value, 10) || 0;
            const meridiem = firstPieceAtMeridiem.value;

            let hour24 = hour12;
            
            if (meridiem === 'PM' && hour12 !== 12) {
                hour24 = hour12 + 12;
            } else if (meridiem === 'AM' && hour12 === 12) {
                hour24 = 0;
            }
            
            const COMPARISON_HOUR = 6;
            const COMPARISON_MINUTE = 45;

            if (hour24 > COMPARISON_HOUR || (hour24 === COMPARISON_HOUR && minute > COMPARISON_MINUTE)) {
                firstPieceAtHour.classList.add("negative");
                firstPieceAtMinute.classList.add("negative");
            } else {
                firstPieceAtHour.classList.remove("negative");
                firstPieceAtMinute.classList.remove("negative");
            }
        }

        [firstPieceAtHour, firstPieceAtMinute, firstPieceAtMeridiem].forEach(input => {
            input.addEventListener('input', checkTimeAndApplyNegativeClass);
            input.addEventListener('change', checkTimeAndApplyNegativeClass);
        });

        firstPieceAtHour.addEventListener('input', function() {
            let value = parseInt(this.value, 10);
            if (value > 12) this.value = 12;
            if (value <= 0 || isNaN(value)) this.value = '';
        });

        firstPieceAtMinute.addEventListener('input', function() {
            let value = parseInt(this.value, 10);
            if (value > 59) this.value = 59;
            if (value <= 0 || isNaN(value)) this.value = '';
        });
        
        checkTimeAndApplyNegativeClass();
    }

    const isLineWet = document.getElementById('is_line_wet');

    isLineWet.addEventListener('change', function() {
        if (isLineWet.value === "0") {
            isLineWet.classList.add("negative");
        } else {
            isLineWet.classList.remove("negative");
        }
    });

    

});