document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('change-password-form');
    if (!form) return;

    // Asumo que tienes una función global para esto en password-toggle.js
    // Si no, puedes definirla aquí o importarla.


    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const newPassword = document.getElementById('new_password').value;
        const confirmPassword = document.getElementById('confirm_password').value;

        if (newPassword !== confirmPassword) {
            showToast(window.translations.error_passwords_do_not_match, false);
            return;
        }

        const hasUpperCase = /[A-Z]/.test(newPassword);
        const hasNumber = /[0-9]/.test(newPassword);
        const isLongEnough = newPassword.length >= 8;

        if (!isLongEnough || !hasUpperCase || !hasNumber) {
            showToast(window.translations.register_error_password_requirements, false);
            return;
        }

        const oldPassword = await customPromptPassword(
            window.translations.prompt_enter_old_password,
            window.translations.prompt_confirm_identity,
            window.translations.change_password_old_placeholder
        );

        if (oldPassword === null) { // El usuario canceló el diálogo
            return;
        }

        if (!oldPassword) {
            showToast(window.translations.error_old_password_required, false);
            return;
        }

        try {
            const response = await fetch('/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    old_password: oldPassword,
                    new_password: newPassword,
                }),
            });

            const result = await response.json();

            if (response.ok) {
                showToast(result.message, true);
                setTimeout(() => { window.location.href = result.redirect_url; }, 1500);
            } else {
                showToast(result.error, false);
            }
        } catch (error) {
            showToast(window.translations.error_generic, false);
        }
    });
});