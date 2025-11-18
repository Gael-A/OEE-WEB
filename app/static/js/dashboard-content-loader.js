import { loadTimeLine } from './modules/timeline.js';
import { loadBarCharts } from './modules/stats.js';
import { loadStatus } from './modules/status.js';

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
            
            // Nuevo formato para el target
            newRow.querySelector('.meta').textContent = `${currentTarget}/${Math.round(accumulatedTarget)}`;
            
            newRow.querySelector('.prod').textContent = row.production;
            newRow.querySelector('.acum').textContent = accumulatedProduction;

            // Nuevo formato para la diferencia
            const accumulatedDifference = accumulatedProduction - accumulatedTarget;
            const difElement = newRow.querySelector('.dif');
            difElement.textContent = `${currentDifference}/${Math.round(accumulatedDifference)}`;
            
            // Solo se pone rojo si la diferencia actual es negativa
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

    container.innerHTML = `<p class="no-data-message">${window.translations.searching_active_report}</p>`;
    if (timestampElement) {
        timestampElement.textContent = `${window.translations.last_update}: --/--/-- --:--`;
    }

    const params = new URLSearchParams(formData);
    try {
        const response = await fetch(`/get-last-daily-report?${params.toString()}`);
        const data = await response.json();
        
        if (data.report_header) {
            renderReport(data, container);
            if (timestampElement && data.last_update_timestamp) {
                timestampElement.textContent = `${window.translations.last_update}: ${data.last_update_timestamp}`;
            }
        } else {
            container.innerHTML = `<p class="no-data-message">${window.translations.no_active_report}</p>`;
        }
    } catch (error) {
        container.innerHTML = `<p class="no-data-message">${window.translations.error_loading_active_report}</p>`;
        showToast(window.translations.error_loading_active_report);
    }
}

async function loadDailyResults(formData) {
    const params = new URLSearchParams(formData);
    try {
        const response = await fetch(`/get-daily-result?${params.toString()}`);
        const results = await response.json();

        if (response.ok) {
            const totalTargetEl = document.getElementById('total-target');
            if (totalTargetEl) totalTargetEl.textContent = results.total_target;

            const totalProductionEl = document.getElementById('total-production');
            if (totalProductionEl) totalProductionEl.textContent = results.total_production;

            const diffElement = document.getElementById('total-difference');
            if (diffElement) {
                diffElement.textContent = results.total_difference;
                diffElement.classList.toggle('negative', results.total_difference < 0);
            }

            const totalDefectsEl = document.getElementById('total-defects');
            if (totalDefectsEl) totalDefectsEl.textContent = results.total_defects;

            const efficiencyElement = document.getElementById('total-efficiency');
            if (efficiencyElement) {
                efficiencyElement.textContent = `${results.total_efficiency}%`;
                if (results.total_efficiency >= 65) efficiencyElement.className = 'result-value high';
                else if (results.total_efficiency >= 30) efficiencyElement.className = 'result-value middle';
                else efficiencyElement.className = 'result-value low';
            }
        } else {
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

async function handleLoads(data) {
    const scriptTag = document.querySelector('script[data-loader]');
    const role = scriptTag?.getAttribute('role');

    const machineStatusPromise = (async () => {
        try {
            const url = `/machines-initial-status-view?date=${data.date}&shift=${data.shift}&pan=${data.pan}`;
            const response = await fetch(url);
            if (response.ok) {
                return await response.json();
            }
            console.error("Error fetching machine status for dashboard");
            return null;
        } catch (error) {
            console.error("Failed to fetch machine status for dashboard:", error);
            return null;
        }
    })();

    const independentLoadPromises = [
        loadStatus(data),
        loadMachines(data),
        loadCurrentReport(data),
        loadDailyResults(data),
    ];

    const machineStatus = await machineStatusPromise;

    if (machineStatus) {
        loadTimeLine(data, machineStatus, role);
        loadBarCharts(data, machineStatus);
    }

    Promise.allSettled(independentLoadPromises).then(results => {
        results.filter(r => r.status === 'rejected').forEach(r => console.error("An independent load failed:", r.reason));
    });
}

export function handleInitialLoad(state) {
    const dataToLoad = state.modeAction.getAttribute("mode") === 'current' ? state.currentFormData : state.formData;
    handleLoads(dataToLoad);
}

export function handlePastModeUpdate(state) {
    handleLoads(state.formData);
}

export function handleCurrentModeUpdate(state) {
    handleLoads(state.currentFormData);
}