window.renderLineChart = async function (pan, shift, date, attribute, unit = '') {
    const containerId = `chart-body-${pan}-${attribute}`;
    const chartBody = document.getElementById(containerId);
    if (!chartBody) return;

    try {
        const response = await fetch(`/hourly-cycles?pan=${pan}&shift=${shift}&date=${date}`);
        const { data: machinesData, start: rawStart, end: rawEnd } = await response.json();

        chartBody.dataset.chartData = JSON.stringify({
            machinesData,
            rawStart,
            rawEnd,
            attribute,
            unit
        });

        drawChart(chartBody);

        const debounce = (func, delay) => {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => func(...args), delay);
            };
        };

        const resizeObserver = new ResizeObserver(debounce(entries => {
            for (let entry of entries) {
                if (entry.target === chartBody) {
                    drawChart(chartBody);
                }
            }
        }, 5)); 
        resizeObserver.observe(chartBody);

    } catch (error) {
        console.error("Error loading line chart data:", error);
    }
};

function drawChart(chartBody) {
    const chartData = JSON.parse(chartBody.dataset.chartData);
    const { machinesData, rawStart, rawEnd, attribute, unit } = chartData;

    chartBody.innerHTML = '';

    const pan = chartBody.id.split('-')[2];
    const legendId = `legend-${pan}-${attribute}`;
    const legendContainer = document.getElementById(legendId);

    if (legendContainer) {
        legendContainer.innerHTML = '';
        
        for (const machineId in machinesData) {
            const { primary } = machinesData[machineId];
            
            const colorBox = document.createElement('div');
            colorBox.className = 'color-box';
            colorBox.style.backgroundColor = primary;
            
            const machineLabel = document.createElement('span');
            machineLabel.textContent = machineId;
            
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.dataset.machineId = machineId;
            legendItem.appendChild(colorBox);
            legendItem.appendChild(machineLabel);
            
            legendContainer.appendChild(legendItem);
        }
    }
    
    const startTime = new Date(rawStart);
    const endTime = new Date(rawEnd);
    const totalDurationMs = endTime - startTime;

    let chartMax = 0;
    const allCycles = [];
    for (const machineId in machinesData) {
        machinesData[machineId].cycles.forEach(point => {
            allCycles.push(point.cycles);
        });
    }

    if (allCycles.length > 0) {
        const maxDataValue = Math.max(...allCycles);
        chartMax = (Math.ceil(maxDataValue / 10) * 10) + 10;
    }
    if (chartMax === 0) chartMax = 10;

    const steps = chartMax / 10;
    for (let i = 0; i <= steps; i++) {
        const rawValue = chartMax - (i * 10);
        const topPosition = (i / steps) * 100;

        const label = document.createElement('div');
        label.className = 'axis-y-label';
        if (i % 2 === 1) label.classList.add('dispensable');
        label.style.top = `${topPosition}%`;
        label.textContent = `${Math.round(rawValue)}${unit}`;
        chartBody.appendChild(label);

        if (i > 0) {
            const gridLine = document.createElement('div');
            gridLine.className = 'grid-line';
            gridLine.style.top = `${topPosition}%`;
            chartBody.appendChild(gridLine);
        }
    }

    // --- Inicio del nuevo bloque de código para el eje X ---
    const markers = [];
    const totalSeconds = totalDurationMs / 1000;

    // Agregar el marcador de inicio
    markers.push({
        label: startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        secondsFromStart: 0
    });

    // Calcular la primera hora en punto después del inicio
    const nextHour = new Date(startTime);
    nextHour.setMinutes(0, 0, 0);
    if (startTime.getMinutes() > 0 || startTime.getSeconds() > 0) {
        nextHour.setHours(nextHour.getHours() + 1);
    }

    const hourStep = 1;

    let markerIndex = 1;
    while (nextHour < endTime) {
        const secondsFromStart = (nextHour - startTime) / 1000;
        markers.push({
            label: nextHour.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            secondsFromStart
        });
        nextHour.setHours(nextHour.getHours() + hourStep);
        markerIndex++;
    }

    markers.push({
        label: endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        secondsFromStart: totalSeconds
    });

    markers.forEach((markerData, index) => {
        const leftPosition = (markerData.secondsFromStart / totalSeconds) * 100;
        
        const label = document.createElement('div');
        label.className = 'axis-x-label';
        
        if (hourStep === 1 && index > 0 && index < markers.length - 1 && index % 2 === 1) {
             label.classList.add('dispensable');
        }
        
        label.style.left = `${leftPosition}%`;
        label.textContent = markerData.label;
        chartBody.appendChild(label);
    });

    const rect = chartBody.getBoundingClientRect();
    const widthPx = rect.width || chartBody.clientWidth;
    const heightPx = rect.height || chartBody.clientHeight;

    function makePointDateFromTimeStr(timeStr) {
        const parts = timeStr.split(':').map(s => parseInt(s, 10));
        const h = parts[0] || 0, m = parts[1] || 0, s = parts[2] || 0;
        let d = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate(), h, m, s);
        if (d < startTime) d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
        return d;
    }

    function msOffsetFromStart(timeStr) {
        return makePointDateFromTimeStr(timeStr).getTime() - startTime.getTime();
    }

    for (const machineId in machinesData) {
        const { cycles = [], primary, secondary } = machinesData[machineId];
        
        cycles.sort((a, b) => msOffsetFromStart(a.time) - msOffsetFromStart(b.time));
        
        const machineGroup = document.createElement('div');
        machineGroup.classList.add('machine-group');
        machineGroup.dataset.machineId = machineId;
        
        for (let i = 0; i < cycles.length; i++) {
            const point = cycles[i];
            const pointDate = makePointDateFromTimeStr(point.time);
            const timeDiffMs = pointDate - startTime;
            const leftPx = (timeDiffMs / totalDurationMs) * widthPx;
            const bottomPx = (point.cycles / chartMax) * heightPx;
            const topPx = heightPx - bottomPx;

            const dataPoint = document.createElement('div');
            dataPoint.className = 'line-point';
            dataPoint.style.position = 'absolute';
            dataPoint.style.left = `${leftPx}px`;
            dataPoint.style.top = `${topPx}px`;
            dataPoint.style.transform = 'translate(-50%, -50%)';
            dataPoint.style.backgroundColor = primary;
            dataPoint.style.width = '10px';
            dataPoint.style.height = '10px';
            dataPoint.style.borderRadius = '50%';
            dataPoint.dataset.machineId = machineId;

            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            // tooltip.textContent = `${point.cycles} ${unit} ${point.time.substring(0, 5)}`;
            tooltip.textContent = `${point.cycles} ${unit}`;
            dataPoint.appendChild(tooltip);

            machineGroup.appendChild(dataPoint);

            if (i < cycles.length - 1) {
                const next = cycles[i + 1];
                const nextDate = makePointDateFromTimeStr(next.time);
                const nextTimeDiffMs = nextDate - startTime;
                const nextLeftPx = (nextTimeDiffMs / totalDurationMs) * widthPx;
                const nextBottomPx = (next.cycles / chartMax) * heightPx;
                const nextTopPx = heightPx - nextBottomPx;

                const deltaX = nextLeftPx - leftPx;
                const deltaY = nextTopPx - topPx;
                const lengthPx = Math.hypot(deltaX, deltaY);
                const angleDeg = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

                const line = document.createElement('div');
                line.className = 'line-segment';
                line.style.position = 'absolute';
                line.style.left = `${leftPx}px`;
                line.style.top = `${topPx}px`;
                line.style.width = `${lengthPx}px`;
                line.style.height = `2px`;
                line.style.transformOrigin = 'left center';
                line.style.transform = `rotate(${angleDeg}deg)`;
                line.style.backgroundColor = secondary;
                line.style.pointerEvents = 'none';
                line.dataset.machineId = machineId;

                machineGroup.appendChild(line);
            }
        }
        chartBody.appendChild(machineGroup);
    }
    
    // Nueva función para manejar el estado de hover
    const handleHover = (machineId, isHovering) => {
        const machineGroupToHighlight = chartBody.querySelector(`.machine-group[data-machine-id="${machineId}"]`);
        const legendItemToHighlight = legendContainer.querySelector(`.legend-item[data-machine-id="${machineId}"]`);
        
        if (isHovering) {
            chartBody.classList.add('is-dimmed');
            legendContainer.classList.add('is-dimmed-legend');
            if (machineGroupToHighlight) machineGroupToHighlight.classList.add('is-highlighted');
            if (legendItemToHighlight) legendItemToHighlight.classList.add('is-highlighted');
        } else {
            chartBody.classList.remove('is-dimmed');
            legendContainer.classList.remove('is-dimmed-legend');
            if (machineGroupToHighlight) machineGroupToHighlight.classList.remove('is-highlighted');
            if (legendItemToHighlight) legendItemToHighlight.classList.remove('is-highlighted');
        }
    };
    
    if (legendContainer) {
        legendContainer.querySelectorAll('.legend-item').forEach(item => {
            const machineId = item.dataset.machineId;
            item.addEventListener('mouseenter', () => handleHover(machineId, true));
            item.addEventListener('mouseleave', () => handleHover(machineId, false));
        });
    }

    chartBody.querySelectorAll('.line-point').forEach(point => {
        const machineId = point.dataset.machineId;
        point.addEventListener('mouseenter', () => handleHover(machineId, true));
        point.addEventListener('mouseleave', () => handleHover(machineId, false));
    });
}