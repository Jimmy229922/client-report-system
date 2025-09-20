import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';
import { setFormDirty } from './router.js';

let uploadedFiles = [];

export function createDepositReportPageHTML(reportType) {
    return `
        <h1 class="page-title">إنشاء تقرير: ${reportType}</h1>
        <div class="form-container">
            <form id="report-form">
                <!-- Form groups will be injected by init -->
            </form>
        </div>
    `;
}

export function createGeneralReportPageHTML(reportType) {
    return `
        <h1 class="page-title">إنشاء تقرير: ${reportType}</h1>
        <div class="form-container">
            <form id="report-form">
                <!-- Form groups will be injected by init -->
            </form>
        </div>
    `;
}

function getFormFields(reportType) {
    const commonFields = `
        <div class="form-group ip-group">
            <label for="ip-input">IP Address</label>
            <input type="text" id="ip-input" name="ip" placeholder="الصق الـ IP هنا لجلب الدولة" autocomplete="off">
            <i id="country-icon" class="fas fa-globe"></i>
            <button type="button" id="clear-ip-btn" class="clear-btn hidden" title="مسح">&times;</button>
        </div>
        <div class="form-group">
            <label for="country">الدولة</label>
            <input type="text" id="country" name="country" readonly placeholder="سيتم تحديدها تلقائياً...">
        </div>
        <div class="form-group">
            <label for="email">البريد الإلكتروني</label>
            <input type="email" id="email" name="email" required>
        </div>
        <div class="form-group">
            <label for="account-number">رقم الحساب</label>
            <input type="text" id="account-number" name="account-number" required>
        </div>
    `;

    const imageUploadField = `
        <div class="form-group">
            <label>رفع صور (3 كحد أقصى)</label>
            <div id="upload-area">
                <p>الصق الصور هنا باستخدام (Win + V) أو اسحبها وأفلتها</p>
            </div>
            <div id="image-previews"></div>
        </div>
    `;

    const formActions = `
        <div class="form-actions">
            <button type="submit" class="submit-btn">إرسال التقرير</button>
            <button type="button" id="copy-report-btn" class="copy-btn">نسخ بيانات التقرير</button>
        </div>
    `;

    if (reportType === 'PAYOUTS') {
        return `
            <div class="form-group">
                <label for="wallet-address">عنوان المحفظة</label>
                <input type="text" id="wallet-address" name="wallet-address" required>
            </div>
            <div class="form-group">
                <label for="emails">الإيميلات (كل إيميل في سطر)</label>
                <textarea id="emails" name="emails" rows="4" placeholder="example1@mail.com\nexample2@mail.com" required></textarea>
                <small class="form-hint">اضغط Enter للإرسال، أو Shift+Enter لسطر جديد.</small>
            </div>
            ${imageUploadField}
            ${formActions}
        `;
    }

    if (reportType === 'Deposit Report') {
        return `
            ${commonFields}
            <div class="form-group">
                <label for="margin-percentage">نسبة الهامش</label>
                <input type="text" id="margin-percentage" name="margin-percentage" placeholder="مثال: 78.21" required>
            </div>
            <div class="form-group">
                <label for="floating-profits">الأرباح للصفقات العائمة</label>
                <input type="text" id="floating-profits" name="floating-profits" placeholder="مثال: 24.40 أو -15.00" required>
            </div>
            <div class="form-group">
                <label for="ip-match-status">حالة الـ IP الأخير</label>
                <div class="segmented-control">
                    <input type="radio" id="ip-match-yes" name="ip-match-status" value="مطابق" checked>
                    <label for="ip-match-yes">مطابق</label>
                    <input type="radio" id="ip-match-no" name="ip-match-status" value="غير مطابق">
                    <label for="ip-match-no">غير مطابق</label>
                </div>
            </div>
            <div class="form-group">
                <label for="bonus-status">حالة البونص</label>
                <div class="segmented-control">
                    <input type="radio" id="bonus-not-banned" name="bonus-status" value="غير محظور من البونص" checked>
                    <label for="bonus-not-banned">غير محظور</label>
                    <input type="radio" id="bonus-banned" name="bonus-status" value="محظور من البونص">
                    <label for="bonus-banned">محظور</label>
                </div>
            </div>
            ${imageUploadField}
            ${formActions}
        `;
    } else { // General and Account Transfer reports
        const transferSourceField = `
            <div class="form-group">
                <label for="transfer-source-select">مصدر التحويل</label>
                <select id="transfer-source-select" name="transfer-source-select" required>
                    <option value="" disabled selected>اختر مصدراً...</option>
                    <option value="2 ACTIONS">2 ACTIONS</option>
                    <option value="PROFIT SUMMARY">PROFIT SUMMARY</option>
                    <option value="suspicious traders">suspicious traders</option>
                    <option value="NEW POSITIONS">NEW POSITIONS</option>
                    <option value="other">أخرى:</option>
                </select>
            </div>
            <div class="form-group" id="transfer-source-other-container" style="display: none;">
                <input type="text" id="transfer-source-other" name="transfer-source-other" placeholder="يرجى تحديد المصدر المخصص">
            </div>
        `;
        return `
            ${commonFields}
            ${transferSourceField}
            <div class="form-group">
                <label for="notes">الملاحظات</label>
                <textarea id="notes" name="notes" rows="4" placeholder="اكتب ملاحظاتك هنا..."></textarea>
                <small class="form-hint">اضغط Enter للإرسال، أو Shift+Enter لسطر جديد.</small>
            </div>
            ${imageUploadField}
            ${formActions}
        `;
    }
}

