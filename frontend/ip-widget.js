document.addEventListener('DOMContentLoaded', () => {
    // --- منطق القائمة العائمة لفحص الـ IP ---

    // 1. حقن HTML و CSS الخاصين بالأداة في الصفحة
    const widgetHTML = `
        <div id="ip-widget" class="ip-widget">
            <div class="widget-header">
                <h3><i class="fas fa-magnifying-glass-location"></i> فاحص الـ IP</h3>
                <div class="widget-actions">
                    <button id="close-widget-btn" class="icon-btn" aria-label="إغلاق"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div class="widget-body">
                <div id="widget-ip-result" class="widget-result">
                    <p class="widget-placeholder">انقر على زر فحص الـ IP في الشريط العلوي لتفعيل الفحص التلقائي.</p>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', widgetHTML);

    // 2. عناصر الـ DOM
    const ipWidget = document.getElementById('ip-widget');
    const quickIpCheckBtn = document.getElementById('quick-ip-check-btn'); // This button is in index.html
    const closeWidgetBtn = document.getElementById('close-widget-btn');
    const widgetIpResult = document.getElementById('widget-ip-result');

    // 3. متغيرات الحالة
    let lastCheckedIp = '';
    let isWidgetClosedByUser = localStorage.getItem('ipWidgetClosed') === 'true';

    // 4. الوظيفة الرئيسية لفحص الحافظة
    const checkClipboard = async () => {
        try {
            const clipboardText = await navigator.clipboard.readText();
            const ip = clipboardText.trim();

            // لا تفعل شيئاً إذا لم يتغير الـ IP أو لم يكن صالحًا
            if (ip === lastCheckedIp || !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
                return;
            }
            lastCheckedIp = ip;

            // لا تفتح الأداة تلقائياً إذا كان المستخدم قد أغلقها يدوياً
            if (isWidgetClosedByUser) {
                return;
            }
            
            showWidget();
            widgetIpResult.innerHTML = '<div class="spinner" style="width: 25px; height: 25px; border-width: 3px;"></div>';

            const response = await fetch(`https://ipapi.co/${ip}/json/`);
            const data = await response.json();

            if (data.error) {
                widgetIpResult.textContent = data.reason || 'IP غير صالح';
            } else {
                const flagUrl = `https://flagcdn.com/w20/${data.country_code.toLowerCase()}.png`;
                widgetIpResult.innerHTML = `
                    <div style="direction: ltr;">${ip}</div>
                    <div style="margin-top: 8px; display: flex; align-items: center; justify-content: center;">
                        <img src="${flagUrl}" onerror="this.style.display='none'" style="margin-left: 10px;" alt="${data.country_name} flag" /> ${data.country_name}
                    </div>
                `;
            }
        } catch (error) {
            console.error("Clipboard access error:", error);
            if (error.name === 'NotAllowedError') {
                widgetIpResult.innerHTML = '<p class="widget-placeholder">تم رفض الإذن. انقر على زر الفحص مرة أخرى للمحاولة.</p>';
            }
        }
    };

    // 5. دوال مساعدة لإظهار وإخفاء الأداة
    const showWidget = () => {
        if (!ipWidget.classList.contains('show')) {
            ipWidget.style.display = 'block';
            setTimeout(() => ipWidget.classList.add('show'), 10);
        }
    };

    const hideWidget = () => {
        ipWidget.classList.remove('show');
    };

    // 6. ربط الأحداث
    if (quickIpCheckBtn) {
        quickIpCheckBtn.addEventListener('click', () => {
            isWidgetClosedByUser = false;
            localStorage.removeItem('ipWidgetClosed');
            showWidget();
            // هذا النقر هو موافقة المستخدم، ونستدعي الدالة مباشرة لطلب الإذن
            checkClipboard();
        });
    }

    closeWidgetBtn.addEventListener('click', () => {
        hideWidget();
        isWidgetClosedByUser = true;
        localStorage.setItem('ipWidgetClosed', 'true');
    });

    // 7. المستمع التلقائي: يعمل عند العودة إلى الصفحة
    window.addEventListener('focus', () => {
        navigator.permissions.query({ name: 'clipboard-read' }).then(permissionStatus => {
            // لا تقم بالفحص إلا إذا كانت الصلاحية ممنوحة بالفعل
            if (permissionStatus.state === 'granted') {
                checkClipboard();
            }
        });
    });

    // 8. عرض الأداة عند التحميل الأولي إذا لم يغلقها المستخدم سابقًا
    if (!isWidgetClosedByUser) {
        showWidget();
    }
});