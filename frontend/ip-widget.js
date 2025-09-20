import { showToast } from './ui.js';

export function initIpWidget() {
    const toggleBtn = document.getElementById('quick-ip-check-btn');
    const widget = document.getElementById('ip-widget');
    const header = document.querySelector('.widget-header');
    const closeBtn = document.getElementById('widget-close-btn');
    const pinBtn = document.getElementById('pin-widget-btn');
    const ipInput = document.getElementById('widget-ip-input');
    const resultDiv = document.getElementById('widget-ip-result');
    const historyContainer = document.getElementById('widget-history-container');
    const historyList = document.getElementById('widget-history-list');

    if (!toggleBtn || !widget || !header || !closeBtn || !pinBtn || !ipInput || !resultDiv || !historyContainer || !historyList) {
        console.warn('IP Widget elements not found.');
        return;
    }

    let isPinned = false;
    let isMonitoring = false;
    let lastCheckedIp = null;
    let history = [];

    const showWidget = () => {
        widget.classList.add('show');
    };

    const hideWidget = () => {
        if (!isPinned) {
            widget.classList.remove('show');
        }
    };

    const updateHistory = () => {
        if (history.length > 0) {
            historyContainer.classList.remove('hidden');
            historyList.innerHTML = history.map(item => `
                <li>
                    <span class="history-ip">${item.ip}</span>
                    <span class="history-country">${item.country}</span>
                </li>
            `).join('');
        } else {
            historyContainer.classList.add('hidden');
        }
    };

    const performLookup = async (ip) => {
        if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
            resultDiv.innerHTML = '';
            return;
        }

        // Show loading state immediately
        resultDiv.innerHTML = '<div class="spinner" style="width: 25px; height: 25px; border-width: 3px;"></div>';
        let countryName = 'غير معروف';

        try {
            const response = await fetch(`https://ipwhois.app/json/${ip}`);
            const data = await response.json();
            if (data.success) {
                countryName = data.country;
                resultDiv.innerHTML = `
                    <img src="${data.country_flag}" alt="${data.country_code}" style="margin-bottom: 0.5rem; width: 40px; height: auto;">
                    ${countryName}
                `;
            } else {
                throw new Error(data.message || 'Invalid IP address');
            }
        } catch (error) {
            console.error('Widget IP lookup failed:', error.message);
            resultDiv.innerHTML = 'فشل البحث';
        }

        // Add to history if it's a new IP
        if (!history.some(item => item.ip === ip)) {
            history.unshift({ ip, country: countryName });
            if (history.length > 5) {
                history.pop(); // Keep history to a max of 5 items
            }
            updateHistory();
        }
    };

    // --- Clipboard Monitoring ---
    let lastCheckTime = 0;
    const checkInterval = 2000; // 2 seconds

    const clipboardLoop = async (timestamp) => {
        if (!isMonitoring) return;

        if (timestamp - lastCheckTime > checkInterval) {
            lastCheckTime = timestamp;

            if (document.hasFocus()) {
                try {
                    const text = await navigator.clipboard.readText();
                    const potentialIp = text.trim();
                    
                    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(potentialIp) && potentialIp !== lastCheckedIp) {
                        lastCheckedIp = potentialIp;
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
        showWidget();
        showToast('تم تفعيل مراقبة الحافظة.');
        window.requestAnimationFrame(clipboardLoop);
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
        lastCheckedIp = ipInput.value.trim();
    });

    // --- Draggable Widget Logic ---
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - widget.offsetLeft;
        offsetY = e.clientY - widget.offsetTop;
        widget.classList.add('dragging');
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        widget.style.left = `${e.clientX - offsetX}px`;
        widget.style.top = `${e.clientY - offsetY}px`;
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        widget.classList.remove('dragging');
    });

    // --- Auto-hide on outside click ---
    document.addEventListener('click', (e) => {
        if (!isPinned && widget.classList.contains('show') && !widget.contains(e.target) && !toggleBtn.contains(e.target)) {
            hideWidget();
        }
    });

    // Initial setup
    updateHistory();
}