function getCommonReportData(form) {
    return {
        ip: form.querySelector('#ip-input')?.value || 'غير محدد',
        country: form.querySelector('#country')?.value || 'غير محدد',
        email: form.querySelector('#email')?.value || 'غير محدد',
        accountNumber: form.querySelector('#account-number')?.value || 'غير محدد',
        notes: form.querySelector('#notes')?.value || 'لا يوجد',
    };
}

function getReportText(reportType, form) {
    const common = getCommonReportData(form);
    const mentions = '\n@Mudarballoul\n@batoulhassan';

    const reportTypeMap = {
        'Suspicious Report': { title: 'suspicious', hash: '#suspicious' },
        'Deposit Report': { title: 'Deposit Report', hash: '#deposit_percentages' },
        'New Position Report': { title: 'new-positions', hash: '#new-positions' },
        'Credit Out Report': { title: 'credit-out', hash: '#credit-out' },
        'تحويل الحسابات': { title: 'تحويل الحسابات', hash: '#account_transfer' },
        'PAYOUTS': { title: 'PAYOUTS', hash: '#payouts' },
    };

    const { title, hash } = reportTypeMap[reportType] || { title: reportType, hash: '' };
    let body = '';
    const footer = `\n\n${hash}${mentions}`;

    if (reportType === 'PAYOUTS') {
        const walletAddress = form.querySelector('#wallet-address').value;
        const emails = form.querySelector('#emails').value;
        body = `عنوان المحفظة: ${walletAddress || 'غير محدد'}\n\n`
             + `الإيميلات:\n${emails || 'لا يوجد'}\n\n`
             + `اكثر من عميل يسحب علي نفس عنوان المحفظة`;

    } else if (reportType === 'Deposit Report') {
        let marginPercentage = form.querySelector('#margin-percentage').value;
        let floatingProfits = form.querySelector('#floating-profits').value;
        const profitStatus = floatingProfits.includes('-') ? 'سالب' : 'موجب';
        const ipMatchStatus = form.querySelector('input[name="ip-match-status"]:checked').value;
        const bonusStatus = form.querySelector('input[name="bonus-status"]:checked').value;

        if (marginPercentage && !marginPercentage.endsWith('%')) marginPercentage += '%';
        if (floatingProfits && !floatingProfits.startsWith('$') && !floatingProfits.startsWith('-$')) {
            floatingProfits = floatingProfits.startsWith('-') ? `-$${floatingProfits.substring(1)}` : `$${floatingProfits}`;
        }
        
        body = `الدولة: ${common.country}\n`
             + `الـ IP: ${common.ip}\n`
             + `الإيميل: ${common.email}\n`
             + `رقم الحساب: ${common.accountNumber}\n`
             + `نسبة الهامش: ${marginPercentage || 'N/A'}\n`
             + `الأرباح للصفقات العائمة: ${floatingProfits || 'NA'}\n\n`
             + `الأرباح للصفقات العائمة (${profitStatus})\n`
             + `الـ IP الأخير (${ipMatchStatus}) لبلد التسجيل، العميل ${bonusStatus}`;
    
    } else { // General and Account Transfer
        const transferSourceSelect = form.querySelector('#transfer-source-select');
        let transferSource = transferSourceSelect.value;
        if (transferSource === 'other') {
            transferSource = form.querySelector('#transfer-source-other').value;
        } else if (!transferSource) {
            transferSource = 'لم يتم الاختيار';
        }

        body = `الـ IP: ${common.ip}\n`
             + `الدولة: ${common.country}\n`
             + `الإيميل: ${common.email}\n`
             + `رقم الحساب: ${common.accountNumber}\n`
             + `مصدر التحويل: ${transferSource}\n`
             + `الملاحظات: ${common.notes}`;
    }

    return `تقرير ${title}\n\n${body}${footer}`;
}

