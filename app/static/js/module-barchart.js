import { getShiftStart } from './modules/shift-schedules.js';

window.renderBarChart = async function (pan, shift, date, attribute, unit = '', max = 100, machineStatus = {}, selector = null, target = null) {
    const containerId = selector ? `chart-body-${selector}-${pan}-${attribute}` : `chart-body-${pan}-${attribute}`;
    const chartBody = document.getElementById(containerId);
    if (!chartBody) return;

    const parseTimeToSeconds = (val) => {
        if (val == null) return NaN;
        if (typeof val === 'number' && !isNaN(val)) return val;
        if (typeof val === 'string') {
            if (val.includes(':')) {
                const parts = val.split(':').map(p => parseInt(p, 10) || 0);
                if (parts.length === 2) {
                    return parts[0] * 3600 + parts[1] * 60;
                } else if (parts.length >= 3) {
                    return parts[0] * 3600 + parts[1] * 60 + parts[2];
                }
            }
            const n = parseFloat(val);
            return isNaN(n) ? NaN : n;
        }
        return NaN;
    };

    const formatHHmm = (seconds) => {
        let s = Math.round(seconds);
        s = ((s % 86400) + 86400) % 86400;
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    try {
        let url;
        if (selector) {
            url = `report-attribute-data?pan=${pan}&shift=${shift}&date=${date}&attribute=${attribute}&target=${target}&selector=${selector}`;
        } else {
            url = `machine-attribute-data?pan=${pan}&shift=${shift}&date=${date}&attribute=${attribute}`;
        }
        const response = await fetch(url);
        const data = await response.json();
        chartBody.innerHTML = '';

        let chartMax = max;

        // Comportamiento para unidades numéricas (no time/hour)
        if (unit !== 'time' && unit !== 'hour') {
            const allValues = data.flatMap(item => [item[attribute] || 0, item.target ? parseFloat(item.target) : 0]);
            const maxDataValue = allValues.length > 0 ? Math.max(...allValues) : 0;

            if (maxDataValue > chartMax) {
                if (maxDataValue > 1500) {
                    chartMax = (Math.ceil(maxDataValue / 1000) * 1000) + 1000;
                } else if (maxDataValue > 250) {
                    chartMax = (Math.ceil(maxDataValue / 100) * 100) + 100;
                } else {
                    chartMax = (Math.ceil(maxDataValue / 10) * 10) + 10;
                }
            }
        }

        if (unit === 'hour') {
            const parsedValues = data.map(item => {
                const v = item[attribute];
                return parseTimeToSeconds(v) || 0;
            });

            const parsedTarget = parseTimeToSeconds(target);
            const maxDataValue = parsedValues.length > 0 ? Math.max(...parsedValues) : 0;
            const baseMax = Math.max(maxDataValue, isNaN(parsedTarget) ? -Infinity : parsedTarget);

            let chartEndSeconds = (isFinite(baseMax) ? baseMax : 0) + 1800;
            if (!isFinite(chartEndSeconds) || chartEndSeconds <= 0) chartEndSeconds = 1800;

            let chartStartSeconds;
            let startTime = getShiftStart(shift, true);

            if (startTime) {
                const parsedStart = parseTimeToSeconds(startTime);
                chartStartSeconds = isNaN(parsedStart) ? 0 : parsedStart;
            } else {
                const minData = parsedValues.length > 0 ? Math.min(...parsedValues) : 0;
                const floorMin = Math.floor((minData) / 1800) * 1800;
                chartStartSeconds = Math.max(0, Math.min(floorMin, chartEndSeconds - 1800));
            }

            if (chartEndSeconds <= chartStartSeconds) {
                chartStartSeconds = Math.max(0, chartEndSeconds - 1800);
            }

            const chartRange = chartEndSeconds - chartStartSeconds;
            const stepSeconds = 1800;
            const totalSteps = Math.ceil(chartRange / stepSeconds);

            for (let i = 0; i <= totalSteps; i++) {
                const tSec = chartStartSeconds + (i * stepSeconds);
                const relative = (tSec - chartStartSeconds) / chartRange;
                const topPosition = 100 - (relative * 100);

                const label = document.createElement('div');
                label.className = 'axis-y-label';
                if (i % 2 === 1 && totalSteps > 8) label.classList.add('dispensable');
                label.style.top = `${topPosition}%`;
                label.textContent = formatHHmm(tSec);
                chartBody.appendChild(label);

                if (i > 0) {
                    const gridLine = document.createElement('div');
                    gridLine.className = 'grid-line';
                    if (i % 2 === 1 && totalSteps > 8) gridLine.classList.add('dispensable');
                    gridLine.style.top = `${topPosition}%`;
                    chartBody.appendChild(gridLine);
                }
            }

            data.forEach(item => {
                const raw = item[attribute];
                const itemSeconds = parseTimeToSeconds(raw) || 0;
                const id = item.id;
                if (!id) return;

                const parsedTargetValue = parseTimeToSeconds(item.target != null ? item.target : target);
                const container = document.createElement("div");
                container.className = "bar-container";

                const bar = document.createElement("div");
                bar.className = "bar";

                let heightPercent = chartRange > 0 ? ((itemSeconds - chartStartSeconds) / chartRange * 100) : 0;
                if (heightPercent < 0) heightPercent = 0;
                if (heightPercent > 100) heightPercent = 100;
                bar.style.height = `${heightPercent}%`;

                const displayValue = formatHHmm(itemSeconds);
                const tooltipValue = displayValue;

                let ratio = 0;
                if (selector && !isNaN(parsedTargetValue) && parsedTargetValue > 0) {
                    if (itemSeconds > parsedTargetValue || itemSeconds == 0) {
                        bar.classList.add("low");
                    } else {
                        bar.classList.add("high");
                    }
                }

                if (selector && (selector === "order" || selector === "total")) {
                    bar.textContent = Math.round(Math.max(0, Math.min(100, ratio * 100))) + '%' + '\n' + displayValue;
                } else {
                    bar.textContent = displayValue;
                }
                bar.classList.add(attribute);

                const tooltip = document.createElement("div");
                tooltip.className = "tooltip";
                tooltip.textContent = tooltipValue;

                const labelEl = document.createElement("div");
                labelEl.className = "bar-label";
                labelEl.textContent = id;
                if (machineStatus[id] === false) {
                    labelEl.classList.add('no_schedule');
                    container.classList.add('no_schedule');
                    labelEl.textContent += ` ${window.translations.barchart_no_schedule}`;
                }

                const parsedGlobalTarget = parseTimeToSeconds(target);
                const parsedItemTarget = parseTimeToSeconds(item.target);
                const effectiveTarget = !isNaN(parsedItemTarget) ? parsedItemTarget : (!isNaN(parsedGlobalTarget) ? parsedGlobalTarget : NaN);

                if (!isNaN(effectiveTarget) && chartRange > 0) {
                    let bottomPercent = ((effectiveTarget - chartStartSeconds) / chartRange) * 100;
                    if (bottomPercent < 0) bottomPercent = 0;
                    if (bottomPercent > 100) bottomPercent = 100;

                    const line = document.createElement('div');
                    line.classList.add('target-line');
                    line.style.bottom = `${bottomPercent}%`;

                    const tLabel = document.createElement('div');
                    tLabel.classList.add('target-label');
                    // tLabel.textContent = `Meta: ${formatHHmm(effectiveTarget)}`;
                    tLabel.textContent = item.comment ? item.comment : 'N/C';

                    line.appendChild(tLabel);
                    container.appendChild(line);
                }

                container.appendChild(bar);
                container.appendChild(labelEl);
                chartBody.appendChild(container);
            });

            return;
        }

        if (unit === 'time') {
            const maxDataValue = data.length > 0 ? Math.max(...data.map(item => item[attribute] || 0)) : 0;
            chartMax = (Math.ceil(maxDataValue / 3600) * 3600) + 3600;

            if (chartMax === 0) {
                chartMax = 3600;
            }

            const yAxisSteps = chartMax / 3600;

            for (let i = 0; i <= yAxisSteps; i++) {
                const currentHour = yAxisSteps - i;
                const topPosition = (i / yAxisSteps) * 100;

                const labelText = `${currentHour}h`;

                const label = document.createElement('div');
                label.className = 'axis-y-label';
                if (i % 2 === 1 && yAxisSteps > 4) {
                    label.classList.add('dispensable');
                }
                label.style.top = `${topPosition}%`;
                label.textContent = labelText;
                chartBody.appendChild(label);

                if (i > 0) {
                    const gridLine = document.createElement('div');
                    gridLine.className = 'grid-line';
                    if (i % 2 === 1 && yAxisSteps > 4) {
                        gridLine.classList.add('dispensable');
                    }
                    gridLine.style.top = `${topPosition}%`;
                    chartBody.appendChild(gridLine);
                }
            }
        } else {
            let stepValue;
            if (chartMax > 2000) {
                stepValue = 1000;
            } else if (chartMax > 200) {
                stepValue = 100;
            } else {
                stepValue = 10;
            }

            const steps = chartMax / stepValue;

            for (let i = 0; i <= steps; i++) {
                const rawValue = chartMax - (i * stepValue);
                const topPosition = (i / steps) * 100;

                const label = document.createElement('div');
                label.className = 'axis-y-label';
                if (i % 2 === 1) {
                    label.classList.add('dispensable');
                }
                label.style.top = `${topPosition}%`;
                let labelText;
                if (chartMax > 2000) {
                    const valueInK = rawValue / 1000;
                    const formattedValue = parseFloat(valueInK.toFixed(1));
                    labelText = formattedValue > 0 ? `${formattedValue}K${unit}` : `0${unit}`;
                } else {
                    labelText = `${Math.round(rawValue)}${unit}`;
                }
                label.textContent = labelText;
                chartBody.appendChild(label);

                if (i > 0) {
                    const gridLine = document.createElement('div');
                    gridLine.className = 'grid-line';
                    gridLine.style.top = `${topPosition}%`;
                    chartBody.appendChild(gridLine);
                }
            }
        }

        data.forEach(item => {
            const value = parseFloat(item[attribute]) || 0;
            const id = item.id;

            if (!id) return;

            const targetValue = parseFloat(item.target);

            const container = document.createElement("div");
            container.className = "bar-container";

            const bar = document.createElement("div");
            bar.className = "bar";
            bar.style.height = `calc(${value} / ${chartMax} * 100%)`;

            let displayValue = '';
            let tooltipValue = '';

            if (unit === 'time') {
                const hours = Math.floor(value / 3600);
                const minutes = Math.floor((value % 3600) / 60);

                const timeParts = [];
                if (hours > 0) timeParts.push(`${hours}h`);
                if (minutes > 0) timeParts.push(`${minutes}m`);

                displayValue = timeParts.length > 0 ? timeParts.join(' ') : '0m';
                tooltipValue = displayValue;
            } else {
                displayValue = `${value}${unit}`;
                tooltipValue = displayValue;
            }

            let ratio;
            if (selector) {
                ratio = value / targetValue;

                if ( ratio >= 1 ) {
                    bar.classList.add("high");
                }
                else if (ratio >= 0.67) {
                    bar.classList.add("upper-middle");
                } else if (ratio >= 0.34) {
                    bar.classList.add("middle");
                } else {
                    bar.classList.add("low");
                }
            } else {
                ratio = value / chartMax;

                if (ratio >= 0.65) {
                    bar.classList.add(attribute == 'time_inactive' ? "low" : "high");
                } else if (ratio >= 0.30) {
                    bar.classList.add("middle");
                } else {
                    bar.classList.add(attribute == 'time_inactive' ? "high" : "low");
                }
            }

            if (selector && (selector === "order" || selector === "total")) {
                bar.textContent = Math.round(ratio * 100) + '%' + '\n' +  displayValue;
            } else {
                bar.textContent = displayValue;
            }

            bar.classList.add(attribute);

            const tooltip = document.createElement("div");
            tooltip.className = "tooltip";
            tooltip.textContent = tooltipValue;

            const label = document.createElement("div");
            label.className = "bar-label";
            label.textContent = id;
            if (machineStatus[id] === false) {
                label.classList.add('no_schedule');
                container.classList.add('no_schedule');
                label.textContent += ` ${window.translations.barchart_no_schedule}`;
            }

            if (!isNaN(targetValue) && chartMax > 0) {
                const line = document.createElement('div');
                line.classList.add('target-line');
                line.style.bottom = `calc(${targetValue} / ${chartMax} * 100%)`;

                const label = document.createElement('div');
                label.classList.add('target-label');
                label.textContent = `Meta: ${targetValue}`;

                line.appendChild(label);
                container.appendChild(line);
            }

            container.appendChild(bar);
            container.appendChild(label);
            chartBody.appendChild(container);
        });

    } catch (error) {
        console.error("Error loading chart data:", error);
    }
}
