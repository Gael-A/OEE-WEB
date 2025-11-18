document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('login-form');

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const id = document.getElementById('id').value;
        const password = document.getElementById('password').value;

        const response = await fetch('/login-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, password })
        });

        const data = await response.json();

        if (response.ok) {
            // The server should provide a redirect URL for security and flexibility.
            window.location.href = data.redirect_url || '/';
        } else {
            showToast(data.error || window.translations.login_error_generic);
        }
    });
});
