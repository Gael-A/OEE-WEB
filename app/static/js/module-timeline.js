function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    let parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);

    return parts.join(" ");
}

window.renderTimeline = async function (pan, shift, date, machine, section, role, isScheduled) {
    let url = "";
    // const urlPrefix = role === 'admin' ? 'debug-' : '';
    const urlPrefix = '';
    if (section.includes("pan")) {
        url = `${urlPrefix}status-data-tl-pan?pan=${pan}&shift=${shift}&date=${date}`;
    } else {
        url = `${urlPrefix}status-data-tl-machine?pan=${pan}&shift=${shift}&date=${date}&node=${machine}`;
    }
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (section.includes("pan")) {
            renderTimelineComponent(pan, data, section, { id: pan, title: pan, type: 'pan', shift: shift });
        } else {
            renderTimelineComponent(machine, data, section, { id: machine, title: machine, type: 'machine', isScheduled: isScheduled, shift: shift });
        }
    } catch (error) {
        console.error(`Error fetching data from ${url}:`, error);
        const container = document.getElementById(`timeline-${machine || pan}-${section}`);
        if (container) {
            container.innerHTML = `<div class="error-message" style="color: white; padding: 1rem;">${window.translations.tl_error_loading}</div>`;
        }
    }
};

function renderTimelineComponent(identifier, data, section, config) {

    const user_role = document.querySelector('script[session-role]')?.getAttribute('session-role');

    const startTime = new Date(data.start);
    const endTime = new Date(data.end);

    const totalSeconds = (endTime - startTime) / 1000;

    const downtime = formatDuration(data.downtime);
    const uptime = formatDuration(data.uptime);
    const totalStops = data.total_stops;

    const container = document.getElementById(`timeline-${identifier}-${section}`);
    if (container) container.innerHTML = "";

    const lapses = data.blocks;

    const moduleDiv = document.createElement("div");
    moduleDiv.classList = "timeline-machine";
    moduleDiv.id = `timeline-${config.type}-${config.id}`;

    const title = config.isScheduled === false
        ? `${config.title} <span class="no-schedule-text">(${window.translations.barchart_no_schedule})</span>`
        : config.title;

    moduleDiv.innerHTML = `
        <div id="header-${config.type}-${config.id}" class="timeline-header">
            <div id="title-${config.type}-${config.id}" class="tlh-title">${title}</div>
            <div id="stats-${config.type}-${config.id}" class="tlh-stats">
                <div id="uptime-${config.type}-${config.id}" class="tlh-stat">
                    <img src="/static/svg/icon-uptime.svg" alt="${window.translations.alt_uptime}">
                    ${uptime}
                </div>
                <div id="downtime-${config.type}-${config.id}" class="tlh-stat">
                    <img src="/static/svg/icon-downtime.svg" alt="${window.translations.alt_downtime}">
                    ${downtime}
                </div>
                <div id="stops-${config.type}-${config.id}" class="tlh-stat">
                    <img src="/static/svg/icon-stops.svg" alt="${window.translations.alt_stops}">
                    ${totalStops} ${window.translations.tl_stops}
                </div>
            </div>
        </div>
        <div id="bar-${config.type}-${config.id}" class="timeline-bar">
            <div id="lapsos-${config.type}-${config.id}" class="lapso-wrapper"></div>
        </div>
        <div id="hours-${config.type}-${config.id}" class="timeline-hours"></div>
    `;

    if (container) container.appendChild(moduleDiv);

    const lapsoWrapper = document.getElementById(`lapsos-${config.type}-${config.id}`);
    const timelineHours = document.getElementById(`hours-${config.type}-${config.id}`);

    lapses.forEach((lapse, index) => {
        const lapseStart = new Date(lapse.start_time);
        const lapseEnd = new Date(lapse.end_time);
        const lapseRealEnd = new Date(lapse.real_end_time);
        const stateKey = `tl_state_${lapse.relevant_status.replace('-', '_')}`;
        const lapseLabel = window.translations[stateKey];
        const lapseSeconds = (lapseEnd - lapseStart) / 1000;
        const lapseMinutes = lapseSeconds / 60;

        const leftPct = ((lapseStart - startTime) / 1000) / totalSeconds * 100;
        const widthPct = lapseSeconds / totalSeconds * 100;

        const lapseDiv = document.createElement("div");
        lapseDiv.id = `lapse-${config.type}-${config.id}-${index}`;
        lapseDiv.className = `lapse ${lapse.relevant_status}`;
        lapseDiv.style.left = `calc(${leftPct}%)`;
        lapseDiv.style.width = `calc(${widthPct}%)`;

        const durationLabel = lapseMinutes >= 60
            ? `${Math.floor(lapseMinutes / 60)}h ${Math.floor(lapseMinutes % 60)}m`
            : `${Math.floor(lapseMinutes)}m`;

        lapseDiv.innerHTML = `
            ${['1', '2', '3'].includes(config.shift) ? lapseMinutes >= 30 ? `<div class="lapse-duration">${durationLabel}</div>` : `` : lapseMinutes >= 180 ? `<div class="lapse-duration">${durationLabel}</div>` : ``}
            <div class="tooltip">
                ${window.translations.tl_tooltip_period} ${lapseLabel}<br/>
                ${lapseStart.toTimeString().substring(0, 5)} - ${lapseEnd.toTimeString().substring(0, 5)} <br/>
                ${durationLabel}
                ${user_role === 'admin' ? `
                <div class="admin-info">
                    <br/>REAL END TIME: ${lapseRealEnd.toTimeString().substring(0, 8)}
                </div>` : ''}
            </div>
        `;

        if (lapsoWrapper) lapsoWrapper.appendChild(lapseDiv);
    });

    const markers = [];

    if (['1', '2', '3'].includes(config.shift)) {
        markers.push({
            label: startTime.toTimeString().substring(0, 5),
            secondsFromStart: 0
        });
    }

    const nextHour = new Date(startTime);
    nextHour.setMinutes(0, 0, 0);
    if (startTime.getMinutes() > 0 || startTime.getSeconds() > 0) {
        nextHour.setHours(nextHour.getHours() + 1);
    }

    const hourStep = !['1', '2', '3'].includes(config.shift) ? 3 : 1;

    while (nextHour < endTime) {
        const secondsFromStart = (nextHour - startTime) / 1000;
        markers.push({
            label: nextHour.toTimeString().substring(0, 5),
            secondsFromStart
        });
        nextHour.setHours(nextHour.getHours() + hourStep);
    }

    markers.push({
        label: endTime.toTimeString().substring(0, 5),
        secondsFromStart: totalSeconds
    });

    markers.forEach((markerData, index) => {
        const marker = document.createElement("div");
        marker.id = `hour-marker-${config.type}-${config.id}-${index}`;
        marker.className = "hour-marker";
        if (hourStep === 1 && index % 2 === 1) {
            marker.classList.add("dispensable");
        }
        marker.textContent = markerData.label;
        marker.style.left = `calc(${markerData.secondsFromStart / totalSeconds * 100}%)`;
        if (timelineHours) timelineHours.appendChild(marker);
    });
}
