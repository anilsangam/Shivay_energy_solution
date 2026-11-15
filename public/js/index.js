document.addEventListener('DOMContentLoaded', function () {
    const video = document.getElementById('aboutCo2Video');
    if (!video) return;

    video.muted = true;
    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(function () {
            document.body.addEventListener('click', function () {
                video.play().catch(function () {});
            }, { once: true });
        });
    }
});
