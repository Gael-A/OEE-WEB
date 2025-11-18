document.addEventListener('DOMContentLoaded', () => {
    const sectionIds = ['barcharts', 'timelines', 'machines', 'report-charts', 'report', 'summary'];
    const content = document.querySelector('.content');
 
    if (!content) {
        console.warn('Auto-scroll: .content container not found. Disabling feature.');
        return;
    }
 
    const sectionIntervals = {
        'report-charts': 30 * 1000,
        'report': 30 * 1000,
    };
    const defaultInterval = 60 * 1000;
    const fadeDuration = 500;
    let currentIndex = 0;
 
    function cycleSections() {
        content.style.opacity = '0';
        
        setTimeout(() => {
            const sectionId = sectionIds[currentIndex];
            const elementToFocus = document.getElementById(sectionId);
 
            if (elementToFocus) {
                elementToFocus.scrollIntoView({ behavior: 'auto', block: 'start' });
            }
 
            content.style.opacity = '1';
 
            const displayTime = sectionIntervals[sectionId] || defaultInterval;
 
            currentIndex = (currentIndex + 1) % sectionIds.length;
 
            setTimeout(cycleSections, displayTime);
        }, fadeDuration);
    }
    cycleSections();
});