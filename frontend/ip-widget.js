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
    let lastCheckedIp = null; // To prevent re-lookups

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
    let lastCheckTime = 0;
    const checkInterval = 2000; // 2 seconds

    const clipboardLoop = async (timestamp) => {
        if (!isMonitoring) return; // Stop the loop if monitoring is turned off

        if (timestamp - lastCheckTime > checkInterval) {
            lastCheckTime = timestamp;

            if (document.hasFocus()) {
                try {
                    const text = await navigator.clipboard.readText();
                    const potentialIp = text.trim();
                    
                    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(potentialIp) && potentialIp !== lastCheckedIp) {
                        lastCheckedIp = potentialIp; // Update last checked IP
                        showWidget();
                        ipInput.value = potentialIp;
                        performLookup(potentialIp);
                    }
                } catch (err) {
                    if (err.name !== 'NotFoundError') {
                        console.warn('Could not read clipboard:', err.name);
                    }
                }
            }
        }
        
        window.requestAnimationFrame(clipboardLoop);
    };

    const startMonitoring = () => {
        if (isMonitoring) return;
        isMonitoring = true;
        showWidget(); // Show the widget immediately when monitoring starts
        showToast('تم تفعيل مراقبة الحافظة.');
        window.requestAnimationFrame(clipboardLoop); // Start the loop
    };

    const stopMonitoring = () => {
        if (!isMonitoring) return;
        isMonitoring = false;
        showToast('تم إيقاف مراقبة الحافظة.');
    };

    toggleBtn.addEventListener('click', () => {
        if (isMonitoring) {
            stopMonitoring();
        } else {
            startMonitoring();
        }
        toggleBtn.classList.toggle('active', isMonitoring);
        toggleBtn.title = isMonitoring ? 'إيقاف مراقبة الحافظة' : 'تفعيل مراقبة الحافظة';
    });

    closeBtn.addEventListener('click', hideWidget);

    pinBtn.addEventListener('click', () => {
        isPinned = !isPinned;
        pinBtn.classList.toggle('pinned', isPinned);
        pinBtn.title = isPinned ? 'إلغاء تثبيت الأداة' : 'تثبيت الأداة';
    });

    ipInput.addEventListener('input', () => {
        performLookup(ipInput.value.trim());
        // When user types, we should update the last checked IP to prevent immediate override
        lastCheckedIp = ipInput.value.trim();
    });

    // Initial setup
    resetWidget();
}