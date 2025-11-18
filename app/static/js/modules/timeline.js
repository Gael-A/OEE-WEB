export async function loadTimeLine(formData, machineStatus = {}, role = '') {
    const { pan, shift, date } = formData;
    if (!pan || !shift || !date) return;

    const machines = window.machines || [];
    
    machines.forEach(machine => {
        const container = document.getElementById(`timeline-${machine}-tl`);
        if (container) {
            if (machineStatus[machine] === false) {
                container.classList.add('no_schedule');
            } else {
                container.classList.remove('no_schedule');
            }
        }
        window.renderTimeline(pan, shift, date, machine, 'tl', role, machineStatus[machine]);
    });

    window.renderTimeline(pan, shift, date, '', 'tl-pan', role);

    document.getElementById('mode-action')?.classList.remove("outdated");
    const query = new URLSearchParams(formData).toString();
    const newUrl = `${window.location.pathname}?${query}`;
    history.replaceState(null, '', newUrl);
}
