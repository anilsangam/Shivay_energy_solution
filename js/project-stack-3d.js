/**
 * SHIVAY ENERGY SOLUTIONS - INFINITE 3D ISOMETRIC MORPH DECK
 * Diagonal Top-Right to Bottom-Left Infinite Scroll with Corner Fade-Out
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', initInfiniteIsometricDeck);

    function initInfiniteIsometricDeck() {
        const container = document.querySelector('.morph-showcase-container');
        const wrapper = document.querySelector('.morph-stage-wrapper');
        const stage = document.querySelector('.morph-deck-stage');
        const cards = Array.from(document.querySelectorAll('.morph-iso-card'));
        const closeBtn = document.querySelector('.morph-btn-close');

        // Meta elements on the left
        const metaBlock = document.querySelector('.morph-meta-block');
        const detailsPanel = document.querySelector('.morph-project-details');
        const nameEl = document.querySelector('.morph-project-name');
        const subEl = document.querySelector('.morph-project-sub');
        const specsEl = document.querySelector('.morph-specs-strip');
        const descEl = document.querySelector('.morph-project-desc');

        if (!container || !wrapper || !stage || cards.length === 0) return;

        // Diagonal Rail Geometry (Top-Right down to Bottom-Left)
        const N = cards.length;
        const cardWidth = cards[0].offsetWidth || 440;
        const L = container.clientWidth + cardWidth * 2;
        const step = L / N;

        let scrollPos = 0;
        let targetScroll = 0;
        let autoSpeed = 0.65; // Slow right-to-left gallery drift
        let isExpanded = false;
        let activeCard = null;
        let activeIndex = 0;

        // Mouse Parallax variables
        let mouseX = 0;
        let mouseY = 0;
        let targetMouseX = 0;
        let targetMouseY = 0;

        // Pointer Drag variables
        let isDragging = false;
        let startY = 0;
        let startScroll = 0;
        let dragDistance = 0;

        // Hovered card reference
        let hoveredCard = null;

        // Initialize Cards
        cards.forEach((card, i) => {
            card.dataset.index = i;

            // Hover only elevates the card. Details update on click.
            card.addEventListener('mouseenter', () => {
                if (isExpanded) return;
                hoveredCard = card;
            });

            card.addEventListener('mouseleave', () => {
                if (isExpanded) return;
                if (hoveredCard === card) hoveredCard = null;
            });

            // Click: Expand to Featured Showcase
            card.addEventListener('click', (e) => {
                // Ignore click if user was dragging
                if (dragDistance > 6) return;

                if (isExpanded) {
                    if (card === activeCard) closeExpandedView();
                    return;
                }
                expandCard(card, i);
            });
        });

        // ==========================================
        // Continuous 60fps Animation Loop
        // ==========================================
        let rafId = null;

        function animateLoop() {
            if (!isExpanded) {
                // Keep the gallery moving until a project is clicked.
                if (!isDragging) {
                    targetScroll += autoSpeed;
                }

                // Smooth Scroll Damping (Lerp)
                scrollPos += (targetScroll - scrollPos) * 0.08;

                stage.style.transform = 'none';

                // Position every card along the diagonal top-right to bottom-left track
                cards.forEach((card, i) => {
                    const rawD = (i * step) - scrollPos;
                    // Each card travels from right to left through the center.
                    const s = ((rawD % L) + L) % L;

                    const screenX = s - cardWidth;
                    let x = screenX - wrapper.offsetLeft;
                    let y = wrapper.clientHeight * 0.5 - card.offsetHeight * 0.5 + 70;
                    let z = 0;
                    const centerX = screenX + cardWidth * 0.5;
                    const centerDistance = Math.abs(centerX - container.clientWidth * 0.5);
                    let scale = Math.max(0.55, 1.04 - centerDistance / (container.clientWidth * 0.9));

                    // Hover elevation
                    if (card === hoveredCard) {
                        x -= 12;
                        y -= 20;
                        z += 55;
                        scale *= 1.04;
                    }

                    // Fade only while the card enters/exits at the viewport edges.
                    const leftEdge = screenX;
                    const rightEdge = screenX + cardWidth * scale;
                    let opacity = Math.min(1, Math.max(0, rightEdge / 120));
                    if (leftEdge > container.clientWidth - 120) {
                        opacity = Math.min(opacity, Math.max(0, (container.clientWidth - leftEdge) / 120));
                    }

                    // Apply Transform & Styling
                    card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) scale(${scale.toFixed(3)})`;
                    card.style.opacity = opacity.toFixed(3);
                    card.style.zIndex = card === hoveredCard ? 9999 : Math.round(2000 - centerDistance);
                    card.style.pointerEvents = opacity < 0.2 ? 'none' : 'auto';

                    // Save last coordinate for smooth morph return
                    card.dataset.lastX = x.toFixed(1);
                    card.dataset.lastY = y.toFixed(1);
                    card.dataset.lastZ = z.toFixed(1);
                    card.dataset.lastScale = scale.toFixed(3);
                });

            }

            rafId = requestAnimationFrame(animateLoop);
        }

        rafId = requestAnimationFrame(animateLoop);

        // ==========================================
        // Wheel & Drag Event Handlers
        // ==========================================
        container.addEventListener('mouseleave', () => {
            targetMouseX = 0;
            targetMouseY = 0;
            hoveredCard = null;
        });

        // Mouse Wheel: Scroll up/down through infinite diagonal loop
        container.addEventListener('wheel', (e) => {
            if (isExpanded) return;
            e.preventDefault();
            // Scroll in direction of wheel
            targetScroll += e.deltaY * 0.85;
        }, { passive: false });

        // Pointer Drag / Swipe
        wrapper.addEventListener('pointerdown', (e) => {
            if (isExpanded) return;
            isDragging = true;
            startY = e.clientY;
            startScroll = targetScroll;
            dragDistance = 0;
            wrapper.setPointerCapture(e.pointerId);
        });

        wrapper.addEventListener('pointermove', (e) => {
            if (!isDragging || isExpanded) return;
            const deltaY = startY - e.clientY;
            dragDistance = Math.abs(deltaY);
            targetScroll = startScroll + deltaY * 1.6;
        });

        const stopDrag = (e) => {
            if (!isDragging) return;
            isDragging = false;
            try { wrapper.releasePointerCapture(e.pointerId); } catch (_) {}
            setTimeout(() => { dragDistance = 0; }, 50);
        };

        wrapper.addEventListener('pointerup', stopDrag);
        wrapper.addEventListener('pointercancel', stopDrag);

        // Mouse Tracker for Parallax
        window.addEventListener('mousemove', (e) => {
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            targetMouseX = (e.clientX - cx) / cx; // -1 to 1
            targetMouseY = (e.clientY - cy) / cy; // -1 to 1
        });

        // ==========================================
        // Left Panel Information Update
        // ==========================================
        function previewProject(card, instant) {
            if (!card) return;

            let data = {};
            try {
                data = JSON.parse(card.getAttribute('data-project') || '{}');
            } catch (e) {
                data = {};
            }

            if (instant) {
                setProjectText(data);
                return;
            }

            if (metaBlock) {
                metaBlock.classList.add('fading');
                setTimeout(() => {
                    setProjectText(data);
                    metaBlock.classList.remove('fading');
                }, 120);
            } else {
                setProjectText(data);
            }
        }

        function setProjectText(data) {
            if (nameEl) nameEl.textContent = data.title || 'Solar Installation';
            if (subEl) subEl.textContent = `${data.location || 'Raisen (M.P.)'} • ${data.year || '2024'}`;
            if (specsEl) {
                specsEl.innerHTML = `
                    <span>CAPACITY: <strong>${data.capacity || 'Custom'}</strong></span>
                    <span>PANELS: <strong>${data.panels ? data.panels.split(' ')[0] : 'TIER-1'}</strong></span>
                    <span>TYPE: <strong>${data.type || 'ON-GRID'}</strong></span>
                `;
            }
            if (descEl) descEl.textContent = data.description || '';
        }

        // ==========================================
        // Expand / Morph Transition
        // ==========================================
        function expandCard(card, index) {
            isExpanded = true;
            activeCard = card;
            activeIndex = index;

            previewProject(card, false);
            if (detailsPanel) detailsPanel.hidden = false;
            if (closeBtn && closeBtn.parentElement) closeBtn.parentElement.hidden = false;
            container.classList.add('details-open');

            // Enable smooth morph transition
            card.classList.add('is-morphing');
            wrapper.classList.add('expanded');

            // Force reflow
            void card.offsetWidth;

            card.classList.add('is-active');

            if (closeBtn) closeBtn.classList.add('visible');
        }

        // ==========================================
        // Close / Reverse Morph Transition
        // ==========================================
        function closeExpandedView() {
            if (!isExpanded || !activeCard) return;

            const card = activeCard;
            if (detailsPanel) detailsPanel.hidden = true;
            if (closeBtn && closeBtn.parentElement) closeBtn.parentElement.hidden = true;
            container.classList.remove('details-open');
            card.classList.remove('is-active');
            wrapper.classList.remove('expanded');

            // Animate card back to its last computed 3D slot
            const lx = parseFloat(card.dataset.lastX || 0);
            const ly = parseFloat(card.dataset.lastY || 0);
            const lz = parseFloat(card.dataset.lastZ || 0);
            const lscale = parseFloat(card.dataset.lastScale || 1);
            card.style.transform = `translate3d(${lx}px, ${ly}px, ${lz}px) scale(${lscale})`;

            if (closeBtn) closeBtn.classList.remove('visible');

            // After animation ends, remove morphing class and resume 60fps loop
            setTimeout(() => {
                card.classList.remove('is-morphing');
                isExpanded = false;
                activeCard = null;
            }, 750);
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', closeExpandedView);
        }

        // ==========================================
        // Keyboard Controls
        // ==========================================
        window.addEventListener('keydown', (e) => {
            if (!isExpanded) return;

            if (e.key === 'Escape') {
                closeExpandedView();
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                let nextIdx = (activeIndex + 1) % cards.length;
                switchActiveCard(nextIdx);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                let prevIdx = (activeIndex - 1 + cards.length) % cards.length;
                switchActiveCard(prevIdx);
            }
        });

        function switchActiveCard(newIdx) {
            if (newIdx === activeIndex) return;

            const oldCard = activeCard;
            const newCard = cards[newIdx];

            oldCard.classList.remove('is-active', 'is-morphing');
            newCard.classList.add('is-morphing', 'is-active');

            activeCard = newCard;
            activeIndex = newIdx;

            previewProject(newCard, false);
        }
    }
})();
