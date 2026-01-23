function renderReport(reportData, container) {
    const { report_header, hourly_rows } = reportData;
    const template = document.getElementById('viewer-row-template');

    if (!report_header) {
        container.innerHTML = `<p class="no-data-message">${window.translations.no_info_to_show}</p>`;
        return;
    }

    container.innerHTML = '';

    const headerWrapper = document.createElement('div');
    headerWrapper.className = 'header-report snap-section';
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
            return Number(data.report_header.id);
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
            let first_daily_id = null;
            for (const report of reports) {
                if (!first_daily_id) {
                    first_daily_id = report.id;
                }
                const reportContainer = document.createElement('div');
                reportContainer.className = 'report-instance';
                container.appendChild(reportContainer);
                const detailResponse = await fetch(`/get-hourly-by-daily/${report.id}`);
                const reportDetails = await detailResponse.json();
                renderReport({ report_header: report, hourly_rows: reportDetails.rows }, reportContainer);
            }
            return first_daily_id;
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

    try {
        window.renderBarChart(formData.pan, formData.shift, formData.date, "start_shift", "hour", 1800, [], "week", "target");
    } catch {
        showToast(window.translations.no_chart_found)
    }

    try {
        const responseComments = await fetch(
            `/report-attribute-data?pan=${formData.pan}&shift=${formData.shift}&date=${formData.date}&attribute=start_shift&target=target&selector=week`
        );

        const resultsComments = await responseComments.json();

        if (Array.isArray(resultsComments)) {
            resultsComments.forEach(item => {
                const commentEl = document.getElementById(`${item.day}-comment`);

                if (commentEl) {
                    commentEl.textContent = item.comment && item.comment !== 'S/C'
                        ? item.comment
                        : window.translations.no_comments;
                }
            });
        }
    } catch (error) {
        console.error(window.translations.error_loading_comments, error);
    }
}

async function loadMachines(formData) {
    if (window.updateMachineView) {
        await window.updateMachineView(formData);
    }
}

async function loadDailyStartInfo(data) {
    try {
        // pan, date and shift should be used to fetch the start shift report
        const responseStartShift = await fetch(`/get-shift-start-report?${new URLSearchParams({
            pan: data.pan,
            shift: data.shift,
            date: data.date
        })}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        const dataStartShift = await responseStartShift.json().catch(() => ({}));

        if (responseStartShift.status === 404) {
            document.querySelector('.start-report-table tbody').style.display = 'none';
            return; 
        }

        if (!responseStartShift.ok) {
            console.error(window.translations.error_getting_report, dataStartShift.error);
            return;
        }

        const report = dataStartShift.report;

        console.log(window.translations.shift_start_report, report);

        document.querySelector('.start-report-table tbody').style.display = 'table-row-group';

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

        let [firstHour = '', firstMinute = ''] = (report.first_piece_at || window.translations.default_time).split(':');

        let meridiem = firstHour > 12 ? window.translations.pm : window.translations.am;
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

        async function triggerInitialValidation(inputs) {
            inputs.forEach(i => i.classList.add('initial-loaded'));

            for (const input of inputs) {
                input.dispatchEvent(new Event('change'));
                input.dispatchEvent(new Event('input'));
            }

            await Promise.resolve();

            inputs.forEach(i => i.classList.remove('initial-loaded'));
        }

        await triggerInitialValidation([
            el.hour, el.minute, el.meridiem,
            el.noOpStart, el.noOpBalancing,
            el.isLineWet
        ]);

    } catch (error) {
        console.error(window.translations.fetch_error, error);
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
        console.error(window.translations.error_getting_pan_config, error);
        showToast(window.translations.error_loading_pan_settings, false);
    }
}

export async function handleInitialLoad(state) {
    const currentReportWrapper = document.getElementById('current-report-wrapper');
    const machinesTitle = document.getElementById('machines-section-title');
    const mode = state.modeAction.getAttribute("mode");
    const dataToLoad = mode === 'current' ? state.currentFormData : state.formData;

    if (mode === 'current') {
        currentReportWrapper?.classList.remove('hidden');
        if (machinesTitle) machinesTitle.textContent = window.translations.viewer_machines_operating_now;
        let dailyId = await loadHistoryReports(dataToLoad);
        if (dailyId) {
            await loadDailyStartInfo(dataToLoad);
            loadCurrentReport(dataToLoad);
        } else {
            dailyId = await loadCurrentReport(dataToLoad);
            if (dailyId) {
                await loadDailyStartInfo(dataToLoad);
            }
        }
    } else {
        currentReportWrapper?.classList.add('hidden');
        if (machinesTitle) machinesTitle.textContent = window.translations.viewer_last_machines_operating;
        let dailyId = await loadHistoryReports(dataToLoad);
        if (dailyId) {
            await loadDailyStartInfo(dataToLoad);
        }
    }
    loadDailyResults(dataToLoad);
    loadMachines(dataToLoad);
    getPanSettings(dataToLoad.pan);
}

export async function handlePastModeUpdate(state) {
    document.getElementById('current-report-wrapper')?.classList.add('hidden');
    const machinesTitle = document.getElementById('machines-section-title');
    if (machinesTitle) machinesTitle.textContent = window.translations.viewer_last_machines_operating;
    let dailyId = await loadHistoryReports(state.formData);
    if (dailyId) {
        await loadDailyStartInfo(state.formData);
    }
    loadDailyResults(state.formData);
    loadMachines(state.formData);
    getPanSettings(state.formData.pan);
    document.getElementById('mode-action')?.classList.remove("outdated");
    const query = new URLSearchParams(state.formData).toString();
    const newUrl = `${window.location.pathname}?${query}`;
    history.replaceState(null, '', newUrl);
}

export async function handleCurrentModeUpdate(state) {
    document.getElementById('current-report-wrapper')?.classList.remove('hidden');
    const machinesTitle = document.getElementById('machines-section-title');
    if (machinesTitle) machinesTitle.textContent = window.translations.viewer_machines_operating_now;
    let dailyId = await loadHistoryReports(state.currentFormData);
    if (dailyId) {
        await loadDailyStartInfo(dataToLoad);
        loadCurrentReport(state.currentFormData);
    } else {
        dailyId = await loadCurrentReport(state.currentFormData);
        if (dailyId) {
            await loadDailyStartInfo(dataToLoad);
        }
    }
    loadDailyResults(state.currentFormData);
    loadMachines(state.currentFormData);
    getPanSettings(state.currentFormData.pan);
    document.getElementById('mode-action')?.classList.remove("outdated");
    const query = new URLSearchParams(state.currentFormData).toString();
    const newUrl = `${window.location.pathname}?${query}`;
    history.replaceState(null, '', newUrl);
}