document.addEventListener('DOMContentLoaded', () => {
    const dialogHTML = `
        <div id="dialog-overlay" class="dialog-overlay">
            <div id="dialog-box" class="dialog-box">
                <h2 id="dialog-title" class="dialog-title"></h2>
                <p id="dialog-message" class="dialog-message"></p>
                <div id="dialog-content" class="dialog-content"></div>
                <div id="dialog-buttons" class="dialog-buttons"></div>
            </div>
        </div>
    `;
    if (!document.getElementById('dialog-overlay')) {
        document.body.insertAdjacentHTML('beforeend', dialogHTML);
    }
});

function showDialog(options) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('dialog-overlay');
        const titleEl = document.getElementById('dialog-title');
        const messageEl = document.getElementById('dialog-message');
        const contentEl = document.getElementById('dialog-content');
        const buttonsEl = document.getElementById('dialog-buttons');

        titleEl.textContent = options.title || '';
        messageEl.textContent = options.message || '';
        contentEl.innerHTML = '';
        buttonsEl.innerHTML = '';

        let inputElement = null;
        if (options.type === 'prompt' || options.type === 'prompt-password') {
            inputElement = document.createElement('input');
            inputElement.type = options.type === 'prompt-password' ? 'password' : 'text';
            inputElement.className = 'dialog-input';
            inputElement.value = options.defaultValue || '';
            inputElement.placeholder = options.placeholder || '';
            contentEl.appendChild(inputElement);

            inputElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    buttonsEl.querySelector('.dialog-button.primary')?.click();
                }
            });
        }

        options.buttons.forEach(button => {
            const buttonEl = document.createElement('button');
            buttonEl.textContent = button.text;
            buttonEl.className = `dialog-button ${button.class}`;

            const clickHandler = () => {
                let resolveValue = button.value;
                if ((options.type === 'prompt' || options.type === 'prompt-password') && button.class.includes('primary')) {
                    resolveValue = inputElement.value;
                }
                resolve(resolveValue);
                hideDialog();
            };

            buttonEl.addEventListener('click', clickHandler, { once: true });
            buttonsEl.appendChild(buttonEl);
        });

        overlay.classList.add('visible');

        if (inputElement) {
            inputElement.focus();
        } else {
            buttonsEl.querySelector('.dialog-button.primary')?.focus();
        }
    });
}

function hideDialog() {
    const overlay = document.getElementById('dialog-overlay');
    overlay.classList.remove('visible');
}

function customAlert(message, title = 'Alerta') {
    return showDialog({
        title, message, type: 'alert',
        buttons: [{ text: 'OK', class: 'primary', value: true }]
    });
}

function customConfirm(message, title = 'Confirmación') {
    return showDialog({
        title, message, type: 'confirm',
        buttons: [
            { text: 'Cancelar', class: 'secondary', value: false },
            { text: 'Confirmar', class: 'primary', value: true }
        ]
    });
}

function customPrompt(message, title = 'Entrada', defaultValue = '', placeholder = '') {
    return showDialog({
        title,
        message,
        type: 'prompt',
        defaultValue,
        placeholder,
        buttons: [
            { text: 'Cancelar', class: 'secondary', value: null },
            { text: 'Aceptar', class: 'primary', value: true }
        ]
    });
}

function customPromptPassword(message, title = 'Contraseña', placeholder = '') {
    return showDialog({
        title, message, type: 'prompt-password', placeholder,
        buttons: [
            { text: 'Cancelar', class: 'secondary', value: null },
            { text: 'Aceptar', class: 'primary', value: true }
        ]
    });
}