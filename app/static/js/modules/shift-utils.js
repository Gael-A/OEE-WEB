export function setShiftByCurrentTime(setShiftValue) {
    const now = new Date();
    const totalMins = now.getHours() * 60 + now.getMinutes();
    let shift = "all";
    if (totalMins >= 385 && totalMins < 970) shift = "1";
    if (totalMins >= 975 || totalMins < 30) shift = "2";
    if (totalMins >= 35 && totalMins < 380) shift = "3";

    setShiftValue(shift);
}