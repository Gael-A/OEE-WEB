window.renderBarChart = async function (pan, shift, date, attribute, unit = '', max = 100, machineStatus = {}, selector = null, target = null) {
    const containerId = selector ? `chart-body-${selector}-${pan}-${attribute}` : `chart-body-${pan}-${attribute}`;
    const chartBody = document.getElementById(containerId);
    if (!chartBody) return;

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
        if (unit !== 'time') {
            const allValues = data.flatMap(item => [item[attribute] || 0, item.target ? parseFloat(item.target) : 0]);
            const maxDataValue = allValues.length > 0 ? Math.max(...allValues) : 0;

            if (maxDataValue > chartMax) {
                // Ajusta 'chartMax' al siguiente múltiplo de 10, 100 o 1000.
                if (maxDataValue > 1500) {
                    chartMax = (Math.ceil(maxDataValue / 1000) * 1000) + 1000;
                } else if (maxDataValue > 250) {
                    chartMax = (Math.ceil(maxDataValue / 100) * 100) + 100;
                } else {
                    chartMax = (Math.ceil(maxDataValue / 10) * 10) + 10;
                }
            }
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
            const value = item[attribute];
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

            // bar.appendChild(tooltip);

            // 🔽 Agrega línea de meta si hay target válido
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