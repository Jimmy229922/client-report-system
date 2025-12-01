import { showToast, showCenterAlert } from './ui.js';
import { checkSpecialIdentifier } from './special-identifiers.js';

export function initIpWidget() {
    const visibilityToggleBtn = document.getElementById('quick-ip-check-btn');
    const widget = document.getElementById('ip-widget');
    const header = document.querySelector('.widget-header');
    const closeBtn = document.getElementById('widget-close-btn');
    const pinBtn = document.getElementById('pin-widget-btn');
    const ipInput = document.getElementById('widget-ip-input');
    const resultDiv = document.getElementById('widget-ip-result');
    const historyContainer = document.getElementById('widget-history-container');
    const historyList = document.getElementById('widget-history-list');
    const clearHistoryBtn = document.getElementById('widget-clear-history-btn');
    const resizer = document.querySelector('.widget-resizer');

    if (!visibilityToggleBtn || !widget || !header || !closeBtn || !pinBtn || !ipInput || !resultDiv || !historyContainer || !historyList || !clearHistoryBtn || !resizer) {
        return;
    }

    let isPinned = false;
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
            historyList.innerHTML = history.map(item => {
                let countryInfo = item.country;
                if (item.city) {
                    countryInfo += ` | ${item.city}`;
                }
                return `
                    <li data-ip="${item.ip}" title="إعادة البحث عن ${item.ip}">
                        <span class="history-ip">${item.ip}</span>
                        <span class="history-country">${countryInfo}</span>
                    </li>
                `;
            }).join('');
        } else {
            historyContainer.classList.add('hidden');
        }
    };

    const performLookup = async (ip) => {
        if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
            resultDiv.innerHTML = '';
            return;
        }

        // Show loading state
        resultDiv.innerHTML = '<div class="spinner" style="width: 25px; height: 25px; border-width: 3px;"></div>';
        let countryName = 'غير معروف';
        let cityName = null;

        // Special check for the specified IP
        checkSpecialIdentifier(ip, 'ip');

        try {
            const response = await fetch(`https://ipwhois.app/json/${ip}`);
            const data = await response.json();
            if (data.success) {
                const userStr = localStorage.getItem('user');
                const isAdmin = userStr ? JSON.parse(userStr).role === 'admin' : false;
                countryName = data.country;
                let infoHtml = `<span class="country-name">${countryName}</span>`;

                if (isAdmin && data.city) {
                    cityName = data.city;
                    infoHtml += ` <span class="info-separator">|</span> <span class="city-name">${data.city}</span>`;
                }

                resultDiv.innerHTML = `
                    <div class="widget-location-display">
                        <img src="${data.country_flag}" alt="${data.country_code}" class="country-flag">
                        <div class="location-info">${infoHtml}</div>
                        <span class="widget-ip-display">${ip}</span>
                    </div>
                `;

                // Show center red alert if IP is from Erbil, Sulaymaniyah, or Kirkuk
                const regionAliases = [
                    { name: 'Erbil', aliases: ['Erbil','Arbil','Irbil','أربيل','اربيل'] },
                    { name: 'Sulaymaniyah', aliases: ['Sulaymaniyah','Sulaimaniyah','Slemani','السليمانية','سليمانية'] },
                    { name: 'Kirkuk', aliases: ['Kirkuk','كركوك'] },
                ];
                const fullRegionText = `${data.region || ''} ${data.city || ''}`.toLowerCase();
                const isIraq = (data.country_code || '').toUpperCase() === 'IQ';
                let matchedRegion = null;
                if (isIraq) {
                    for (const entry of regionAliases) {
                        if (entry.aliases.some(a => fullRegionText.includes(a.toLowerCase()))) {
                            matchedRegion = entry.name;
                            break;
                        }
                    }
                }
                if (matchedRegion) {
                    showCenterAlert(`تحذير: ال-IP ${ip} من ${matchedRegion}`);
                }
            } else {
                throw new Error(data.message || 'Invalid IP address');
            }
        } catch (error) {
            // Silently fail, the UI will show 'فشل البحث'
            resultDiv.innerHTML = 'فشل البحث';
        }

        // Add to history if it's a new IP
        if (!history.some(item => item.ip === ip)) {
            history.unshift({ ip, country: countryName, city: cityName });
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
        if (timestamp - lastCheckTime > checkInterval) {
            lastCheckTime = timestamp;

            if (document.hasFocus()) {
                try {
                    const clipboardText = await navigator.clipboard.readText();
                    const trimmedText = clipboardText.trim();
                    
                    // Regex to find an IP address pattern within a string (e.g., in a URL)
                    const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;
                    const match = trimmedText.match(ipRegex);

                    // If an IP is found in the text and it's different from the last one we checked
                    if (match && match[0] && match[0] !== lastCheckedIp) {
                        const extractedIp = match[0];
                        lastCheckedIp = extractedIp;
                        showWidget();
                        performLookup(extractedIp);
                    }
                } catch (err) {
                    // Silently ignore clipboard read errors, which can happen if permissions are not granted.
                }
            }
        }
        
        window.requestAnimationFrame(clipboardLoop);
    };

    // The button now only controls visibility
    visibilityToggleBtn.addEventListener('click', () => {
        widget.classList.toggle('show');
    });

    // --- Clickable History Logic ---
    historyList.addEventListener('click', (e) => {
        const listItem = e.target.closest('li');
        if (!listItem) return;

        const ip = listItem.dataset.ip;
        ipInput.value = ip;
        performLookup(ip);
    });

    // --- Clear History ---
    clearHistoryBtn.addEventListener('click', () => {
        history = [];
        updateHistory();
        showToast('تم مسح السجل.');
    });

    // --- Event Listeners ---
    closeBtn.addEventListener('click', hideWidget);

    pinBtn.addEventListener('click', () => {
        isPinned = !isPinned;
        pinBtn.classList.toggle('pinned', isPinned);
        pinBtn.title = isPinned ? 'إلغاء تثبيت الأداة' : 'تثبيت الأداة';
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
        if (!isPinned && widget.classList.contains('show') && !widget.contains(e.target) && !visibilityToggleBtn.contains(e.target)) {
            hideWidget();
        }
    });

    // --- Resizable Widget Logic ---
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        let startX = e.clientX;
        let startY = e.clientY;
        let startWidth = parseInt(document.defaultView.getComputedStyle(widget).width, 10);
        let startHeight = parseInt(document.defaultView.getComputedStyle(widget).height, 10);

        function doDrag(e) {
            widget.style.width = (startWidth - (e.clientX - startX)) + 'px'; // Inverted for RTL
            widget.style.height = (startHeight + (e.clientY - startY)) + 'px';
        }

        function stopDrag() {
            document.documentElement.removeEventListener('mousemove', doDrag, false);
            document.documentElement.removeEventListener('mouseup', stopDrag, false);
        }

        document.documentElement.addEventListener('mousemove', doDrag, false);
        document.documentElement.addEventListener('mouseup', stopDrag, false);
    });

    // Initial setup
    updateHistory();
    window.requestAnimationFrame(clipboardLoop); // Start monitoring immediately
}
