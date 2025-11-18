export async function loadPanOptions(panSelect, panMenu, panLabel, createDropdownOptions) {
    const params = new URLSearchParams(window.location.search);
    const currentPan = params.get("pan");
    try {
        const res = await fetch("/available-panids");
        const panids = await res.json();
        panSelect.innerHTML = '';
        panids.forEach(pan => {
            const opt = document.createElement("option");
            opt.value = pan;
            opt.textContent = pan;
            if (pan === currentPan) opt.selected = true;
            panSelect.appendChild(opt);
        });
        createDropdownOptions(panSelect, panMenu, panLabel);
    } catch (e) {
        console.error("Error cargando PAN_IDs:", e);
    }
}