export function initCreateReportPage() {
    const form = document.getElementById('report-form');
    const pageTitle = document.querySelector('.page-title').innerText.replace('إنشاء تقرير: ', '');
    form.innerHTML = getFormFields(pageTitle);

    const uploadArea = form.querySelector('#upload-area');
    const imagePreviews = form.querySelector('#image-previews');
    const copyBtn = form.querySelector('#copy-report-btn');
    uploadedFiles = [];

    const ipInput = form.querySelector('#ip-input');
    const clearIpBtn = form.querySelector('#clear-ip-btn');

    if (ipInput && clearIpBtn) {
        ipInput.addEventListener('input', () => {
            clearIpBtn.classList.toggle('hidden', ipInput.value.length === 0);
        });
        clearIpBtn.addEventListener('click', () => {
            ipInput.value = '';
            // Manually clear country fields since the debounced lookup won't fire immediately
            const countryInput = form.querySelector('#country');
            const countryIcon = form.querySelector('#country-icon');
            if (countryInput) countryInput.value = '';
            if (countryIcon) {
                countryIcon.className = 'fas fa-globe';
                countryIcon.innerHTML = '';
            }
            clearIpBtn.classList.add('hidden');
            ipInput.focus();
        });
    }

    form.addEventListener('input', () => setFormDirty(true));

    if (form.querySelector('#transfer-source-select')) {
        form.querySelector('#transfer-source-select').addEventListener('change', (e) => {
            const isOther = e.target.value === 'other';
            form.querySelector('#transfer-source-other-container').style.display = isOther ? 'block' : 'none';
            form.querySelector('#transfer-source-other').required = isOther;
        });
    }

    // Add keydown listener to textareas for Enter submission
    form.querySelectorAll('textarea').forEach(textarea => {
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Prevent new line
                form.querySelector('.submit-btn').click(); // Trigger form submission
            }
        });
    });

    // Add keydown listener to the form for Enter submission on non-textarea inputs
    form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            form.querySelector('.submit-btn').click();
        }
    });

    const handleFiles = (files) => {
        for (const file of files) {
            if (file.type.startsWith('image/') && uploadedFiles.length < 3) {
                if (!uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
                    uploadedFiles.push(file);
                    createImagePreview(file);
                } else {
                    showToast('تم رفع هذه الصورة بالفعل.', true);
                }
            }
        }
    };

    document.onpaste = (e) => window.location.hash.startsWith('#reports/') && handleFiles(e.clipboardData.files);
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    const createImagePreview = (file) => {
        const src = URL.createObjectURL(file);
        const container = document.createElement('div');
        container.className = 'img-preview-container';
        container.dataset.blobUrl = src;
        container.innerHTML = `
            <img src="${src}" class="img-preview">
            <button type="button" class="remove-img-btn">&times;</button>
        `;
        container.querySelector('.remove-img-btn').onclick = () => {
            URL.revokeObjectURL(src);
            container.remove();
            uploadedFiles = uploadedFiles.filter(f => f !== file);
        };
        imagePreviews.appendChild(container);
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('.submit-btn');
        submitBtn.innerText = 'جاري الإرسال...';
        submitBtn.disabled = true;

        const formData = new FormData();
        formData.append('reportText', getReportText(pageTitle, form));
        uploadedFiles.forEach(file => formData.append('images', file));

        try {
            await fetchWithAuth('/api/send-report', { method: 'POST', body: formData });

            showToast('تم إرسال التقرير بنجاح!');
            setFormDirty(false);
            document.querySelectorAll('.img-preview-container').forEach(c => URL.revokeObjectURL(c.dataset.blobUrl));
            form.reset();
            imagePreviews.innerHTML = '';
            uploadedFiles = [];

            // Dispatch a custom event to notify other parts of the app (like the dashboard)
            document.dispatchEvent(new CustomEvent('reportSent'));

            const countryIcon = form.querySelector('#country-icon');
            if (countryIcon) {
                countryIcon.innerHTML = '';
            }
        } catch (error) {
            showToast(error.message, true);
        } finally {
            submitBtn.innerText = 'إرسال التقرير';
            submitBtn.disabled = false;
        }
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(getReportText(pageTitle, form)).then(() => {
            const originalText = copyBtn.innerText;
            copyBtn.innerText = 'تم النسخ!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyBtn.innerText = originalText;
                copyBtn.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            showToast('فشل نسخ النص.', true);
            console.error('Copy failed:', err);
        });
    });
}

