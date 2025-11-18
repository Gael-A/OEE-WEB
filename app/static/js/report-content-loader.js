import { getShiftTimes, fetchPanSchedule } from './modules/shift-schedules.js';

const recalculateTable = () => {
    const tableBody = document.getElementById('report-body');
    if (!tableBody) return;
    let runningTotalProd = 0;
    let runningTotalMeta = 0;
    const rows = tableBody.querySelectorAll('tr');

    rows.forEach(row => {
        const metaDiv = row.querySelector('div.static-info.meta');
        const metaInput = row.querySelector('input.meta');
        const metaValue = parseFloat(metaInput?.value || metaDiv?.textContent.split('/')[0]) || 0;
        runningTotalMeta += metaValue;
        
        const prodInput = row.querySelector('input.prod');
        const prodDiv = row.querySelector('div.static-info.prod');
        const prodValue = parseFloat(prodInput?.value || prodDiv?.textContent) || 0;

        const difElement = row.querySelector('.dif');
        if (difElement) {
            const difference = prodValue - metaValue;
            runningTotalProd += prodValue;
            const totalDifference = runningTotalProd - runningTotalMeta;
            difElement.textContent = `${difference}/${totalDifference}`;
            difElement.classList.toggle('negative', difference < 0);
        }

        const acumElement = row.querySelector('.acum');
        if (acumElement) {
            acumElement.textContent = runningTotalProd;
        }

        if (metaDiv) {
            metaDiv.textContent = `${metaValue}/${runningTotalMeta}`;
        }
    });
};

const roundToNearestFive = (value) => {
    return Math.round(value / 5) * 5;
};

