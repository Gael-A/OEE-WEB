document.addEventListener('DOMContentLoaded', () => {
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const sidebarToggleIcon = document.querySelector('.sidebar-toggle-icon');
    const contractedSidebar = document.querySelector('.contracted-sidebar');
    const extendedSidebar = document.querySelector('.extended-sidebar');

    if (sidebarToggle && contractedSidebar && extendedSidebar) {
        sidebarToggle.addEventListener('click', () => {
            const isContractedVisible = contractedSidebar.classList.contains('visible');

            contractedSidebar.classList.toggle('visible', !isContractedVisible);
            extendedSidebar.classList.toggle('visible', isContractedVisible);

            sidebarToggle.classList.toggle('left', isContractedVisible);
            sidebarToggle.classList.toggle('right', !isContractedVisible);
            sidebarToggleIcon.classList.toggle('left', isContractedVisible);
            sidebarToggleIcon.classList.toggle('right', !isContractedVisible);
        });
    }
});
