import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';
import { checkSpecialIdentifier } from './special-identifiers.js';
import { refreshHomePageData } from './page-home.js';
import { setFormDirty } from './router.js';
import imageCompression from 'https://esm.sh/browser-image-compression@2.0.2';

let uploadedFiles = [];
let isIpLookupInProgress = false;

export function renderAccountTransferPage() {
    return `
    <div class="report-form-page-container">
        <div class="page-header">
            <h1 class="page-title">إنشاء تقرير جديد</h1>
            <p class="page-subtitle">نوع التقرير: <strong>تحويل الحسابات</strong></p>
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
                    <label for="transfer-source-select">مصدر التحويل <span style="color: var(--danger-color);">*</span></label>
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

                <div class="form-group">    
                    <div class="notes-field-wrapper">
                        <label for="notes">الملاحظات <span style="color: var(--danger-color);">*</span></label>
                        <textarea id="notes" name="notes" rows="4" placeholder="اكتب ملاحظاتك هنا..." required></textarea>
                        <small class="form-hint">اضغط Enter للإرسال، أو Shift+Enter لسطر جديد.</small>
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

export function initAccountTransferPage() {
    const form = document.getElementById('report-form');
    if (!form) return;

    const ipInput = form.querySelector('#ip-input');
    const countryInput = form.querySelector('#country');
    const cityInput = form.querySelector('#city');
    const countryIcon = form.querySelector('#country-icon');
    const clearIpBtn = form.querySelector('#clear-ip-btn');
    const transferSourceSelect = form.querySelector('#transfer-source-select');
    const otherContainer = form.querySelector('#transfer-source-other-container');
    const otherInput = form.querySelector('#transfer-source-other');
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

    // Transfer Source Logic
    if (transferSourceSelect) {
        transferSourceSelect.addEventListener('change', (e) => {
            const isOther = e.target.value === 'other';
            otherContainer.style.display = isOther ? 'block' : 'none';
            otherInput.required = isOther;
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
            if (window.location.hash === '#reports/account-transfer') {
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

        const payload = {
            reportText: `تقرير تحويل الحسابات\n\n` +
                `IP Address: ${ipInput.value}\n` +
                `Country: ${countryInput.value}\n` +
                `Account Number: ${form.querySelector('#account-number').value}\n` +
                `Email: ${form.querySelector('#report-email').value}\n` +
                `Source: ${transferSourceSelect.value === 'other' ? otherInput.value : transferSourceSelect.value}\n` +
                `Notes: ${form.querySelector('#notes').value}\n\n` +
                `#account_transfer\n@ahmedelgma\n@batoulhassan`,
            reportType: 'account_transfer'
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
            const copyText = `تقرير تحويل الحسابات\n\n` +
                `IP Address: ${ipInput.value}\n` +
                `Country: ${countryInput.value}\n` +
                `Account Number: ${form.querySelector('#account-number').value}\n` +
                `Email: ${form.querySelector('#report-email').value}\n` +
                `Source: ${transferSourceSelect.value === 'other' ? otherInput.value : transferSourceSelect.value}\n` +
                `Notes: ${form.querySelector('#notes').value}\n\n` +
                `#account_transfer\n@ahmedelgma\n@batoulhassan`;
            
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
