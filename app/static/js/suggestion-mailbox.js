document.addEventListener('DOMContentLoaded', function () {
    const suggestionsList = document.getElementById('all-suggestions-list');

    function getStatusTranslation(status) {
        const key = `suggestion_status_${status.toLowerCase()}`;
        return window.translations[key] || status;
    }

    function createSuggestionContent(suggestion) {
        return `
            <div class="suggestion-details">
                <p><strong>${window.translations.suggestion_problem || 'Problem'}:</strong> ${suggestion.problem}</p>
                <p><strong>${window.translations.suggestion_solution || 'Solution'}:</strong> ${suggestion.solution || 'N/A'}</p>
                <p><strong>${window.translations.suggestion_benefit || 'Benefit'}:</strong> ${suggestion.benefit || 'N/A'}</p>
            </div>
        `;
    }

    function getActionButtonsHTML(status) {
        const translations = window.translations || {};
        let buttonsHTML = '';

        switch (status) {
            case 'submitted':
                buttonsHTML = `
                    <div class="action-button change-status" data-new-status="in_review" title="${translations.suggestion_status_in_review || 'Mark as In Review'}">
                        <img src="/static/svg/icon-in_review.svg" alt="${translations.suggestion_status_in_review || 'In Review'}">
                    </div>
                    <div class="action-button change-status" data-new-status="rejected" title="${translations.suggestion_status_rejected || 'Mark as Rejected'}">
                        <img src="/static/svg/icon-rejected.svg" alt="${translations.suggestion_status_rejected || 'Rejected'}">
                    </div>
                `;
                break;
            case 'in_review':
                buttonsHTML = `
                    <div class="action-button change-status" data-new-status="approved" title="${translations.suggestion_status_approved || 'Mark as Approved'}">
                        <img src="/static/svg/icon-approved.svg" alt="${translations.suggestion_status_approved || 'Approved'}">
                    </div>
                    <div class="action-button change-status" data-new-status="rejected" title="${translations.suggestion_status_rejected || 'Mark as Rejected'}">
                        <img src="/static/svg/icon-rejected.svg" alt="${translations.suggestion_status_rejected || 'Rejected'}">
                    </div>
                `;
                break;
            case 'approved':
                buttonsHTML = `
                    <div class="action-button change-status" data-new-status="implemented" title="${translations.suggestion_status_implemented || 'Mark as Implemented'}">
                        <img src="/static/svg/icon-implemented.svg" alt="${translations.suggestion_status_implemented || 'Implemented'}">
                    </div>
                    <div class="action-button change-status" data-new-status="rejected" title="${translations.suggestion_status_rejected || 'Mark as Rejected'}">
                        <img src="/static/svg/icon-rejected.svg" alt="${translations.suggestion_status_rejected || 'Rejected'}">
                    </div>
                `;
                break;
        }

        return buttonsHTML;
    }

    fetch('/api/suggestions/')
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
                    <th>${window.translations.suggestion_status || 'Status'}</th>
                    <th>${window.translations.suggestion_from || 'From'}</th>
                    <th>${window.translations.suggestion_data || 'Suggestion'}</th>
                    <th>${window.translations.suggestion_created_at || 'Created At'}</th>
                    <th>${window.translations.suggestion_actions || 'Actions'}</th>
                </tr>
            `;
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            data.forEach(suggestion => {
                const tr = document.createElement('tr');
                tr.dataset.suggestionId = suggestion.id;
                tr.innerHTML = `
                    <td class="${suggestion.status}">${getStatusTranslation(suggestion.status)}</td>
                    <td>${suggestion.user_area}</td>
                    <td>${createSuggestionContent(suggestion)}</td>
                    <td>${new Date(suggestion.created_at).toLocaleString()}</td>
                    <td class="actions-cell">
                        ${getActionButtonsHTML(suggestion.status)}
                    </td>
                `;
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);

            suggestionsList.innerHTML = '';
            suggestionsList.appendChild(table);
        })
        .catch(error => {
            console.error('Error fetching suggestions:', error);
            suggestionsList.innerHTML = `<p>${window.translations.error_loading_suggestions}</p>`;
        });

    suggestionsList.addEventListener('click', async (event) => {
        const changeStatusButton = event.target.closest('.change-status');
        if (changeStatusButton) {
            const row = changeStatusButton.closest('tr');
            const suggestionId = row.dataset.suggestionId;
            const newStatus = changeStatusButton.dataset.newStatus;

            const payloadStatus = newStatus === 'rejected' ? 'rejected' : 'next_step';

            try {
                const response = await fetch(`/api/suggestions/${suggestionId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ status: payloadStatus }),
                });

                if (response.ok) {
                    const newSuggestionStatus = (payloadStatus === 'next_step')
                        ? getNextStatus(row.querySelector('td:first-child').className)
                        : 'rejected';

                    const statusCell = row.querySelector('td:first-child');
                    statusCell.className = newSuggestionStatus;
                    statusCell.textContent = getStatusTranslation(newSuggestionStatus);

                    const actionsCell = row.querySelector('.actions-cell');
                    actionsCell.innerHTML = getActionButtonsHTML(newSuggestionStatus);

                    showToast(window.translations.suggestion_update_success || 'Suggestion updated successfully.', true);
                } else {
                    const errorData = await response.json();
                    showToast(errorData.error || window.translations.suggestion_update_error || 'Error updating suggestion.', false);
                }
            } catch (error) {
                console.error('Error updating suggestion status:', error);
                showToast(window.translations.suggestion_update_error || 'Error updating suggestion.', false);
            }
            return;
        }
    });

    function getNextStatus(currentStatusClass) {
        const statusSteps = ["submitted", "in_review", "approved", "implemented"];
        const currentIndex = statusSteps.indexOf(currentStatusClass);
        return (currentIndex >= 0 && currentIndex < statusSteps.length - 1)
            ? statusSteps[currentIndex + 1]
            : currentStatusClass;
    }
});