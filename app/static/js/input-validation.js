document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('input', (event) => {
        const target = event.target;
        if (target.tagName === 'INPUT' && target.type === 'number') {
            const numericValue = parseFloat(target.value);
            if (!isNaN(numericValue) && numericValue < 0) {
                showToast(window.translations.input_negative_number_warning, false);
                target.value = 0;
            }
        }
    });
});