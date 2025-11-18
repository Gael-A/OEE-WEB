document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('.form'); 
    
    if (form) {
        const requiredInputs = form.querySelectorAll('input[required], select[required]');
        const submitButton = form.querySelector('.login-button');

        function checkFormValidity() {
            let allFilled = true;
            requiredInputs.forEach(input => {
                if (!input.value.trim()) {
                    allFilled = false;
                }
            });

            submitButton.disabled = !allFilled;
        }

        checkFormValidity();

        setTimeout(checkFormValidity, 100);

        requiredInputs.forEach(input => {
            input.addEventListener('input', checkFormValidity);
            input.addEventListener('change', checkFormValidity);
        });
    }
});
