window.renderStatusModule = async function(pan, shift, date) {
    const container = document.getElementById(`status-${pan}`);
    if (!container) return;
    
    try {
        const res = await fetch(`/last-status-pan?pan=${pan}&shift=${shift}&date=${date}`);
        const data = await res.json();
        let status = data.relevant_status;

        const status_class = {
            "inactive": "inactive",
            "service": "service",
            "irrelevant": "irrelevant",
            "not_schedule": "not_schedule",
            "unknown": "unknown"
        };

        Object.values(status_class).forEach(className => {
            container.classList.remove(className);
        });

        if (status in status_class) {
            container.classList.add(status_class[status]);
        } else {
            status = 'unknown';
            container.classList.add(status_class.unknown);
        }

        const translationKey = status === 'irrelevant' ? 'status_ok' : `status_${status.replace('-', '_')}`;
        container.textContent = window.translations[translationKey] || window.translations.status_unknown;
    } catch (err) {
        console.error("Error loading status value:", err);
        container.textContent = window.translations.common_na;
    }
};
