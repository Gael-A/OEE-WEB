window.renderNumericalModule = async function(pan, shift, date, attribute, unit = '', section = '') {
    const container = document.getElementById(`numerical-value-${pan}-${attribute}-${section}`);
    if (!container) return;

    try {
        const res = await fetch(`/pan-attribute-data?pan=${pan}&shift=${shift}&date=${date}&attribute=${attribute}`);
        const data = await res.json();
        const value = data[attribute];

        if (unit === "time") {
            const totalSeconds = parseInt(value, 10) || 0;
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);

            let formatted = "";
            if (hours > 0) formatted += `${hours}h `;
            if (minutes > 0 || hours === 0) formatted += `${minutes}m`;

            container.textContent = formatted;
        } else {
            container.textContent = `${value}${unit}`;
        }
    } catch (err) {
        console.error("Error loading numerical value:", err);
        container.textContent = "N/A";
    }
};
