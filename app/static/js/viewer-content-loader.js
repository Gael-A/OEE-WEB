function renderReport(reportData, container) {
    const { report_header, hourly_rows } = reportData;
    const template = document.getElementById('viewer-row-template');

    if (!report_header) {
        container.innerHTML = `<p class="no-data-message">${window.translations.no_info_to_show}</p>`;
        return;
    }

    container.innerHTML = '';

    const headerWrapper = document.createElement('div');
    headerWrapper.className = 'header-report';
    const headerTable = document.createElement('table');
    headerTable.className = 'header-report-table viewer';
    headerTable.innerHTML = `
        <thead>
            <tr>
                <th>${window.translations.part_number}</th>
                <th>${window.translations.order}</th>
                <th>${window.translations.quantity}</th>
                <th>${window.translations.operator_count}</th>
                <th>${window.translations.reported_by}</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td data-label="${window.translations.part_number}">${report_header.part_no}</td>
                <td data-label="${window.translations.order}">${report_header.order}</td>
                <td data-label="${window.translations.quantity}">${report_header.quantity}</td>
                <td data-label="${window.translations.operator_count}">${report_header.op_no}</td>
                <td data-label="${window.translations.reported_by}">${report_header.created_by_name || '--'}</td>
            </tr>
        </tbody>
    `;
    headerWrapper.appendChild(headerTable);
    container.appendChild(headerWrapper);

    const bodyWrapper = document.createElement('div');
    bodyWrapper.className = 'body-report';
    const bodyTable = document.createElement('table');
    bodyTable.className = 'body-report-table';
    bodyTable.innerHTML = `
        <thead>
            <tr>
                <th>${window.translations.hour.toUpperCase()}</th>
                <th>${window.translations.target.toUpperCase()}</th>
                <th>${window.translations.prod.toUpperCase()}</th>
                <th>${window.translations.accum.toUpperCase()}</th>
                <th>${window.translations.diff.toUpperCase()}</th>
                <th>${window.translations.defect.toUpperCase()}</th>
                <th>${window.translations.notes_incidents.toUpperCase()}</th>
            </tr>
        </thead>
    `;
    const tableBody = document.createElement('tbody');
    tableBody.id = 'report-body';

    if (hourly_rows && hourly_rows.length > 0 && template) {
        let accumulatedTarget = 0;
        let accumulatedProduction = 0;

        hourly_rows.forEach(row => {
            const newRow = template.content.cloneNode(true);
            const currentTarget = parseFloat(row.target) || 0;
            const currentProduction = parseFloat(row.production) || 0;
            const currentDifference = currentProduction - currentTarget;

            accumulatedTarget += currentTarget;
            accumulatedProduction += currentProduction;

            newRow.querySelector('.hora').textContent = `${row.start_hour.substring(0, 5)} - ${row.end_hour.substring(0, 5)}`;
            
            // Nuevo formato para el target: "actual / acumulado"
            newRow.querySelector('.meta').textContent = `${currentTarget}/${Math.round(accumulatedTarget)}`;
            
            newRow.querySelector('.prod').textContent = row.production;
            newRow.querySelector('.acum').textContent = accumulatedProduction;

            // Nuevo formato para la diferencia: "actual / acumulada"
            const accumulatedDifference = accumulatedProduction - accumulatedTarget;
            const difElement = newRow.querySelector('.dif');
            difElement.textContent = `${currentDifference}/${Math.round(accumulatedDifference)}`;
            
            // La clase negative se aplica SOLO si la diferencia ACTUAL es negativa
            difElement.classList.toggle('negative', currentDifference < 0);

            newRow.querySelector('.defect').textContent = row.defects || '';
            newRow.querySelector('.notas-incidentes').textContent = row.incident_notes || '';

            tableBody.appendChild(newRow);
        });
    } else {
        tableBody.innerHTML = `<tr><td colspan="7" class="no-data-message">${window.translations.report_no_hourly_records}</td></tr>`;
    }

    bodyTable.appendChild(tableBody);
    bodyWrapper.appendChild(bodyTable);
    container.appendChild(bodyWrapper);
}

async function loadCurrentReport(formData) {
    const container = document.getElementById('current-report-container');
    const timestampElement = document.getElementById('current-report-timestamp');
    const creatorElement = document.getElementById('current-report-creator');

    container.innerHTML = `<p class="no-data-message">${window.translations.searching_active_report}</p>`;
    if (timestampElement) {
        timestampElement.textContent = `${window.translations.last_update} --/--/-- --:--`;
    }
    if (creatorElement) {
        creatorElement.textContent = `${window.translations.reported_by}: --`;
    }

    const params = new URLSearchParams(formData);
    try {
        const response = await fetch(`/get-open-daily-report?${params.toString()}`);
        const data = await response.json();
        if (data.report_header) {
            renderReport(data, container);
            if (timestampElement && data.last_update_timestamp) {
                timestampElement.textContent = `${window.translations.last_update} ${data.last_update_timestamp}`;
            }
            if (creatorElement && data.report_header.created_by_name) {
                creatorElement.textContent = `${window.translations.reported_by}: ${data.report_header.created_by_name}`;
            }
        } else {
            container.innerHTML = `<p class="no-data-message">${window.translations.no_active_report}</p>`;
        }
    } catch (error) {
        container.innerHTML = `<p class="no-data-message">${window.translations.error_loading_active_report}</p>`;
        showToast(window.translations.error_loading_active_report);
    }
}

