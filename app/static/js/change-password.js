document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('change-password-form');
    if (!form) return;

    // Asumo que tienes una función global para esto en password-toggle.js
    // Si no, puedes definirla aquí o importarla.
    initializePasswordToggle('toggle-new-password', 'new_password', 'new-password-icon');
    initializePasswordToggle('toggle-confirm-password', 'confirm_password', 'confirm-password-icon');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const newPassword = document.getElementById('new_password').value;
        const confirmPassword = document.getElementById('confirm_password').value;

        if (newPassword !== confirmPassword) {
            showToast(window.translations.error_passwords_do_not_match || 'Las contraseñas nuevas no coinciden.', false);
            return;
        }

        const hasUpperCase = /[A-Z]/.test(newPassword);
        const hasNumber = /[0-9]/.test(newPassword);
        const isLongEnough = newPassword.length >= 8;

        if (!isLongEnough || !hasUpperCase || !hasNumber) {
            showToast(window.translations.register_error_password_requirements || 'La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.', false);
            return;
        }

        const oldPassword = await customPromptPassword(
            window.translations.prompt_enter_old_password || 'Para continuar, ingresa tu contraseña actual.',
            window.translations.prompt_confirm_identity || 'Confirmar Identidad',
            window.translations.change_password_old_placeholder || 'Contraseña actual'
        );

        if (oldPassword === null) { // El usuario canceló el diálogo
            return;
        }

        if (!oldPassword) {
            showToast(window.translations.error_old_password_required || 'La contraseña actual es obligatoria.', false);
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
                showToast(result.error || 'Ocurrió un error.', false);
            }
        } catch (error) {
            showToast(window.translations.error_generic || 'Error de conexión con el servidor.', false);
        }
    });
});