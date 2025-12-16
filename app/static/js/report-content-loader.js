import { getShiftTimes, fetchPanSchedule } from './modules/shift-schedules.js';

const DailyReportController = (function () {
    const state = {
        formData: null,
        dailyReportId: null,
        rows: [],
        panSchedule: [],
        effectiveShiftTimes: [],
        initializing: true
    };

    let tableBody;
    let template;
    let closeReportButton;
    function safeNumber(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    function roundToNearestFive(value) {
        return Math.round(value / 5) * 5;
    }

    function parseMetaFromText(metaText) {
        if (!metaText) return 0;
        const parts = String(metaText).split('/');
        return safeNumber(parts[0]);
    }

    function getAdjustedTargetForInterval(targetPerHour, interval, panSchedule) {
        if (!interval) return roundToNearestFive(targetPerHour);
        const [startTime, endTime] = interval.split(' - ').map(s => s.trim());
        let adjusted = targetPerHour;

        if (panSchedule && panSchedule.length > 0) {
            const match = panSchedule.find(sch =>
                sch.start_hour.startsWith(startTime) && sch.end_hour.startsWith(endTime)
            );
            if (match && typeof match.duration === 'number') {
                adjusted = (targetPerHour / 60) * (60 - match.duration);
            }
        }

        return roundToNearestFive(adjusted);
    }

    function parseHourToMinutes(hourStr) {
        const [h, m] = String(hourStr).split(':').map(s => Number(s));
        if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
        return h * 60 + m;
    }

    function computeEffectiveShiftTimes(shiftTimes, lastEndHour, rows = []) {
        if (!Array.isArray(shiftTimes) || shiftTimes.length === 0) return [];

        let lastHour = lastEndHour;
        if (Array.isArray(rows) && rows.length > 0) {
            const lastRow = rows[rows.length - 1];
            if (lastRow && lastRow.end_hour) lastHour = lastRow.end_hour;
        }

        if (!lastHour) return shiftTimes.slice();

        const lastEndSimple = String(lastHour).substring(0, 5);
        const lastEndMins = parseHourToMinutes(lastEndSimple);
        if (Number.isNaN(lastEndMins)) return shiftTimes.slice();

        const exactMatchIndex = shiftTimes.findIndex(interval => {
            const parts = interval.split(' - ').map(s => s.trim());
            return parts[1] && parts[1].substring(0, 5) === lastEndSimple;
        });
        if (exactMatchIndex > -1) {
            const startIndex = exactMatchIndex;
            return startIndex < shiftTimes.length ? shiftTimes.slice(startIndex) : [];
        }

        const nextIndex = shiftTimes.findIndex(interval => {
            const start = (interval.split(' - ')[0] || '').trim().substring(0, 5);
            const startMins = parseHourToMinutes(start);
            return Number.isFinite(startMins) && startMins >= lastEndMins;
        });

        if (nextIndex === -1) return [];
        return shiftTimes.slice(nextIndex);
    }

    function getNextAvailableIndex() {
        const effective = state.effectiveShiftTimes || [];
        if (!Array.isArray(effective) || effective.length === 0) return 0;

        const usedStarts = new Set();
        (state.rows || []).forEach(r => {
            try {
                const s = String(r.start_hour || '').trim().substring(0, 5);
                if (s) usedStarts.add(s);
            } catch (e) {
            }
        });

        for (let i = 0; i < effective.length; i++) {
            const start = String((effective[i] || '').split(' - ')[0] || '').trim().substring(0, 5);
            if (!start) continue;
            if (!usedStarts.has(start)) {
                return i;
            }
        }
        return effective.length;
    }

    function renderTable(load = false) {
        if (!tableBody || !template) return;
        tableBody.innerHTML = '';

        if (Array.isArray(state.rows) && state.rows.length > 0) {
            state.rows.forEach(rowData => {
                const rowEl = createSavedRowElement(rowData);
                tableBody.appendChild(rowEl);
            });
        }

        const nextIndex = getNextAvailableIndex();

        if (nextIndex < (state.effectiveShiftTimes?.length || 0)) {
            const newRow = createEditableRow(nextIndex);
            tableBody.appendChild(newRow);
        } else if ((state.rows?.length || 0) === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="8" class="no-data-message">${window.translations.report_no_hourly_records}</td>`;
            tableBody.appendChild(tr);
        }

        recalculateTable();
    }

    function createSavedRowElement(rowData) {
        const clone = template.content.cloneNode(true);
        const tr = clone.querySelector('tr') || clone;

        const horaEl = tr.querySelector('.hora');
        if (horaEl) horaEl.textContent = `${String(rowData.start_hour).substring(0, 5)} - ${String(rowData.end_hour).substring(0, 5)}`;

        const metaVal = roundToNearestFive(rowData.target);
        const metaEl = tr.querySelector('.static-info.meta');
        if (metaEl) metaEl.textContent = `${metaVal}`;

        const prodInput = tr.querySelector('input.prod');
        if (prodInput) {
            const prodDiv = document.createElement('div');
            prodDiv.className = 'static-info prod';
            prodDiv.textContent = String(rowData.production ?? '');
            prodInput.parentElement.replaceChild(prodDiv, prodInput);
        }

        const acumEl = tr.querySelector('.static-info.acum');
        if (acumEl) acumEl.textContent = String(rowData.accumulated ?? '');

        const difEl = tr.querySelector('.static-info.dif');
        if (difEl) {
            difEl.textContent = String(rowData.difference ?? '');
            difEl.classList.toggle('negative', (rowData.difference ?? 0) < 0);
        }

        const defectInput = tr.querySelector('input.defect');
        if (defectInput) {
            const defectDiv = document.createElement('div');
            defectDiv.className = 'static-info defect';
            defectDiv.textContent = rowData.defects ?? '';
            defectInput.parentElement.replaceChild(defectDiv, defectInput);
        }

        const notasInput = tr.querySelector('input.notas-incidentes');
        if (notasInput) {
            const notasDiv = document.createElement('div');
            notasDiv.className = 'static-info notas-incidentes';
            notasDiv.textContent = rowData.incident_notes ?? '';
            notasInput.parentElement.replaceChild(notasDiv, notasInput);
        }

        const actionButton = tr.querySelector('.action-button');
        if (actionButton) {
            actionButton.classList.add('edit');
            actionButton.title = window.translations.report_row_saved;
            const icon = actionButton.querySelector('img');
            if (icon) {
                icon.src = '/static/svg/action-edit.svg';
                icon.alt = window.translations.alt_edit;
            }
        }

        if (rowData.id !== undefined && rowData.id !== null) {
            tr.dataset.hourlyId = rowData.id;
        }

        tr.classList.add('row-done');

        return tr;
    }

    function createEditableRow(rowIndex) {
        const clone = template.content.cloneNode(true);
        const tr = clone.querySelector('tr') || clone;

        const horaEl = tr.querySelector('.hora');
        const interval = (state.effectiveShiftTimes && state.effectiveShiftTimes.length > 0)
            ? (state.effectiveShiftTimes[rowIndex] || '00:00 - 00:00')
            : '00:00 - 00:00';
        if (horaEl) horaEl.textContent = interval;

        const metaDiv = tr.querySelector('.static-info.meta');
        const adjusted = getAdjustedTargetForInterval(state.formData?.target_per_hour ?? 0, interval, state.panSchedule);
        if (metaDiv) metaDiv.textContent = `${adjusted}`;

        return tr;
    }

    function recalculateTable() {
        if (!tableBody) return;
        const rows = Array.from(tableBody.querySelectorAll('tr'));
        let runningTotalProd = 0;
        let runningTotalMeta = 0;

        rows.forEach(row => {
            const metaInput = row.querySelector('input.meta');
            const metaDiv = row.querySelector('div.static-info.meta');
            const metaValue = parseMetaFromText(metaInput ? metaInput.value : (metaDiv ? metaDiv.textContent : '0'));
            runningTotalMeta += metaValue;

            const prodInput = row.querySelector('input.prod');
            const prodDiv = row.querySelector('div.static-info.prod');
            const prodValue = safeNumber(prodInput ? prodInput.value : (prodDiv ? prodDiv.textContent : 0));

            const difEl = row.querySelector('.dif');
            if (difEl) {
                const difference = prodValue - metaValue;
                runningTotalProd += prodValue;
                const totalDifference = runningTotalProd - runningTotalMeta;
                difEl.textContent = `${difference}/${totalDifference}`;
                difEl.classList.toggle('negative', difference < 0);
            } else {
                runningTotalProd += prodValue;
            }

            const acumEl = row.querySelector('.acum');
            if (acumEl) acumEl.textContent = runningTotalProd;

            if (metaDiv) metaDiv.textContent = `${metaValue}/${runningTotalMeta}`;
        });
    }

    function onTableClick(event) {
        const actionButton = event.target.closest('.action-button');
        if (!actionButton) return;
        const row = actionButton.closest('tr');
        if (!row) return;

        if (actionButton.classList.contains('edit')) {
            enterEditMode(row, actionButton);
            return;
        }

        if (actionButton.classList.contains('update')) {
            updateExistingRow(row, actionButton);
            return;
        }

        saveNewRow(row, actionButton);
    }

    function onTableInput(event) {
        const input = event.target;
        if (!input) return;
        if (input.classList.contains('prod') || input.classList.contains('meta')) {
            recalculateTable();
        }
    }

    function enterEditMode(row, actionButton) {
        const editFields = ['prod', 'defect', 'notas-incidentes'];
        editFields.forEach(className => {
            const div = row.querySelector(`div.static-info.${className}`);
            if (div) {
                const input = document.createElement('input');
                input.className = className;
                input.type = className === 'notas-incidentes' ? 'text' : 'number';
                input.value = div.textContent.trim();
                div.parentElement.replaceChild(input, div);
            }
        });

        actionButton.classList.remove('edit');
        actionButton.classList.add('update');
        actionButton.title = window.translations.report_update_row;
        const icon = actionButton.querySelector('img');
        if (icon) {
            icon.src = '/static/svg/action-check.svg';
            icon.alt = window.translations.alt_update;
        }

        recalculateTable();
    }

    async function updateExistingRow(row, actionButton) {
        const currentProdInput = row.querySelector('input.prod');
        const defectInput = row.querySelector('input.defect');
        const notasInput = row.querySelector('input.notas-incidentes');

        if (!currentProdInput || !String(currentProdInput.value).trim()) {
            showToast(window.translations.report_fill_prod_field);
            return;
        }

        const targetValue = getAdjustedTargetForRowFromRowElement(row);
        const difference = safeNumber(currentProdInput.value) - safeNumber(targetValue);
        if (difference < 0 && (!notasInput || !notasInput.value.trim())) {
            showToast(window.translations.report_mandatory_note_for_missed_target, false);
            return;
        }

        const payload = {
            id: row.dataset.hourlyId,
            target: targetValue,
            production: currentProdInput.value,
            defects: defectInput?.value,
            incident_notes: notasInput?.value
        };

        try {
            const response = await fetch('/update-hourly-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                showToast(err.error || window.translations.report_error_updating_row);
                return;
            }

            row.querySelectorAll('input').forEach(input => {
                const staticInfo = document.createElement('div');
                staticInfo.className = `static-info ${input.className}`;
                staticInfo.textContent = input.value || ' ';
                input.parentElement.replaceChild(staticInfo, input);
            });

            actionButton.classList.remove('update');
            actionButton.classList.add('edit');
            actionButton.title = window.translations.report_edit_row;
            const icon = actionButton.querySelector('img');
            if (icon) {
                icon.src = '/static/svg/action-edit.svg';
                icon.alt = window.translations.alt_edit;
            }

            const id = row.dataset.hourlyId;
            if (id) {
                const idx = state.rows.findIndex(r => String(r.id) === String(id));
                if (idx > -1) {
                    state.rows[idx].production = Number(payload.production);
                    state.rows[idx].defects = payload.defects;
                    state.rows[idx].incident_notes = payload.incident_notes;
                    state.rows[idx].target = payload.target;
                }
            }

            showToast(window.translations.report_row_updated_successfully, true);
            recalculateTable();
        } catch (e) {
            console.error("Error updating row:", e);
            showToast(window.translations.report_connection_error_updating);
        }
    }

    async function saveNewRow(row, actionButton) {
        const prodInput = row.querySelector('input.prod');
        const defectInput = row.querySelector('input.defect');
        const notasInput = row.querySelector('input.notas-incidentes');

        if (!prodInput || !String(prodInput.value).trim()) {
            showToast(window.translations.report_fill_prod_field);
            return;
        }

        const targetValue = getAdjustedTargetForRowFromRowElement(row);
        const difference = safeNumber(prodInput.value) - safeNumber(targetValue);
        if (difference < 0 && (!notasInput || !notasInput.value.trim())) {
            showToast(window.translations.report_mandatory_note_for_missed_target, false);
            return;
        }

        const timeRange = row.querySelector('.hora')?.textContent;
        const payload = {
            daily_id: state.dailyReportId,
            time_range: timeRange,
            target: targetValue,
            production: prodInput.value,
            defects: defectInput?.value,
            incident_notes: notasInput?.value
        };

        try {
            const response = await fetch('/add-hourly-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                showToast(result.error || window.translations.report_error_saving_row);
                return;
            }

            const [startHour = '', endHour = ''] = String(timeRange || '').split(' - ').map(s => s.trim());
            const newRowObj = {
                id: result.hourly_id ?? null,
                daily_id: state.dailyReportId,
                start_hour: startHour,
                end_hour: endHour,
                production: Number(prodInput.value),
                target: payload.target,
                defects: payload.defects,
                incident_notes: payload.incident_notes
            };
            state.rows.push(newRowObj);

            if (result.hourly_id) row.dataset.hourlyId = result.hourly_id;
            row.classList.add('row-done');

            row.querySelectorAll('input').forEach(input => {
                const staticInfo = document.createElement('div');
                staticInfo.className = `static-info ${input.className}`;
                staticInfo.textContent = input.value || ' ';
                input.parentElement.replaceChild(staticInfo, input);
            });

            actionButton.classList.add('edit');
            actionButton.title = window.translations.report_row_saved;
            const icon = actionButton.querySelector('img');
            if (icon) {
                icon.src = '/static/svg/action-edit.svg';
                icon.alt = window.translations.alt_edit;
            }

            if (document.querySelector('.report-action-button.cancel-action')) {
                setupReportActionButton(state.dailyReportId, true);
            }

            const nextIndex = getNextAvailableIndex();

            if (nextIndex < (state.effectiveShiftTimes?.length || 0)) {
                const nextRow = createEditableRow(nextIndex);
                tableBody.appendChild(nextRow);
            } else {
                showToast(window.translations.report_all_shifts_completed, true);
            }

            recalculateTable();
        } catch (e) {
            console.error("Error saving new row:", e);
            showToast(window.translations.report_connection_error_saving_row);
        }
    }

    function getAdjustedTargetForRowFromRowElement(row) {
        const horaText = row.querySelector('.hora')?.textContent;
        if (!horaText) return roundToNearestFive(state.formData?.target_per_hour ?? 0);
        return getAdjustedTargetForInterval(state.formData?.target_per_hour ?? 0, horaText, state.panSchedule);
    }

    function setupReportActionButton(dailyId, isClosingAction) {
        const closeButton = document.getElementById('close-report-button');
        if (!closeButton) return;

        const newButton = closeButton.cloneNode(true);
        closeButton.parentNode.replaceChild(newButton, closeButton);
        newButton.classList.remove('hidden');

        if (isClosingAction) {
            newButton.textContent = window.translations.report_close_report;
            newButton.classList.remove('cancel-action');
            newButton.addEventListener('click', async () => {
                const confirmed = await customConfirm(
                    window.translations.report_confirm_close,
                    window.translations.report_confirm_close_title
                );
                if (!confirmed) return;
                try {
                    const response = await fetch('/close-daily-report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ daily_id: dailyId })
                    });
                    const result = await response.json().catch(() => ({}));
                    if (response.ok) {
                        showToast(result.message, true);
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        showToast(result.error || window.translations.report_error_closing);
                    }
                } catch (err) {
                    showToast(window.translations.report_connection_error);
                }
            });
        } else {
            newButton.textContent = window.translations.report_cancel_report;
            newButton.classList.add('cancel-action');
            newButton.addEventListener('click', async () => {
                const confirmed = await customConfirm(
                    window.translations.report_confirm_cancel,
                    window.translations.report_confirm_cancel_title
                );
                if (!confirmed) return;
                try {
                    const response = await fetch('/cancel-daily-report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ daily_id: dailyId })
                    });
                    if (response.ok) {
                        showToast(window.translations.report_cancelled_successfully, true);
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        const result = await response.json().catch(() => ({}));
                        showToast(result.error || window.translations.report_error_cancelling);
                    }
                } catch (err) {
                    showToast(window.translations.report_connection_error);
                }
            });
        }
    }

    function setupHeaderInteraction(formData, existingHeader = null) {
        let dailyReportId = null;
        const headerCheckButton = document.getElementById('header-check-button');
        if (!headerCheckButton) {
            console.error("No se encontró el botón de confirmación del encabezado.");
            return;
        }

        if (existingHeader) {
            const headerRow = headerCheckButton.closest('tr');
            headerRow.querySelector('#no_parte').value = existingHeader.part_no;
            headerRow.querySelector('#orden').value = existingHeader.order;
            headerRow.querySelector('#cantidad').value = existingHeader.quantity;
            headerRow.querySelector('#no_op').value = existingHeader.op_no;
            document.getElementById('no_op_start').value = existingHeader.op_no;

            headerRow.querySelectorAll('input').forEach(input => {
                const staticInfo = document.createElement('div');
                staticInfo.className = `static-info ${input.className}`;
                staticInfo.textContent = input.value;
                staticInfo.id = input.id;
                input.parentElement.replaceChild(staticInfo, input);
            });

            headerCheckButton.classList.add('edit');
            headerCheckButton.title = window.translations.report_header_confirmed;
            const icon = headerCheckButton.querySelector('img');
            if (icon) {
                icon.src = '/static/svg/action-edit.svg';
                icon.alt = window.translations.alt_edit;
            }

            dailyReportId = existingHeader.id;
        }

        const handler = async () => {
            const headerRow = headerCheckButton.closest('tr');

            if (headerCheckButton.classList.contains('edit')) {
                headerRow.querySelectorAll('div.static-info').forEach(div => {
                    const input = document.createElement('input');
                    input.className = div.className.replace('static-info', '').trim();
                    input.id = div.id;
                    input.type = div.id in ['no_parte', 'orden'] ? 'text' : 'number';
                    input.value = div.textContent;
                    div.parentElement.replaceChild(input, div);
                });

                headerCheckButton.classList.remove('edit');
                headerCheckButton.classList.add('update');
                headerCheckButton.title = window.translations.report_confirm_header_changes;
                const icon = headerCheckButton.querySelector('img');
                if (icon) {
                    icon.src = '/static/svg/action-check.svg';
                    icon.alt = window.translations.alt_confirm;
                }

                document.getElementById('no_op').addEventListener('input', function () {
                    document.getElementById('no_op_start').value = this.value;
                    updateNoOpBalancing();
                });

                return;
            }

            let allFieldsFilled = true;
            headerRow.querySelectorAll('input').forEach(input => {
                if (!String(input.value).trim()) {
                    showToast(`${window.translations.report_fill_field} ${input.closest('td').dataset.label}`);
                    allFieldsFilled = false;
                }
            });
            if (!allFieldsFilled) return;

            const partNoInput = headerRow.querySelector('#no_parte');
            const partNoValue = partNoInput.value;
            const validPartNos = window.part_nos.map(p => String(p));
            if (!validPartNos.includes(partNoValue)) {
                showToast(window.translations.report_invalid_part_no, false);
                return;
            }

            const headerData = {
                pan: state.formData.pan,
                shift: state.formData.shift,
                date: state.formData.date,
                part_no: headerRow.querySelector('#no_parte').value,
                order: headerRow.querySelector('#orden').value,
                quantity: headerRow.querySelector('#cantidad').value,
                op_no: headerRow.querySelector('#no_op').value
            };

            if (headerCheckButton.classList.contains('update')) {
                try {
                    const response = await fetch('/update-daily-report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...headerData,
                            daily_id: dailyReportId
                        })
                    });

                    if (!response.ok) {
                        const errorResult = await response.json().catch(() => ({}));
                        showToast(errorResult.error || window.translations.report_error_updating_header);
                        return;
                    }

                    const result = response.status === 204 ? {} : await response.json().catch(() => ({}));

                    showToast(window.translations.report_header_updated_successfully, true);

                    headerRow.querySelectorAll('input').forEach(input => {
                        const staticInfo = document.createElement('div');
                        staticInfo.className = `static-info ${input.className}`;
                        staticInfo.textContent = input.value;
                        staticInfo.id = input.id;
                        input.parentElement.replaceChild(staticInfo, input);
                    });

                    headerCheckButton.classList.remove('update');
                    headerCheckButton.classList.add('edit');
                    headerCheckButton.title = window.translations.report_edit_header;
                    const icon = headerCheckButton.querySelector('img');
                    if (icon) {
                        icon.src = '/static/svg/action-edit.svg';
                        icon.alt = window.translations.alt_edit;
                    }

                    if (result.target_per_hour !== undefined) {
                        state.formData.target_per_hour = result.target_per_hour;
                        const lastRow = document.getElementById('report-body')?.querySelector('tr:last-child');
                        if (lastRow) {
                            const newTarget = getAdjustedTargetForRowFromRowElement(lastRow);
                            const metaDiv = lastRow.querySelector('div.static-info.meta');
                            if (metaDiv) metaDiv.textContent = `${newTarget}`;
                        }
                    }

                    recalculateTable();
                } catch (err) {
                    console.error("Error updating header:", err);
                    showToast(window.translations.report_connection_error_updating);
                }
                return;
            }

            try {
                const response = await fetch('/create-daily-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(headerData)
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showToast(result.error || window.translations.report_error_creating);
                    return;
                }

                dailyReportId = result.daily_id;
                state.dailyReportId = dailyReportId;
                dailyReportModule.init(dailyReportId);
                const lastEndHour = result.last_end_hour;
                state.formData.target_per_hour = result.target_per_hour;

                headerRow.querySelectorAll('input').forEach(input => {
                    const staticInfo = document.createElement('div');
                    staticInfo.className = `static-info ${input.className}`;
                    staticInfo.textContent = input.value;
                    staticInfo.id = input.id;
                    input.parentElement.replaceChild(staticInfo, input);
                });

                headerCheckButton.classList.add('edit');
                headerCheckButton.title = window.translations.report_edit_header;
                const icon = headerCheckButton.querySelector('img');
                if (icon) {
                    icon.src = '/static/svg/action-edit.svg';
                    icon.alt = window.translations.alt_edit;
                }
                
                document.querySelector('.start-report-table tbody').style.display = 'table-row-group';
                document.getElementById('close-start-report-button').classList.remove('hidden');
                initializeReportTable(state.formData, state.dailyReportId, [], lastEndHour);
                setupReportActionButton(state.dailyReportId, false);
            } catch (err) {
                console.error("Error creating report:", err);
                showToast(window.translations.report_connection_error_creating);
            }
        };

        headerCheckButton.removeEventListener('click', handler);
        headerCheckButton.addEventListener('click', handler);
    }

    async function loadReportContent(formData) {
        if (!formData || !formData.pan) return;
        state.formData = formData;

        tableBody = document.getElementById('report-body');
        template = document.getElementById('report-row-template');
        closeReportButton = document.getElementById('close-report-button');

        try {
            state.panSchedule = await fetchPanSchedule(formData.pan).catch(err => {
                console.error("Failed to load pan schedule:", err);
                return [];
            });
        } catch (err) {
            console.error("Error fetching pan schedule:", err);
            state.panSchedule = [];
        }

        const params = new URLSearchParams(formData);
        try {
            const resp = await fetch(`/get-open-daily-report?${params.toString()}`);
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok && !data.report_header) {
                setupHeaderInteraction(formData);
                return;
            }

            if (data.report_header) {
                showToast(window.translations.report_found_open_report, true);
                state.dailyReportId = data.report_header.id;
                dailyReportModule.init(data.report_header.id);
                setupHeaderInteraction(formData, data.report_header);
                const hasRows = Array.isArray(data.hourly_rows) && data.hourly_rows.length > 0;
                setupReportActionButton(data.report_header.id, hasRows);
                state.formData.target_per_hour = data.target_per_hour;

                state.rows = (data.hourly_rows || []).map(r => Object.assign({}, r));
                const allShiftTimes = getShiftTimes(formData.shift) || [];
                state.effectiveShiftTimes = computeEffectiveShiftTimes(allShiftTimes, data.last_end_hour, state.rows);

                renderTable(true);

                document.querySelector('.start-report-table tbody').style.display = 'table-row-group';
                document.getElementById('close-start-report-button').classList.remove('hidden');
            } else {
                setupHeaderInteraction(formData);
                document.querySelector('.start-report-table tbody').style.display = 'none';
                document.getElementById('close-start-report-button').classList.add('hidden');
            }

            try {
                const dailyId = state.dailyReportId || data.report_header.id;

                if (dailyId) {

                    const responseStartShift = await fetch(`/get-shift-start-report?daily_id=${dailyId}`, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (responseStartShift.status === 404) {
                        document.querySelector('.start-report-table tbody').style.display = 'table-row-group';
                        document.getElementById('close-start-report-button').classList.remove('hidden');
                        console.log("No existe reporte de inicio de turno.");
                    } else {
                        const dataStartShift = await responseStartShift.json().catch(() => ({}));
                        
                        if (!responseStartShift.ok) {
                            console.error("Error al obtener reporte:", dataStartShift.error);
                            return;
                        }

                        // Si existe el reporte
                        const report = dataStartShift.report;

                        console.log("Shift Start Report:", report);

                        // Aquí ya puedes colocar los valores en los campos si lo deseas:
                        document.querySelector('.start-report-table tbody').style.display = 'table-row-group';
                        document.getElementById('close-start-report-button').classList.add('hidden');

                        // Agrupamos todos los elementos que vamos a usar
                        const el = {
                            hour: document.getElementById('first_piece_at_hour'),
                            minute: document.getElementById('first_piece_at_minute'),
                            meridiem: document.getElementById('first_piece_at_meridiem'),
                            comment: document.getElementById('first_piece_comment'),

                            noOpStart: document.getElementById('no_op_start'),
                            noOpBalancing: document.getElementById('no_op_balancing'),
                            noOpBalancingComment: document.getElementById('no_op_balancing_comment'),

                            isLineWet: document.getElementById('is_line_wet'),
                            lineWetComment: document.getElementById('line_wet_comment')
                        };

                        // Deshabilitar inputs en bloque
                        [
                            el.hour, el.minute, el.meridiem, el.comment,
                            el.noOpStart, el.noOpBalancing, el.noOpBalancingComment,
                            el.isLineWet, el.lineWetComment
                        ].forEach(input => input.disabled = true);

                        // Parseo de hora
                        let [firstHour = '', firstMinute = ''] = (report.first_piece_at || '00:00').split(':');

                        let meridiem = firstHour > 12 ? "PM" : "AM";
                        if (firstHour > 12) {
                            firstHour = String(firstHour - 12).padStart(2, '0');
                        }

                        // Asignación de valores
                        el.hour.value = firstHour;
                        el.minute.value = firstMinute;
                        el.meridiem.value = meridiem;

                        el.comment.value = report.first_piece_comment || "";

                        el.noOpStart.value = report.no_op_start || "";
                        el.noOpBalancing.value = report.no_op_balancing || "";
                        el.noOpBalancingComment.value = report.no_op_comment || "";

                        el.isLineWet.selectedIndex = report.is_line_wet;
                        el.lineWetComment.value = report.is_line_wet_comment || "";

                        [
                            el.hour, el.minute, el.meridiem,
                            el.noOpStart, el.noOpBalancing,
                            el.isLineWet
                        ].forEach(input => {
                            input.classList.add('initial-loaded');
                            input.dispatchEvent(new Event('change'));
                            input.dispatchEvent(new Event('input'));    
                            input.classList.remove('initial-loaded');
                        });
                    }
                }

            } catch (error) {
                console.error("Error en fetch:", error);
            }
        } catch (e) {
            console.error("Error loading open daily report:", e);
            showToast(window.translations.report_connection_error_creating);
            setupHeaderInteraction(formData);
        }

        if (tableBody) {
            tableBody.removeEventListener('click', onTableClick);
            tableBody.addEventListener('click', onTableClick);
            tableBody.removeEventListener('input', onTableInput);
            tableBody.addEventListener('input', onTableInput);
        }

        state.initializing = false;
    }

    function initializeReportTable(formData, dailyReportId, existingRows = [], lastEndHour = null) {
        state.formData = formData;
        state.dailyReportId = dailyReportId;
        dailyReportModule.init(dailyReportId);
        state.panSchedule = state.panSchedule || [];
        state.rows = (existingRows || []).map(r => Object.assign({}, r));

        const allShiftTimes = getShiftTimes(formData.shift) || [];
        state.effectiveShiftTimes = computeEffectiveShiftTimes(allShiftTimes, lastEndHour, state.rows);

        tableBody = document.getElementById('report-body');
        template = document.getElementById('report-row-template');

        renderTable();

        if (tableBody) {
            tableBody.removeEventListener('click', onTableClick);
            tableBody.addEventListener('click', onTableClick);
            tableBody.removeEventListener('input', onTableInput);
            tableBody.addEventListener('input', onTableInput);
        }
    }

    async function getPanSettings(pan) {
        const operatingMachinesSection = document.querySelectorAll('.operating-machines-section');
        const dailyStartSection = document.querySelectorAll('.daily-start-section');

        try {
            const responseSettings = await fetch(`/pan-settings/${pan}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            const dataSettings = await responseSettings.json().catch(() => ({}));

            if (!responseSettings.ok) {
                showToast(dataSettings.error || window.translations.error_loading_pan_settings, false);
                operatingMachinesSection.forEach(section => section.classList.add('hidden'));
                dailyStartSection.forEach(section => section.classList.add('hidden'));
                return;
            }

            if (dataSettings.has_machines_in_system) {
                operatingMachinesSection.forEach(section => section.classList.remove('hidden'));
            } else {
                operatingMachinesSection.forEach(section => section.classList.add('hidden'));
            }

            if (dataSettings.need_daily_start_info) {
                dailyStartSection.forEach(section => section.classList.remove('hidden'));
            } else {
                dailyStartSection.forEach(section => section.classList.add('hidden'));
            }
        } catch (error) {
            console.error("Error al obtener la configuración del PAN:", error);
            showToast(window.translations.error_loading_pan_settings, false);
        }
    }

    return {
        handleInitialLoad: function (stateFromLoader) {
            const mode = stateFromLoader.modeAction?.getAttribute("mode");
            const dataToLoad = mode === 'current' ? stateFromLoader.currentFormData : stateFromLoader.formData;
            loadReportContent(dataToLoad);
            getPanSettings(dataToLoad.pan);
        },

        handlePastModeUpdate: function (stateFromLoader) {
            loadReportContent(stateFromLoader.formData);
            getPanSettings(stateFromLoader.formData.pan);
        },

        handleCurrentModeUpdate: function (stateFromLoader) {
            /*
            loadReportContent(stateFromLoader.currentFormData);
            getPanSettings(stateFromLoader.currentFormData.pan);
            */
        },

        initializeReportTable: initializeReportTable,
        setupReportActionButton: setupReportActionButton,
        setupHeaderInteraction: setupHeaderInteraction,
        recalculateTable: recalculateTable
    };
})();

export const handleInitialLoad = DailyReportController.handleInitialLoad;
export const handlePastModeUpdate = DailyReportController.handlePastModeUpdate;
export const handleCurrentModeUpdate = DailyReportController.handleCurrentModeUpdate;

export const initializeReportTable = DailyReportController.initializeReportTable;
export const setupReportActionButton = DailyReportController.setupReportActionButton;
export const setupHeaderInteraction = DailyReportController.setupHeaderInteraction;
export const recalculateTable = DailyReportController.recalculateTable;
