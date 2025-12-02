import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';
import { checkSpecialIdentifier } from './special-identifiers.js';
import { refreshHomePageData } from './page-home.js';
import { setFormDirty } from './router.js';
import imageCompression from 'https://esm.sh/browser-image-compression@2.0.2';

let uploadedFiles = [];
let isIpLookupInProgress = false;

export function renderDepositReportPage() {
    return `
    <div class="report-form-page-container">
        <div class="page-header">
            <h1 class="page-title">إنشاء تقرير جديد</h1>
            <p class="page-subtitle">نوع التقرير: <strong>Deposit Report</strong></p>
        </div>
        <div class="form-container">
            <form id="report-form">
                <div class="form-group ip-group">
                    <label for="ip-input">IP Address <span style="color: var(--danger-color);">*</span></label>
                    <input type="text" id="ip-input" name="ip" placeholder="الصق الـ IP هنا لجلب ip country" autocomplete="off" required>
                    <i id="country-icon" class="fas fa-globe"></i>
                    <button type="button" id="clear-ip-btn" class="clear-btn hidden" title="مسح">&times;</button>
                </div>
                <div class="form-group">
                    <label for="country">ip country <span style="color: var(--danger-color);">*</span></label>
                    <input type="text" id="country" name="country" readonly placeholder="سيتم تحديدها تلقائياً...">
                    <input type="hidden" id="city" name="city">
                </div>
                <div class="form-group">
                    <label for="account-number">رقم الحساب <span style="color: var(--danger-color);">*</span></label>
                    <input type="text" id="account-number" name="account-number" required>
                </div>

                <div class="form-group">
                    <label for="report-email">البريد الإلكتروني <span style="color: var(--danger-color);">*</span></label>
                    <input type="email" id="report-email" name="email" required>
                </div>
                <div class="form-group">
                    <label for="margin-percentage">نسبة الهامش <span style="color: var(--danger-color);">*</span></label>
                    <input type="text" id="margin-percentage" name="margin-percentage" placeholder="مثال: 78.21" required pattern="[0-9]+(\.[0-9]{1,2})?%?" data-pattern-error="الرجاء إدخال نسبة الهامش كرقم صحيح أو عشري (مثال: 78.21).">
                </div>
                <div class="form-group">
                    <label for="floating-profit-status">حالة الأرباح العائمة <span style="color: var(--danger-color);">*</span></label>
                    <div class="segmented-control">
                        <input type="radio" id="profit-positive" name="floating-profit-status" value="موجب" checked>
                        <label for="profit-positive">موجب</label>
                        <input type="radio" id="profit-negative" name="floating-profit-status" value="سالب">
                        <label for="profit-negative">سالب</label>
                    </div>
                </div>
                <div class="form-group">
                    <label for="ip-match-status">حالة الـ IP الأخير <span style="color: var(--danger-color);">*</span></label>
                    <div class="segmented-control">
                        <input type="radio" id="ip-match-yes" name="ip-match-status" value="مطابق" checked>
                        <label for="ip-match-yes">مطابق</label>
                        <input type="radio" id="ip-match-no" name="ip-match-status" value="غير مطابق">
                        <label for="ip-match-no">غير مطابق</label>
                    </div>
                </div>
                <div class="form-group">
                    <label for="bonus-status">حالة البونص <span style="color: var(--danger-color);">*</span></label>
                    <div class="segmented-control">
                        <input type="radio" id="bonus-not-banned" name="bonus-status" value="غير محظور من البونص" checked>
                        <label for="bonus-not-banned">غير محظور</label>
                        <input type="radio" id="bonus-banned" name="bonus-status" value="محظور من البونص">
                        <label for="bonus-banned">محظور</label>
                    </div>
                </div>
                <div class="form-group">
                    <div class="notes-field-wrapper">
                        <label for="additional-notes">ملاحظات إضافية (اختياري)</label>
                        <textarea id="additional-notes" name="additional-notes" rows="3" placeholder="اكتب ملاحظاتك الإضافية هنا..."></textarea>
                    </div>
                </div>

                <div class="form-group">
                    <label>رفع صور (3 كحد أقصى)</label>
                    <div id="upload-area">
                        <p>الصق الصور هنا باستخدام (Win + V) أو اسحبها وأفلتها</p>
                    </div>
                    <div id="image-previews"></div>
                </div>

                <div class="form-actions">
                    <button type="submit" class="submit-btn">إرسال التقرير</button>
                    <button type="button" id="copy-report-btn" class="copy-btn">نسخ بيانات التقرير</button>
                </div>
            </form>
        </div>
    </div>
    `;
}

