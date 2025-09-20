export function initIpWidget() {
    const openBtn = document.getElementById('quick-ip-check-btn');
    const widget = document.getElementById('ip-widget');
    const closeBtn = document.getElementById('widget-close-btn');
    const pinBtn = document.getElementById('pin-widget-btn');
    const ipInput = document.getElementById('widget-ip-input');
    const resultDiv = document.getElementById('widget-ip-result');

    if (!openBtn || !widget || !closeBtn || !pinBtn || !ipInput || !resultDiv) {
        console.warn('IP Widget elements not found.');
        return;
    }

    let isPinned = false;

    const showWidget = () => {
        widget.classList.add('show');
        setTimeout(() => ipInput.focus(), 50);
    };

    const hideWidget = () => {
        if (!isPinned) {
            widget.classList.remove('show');
        }
    };

    const resetWidget = () => {
        ipInput.value = '';
        resultDiv.innerHTML = '<span class="widget-placeholder">انسخ IP أو أدخله يدوياً</span>';
    };

    openBtn.addEventListener('click', showWidget);
    closeBtn.addEventListener('click', hideWidget);

    pinBtn.addEventListener('click', () => {
        isPinned = !isPinned;
        pinBtn.classList.toggle('pinned', isPinned);
        pinBtn.title = isPinned ? 'إلغاء تثبيت الأداة' : 'تثبيت الأداة';
    });

    const performLookup = (ip) => {
        if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
            resetWidget();
            return;
        }

        // Use the globally available ipToCountry function
        const countryCode = window.ipToCountry.lookup(ip);

        if (countryCode) {
            const regionNames = new Intl.DisplayNames(['ar'], { type: 'region' });
            const countryName = regionNames.of(countryCode) || countryCode;
            resultDiv.innerHTML = `
                <img src="https://flagcdn.com/w40/${countryCode.toLowerCase()}.png" alt="${countryCode}" style="margin-bottom: 0.5rem;">
                ${countryName}
            `;
        } else {
            resultDiv.innerHTML = 'غير معروف';
        }
    };

    ipInput.addEventListener('input', () => {
        performLookup(ipInput.value.trim());
    });

    // --- Clipboard Monitoring ---
    const checkClipboard = async () => {
        if (!document.hasFocus()) {
            return;
        }
        try {
            const text = await navigator.clipboard.readText();
            const potentialIp = text.trim();
            // Check if it's a valid IP and different from the current input value
            if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(potentialIp) && potentialIp !== ipInput.value) {
                showWidget();
                ipInput.value = potentialIp;
                performLookup(potentialIp);
            }
        } catch (err) {
            // This can happen if the clipboard is empty or doesn't contain text.
            // Or if the user hasn't granted permission. We can ignore these errors.
            if (err.name !== 'NotFoundError') {
                console.warn('Could not read clipboard:', err.name);
            }
        }
    };

    // Check clipboard periodically when the window is focused
    let clipboardInterval;
    window.addEventListener('focus', () => {
        checkClipboard(); // Check immediately on focus
        if (!clipboardInterval) {
            clipboardInterval = setInterval(checkClipboard, 2000); // Then check every 2 seconds
        }
    });

    window.addEventListener('blur', () => {
        if (clipboardInterval) {
            clearInterval(clipboardInterval);
            clipboardInterval = null;
        }
    });

    // Initial setup
    resetWidget();
    clipboardInterval = setInterval(checkClipboard, 2000);
}