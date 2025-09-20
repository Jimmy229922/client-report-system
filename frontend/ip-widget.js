import { showToast } from './ui.js';

export function initIpWidget() {
    const toggleBtn = document.getElementById('quick-ip-check-btn');
    const widget = document.getElementById('ip-widget');
    const closeBtn = document.getElementById('widget-close-btn');
    const pinBtn = document.getElementById('pin-widget-btn');
    const ipInput = document.getElementById('widget-ip-input');
    const resultDiv = document.getElementById('widget-ip-result');

    if (!toggleBtn || !widget || !closeBtn || !pinBtn || !ipInput || !resultDiv) {
        console.warn('IP Widget elements not found.');
        return;
    }

    let isPinned = false;
    let isMonitoring = false;
    let clipboardInterval = null;

    const showWidget = () => {
        widget.classList.add('show');
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

    const performLookup = (ip) => {
        if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
            resetWidget();
            return;
        }

        // Use the globally available ipToCountry function from the library
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

    // --- Clipboard Monitoring ---
    const checkClipboard = async () => {
        if (!isMonitoring || !document.hasFocus()) {
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
            if (err.name !== 'NotFoundError') {
                console.warn('Could not read clipboard:', err.name);
            }
        }
    };

    const startMonitoring = () => {
        if (clipboardInterval) return;
        showToast('تم تفعيل مراقبة الحافظة.');
        checkClipboard(); // Check immediately
        clipboardInterval = setInterval(checkClipboard, 2000);
    };

    const stopMonitoring = () => {
        if (!clipboardInterval) return;
        showToast('تم إيقاف مراقبة الحافظة.');
        clearInterval(clipboardInterval);
        clipboardInterval = null;
    };

    toggleBtn.addEventListener('click', () => {
        isMonitoring = !isMonitoring;
        toggleBtn.classList.toggle('active', isMonitoring);
        toggleBtn.title = isMonitoring ? 'إيقاف مراقبة الحافظة' : 'تفعيل مراقبة الحافظة';

        if (isMonitoring) {
            startMonitoring();
        } else {
            stopMonitoring();
        }
    });

    closeBtn.addEventListener('click', hideWidget);

    pinBtn.addEventListener('click', () => {
        isPinned = !isPinned;
        pinBtn.classList.toggle('pinned', isPinned);
        pinBtn.title = isPinned ? 'إلغاء تثبيت الأداة' : 'تثبيت الأداة';
    });

    ipInput.addEventListener('input', () => {
        performLookup(ipInput.value.trim());
    });

    // Initial setup
    resetWidget();
}