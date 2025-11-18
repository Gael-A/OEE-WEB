document.addEventListener('DOMContentLoaded', function () {
    const suggestionsList = document.getElementById('user-suggestions-list');

    function getStatusTranslation(status) {
        const key = `suggestion_status_${status.toLowerCase()}`;
        return window.translations[key] || status;
    }

    fetch('/api/suggestions/user')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error(data.error);
                suggestionsList.innerHTML = `<p>${window.translations.error_loading_suggestions}</p>`;
                return;
            }

            if (data.length === 0) {
                suggestionsList.innerHTML = `<p>${window.translations.no_suggestions_found}</p>`;
                return;
            }

            const table = document.createElement('table');
            table.className = 'suggestions-table';

            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr>
                    <th>${window.translations.suggestion_status}</th>
                    <th>${window.translations.suggestion_area}</th>
                    <th>${window.translations.suggestion_problem}</th>
                    <th>${window.translations.suggestion_solution}</th>
                    <th>${window.translations.suggestion_benefit}</th>
                    <th>${window.translations.suggestion_created_at}</th>
                    <th>${window.translations.suggestion_actions}</th>
                </tr>
            `;
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            data.forEach(suggestion => {
                const tr = document.createElement('tr');
                tr.dataset.suggestionId = suggestion.id;
                tr.innerHTML = `
                    <td class="${suggestion.status}">${getStatusTranslation(suggestion.status)}</td>
                    <td>${suggestion.area}</td>
                    <td>${suggestion.problem}</td>
                    <td>${suggestion.solution}</td>
                    <td>${suggestion.benefit}</td>
                    <td>${new Date(suggestion.created_at).toLocaleString()}</td>
                    <td class="actions-cell">
                        <div class="action-button edit-suggestion" title="${window.translations.alt_edit || 'Edit'}">
                            <img src="/static/svg/action-edit.svg" alt="${window.translations.alt_edit || 'Edit'}">
                        </div>
                        <div class="action-button delete-suggestion" title="${window.translations.alt_delete_user || 'Delete'}">
                            <img src="/static/svg/action-remove.svg" alt="${window.translations.alt_delete_user || 'Delete'}">
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);

            suggestionsList.appendChild(table);
        })
        .catch(error => {
            console.error('Error fetching suggestions:', error);
            suggestionsList.innerHTML = `<p>${window.translations.error_loading_suggestions}</p>`;
        });

    suggestionsList.addEventListener('click', async (event) => {
        const editButton = event.target.closest('.edit-suggestion');
        if (editButton) {
            const row = editButton.closest('tr');
            const suggestionId = row.dataset.suggestionId;
            window.location.href = `/suggestion-box/${suggestionId}`;
            return;
        }

        const deleteButton = event.target.closest('.delete-suggestion');
        if (!deleteButton) return;

        const row = deleteButton.closest('tr');
        const suggestionId = row.dataset.suggestionId;

        const confirmDelete = await customConfirm(
            window.translations.suggestion_confirm_delete || 'Are you sure you want to delete this suggestion?',
            window.translations.suggestion_confirm_delete_title || 'Confirm Deletion'
        );

        if (confirmDelete) {
            try {
                const response = await fetch(`/api/suggestions/${suggestionId}`, {
                    method: 'DELETE',
                });

                if (response.ok) {
                    row.remove();
                    showToast(window.translations.suggestion_delete_success || 'Suggestion deleted successfully.', true);
                    const tbody = suggestionsList.querySelector('tbody');
                    if (tbody && tbody.children.length === 0) {
                        suggestionsList.innerHTML = `<p>${window.translations.no_suggestions_found}</p>`;
                    }
                } else {
                    const errorData = await response.json();
                    showToast(errorData.error || window.translations.suggestion_delete_error || 'Error deleting suggestion.', false);
                }
            } catch (error) {
                console.error('Error deleting suggestion:', error);
                showToast(window.translations.suggestion_delete_error || 'Error deleting suggestion.', false);
            }
        }
    });
});