function initializeReportTable(formData, dailyReportId, existingRows = [], lastEndHour = null) {
    const tableBody = document.getElementById('report-body');
    const template = document.getElementById('report-row-template');
    const allShiftTimes = getShiftTimes(formData.shift);
    let effectiveShiftTimes = allShiftTimes;
    
    if (lastEndHour) {
        const lastHourSimple = lastEndHour.substring(0, 5);
        const lastIntervalIndex = allShiftTimes.findIndex(interval => {
            const intervalEnd = interval.split(' - ')[1];
            return intervalEnd === lastHourSimple;
        });

        const startIndex = lastIntervalIndex > -1 ? lastIntervalIndex + 1 : -1;
        if (startIndex > -1 && startIndex < allShiftTimes.length) {
            effectiveShiftTimes = allShiftTimes.slice(startIndex);
            showToast(`${window.translations.report_continuing_from} ${effectiveShiftTimes[0].split(' - ')[0]}.`, true);
        } else {
            effectiveShiftTimes = [];
        }
    }

    if (!tableBody || !template) {
        return;
    }

    tableBody.innerHTML = '';

    const addNewRow = () => {
        const rowIndex = tableBody.querySelectorAll('tr').length;
        if (rowIndex >= effectiveShiftTimes.length) {
            showToast(window.translations.report_all_shifts_completed, true);
            return;
        }

        const newRow = template.content.cloneNode(true);
        const horaElement = newRow.querySelector('.hora');
        if (horaElement) {
            horaElement.textContent = effectiveShiftTimes[rowIndex];
        }

        const metaDiv = newRow.querySelector('.static-info.meta');
        const currentInterval = effectiveShiftTimes[rowIndex];
        const [startTime, endTime] = currentInterval.split(" - ");

        let adjustedTarget = formData.target_per_hour;

        if (formData.panSchedule && formData.panSchedule.length > 0) {
            const match = formData.panSchedule.find(sch =>
                sch.start_hour.startsWith(startTime) && sch.end_hour.startsWith(endTime)
            );
            if (match) {
                adjustedTarget = (formData.target_per_hour / 60) * (60 - match.duration);
            }
        }
        
        const roundedTarget = roundToNearestFive(adjustedTarget);
        if (metaDiv) {
            metaDiv.textContent = `${roundedTarget}`;
        }

        const prodInput = newRow.querySelector('input.prod');
        prodInput.addEventListener('input', recalculateTable);

        tableBody.appendChild(newRow);
        recalculateTable();
    };

    existingRows.forEach(rowData => {
        const newRow = template.content.cloneNode(true);
        const addedRow = newRow.querySelector('tr');
        
        addedRow.querySelector('.hora').textContent = `${rowData.start_hour.substring(0, 5)} - ${rowData.end_hour.substring(0, 5)}`;
        
        const roundedTarget = roundToNearestFive(rowData.target);
        
        const prodInput = addedRow.querySelector('input.prod');
        const prodDiv = document.createElement('div');
        prodDiv.className = 'static-info prod';
        prodDiv.textContent = rowData.production;
        prodInput.parentElement.replaceChild(prodDiv, prodInput);

        const defectInput = addedRow.querySelector('input.defect');
        const defectDiv = document.createElement('div');
        defectDiv.className = 'static-info defect';
        defectDiv.textContent = rowData.defects || '';
        defectInput.parentElement.replaceChild(defectDiv, defectInput);

        const notasInput = addedRow.querySelector('input.notas-incidentes');
        const notasDiv = document.createElement('div');
        notasDiv.className = 'static-info notas-incidentes';
        notasDiv.textContent = rowData.incident_notes || '';
        notasInput.parentElement.replaceChild(notasDiv, notasInput);

        const metaDiv = addedRow.querySelector('.static-info.meta');
        if (metaDiv) metaDiv.textContent = roundedTarget;

        const acumDiv = addedRow.querySelector('.static-info.acum');
        if (acumDiv) acumDiv.textContent = rowData.accumulated;

        const difDiv = addedRow.querySelector('.static-info.dif');
        if (difDiv) difDiv.textContent = rowData.difference;

        if (rowData.difference < 0 && difDiv) {
            difDiv.classList.add('negative');
        }
        
        const actionButton = addedRow.querySelector('.action-button');
        actionButton.classList.add('edit');
        actionButton.title = window.translations.report_row_saved;
        actionButton.querySelector('img').src = '/static/svg/action-edit.svg';
        actionButton.querySelector('img').alt = window.translations.alt_edit;
        
        addedRow.dataset.hourlyId = rowData.id;
        addedRow.classList.add('row-done');
        
        tableBody.appendChild(addedRow);
    });
    
    recalculateTable();

    if (existingRows.length < effectiveShiftTimes.length) {
        addNewRow();
    }

    tableBody.addEventListener('click', async (event) => {
        const actionButton = event.target.closest('.action-button');
        if (!actionButton) return;

        const currentRow = actionButton.closest('tr');
        const prodDiv = currentRow.querySelector('div.static-info.prod');
        const prodInput = currentRow.querySelector('input.prod');
        const defectInput = currentRow.querySelector('input.defect');
        const notasInput = currentRow.querySelector('input.notas-incidentes');

        const checkNotes = (productionValue, targetValue) => {
            const difference = parseFloat(productionValue) - parseFloat(targetValue);
            if (difference < 0 && (!notasInput || !notasInput.value.trim())) {
                showToast(window.translations.report_mandatory_note_for_missed_target, false);
                return false;
            }
            return true;
        };

        if (actionButton.classList.contains('edit')) {
            console.log('Editar fila');
            
            const editFields = ['prod', 'defect', 'notas-incidentes'];
            editFields.forEach(className => {
                const div = currentRow.querySelector(`div.static-info.${className}`);
                if (div) {
                    const input = document.createElement('input');
                    input.className = className;
                    input.type = className === 'notas-incidentes' ? 'text' : 'number';
                    input.value = div.textContent.trim();
                    div.parentElement.replaceChild(input, div);
                }
            });
            
            const prodInputToListen = currentRow.querySelector('input.prod');
            const metaInputToListen = currentRow.querySelector('input.meta');
            if (prodInputToListen) prodInputToListen.addEventListener('input', recalculateTable);
            if (metaInputToListen) metaInputToListen.addEventListener('input', recalculateTable);
            
            actionButton.classList.remove('edit');
            actionButton.classList.add('update');
            actionButton.title = window.translations.report_update_row;
            const icon = actionButton.querySelector('img');
            if (icon) {
                icon.src = '/static/svg/action-check.svg';
                icon.alt = window.translations.alt_update;
            }
            recalculateTable();
            return;
        }

        if (actionButton.classList.contains('update')) {
            const currentProdInput = currentRow.querySelector('input.prod');
            if (!currentProdInput || !currentProdInput.value.trim()) {
                showToast(window.translations.report_fill_prod_field);
                return;
            }

            const targetValue = getAdjustedTargetForRow(currentRow, formData);
            if (!checkNotes(currentProdInput.value, targetValue)) {
                return;
            }
            
            const rowData = {
                id: currentRow.dataset.hourlyId,
                target: targetValue,
                production: currentProdInput.value,
                defects: defectInput?.value,
                incident_notes: notasInput?.value,
            };

            try {
                const response = await fetch('/update-hourly-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(rowData)
                });
                
                if (!response.ok) {
                    const errorResult = await response.json();
                    showToast(errorResult.error || window.translations.report_error_updating_row);
                    return;
                }

                const result = response.status === 204 ? {} : await response.json();
                
                showToast(window.translations.report_row_updated_successfully, true);

                currentRow.querySelectorAll('input').forEach(input => {
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

                recalculateTable();
            } catch (error) {
                console.error("Error al procesar la respuesta del servidor:", error);
                showToast(window.translations.report_connection_error_updating);
            }
            return;
        }

        const currentProdInput = currentRow.querySelector('input.prod');
        if (!currentProdInput || !currentProdInput.value.trim()) {
            showToast(window.translations.report_fill_prod_field);
            return;
        }

        const targetValue = getAdjustedTargetForRow(currentRow, formData);
        if (!checkNotes(currentProdInput.value, targetValue)) {
            return;
        }

        const rowData = {
            daily_id: dailyReportId,
            time_range: currentRow.querySelector('.hora')?.textContent,
            target: targetValue,
            production: currentProdInput.value,
            defects: defectInput?.value,
            incident_notes: notasInput?.value
        };

        try {
            const response = await fetch('/add-hourly-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rowData)
            });
            const result = await response.json();

            if (!response.ok) {
                showToast(result.error || window.translations.report_error_saving_row);
                return;
            }

            currentRow.dataset.hourlyId = result.hourly_id;
            currentRow.classList.add('row-done');

            currentRow.querySelectorAll('input').forEach(input => {
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
                setupReportActionButton(dailyReportId, true);
            }

            addNewRow();
            recalculateTable();
        } catch (error) {
            showToast(error || window.translations.report_connection_error_saving_row);
        }
    });
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
            if (confirmed) {
                try {
                    const response = await fetch('/close-daily-report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ daily_id: dailyId })
                    });
                    const result = await response.json();
                    if (response.ok) {
                        showToast(result.message, true);
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        showToast(result.error || window.translations.report_error_closing);
                    }
                } catch (error) {
                    showToast(window.translations.report_connection_error);
                }
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
            if (confirmed) {
                const response = await fetch('/cancel-daily-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ daily_id: dailyId })
                });
                if (response.ok) {
                    showToast(window.translations.report_cancelled_successfully, true);
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    const result = await response.json();
                    showToast(result.error || window.translations.report_error_cancelling);
                }
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

    const headerCheckHandler = async () => {
        const headerRow = headerCheckButton.closest('tr');

        if (headerCheckButton.classList.contains('edit')) {
            console.log('Editar encabezado');

            headerRow.querySelectorAll('div.static-info').forEach(div => {
                const input = document.createElement('input');
                input.className = div.className.replace('static-info', '').trim();
                input.id = div.id;
                input.type = div.id === 'orden' ? 'text' : 'number';
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
            return;
        }

        let allFieldsFilled = true;
        headerRow.querySelectorAll('input').forEach(input => {
            if (!input.value.trim()) {
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
            pan: formData.pan,
            shift: formData.shift,
            date: formData.date,
            part_no: headerRow.querySelector('#no_parte').value,
            order: headerRow.querySelector('#orden').value,
            quantity: headerRow.querySelector('#cantidad').value,
            op_no: headerRow.querySelector('#no_op').value
        };

        if (headerCheckButton.classList.contains('update')) {
            console.log('Actualizar encabezado');

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
                    const errorResult = await response.json();
                    showToast(errorResult.error || window.translations.report_error_updating_header);
                    return;
                }

                const result = response.status === 204 ? {} : await response.json();

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
                    formData.target_per_hour = result.target_per_hour;
                    
                    const lastRow = document.getElementById('report-body').querySelector('tr:last-child');
                    if (lastRow) {
                           const newTarget = getAdjustedTargetForRow(lastRow, formData);
                           const metaDiv = lastRow.querySelector('div.static-info.meta');
                           if (metaDiv) {
                               metaDiv.textContent = `${newTarget}`;
                           } else {
                                const metaInput = lastRow.querySelector('input.meta');
                                if(metaInput) metaInput.value = newTarget;
                           }
                    }
                }
                recalculateTable();

            } catch (error) {
                console.error("Error al procesar la respuesta del servidor:", error);
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
            const result = await response.json();

            if (!response.ok) {
                showToast(result.error || window.translations.report_error_creating);
                return;
            }

            dailyReportId = result.daily_id;
            const lastEndHour = result.last_end_hour;
            
            formData.target_per_hour = result.target_per_hour;

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

            initializeReportTable(formData, dailyReportId, [], lastEndHour);
            setupReportActionButton(dailyReportId, false);
        } catch (error) {
            showToast(window.translations.report_connection_error_creating);
        }
    };

    headerCheckButton.addEventListener('click', headerCheckHandler);
}


function getAdjustedTargetForRow(row, formData) {
    const horaText = row.querySelector('.hora')?.textContent;
    if (!horaText) {
        const defaultValue = formData.target_per_hour;
        return roundToNearestFive(defaultValue);
    }

    const [startTime, endTime] = horaText.split(" - ");
    let adjusted = formData.target_per_hour;

    if (formData.panSchedule && formData.panSchedule.length > 0) {
        const match = formData.panSchedule.find(sch =>
            sch.start_hour.startsWith(startTime) && sch.end_hour.startsWith(endTime)
        );
        if (match) {
            adjusted = (formData.target_per_hour / 60) * (60 - match.duration);
        }
    }

    return roundToNearestFive(adjusted);
}


async function loadReportContent(formData) {
    console.log("Cargando contenido del REPORTE con los datos:", formData);

    try {
        formData.panSchedule = await fetchPanSchedule(formData.pan);
    } catch (error) {
        console.error("Failed to load pan schedule:", error);
        formData.panSchedule = [];
    }

    const params = new URLSearchParams(formData);
    const response = await fetch(`/get-open-daily-report?${params.toString()}`);
    const data = await response.json();

    if (data.report_header) {
        showToast(window.translations.report_found_open_report, true);
        setupHeaderInteraction(formData, data.report_header);
        const hasRows = data.hourly_rows && data.hourly_rows.length > 0;
        setupReportActionButton(data.report_header.id, hasRows);
        formData.target_per_hour = data.target_per_hour;
        initializeReportTable(formData, data.report_header.id, data.hourly_rows, data.last_end_hour);
    } else {
        setupHeaderInteraction(formData);
    }
}

export function handleInitialLoad(state) {
    console.log("Manejando carga inicial para la página de REPORTE.");
    const mode = state.modeAction.getAttribute("mode");
    const dataToLoad = mode === 'current' ? state.currentFormData : state.formData;
    loadReportContent(dataToLoad);
}

export function handlePastModeUpdate(state) {
    loadReportContent(state.formData);
}

export function handleCurrentModeUpdate(state) {
}