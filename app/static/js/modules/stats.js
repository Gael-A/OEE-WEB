window.chartAttributes = [
    { key: "cycles", unit: "", type: "linechart" },
    { key: "availability", unit: "%", max: 100 },
    { key: "availability_weighted", unit: "%", max: 100 },
    { key: "time_inactive", unit: "time", max: 43200 },
    { key: "time_ok", unit: "time", max: 43200 },
    { key: "availability", unit: "%", section: "summary" },
    { key: "availability_weighted", unit: "%", section: "summary" },
    { key: "counter", unit: "" },
    { key: "prod-efficiency", unit: "%" },
    { key: "quality", unit: "%" },
    { key: "oee", unit: "%" },
    { key: "moee", unit: "%" },
    { key: "target", unit: "" },
    { key: "production", unit: "" },
    { key: "real_production", unit: "" },
    { key: "difference", unit: "" },
    { key: "defects", unit: "" },
    { key: "production", unit: "", max: 80, selector: "hourly", target: "target" },
    { key: "production", unit: "", max: 4000, selector: "order", target: "target" },
    { key: "production", unit: "", max: 1500, selector: "total", target: "target" }
];

export function loadBarCharts(formData, machineStatus = {}) {
    const { pan, shift, date } = formData;
    if (!pan || !shift || !date) return;

    const chartAttributes = window.chartAttributes || [];

    chartAttributes.forEach(attr => {
        const { key, unit, max, section, selector, target, type} = attr;
        if (type == 'linechart') {
            window.renderLineChart(pan, shift, date, key, unit, max, machineStatus);
        }
        else {
            if (max) {
                if (selector) {
                    window.renderBarChart(pan, shift, date, key, unit, max, machineStatus, selector, target);
                } else {
                    window.renderBarChart(pan, shift, date, key, unit, max, machineStatus);
                }
            }
            window.renderNumericalModule(pan, shift, date, key, unit, section);
        }
    });

    document.getElementById('mode-action')?.classList.remove("outdated");

    const query = new URLSearchParams(formData).toString();
    const newUrl = `${window.location.pathname}?${query}`;
    history.replaceState(null, '', newUrl);
}