export function initDepositReportPage() {
    const form = document.getElementById('report-form');
    if (!form) return;

    const ipInput = form.querySelector('#ip-input');
    const countryInput = form.querySelector('#country');
    const cityInput = form.querySelector('#city');
    const countryIcon = form.querySelector('#country-icon');
    const clearIpBtn = form.querySelector('#clear-ip-btn');
    const uploadArea = form.querySelector('#upload-area');
    const imagePreviews = form.querySelector('#image-previews');
    const submitBtn = form.querySelector('.submit-btn');
    const copyBtn = form.querySelector('#copy-report-btn');

    // IP Lookup Logic
    const handleIpLookup = async () => {
        if (isIpLookupInProgress) return;
        const ip = ipInput.value.trim();
        if (!ip) {
            countryInput.value = '';
            if (cityInput) cityInput.value = '';
            countryIcon.className = 'fas fa-globe';
            countryIcon.innerHTML = '';
            return;
        }

        const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;
        const match = ip.match(ipRegex);
        const extractedIp = match ? match[0] : null;

        if (!extractedIp) {
            countryInput.value = 'IP غير صالح';
            countryIcon.className = 'fas fa-exclamation-triangle';
            countryIcon.innerHTML = '';
            return;
        }

        countryInput.value = "جاري البحث...";
        countryIcon.className = 'fas fa-spinner fa-spin';
        countryIcon.innerHTML = '';

        checkSpecialIdentifier(extractedIp, 'ip');

        try {
            isIpLookupInProgress = true;
            const response = await fetch(`https://ipwhois.app/json/${extractedIp}`);
            const data = await response.json();
            if (data.success) {
                countryInput.value = data.country;
                if (cityInput) cityInput.value = '';
                countryIcon.className = 'fas fa-globe';
                countryIcon.innerHTML = `<img src="${data.country_flag}" alt="${data.country_code}" style="width: 20px; height: auto;">`;
                countryInput.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                throw new Error(data.message || 'Invalid IP address');
            }
        } catch (error) {
            countryInput.value = 'فشل البحث';
            countryIcon.className = 'fas fa-exclamation-triangle';
            countryIcon.innerHTML = '';
        } finally {
            isIpLookupInProgress = false;
            updateFormState();
        }
    };

    if (ipInput) {
        ipInput.addEventListener('input', debounce(() => handleIpLookup(), 300));
        ipInput.addEventListener('blur', () => handleIpLookup());
        ipInput.addEventListener('input', () => {
            if (clearIpBtn) clearIpBtn.classList.toggle('hidden', ipInput.value.length === 0);
            updateFormState();
        });
    }

    if (clearIpBtn) {
        clearIpBtn.addEventListener('click', () => {
            ipInput.value = '';
            countryInput.value = '';
            countryIcon.className = 'fas fa-globe';
            countryIcon.innerHTML = '';
            clearIpBtn.classList.add('hidden');
            ipInput.focus();
        });
    }

    // Form Validation
    const updateFormState = () => {
        const isValid = form.checkValidity();
        if (submitBtn) submitBtn.disabled = !isValid;
        if (copyBtn) copyBtn.disabled = !isValid;
    };

    form.addEventListener('input', () => {
        setFormDirty(true);
        updateFormState();
    });

    // Image Upload Logic
    const handleFiles = async (files) => {
        const compressionOptions = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
        for (const file of files) {
            if (file.type.startsWith('image/') && uploadedFiles.length < 3) {
                if (uploadedFiles.some(f => f.originalName === file.name && f.originalSize === file.size)) {
                    showToast('تم رفع هذه الصورة بالفعل.', true);
                    continue;
                }
                const previewContainer = createImagePreview(file, true);
                imagePreviews.appendChild(previewContainer);
                try {
                    const compressedFile = await imageCompression(file, compressionOptions);
                    const fileData = {
                        file: compressedFile,
                        originalName: file.name,
                        originalSize: file.size,
                        previewUrl: URL.createObjectURL(compressedFile)
                    };
                    uploadedFiles.push(fileData);
                    updateImagePreview(previewContainer, fileData);
                } catch (err) {
                    previewContainer.remove();
                    showToast('فشل ضغط الصورة.', true);
                }
            }
        }
    };

    const createImagePreview = (file, isLoading = false) => {
        const container = document.createElement('div');
        container.className = 'img-preview-container';
        if (isLoading) {
            container.classList.add('loading');
            container.innerHTML = `<div class="img-preview-spinner"></div>`;
        }
        return container;
    };

    const updateImagePreview = (container, fileData) => {
        container.classList.remove('loading');
        container.innerHTML = `
            <img src="${fileData.previewUrl}" class="img-preview">
            <button type="button" class="remove-img-btn">&times;</button>
        `;
        container.querySelector('.remove-img-btn').onclick = () => {
            URL.revokeObjectURL(fileData.previewUrl);
            container.remove();
            uploadedFiles = uploadedFiles.filter(f => f.previewUrl !== fileData.previewUrl);
        };
    };

    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
        });
        document.onpaste = (e) => {
            if (window.location.hash === '#reports/deposit') {
                handleFiles(e.clipboardData.files);
            }
        };
    }

    // Submit Logic
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        submitBtn.innerText = 'جاري الإرسال...';
        submitBtn.disabled = true;

        let marginPercentage = form.querySelector('#margin-percentage').value;
        if (marginPercentage && !marginPercentage.endsWith('%')) marginPercentage += '%';

        const floatingProfitStatus = form.querySelector('input[name="floating-profit-status"]:checked').value;
        const ipMatchStatus = form.querySelector('input[name="ip-match-status"]:checked').value;
        const bonusStatus = form.querySelector('input[name="bonus-status"]:checked').value;
        const additionalNotes = form.querySelector('#additional-notes')?.value.trim();
        const country = countryInput.value.split(' | ')[0];

        let body = `ip country: <code>${country}</code>\n` +
             `IP: <code>${ipInput.value}</code>\n` +
             `الإيميل: <code>${form.querySelector('#report-email').value}</code>\n` +
             `رقم الحساب: <code>${form.querySelector('#account-number').value}</code>\n` +
             `نسبة الهامش: <code>${marginPercentage || 'N/A'}</code>\n\n` +
             `الأرباح للصفقات العائمة (${floatingProfitStatus})\n` +
             `الـ IP الأخير (${ipMatchStatus}) لبلد التسجيل، العميل ${bonusStatus}`;

        if (additionalNotes) {
            body += `\nملاحظات إضافية: <code>${additionalNotes}</code>`;
        }

        const payload = {
            reportText: `تقرير Deposit Report\n\n${body}\n\n#deposit_percentages`,
            reportType: 'deposit_percentages'
        };

        const formData = new FormData();
        formData.append('report_text', payload.reportText);
        formData.append('type', payload.reportType);
        uploadedFiles.forEach(f => formData.append('images', f.file, f.originalName));

        try {
            const result = await fetchWithAuth('/api/reports', { method: 'POST', body: formData });
            showToast(result.message);
            setFormDirty(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            form.reset();
            imagePreviews.innerHTML = '';
            uploadedFiles = [];
            refreshHomePageData();
        } catch (error) {
            showToast(error.message, true);
        } finally {
            submitBtn.innerText = 'إرسال التقرير';
            submitBtn.disabled = false;
        }
    });

    // Copy Logic
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
             if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
            
            let marginPercentage = form.querySelector('#margin-percentage').value;
            if (marginPercentage && !marginPercentage.endsWith('%')) marginPercentage += '%';

            const floatingProfitStatus = form.querySelector('input[name="floating-profit-status"]:checked').value;
            const ipMatchStatus = form.querySelector('input[name="ip-match-status"]:checked').value;
            const bonusStatus = form.querySelector('input[name="bonus-status"]:checked').value;
            const additionalNotes = form.querySelector('#additional-notes')?.value.trim();
            const country = countryInput.value.split(' | ')[0];

            let body = `ip country: ${country}\n` +
                `IP: ${ipInput.value}\n` +
                `الإيميل: ${form.querySelector('#report-email').value}\n` +
                `رقم الحساب: ${form.querySelector('#account-number').value}\n` +
                `نسبة الهامش: ${marginPercentage || 'N/A'}\n\n` +
                `الأرباح للصفقات العائمة (${floatingProfitStatus})\n` +
                `الـ IP الأخير (${ipMatchStatus}) لبلد التسجيل، العميل ${bonusStatus}`;

            if (additionalNotes) {
                body += `\nملاحظات إضافية: ${additionalNotes}`;
            }

            const copyText = `تقرير Deposit Report\n\n${body}\n\n#deposit_percentages`;
            
            await navigator.clipboard.writeText(copyText);
            showToast('تم النسخ!');
        });
    }
    
    updateFormState();
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}