async function loadHistoryReports(formData) {
    const container = document.getElementById('history-reports-container');
    container.innerHTML = `<p class="no-data-message">${window.translations.viewer_searching_history}</p>`;
    const params = new URLSearchParams(formData);
    try {
        const response = await fetch(`/get-closed-daily-reports?${params.toString()}`);
        const reports = await response.json();
        container.innerHTML = '';
        if (reports && reports.length > 0) {
            for (const report of reports) {
                const reportContainer = document.createElement('div');
                reportContainer.className = 'report-instance';
                container.appendChild(reportContainer);
                const detailResponse = await fetch(`/get-hourly-by-daily/${report.id}`);
                const reportDetails = await detailResponse.json();
                renderReport({ report_header: report, hourly_rows: reportDetails.rows }, reportContainer);
            }
        } else {
            container.innerHTML = `<p class="no-data-message">${window.translations.no_history_reports_found}</p>`;
        }
    } catch (error) {
        container.innerHTML = `<p class="no-data-message">${window.translations.viewer_error_loading_history}</p>`;
        showToast(window.translations.viewer_error_loading_history);
    }
}

async function loadDailyResults(formData) {
    const params = new URLSearchParams(formData);
    try {
        const response = await fetch(`/get-daily-result?${params.toString()}`);
        const results = await response.json();

        if (response.ok) {
            document.getElementById('total-target').textContent = results.total_target;
            document.getElementById('total-production').textContent = results.total_production;
            
            const diffElement = document.getElementById('total-difference');
            diffElement.textContent = results.total_difference;
            diffElement.classList.toggle('negative', results.total_difference < 0);

            document.getElementById('total-defects').textContent = results.total_defects;
            
            const efficiencyElement = document.getElementById('total-efficiency');
            efficiencyElement.textContent = `${results.total_efficiency}%`;
            if (results.total_efficiency >= 65) efficiencyElement.className = 'result-value high';
            else if (results.total_efficiency >= 30) efficiencyElement.className = 'result-value middle';
            else efficiencyElement.className = 'result-value low';

        } else {
            // Manejar el caso de que la respuesta sea un error, pero el body no tenga resultados
            document.getElementById('total-target').textContent = '--';
            document.getElementById('total-production').textContent = '--';
            document.getElementById('total-difference').textContent = '--';
            document.getElementById('total-defects').textContent = '--';
            const efficiencyElement = document.getElementById('total-efficiency');
            efficiencyElement.textContent = '--';
            efficiencyElement.className = 'result-value low'; // o cualquier clase predeterminada
            showToast(results.error || window.translations.error_loading_total_results);
        }
    } catch (error) {
        showToast(window.translations.connection_error_loading_results);
    }
}

async function loadMachines(formData) {
    if (window.updateMachineView) {
        await window.updateMachineView(formData);
    }
}

export function handleInitialLoad(state) {
    const currentReportWrapper = document.getElementById('current-report-wrapper');
    const machinesTitle = document.getElementById('machines-section-title');
    const mode = state.modeAction.getAttribute("mode");
    const dataToLoad = mode === 'current' ? state.currentFormData : state.formData;

    if (mode === 'current') {
        currentReportWrapper?.classList.remove('hidden');
        if (machinesTitle) machinesTitle.textContent = window.translations.viewer_machines_operating_now;
        loadCurrentReport(dataToLoad);
    } else {
        currentReportWrapper?.classList.add('hidden');
        if (machinesTitle) machinesTitle.textContent = window.translations.viewer_last_machines_operating;
    }
    loadHistoryReports(dataToLoad);
    loadDailyResults(dataToLoad);
    loadMachines(dataToLoad);
}

export function handlePastModeUpdate(state) {
    document.getElementById('current-report-wrapper')?.classList.add('hidden');
    const machinesTitle = document.getElementById('machines-section-title');
    if (machinesTitle) machinesTitle.textContent = window.translations.viewer_last_machines_operating;
    loadHistoryReports(state.formData);
    loadDailyResults(state.formData);
    loadMachines(state.formData);
    document.getElementById('mode-action')?.classList.remove("outdated");
    const query = new URLSearchParams(state.formData).toString();
    const newUrl = `${window.location.pathname}?${query}`;
    history.replaceState(null, '', newUrl);
}

export function handleCurrentModeUpdate(state) {
    document.getElementById('current-report-wrapper')?.classList.remove('hidden');
    const machinesTitle = document.getElementById('machines-section-title');
    if (machinesTitle) machinesTitle.textContent = window.translations.viewer_machines_operating_now;
    loadCurrentReport(state.currentFormData);
    loadHistoryReports(state.currentFormData);
    loadDailyResults(state.currentFormData);
    loadMachines(state.currentFormData);
    document.getElementById('mode-action')?.classList.remove("outdated");
    const query = new URLSearchParams(state.currentFormData).toString();
    const newUrl = `${window.location.pathname}?${query}`;
    history.replaceState(null, '', newUrl);
}