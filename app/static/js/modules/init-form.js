export function initformData(formData, setPanValue, setShiftValue, updateDate, toggleMode, loaderType) {
    const urlParams = new URLSearchParams(window.location.search);
    const urlPan = urlParams.get("pan");
    const urlShift = urlParams.get("shift");
    const urlDate = urlParams.get("date");

    const inpPan = document.getElementById('pan').value;
    const inpShift = document.getElementById('shift').value;
    const inpDate = document.getElementById('date').value;

    formData.pan = urlPan || inpPan;
    if (urlPan) {
        setPanValue(urlPan);
    }

    if ((loaderType === 'dashboard' || loaderType === 'viewer' ) && (urlShift || urlDate)) {
        formData.shift = urlShift || inpShift;
        formData.date = urlDate || inpDate;
        
        if (!(urlShift == inpShift && urlDate == inpDate)) {
            toggleMode();
        }
        if (urlShift) setShiftValue(urlShift);
        if (urlDate) updateDate(urlDate);
    } else {
        formData.shift = inpShift;
        formData.date = inpDate;
    }
}
