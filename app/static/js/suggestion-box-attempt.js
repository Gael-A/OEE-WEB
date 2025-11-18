document.addEventListener('DOMContentLoaded', function () {
    const suggestionForm = document.getElementById('suggestion-form');

    if (suggestionForm) {
        suggestionForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData(suggestionForm);
            const data = Object.fromEntries(formData.entries());
            const suggestionId = suggestionForm.dataset.suggestionId;

            let url = '/api/suggestions/';
            let method = 'POST';
            let errorMessage = window.translations.suggestion_error_generic;

            if (suggestionId) {
                url = `/api/suggestions/${suggestionId}`;
                method = 'PUT';
                errorMessage = window.translations.suggestion_update_error || 'Error updating suggestion.';
            }

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();
                if (response.ok) {
                    showToast(result.message, true);
                    if (suggestionId) {
                        window.location.href = '/suggestion-box#user-suggestions-section';
                    } else {
                        window.location.reload();
                    }
                } else {
                    showToast(result.error || errorMessage, false);
                }
            } catch (error) {
                console.error('Error submitting suggestion:', error);
                showToast(errorMessage, false);
            }
        });
    }
});