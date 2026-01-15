import { initformData } from './modules/init-form.js';
import { createDropdownOptions } from './modules/dropdowns.js';
import { renderDatepicker } from './modules/datepicker.js';
import { toggleMode } from './modules/mode-toggle.js';
import { setShiftByCurrentTime } from './modules/shift-utils.js';
import { loadPanOptions } from './modules/pan-loader.js';

document.addEventListener('DOMContentLoaded', async () => {
    const state = {
        formData: {},
        currentFormData: {},
        savedPastDate: null,
        savedShift: null,
        today: new Date(),
        selectedDate: null,
        contentLoader: null,
        loaderType: null
    };

    // --- Selección de Elementos del DOM ---
    const panSelect = document.getElementById('pan');
    const panLabel = document.getElementById('pan-label');
    const panDropdown = document.getElementById('pan-dropdown');
    const panMenu = document.getElementById('pan-dropdown-menu');

    const shiftSelect = document.getElementById('shift');
    const shiftLabel = document.getElementById('shift-label');
    const shiftNumber = document.getElementById('shift-number');
    const shiftDropdown = document.getElementById('shift-dropdown');
    const shiftMenu = document.getElementById('shift-dropdown-menu');

    const dateLabel = document.getElementById('date-label');
    const dateDropdown = document.getElementById('date-dropdown');
    const dateMenu = document.getElementById('date-picker-menu');
    const datepicker = document.getElementById('custom-datepicker');

    const modeToggle = document.getElementById("mode-toggle");
    const modeAction = document.getElementById("mode-action");

    const dateInput = document.getElementById('date');
    const panInput = document.getElementById('pan');
    const shiftInput = document.getElementById('shift');

    const clockElement = document.getElementById('clock');

    let initializing = true;
    let previousPan = panSelect.value;

    state.selectedDate = dateInput.value ? new Date(dateInput.value) : new Date();

    //Formatea un objeto Date a una cadena 'dd/mm/yyyy'
    function formatDate(date) {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const y = date.getFullYear();
        return `${d}/${m}/${y}`;
    }

    //Actualiza la fecha en el estado, el input oculto y la etiqueta visible
    function updateDate(dateStr) {
        let d;
        if (typeof dateStr === 'string') {
            const [year, month, day] = dateStr.split('-').map(Number);
            d = new Date(year, month - 1, day);
        } else {
            d = new Date(dateStr);
        }
        state.selectedDate = d;
        const yy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dateInput.value = `${yy}-${mm}-${dd}`;
        dateLabel.textContent = formatDate(d);
        renderDatepicker(d, state.today, state.selectedDate, updateDate);
        if (modeAction.getAttribute("mode") === 'past') modeAction.classList.add('outdated');
    }

    //Establece el valor del selector de PAN ID y actualiza su etiqueta
    function setPanValue(value) {
        panSelect.value = value;
        const selectedOption = [...panSelect.options].find(opt => opt.value === value);
        if (selectedOption) {
            panLabel.textContent = selectedOption.textContent;
        }
        panSelect.dispatchEvent(new Event('change'));
    }

    //Establece el valor del selector de turno y actualiza su estado
    function setShiftValue(shiftValue) {
        shiftSelect.value = shiftValue;
        shiftSelect.dispatchEvent(new Event("change"));
        updateFormData();
    }

    //Recopila los valores actuales de los inputs del formulario (PAN, turno, fecha)
    function updateFormData() {
        state.formData = {
            pan: panInput.value,
            shift: shiftInput.value,
            date: dateInput.value
        };

        // -------------------------------
        // ✅ AGREGADO: Exponer globalmente
        // -------------------------------
        window.filters = {
            pan: state.formData.pan,
            shift: state.formData.shift,
            date: state.formData.date
        };
        // -------------------------------

        if (modeAction.getAttribute("mode") === 'past') {
            modeAction.classList.add('outdated');
        }
    }

    //Calcula y actualiza el estado para el modo 'Actual'
    function updateCurrentFormData() {
        const oldCurrentFormData = state.currentFormData;
        const now = new Date();

        const CUT_MINUTES = 30; // 00:30

        const adjustedDate = new Date(now);
        const minutesFromMidnight = now.getHours() * 60 + now.getMinutes();

        if (minutesFromMidnight < CUT_MINUTES) {
            adjustedDate.setDate(adjustedDate.getDate() - 1);
        }

        const yy = adjustedDate.getFullYear();
        const mm = String(adjustedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(adjustedDate.getDate()).padStart(2, '0');

        const todayStr = `${yy}-${mm}-${dd}`;

        const totalMins = now.getHours() * 60 + now.getMinutes();
        let shift = "all";
        if (totalMins >= 385 && totalMins < 970) shift = "1";
        if (totalMins >= 975 || totalMins < 30) shift = "2";
        if (totalMins >= 35 && totalMins < 380) shift = "3";

        state.currentFormData = {
            pan: panInput.value,
            shift: shift,
            date: todayStr
        };

        if (
            oldCurrentFormData.pan !== state.currentFormData.pan ||
            oldCurrentFormData.shift !== state.currentFormData.shift ||
            oldCurrentFormData.date !== state.currentFormData.date
        ) {
            if ((state.loaderType === 'report' || state.loaderType === 'plan') && !initializing) {
                window.location.reload();
            } else {
                setShiftByCurrentTime(setShiftValue);
                updateDate(todayStr);
            }
        }
    }

    //Actualiza el reloj en la UI cuando está en modo 'Actual'
    function updateClock() {
        const mode = modeToggle?.getAttribute('mode');
        if (mode === 'current') {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            clockElement.textContent = `${hours}:${minutes}:${seconds}`;
            clockElement.parentElement?.classList.remove('disabled');
        } else {
            clockElement.textContent = `00:00:00`;
            clockElement.parentElement?.classList.add('disabled');
        }

        updateCurrentFormData();
    }

    // --- Carga Dinámica del Módulo de Contenido ---
    async function loadContentLoader() {
        const scriptTag = document.querySelector('script[data-loader]');
        const loaderType = scriptTag ? scriptTag.getAttribute('data-loader') : 'dashboard';
        state.loaderType = loaderType;
        state.userRole = scriptTag ? scriptTag.getAttribute('data-user-role') : 'user';

        try {
            switch (loaderType) {
                case 'report':
                    state.contentLoader = await import('./report-content-loader.js');
                    break;
                case 'plan':
                    state.contentLoader = await import('./plan-content-loader.js');
                    break;
                case 'viewer':
                    state.contentLoader = await import('./viewer-content-loader.js');
                    break;
                case 'dashboard':
                default:
                    state.contentLoader = await import('./dashboard-content-loader.js');
                    break;
            }
        } catch (error) {
            console.error(`Falló la carga del módulo de contenido: ${loaderType}`, error);
        }
    }

    panSelect.onchange = () => {
        const selected = panSelect.options[panSelect.selectedIndex];
        panLabel.textContent = selected.textContent;
        updateFormData();

        if (!initializing) {
            const urlParams = { pan: state.formData.pan };

            if (state.loaderType === 'dashboard' || state.loaderType === 'viewer') {
                urlParams.shift = state.formData.shift;
                urlParams.date = state.formData.date;
            }

            const query = new URLSearchParams(urlParams).toString();
            const newUrl = `${window.location.pathname}?${query}`;
            history.replaceState(null, '', newUrl);
        }

        if (!initializing && panSelect.value !== previousPan) {
            previousPan = panSelect.value;
            window.location.reload();
        }
    };

    shiftSelect.onchange = () => {
        const selected = shiftSelect.options[shiftSelect.selectedIndex];
        shiftLabel.textContent = selected.textContent;
        shiftNumber.textContent = isNaN(selected.value) ? '-' : selected.value;
        updateFormData();
    };

    dateInput.onchange = () => {
        updateFormData();
    };

    // Manejo de visibilidad de dropdowns
    [panDropdown, shiftDropdown, dateDropdown].forEach(dropdown => {
        dropdown.onclick = (e) => {
            e.stopPropagation();
            const menu = dropdown.nextElementSibling;
            const mode = modeToggle?.nextElementSibling?.nextElementSibling?.getAttribute("mode");
            if (mode === "current" && dropdown !== panDropdown) return;
            document.querySelectorAll('.dropdown-menu').forEach(m => {
                if (m !== menu) m.classList.add('hidden');
            });
            menu.classList.toggle('hidden');
        };
    });

    // Funcionalidad del Modo Actual/Pasado
    state.modeToggle = modeToggle;
    state.modeAction = modeAction;
    state.updateDate = updateDate;
    state.setShiftByCurrentTime = () => setShiftByCurrentTime(setShiftValue);

    // Botón Actual/Pasado
    if (modeToggle) {
        modeToggle.addEventListener("click", () => {
            toggleMode(state);
            updateClock();
            const newMode = modeToggle.getAttribute("mode");
            if (newMode === 'past') {
                state.contentLoader?.handlePastModeUpdate(state);
            } else {
                state.contentLoader?.handleCurrentModeUpdate(state);
            }
        });
    }

    // Botón Actualizar en modo Pasado
    if (modeAction) {
        modeAction.addEventListener("click", function () {
            if (modeToggle.getAttribute("mode") === "past") {
                updateFormData();
                state.contentLoader?.handlePastModeUpdate(state);
            }
        });
    }

    // --- Inicialización ---
    await loadContentLoader();

    await loadPanOptions(panSelect, panMenu, panLabel, createDropdownOptions);

    createDropdownOptions(shiftSelect, shiftMenu, shiftLabel, (opt) => {
        shiftNumber.textContent = isNaN(opt.value) ? '-' : opt.value;
    });

    updateDate(state.selectedDate);
    setShiftByCurrentTime(setShiftValue);
    updateCurrentFormData();
    initformData(state.formData, setPanValue, setShiftValue, updateDate, () => { toggleMode(state); }, state.loaderType);
    updateFormData();
    state.contentLoader?.handleInitialLoad(state);

    initializing = false;

    setInterval(updateClock, 1000);
    updateClock();

    // Actualización automática por minuto (solo en modo Actual)
    setInterval(() => {
        if (modeToggle.getAttribute("mode") === 'current') {
            state.contentLoader?.handleCurrentModeUpdate(state);
        }
    }, 60000);
});
