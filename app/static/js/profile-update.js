document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('profile-form');
    if (!form) return;

    const originalValues = {};
    const fields = form.querySelectorAll('input, select');
    const submitButton = form.querySelector('button[type="submit"]');

    fields.forEach(field => {
        originalValues[field.name] = field.value;
    });

    function checkForChanges() {
        let hasChanged = false;
        fields.forEach(field => {
            if (originalValues[field.name] !== field.value) {
                hasChanged = true;
            }
        });
        submitButton.disabled = !hasChanged;
    }

    fields.forEach(field => {
        field.addEventListener('input', checkForChanges);
        field.addEventListener('change', checkForChanges);
    });

    // Initial state
    checkForChanges();

    form.addEventListener('submit', async function (event) {
        event.preventDefault();

        // Usa el nuevo diálogo personalizado en lugar del prompt nativo
        const password = await customPromptPassword(
            window.translations.profile_update_prompt_password,
            window.translations.profile_update_confirm_title || 'Confirmar Cambios'
        );

        if (password === null || password.trim() === '') {
            showToast(window.translations.profile_update_cancelled, false);
            revertChanges();
            return;
        }

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        data.password = password;

        try {
            const response = await fetch('/update-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (response.ok) {
                showToast(result.message || window.translations.profile_update_success, true);
                setTimeout(() => window.location.reload(), 1500);
            } else {
                let errorMessage = window.translations.profile_update_error_generic;
                if (response.status === 403) errorMessage = window.translations.profile_update_error_password;
                else if (response.status === 409) errorMessage = window.translations.profile_update_error_email_in_use;
                else if (result.error) errorMessage = result.error;

                showToast(errorMessage, false);
                revertChanges();
            }
        } catch (error) {
            showToast(window.translations.profile_update_error_generic, false);
            revertChanges();
        }
    });

    function revertChanges() {
        fields.forEach(field => {
            field.value = originalValues[field.name];
        });
        checkForChanges();
    }
});