// --- Self-attaching IP Lookup for Report Forms ---

// Helper function to delay execution
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

async function handleIpLookup(ipInput) {
    const form = ipInput.closest('form');
    if (!form) return;

    const ip = ipInput.value.trim();
    const countryInput = form.querySelector('#country');
    const countryIcon = form.querySelector('#country-icon');

    if (!countryInput || !countryIcon) return;

    // Reset fields if IP is invalid
    if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
        countryInput.value = "";
        countryIcon.className = 'fas fa-globe';
        countryIcon.innerHTML = '';
        return;
    }

    countryInput.value = "جاري البحث...";
    countryIcon.className = 'fas fa-spinner fa-spin';
    countryIcon.innerHTML = '';

    // Use the new, faster ipwhois.io API
    try {
        const response = await fetch(`https://ipwhois.app/json/${ip}`);
        const data = await response.json();
        if (data.success) {
            countryInput.value = data.country;
            countryIcon.className = 'fas fa-globe';
            countryIcon.innerHTML = `<img src="${data.country_flag}" alt="${data.country_code}" style="width: 20px; height: auto;">`;
        } else {
            throw new Error(data.message || 'Invalid IP address');
        }
    } catch (error) {
        console.error('IP lookup failed:', error.message);
        countryInput.value = 'فشل البحث';
        countryIcon.className = 'fas fa-exclamation-triangle';
        countryIcon.innerHTML = '';
    }
}

// Use a MutationObserver to detect when a report form is added to the DOM.
document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        const observer = new MutationObserver(() => {
            const ipInput = document.getElementById('ip-input');
            if (ipInput && !ipInput.dataset.listenerAttached) {
                ipInput.addEventListener('input', debounce(() => handleIpLookup(ipInput), 300));
                ipInput.addEventListener('blur', () => handleIpLookup(ipInput));
                ipInput.dataset.listenerAttached = 'true';
            }
        });
        observer.observe(mainContent, { childList: true, subtree: true });
    }
});