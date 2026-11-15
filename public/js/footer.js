(function () {
    'use strict';

    const backToTop = document.getElementById('back-to-top');
    if (!backToTop) return;

    const visibilityThreshold = 600;
    let isVisible = false;
    let ticking = false;

    function updateVisibility() {
        const shouldShow = window.scrollY > visibilityThreshold;
        if (shouldShow !== isVisible) {
            backToTop.classList.toggle('show', shouldShow);
            backToTop.classList.toggle('hide', !shouldShow);
            isVisible = shouldShow;
        }
        ticking = false;
    }

    window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updateVisibility);
    }, { passive: true });

    backToTop.addEventListener('click', function (event) {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    updateVisibility();
})();
