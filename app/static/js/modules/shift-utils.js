export function setShiftByCurrentTime(setShiftValue) {
    const now = new Date();
    const totalMins = now.getHours() * 60 + now.getMinutes();
    let shift = "all";
    if (totalMins >= 385 && totalMins < 970) shift = "1";
    if (totalMins >= 975 || totalMins < 30) shift = "2";
    if (totalMins >= 35 && totalMins < 380) shift = "3";

    setShiftValue(shift);
}

/*
Civilización/Imperio    —   Raza
------------------------ -------------------------
Egipto islámico         —    
Romana Bizantina        —   Aquas Centro, 
Maya Clásico/Posclásico —   Caelums
Vikinga                 —   Aquas Noreste
Heian / Song            —   Terra Fungos
Europa Medieval         —   Terra Faunas Occidente

------------------------ -------------------------

Civilización/Imperio/Período:
    Egipto Islámico
    Romana Bizantina
    Maya Clásico/Posclásico
    Vikinga
    Heian / Song
    Europa Medieval

Razas:
    Aquas
    Terra Faunas Oriente
    Terra Faunas Occidente
    Terra Floras
    Terra Fungos
    Caelums
    Umbras
    Humanos


*/