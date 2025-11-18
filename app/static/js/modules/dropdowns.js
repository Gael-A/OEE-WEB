export function createDropdownOptions(select, menu, label, callback) {
    menu.innerHTML = '';
    [...select.options].forEach(opt => {
        const div = document.createElement('div');
        div.classList.add('dropdown-option');
        div.textContent = opt.textContent;
        div.dataset.value = opt.value;
        div.onclick = () => {
            select.value = opt.value;
            label.textContent = opt.textContent;
            menu.classList.add('hidden');
            select.dispatchEvent(new Event('change'));
            callback?.(opt);
        };
        menu.appendChild(div);
    });

    const selected = select.options[select.selectedIndex];
    if (selected) {
        label.textContent = selected.textContent;
        callback?.(selected);
    }
}
