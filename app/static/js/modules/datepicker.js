export function renderDatepicker(date, today, selectedDate, updateDate) {
    const months = window.translations.months;
    const days = window.translations.days;
    const datepicker = document.getElementById('custom-datepicker');

    datepicker.innerHTML = '';

    const header = document.createElement('div');
    header.id = 'custom-datepicker-header';
    const navBtn = (text, change) => {
        const btn = document.createElement('span');
        btn.textContent = text;
        btn.classList.add('datepicker-nav-button');
        btn.onclick = () => {
            const newDate = new Date(selectedDate);
            newDate.setMonth(newDate.getMonth() + change);
            updateDate(newDate);
        };
        return btn;
    };
    const title = document.createElement('span');
    title.textContent = `${months[date.getMonth()]} ${date.getFullYear()}`;
    header.append(navBtn('<', -1), title, navBtn('>', 1));
    datepicker.appendChild(header);

    days.forEach(d => {
        const el = document.createElement('div');
        el.classList.add('day');
        el.textContent = d;
        datepicker.appendChild(el);
    });

    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    for (let i = 0; i < firstDay.getDay(); i++) {
        const empty = document.createElement('div');
        empty.classList.add('empty');
        datepicker.appendChild(empty);
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const cellDate = new Date(date.getFullYear(), date.getMonth(), d);
        const cell = document.createElement('div');
        cell.classList.add('date');
        cell.textContent = d;
        if (cellDate.toDateString() === today.toDateString()) cell.classList.add('today');
        if (cellDate.toDateString() === selectedDate.toDateString()) cell.classList.add('selected');
        cell.onclick = () => {
            updateDate(cellDate);
            document.getElementById('date-picker-menu').classList.add('hidden');
        };
        datepicker.appendChild(cell);
    }
}
