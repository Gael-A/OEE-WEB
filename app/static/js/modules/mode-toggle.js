export function toggleMode(state) {
    const { 
        modeToggle, 
        modeAction, 
        updateDate, 
        setShiftByCurrentTime,
        today,
        selectedDate
    } = state;

    const icon = modeToggle.querySelector(".action-icon");
    const modeButton = modeToggle.nextElementSibling?.nextElementSibling;
    const currentMode = modeButton?.getAttribute("mode");

    if (currentMode === "current") {
        icon.src = "/static/svg/action-past.svg";
        modeToggle.setAttribute("mode", "past");
        modeButton?.classList.remove("disabled");
        modeButton.textContent = window.translations.past_mode;
        modeButton.setAttribute("mode", "past");
        updateDate(state.savedPastDate || today);
        if (state.savedShift) {
            const shiftSelect = document.getElementById("shift");
            shiftSelect.value = state.savedShift;
            shiftSelect.dispatchEvent(new Event("change"));
        }
        document.getElementById("shift-dropdown").classList.remove("disabled");
        document.getElementById("date-dropdown").classList.remove("disabled");
    } else {
        icon.src = "/static/svg/action-current.svg";
        modeToggle.setAttribute("mode", "current");
        modeButton?.classList.add("disabled");
        modeButton.textContent = window.translations.current_mode;
        modeButton.setAttribute("mode", "current");
        state.savedPastDate = new Date(selectedDate);
        state.savedShift = document.getElementById("shift").value;
        updateDate(today);
        setShiftByCurrentTime();
        document.getElementById("shift-dropdown").classList.add("disabled");
        document.getElementById("date-dropdown").classList.add("disabled");
    }
}
