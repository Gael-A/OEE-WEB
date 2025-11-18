document.addEventListener('DOMContentLoaded', function () {
    const registerForm = document.getElementById('register-form');

    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(registerForm);
        const data = Object.fromEntries(formData.entries());

        const password = data.password;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const isLongEnough = password.length >= 8;

        if (!isLongEnough || !hasUpperCase || !hasNumber) {
            // Usamos un fallback por si la traducción no está disponible
            showToast(window.translations.register_error_password_requirements || 'La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.');
            return;
        }

        if (data.password !== data.confirm_password) {
            showToast(window.translations.register_error_passwords_no_match);
            return;
        }

        const response = await fetch('/register-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (response.ok) {
            showToast(result.message, true);
            setTimeout(() => { window.location.href = "/login"; }, 2000);
        } else {
            showToast(result.error || window.translations.register_error_generic);
        }
    });
});