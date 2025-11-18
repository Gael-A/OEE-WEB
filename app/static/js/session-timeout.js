function initSessionTimeout(timeoutInSeconds, logoutUrl) {
    if (timeoutInSeconds > 0) {
        const timeoutInMilliseconds = timeoutInSeconds * 1000;
        setTimeout(() => {
            window.location.href = logoutUrl;
        }, timeoutInMilliseconds);
    }
}