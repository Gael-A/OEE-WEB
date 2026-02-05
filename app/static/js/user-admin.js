document.addEventListener('DOMContentLoaded', function () {
    const userTableBody = document.getElementById('user-table-body');
    const searchInput = document.getElementById('search-input');
    const sortableHeaders = document.querySelectorAll('.admin-table th.sortable');
    const addUserForm = document.getElementById('add-user-form');

    let allUsers = [];
    let searchTerm = '';
    let sortState = { key: null, direction: 'default' };

    const currentUserId = window.currentUserId || null;
    const translations = window.translations || {};
    const iconPath = './static/svg/action-user-remove.svg';
    const addUserIconPath = './static/svg/action-user-add.svg';

    function createRoleSelect(user) {
        const roles = {
            user: translations.user_role_user || 'User',
            admin: translations.user_role_admin || 'Admin',
            supervisor: translations.user_role_supervisor || 'Supervisor',
            'supervisor_&_leader': 'Both',
            production_leader: translations.user_role_production_leader || 'Production Leader'
        };

        const select = document.createElement('select');
        select.name = 'role';
        select.className = 'role-select';
        select.dataset.userId = user.id;

        for (const [roleValue, roleText] of Object.entries(roles)) {
            const option = document.createElement('option');
            option.value = roleValue;
            option.textContent = roleText;
            if (user.role === roleValue) {
                option.selected = true;
            }
            select.appendChild(option);
        }

        select.addEventListener('change', handleRoleChange);
        return select;
    }

    async function handleRoleChange(event) {
        const select = event.target;
        const userId = select.dataset.userId;
        const newRole = select.value;

        if (String(userId) === String(currentUserId)) {
            showToast(translations.user_admin_cannot_change_self_role || 'You cannot change your own role.', false);
            const originalUser = allUsers.find(u => String(u.id) === String(userId));
            if (originalUser) {
                select.value = originalUser.role;
            }
            return;
        }

        try {
            const response = await fetch(`/api/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
            });

            const result = await response.json();

            if (response.ok) {
                showToast(result.message || 'Rol actualizado correctamente.', true);
                const userToUpdate = allUsers.find(u => String(u.id) === String(userId));
                if (userToUpdate) {
                    userToUpdate.role = newRole;
                }
            } else {
                showToast(result.error || 'Error al actualizar el rol.', false);
                const originalUser = allUsers.find(u => String(u.id) === String(userId));
                if (originalUser) {
                    select.value = originalUser.role;
                }
            }
        } catch (error) {
            console.error('Error al actualizar el rol:', error);
            showToast('Ocurrió un error de red al actualizar el rol.', false);
            const originalUser = allUsers.find(u => String(u.id) === String(userId));
            if (originalUser) {
                select.value = originalUser.role;
            }
        }
    }
    
    async function handleAddUser() {
        const newUser = {
            id: document.getElementById('new-user-id').value,
            first_name: document.getElementById('new-user-first-name').value,
            last_name: document.getElementById('new-user-last-name').value,
            email: document.getElementById('new-user-email').value,
            role: document.getElementById('new-user-role').value
        };

        if (!newUser.id) {
            showToast(translations.user_admin_add_validation_error || 'ID are required.', false);
            return;
        }

        try {
            const response = await fetch('/api/users/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser),
            });

            const result = await response.json();

            if (response.ok) {
                showToast(result.message || translations.user_admin_add_success || 'User added successfully.', true);
                allUsers.push(result.user);
                renderTable();
                document.getElementById('new-user-id').value = '';
                document.getElementById('new-user-first-name').value = '';
                document.getElementById('new-user-last-name').value = '';
                document.getElementById('new-user-email').value = '';
                document.getElementById('new-user-role').value = 'user';
            } else {
                showToast(result.error || translations.user_admin_add_error || 'Error adding user.', false);
            }
        } catch (error) {
            console.error('Error al agregar el usuario:', error);
            showToast('Ocurrió un error de red al agregar el usuario.', false);
        }
    }

    function renderTable() {
        let processedUsers = [...allUsers];

        if (searchTerm) {
            processedUsers = processedUsers.filter(user => {
                const id = user.id ? user.id.toString().toLowerCase() : '';
                const firstName = user.first_name ? user.first_name.toLowerCase() : '';
                const lastName = user.last_name ? user.last_name.toLowerCase() : '';
                const email = user.email ? user.email.toLowerCase() : '';
                return id.includes(searchTerm) ||
                       firstName.includes(searchTerm) ||
                       lastName.includes(searchTerm) ||
                       email.includes(searchTerm);
            });
        }

        if (sortState.key && sortState.direction !== 'default') {
            processedUsers.sort((a, b) => {
                const valA = a[sortState.key];
                const valB = b[sortState.key];

                let comparison = 0;
                if (valA > valB) comparison = 1;
                else if (valA < valB) comparison = -1;

                return sortState.direction === 'desc' ? comparison * -1 : comparison;
            });
        }

        updateSortIndicators();
        displayUsersInTable(processedUsers);
    }

    function displayUsersInTable(users) {
        userTableBody.innerHTML = '';
        
        const roles = {
            user: translations.user_role_user || 'User',
            production_leader: translations.user_role_production_leader || 'Production Leader',
            supervisor: translations.user_role_supervisor || 'Supervisor',
            'supervisor_&_leader': 'Both',
            admin: translations.user_role_admin || 'Admin'
        };
        const addUserRow = userTableBody.insertRow();
        addUserRow.id = 'add-user-row';
        addUserRow.innerHTML = `
            <td><input type="number" id="new-user-id" name="id" placeholder="${translations.user_id || 'ID'}" required></td>
            <td><input type="text" id="new-user-first-name" name="first_name" placeholder="${translations.user_first_name || 'First Name'}"></td>
            <td><input type="text" id="new-user-last-name" name="last_name" placeholder="${translations.user_last_name || 'Last Name'}"></td>
            <td><input type="email" id="new-user-email" name="email" placeholder="${translations.user_email || 'Email'}"></td>
            <td>
                <select id="new-user-role" name="role">
                    <option value="user" selected>${roles.user}</option>
                    <option value="production_leader">${roles.production_leader}</option>
                    <option value="supervisor_&_leader">${roles["supervisor_&_leader"]}</option>
                    <option value="supervisor">${roles.supervisor}</option>
                    <option value="admin">${roles.admin}</option>
                </select>
            </td>
            <td class="actions-cell">
                <button class="action-btn add-user-btn" title="${translations.toolbar_generic_button_text || 'Add User'}">
                    <img src="${addUserIconPath}" alt="Add User">
                </button>
            </td>
        `;

        if (users.length === 0) {
            const message = searchTerm ? 
                (translations.no_users_found_for_search || 'No se encontraron usuarios para su búsqueda.') : 
                (translations.no_users_in_system || 'No hay usuarios en el sistema.');
            const emptyRow = userTableBody.insertRow();
            emptyRow.innerHTML = `<td colspan="6">${message}</td>`;
            return;
        }

        users.forEach(user => {
            const row = userTableBody.insertRow();
            row.dataset.userId = user.id;
            row.innerHTML = `
                <td>${user.id}</td>
                <td>${user.first_name}</td>
                <td>${user.last_name}</td>
                <td>${user.email}</td>
                <td></td>
                <td class="actions-cell">
                    <button class="action-btn delete-btn" data-user-id="${user.id}" title="${translations.alt_delete_user || 'Delete user'}">
                        <img src="${iconPath}" alt="Delete">
                    </button>
                </td>`;
            row.cells[4].appendChild(createRoleSelect(user));
        });
    }

    function updateSortIndicators() {
        sortableHeaders.forEach(header => {
            header.classList.remove('sort-asc', 'sort-desc');
            if (header.dataset.sortKey === sortState.key) {
                if (sortState.direction === 'asc') header.classList.add('sort-asc');
                else if (sortState.direction === 'desc') header.classList.add('sort-desc');
            }
        });
    }

    async function initializeUserList() {
        try {
            const response = await fetch('/api/users/');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            allUsers = await response.json();
            renderTable();
        } catch (error) {
            console.error('Error al obtener los usuarios:', error);
            userTableBody.innerHTML = `<tr><td colspan="6">${translations.error_loading_users || 'Error al cargar los usuarios.'}</td></tr>`;
        }
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase().trim();
            renderTable();
        });
    }

    sortableHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            const clickedKey = e.currentTarget.dataset.sortKey;
            if (sortState.key === clickedKey) {
                if (sortState.direction === 'asc') sortState.direction = 'desc';
                else {
                    sortState.direction = 'default';
                    sortState.key = null;
                }
            } else {
                sortState.key = clickedKey;
                sortState.direction = 'asc';
            }
            renderTable();
        });
    });

    userTableBody.addEventListener('click', async (event) => {
        const deleteButton = event.target.closest('.delete-btn');
        const addUserButton = event.target.closest('.add-user-btn');

        if (deleteButton) {
            const userId = deleteButton.dataset.userId;

            if (String(userId) === String(currentUserId)) {
                showToast(translations.user_admin_cannot_delete_self || 'You cannot delete your own account.', false);
                return;
            }

            const confirmMessage = (translations.user_admin_confirm_delete || 'Are you sure you want to delete user {{userId}}?').replace('{{userId}}', userId);
            if (!confirm(confirmMessage)) {
                return;
            }

            try {
                const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
                const result = await response.json();

                if (response.ok) {
                    showToast(result.message || translations.user_admin_delete_success || 'User deleted successfully.', true);
                    allUsers = allUsers.filter(u => String(u.id) !== String(userId));
                    renderTable();
                } else {
                    showToast(result.error || translations.user_admin_delete_error || 'Error deleting user.', false);
                }
            } catch (error) {
                console.error('Error al eliminar el usuario:', error);
                showToast('Ocurrió un error de red al eliminar el usuario.', false);
            }
        } else if (addUserButton) {
            handleAddUser();
        }
    });

    initializeUserList();
});