document.addEventListener('DOMContentLoaded', function () {
    const video = document.getElementById('aboutCo2Video');
    if (!video) return;

    video.muted = true;
    video.play().catch(function () {
        video.controls = true;
    });

    video.addEventListener('error', function () {
        video.controls = true;
        video.setAttribute('poster', '/images/background/2.webp');
    });
});
