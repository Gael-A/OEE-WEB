export function loadStatus(formData) {
    const { pan, shift, date } = formData;
    if (!pan || !shift || !date) return;

    window.renderStatusModule(pan, shift, date)
}