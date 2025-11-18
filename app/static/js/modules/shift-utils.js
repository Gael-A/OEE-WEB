export function setShiftByCurrentTime(setShiftValue) {
    const now = new Date();
    const totalMins = now.getHours() * 60 + now.getMinutes();
    let shift = "all";
    if (totalMins >= 390 && totalMins < 970) shift = "1";
    if (totalMins >= 980 || totalMins < 30) shift = "2";
    if (totalMins >= 40 && totalMins < 380) shift = "3";

    setShiftValue(shift);
}
