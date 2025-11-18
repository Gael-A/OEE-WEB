function showToast(message, isSuccess = false) {
    let toast = document.getElementById('toast');

    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
    }

    if (toast.hideTimeout) {
        clearTimeout(toast.hideTimeout);
    }

    toast.textContent = message;
    toast.className = 'toast show';
    if (isSuccess) {
        toast.classList.add('success');
    }
    
    toast.hideTimeout = setTimeout(() => {
        toast.classList.remove('show');
        toast.hideTimeout = null;
    }, 3000);
}