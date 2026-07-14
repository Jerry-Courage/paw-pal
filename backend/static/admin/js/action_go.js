/**
 * Injects a "Go" button next to the bulk action dropdown in Django Unfold admin.
 * Unfold removes the native Django submit button — this restores it.
 */
(function() {
    function injectGoButton() {
        // Find all action select dropdowns
        var selects = document.querySelectorAll('select[name="action"]');
        selects.forEach(function(sel) {
            // Don't inject twice
            if (sel.parentNode.querySelector('.go-btn-injected')) return;

            var btn = document.createElement('button');
            btn.type = 'submit';
            btn.name = 'index';
            btn.value = '0';
            btn.textContent = 'Go';
            btn.className = 'go-btn-injected';
            btn.style.cssText = [
                'display:inline-flex',
                'align-items:center',
                'padding:6px 18px',
                'background:#f97316',
                'color:white',
                'font-weight:700',
                'font-size:12px',
                'border-radius:8px',
                'border:none',
                'cursor:pointer',
                'margin-left:8px',
                'vertical-align:middle',
                'line-height:1'
            ].join(';');

            btn.addEventListener('mouseover', function() { this.style.background = '#ea6c0a'; });
            btn.addEventListener('mouseout',  function() { this.style.background = '#f97316'; });

            sel.parentNode.insertBefore(btn, sel.nextSibling);
        });
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectGoButton);
    } else {
        injectGoButton();
    }

    // Also run after any dynamic content loads (Unfold uses HTMX/Alpine)
    setTimeout(injectGoButton, 500);
    setTimeout(injectGoButton, 1500);
})();
