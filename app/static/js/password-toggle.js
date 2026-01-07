function initializePasswordToggle(toggleId, inputId, iconId) {
    const toggleButton = document.getElementById(toggleId);
    const passwordInput = document.getElementById(inputId);
    const passwordIcon = document.getElementById(iconId);

    const eyeIconSrc = "/static/svg/action-eye.svg";
    const eyeSlashIconSrc = "/static/svg/action-eye-slash.svg";

    if (toggleButton && passwordInput && passwordIcon) {
        toggleButton.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            passwordIcon.src = isPassword ? eyeIconSrc : eyeSlashIconSrc;
        });
    }
}

document.addEventListener('DOMContentLoaded', function () {
    initializePasswordToggle('toggle-password', 'password', 'password-icon');
    initializePasswordToggle('toggle-confirm-password', 'confirm_password', 'confirm-password-icon');
    initializePasswordToggle('toggle-new-password', 'new_password', 'new-password-icon');
});
