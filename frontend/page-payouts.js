import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';
import { refreshHomePageData } from './page-home.js';
import { setFormDirty, navigate } from './router.js';
import { createImageUploader } from './image-uploader.js';

let uploadedFiles = [];
let isDirty = false;
let payoutsUploader = null;
let isApplyingAutoFilter = false;
let lastPayoutParseResult = null;
let copyFeedbackTimeout = null;

const UNKNOWN_COUNTRY_LABEL = 'Unknown';
const BANNED_MARKER = ' ( محظور )';

async function copyTextToClipboard(value) {
    if (!value) return;
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }
    const temp = document.createElement('textarea');
    temp.value = value;
    temp.setAttribute('readonly', '');
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    document.body.removeChild(temp);
}

function buildReportMessage(entries, walletAddress) {
    if (!entries || entries.size === 0) return '';
    const lines = [];
    lines.push(`عنوان المحفظة: ${walletAddress || 'غير محددة'}`);
    lines.push('');
    lines.push('الإيميلات:');
    for (const [email, data] of entries.entries()) {
        let line = `${email}`;
        const countryValue = data.country?.trim();
        const shouldShowCountry = countryValue && countryValue.toLowerCase() !== 'crm' && countryValue !== UNKNOWN_COUNTRY_LABEL;
        if (shouldShowCountry) {
            line += ` - ${countryValue}`;
        }
        if (data.isBanned) {
            line += ' (محظور)';
        }
        lines.push(line);
    }
    if (entries.size > 1) {
        lines.push('');
        lines.push('اكثر من عميل يسحب علي نفس عنوان المحفظة');
    }
    lines.push('');
    lines.push('#payouts');
    return lines.join('\n');
}

function flashCopySuccess(button) {
    if (!button) return;
    if (!button.dataset.originalText) {
        button.dataset.originalText = button.innerHTML;
        button.dataset.originalBackground = button.style.backgroundColor || '';
        button.dataset.originalColor = button.style.color || '';
    }
    button.innerHTML = 'تم النسخ';
    button.style.backgroundColor = '#198754';
    button.style.color = '#fff';

    if (copyFeedbackTimeout) {
        clearTimeout(copyFeedbackTimeout);
    }

    copyFeedbackTimeout = setTimeout(() => {
        button.innerHTML = button.dataset.originalText || button.innerHTML;
        button.style.backgroundColor = button.dataset.originalBackground || '';
        button.style.color = button.dataset.originalColor || '';
        copyFeedbackTimeout = null;
    }, 1600);
}

function determineCountryFromLines(lines, ipRegex) {
    let country = UNKNOWN_COUNTRY_LABEL;
    const ipLineIndex = lines.findIndex(line => ipRegex.test(line));
    if (ipLineIndex > 0) {
        let candidateIndex = ipLineIndex - 1;
        while (candidateIndex >= 0 && !lines[candidateIndex]) candidateIndex--;
        if (candidateIndex >= 0) {
            const candidate = lines[candidateIndex];
            if (candidate && !/[0-9@]/.test(candidate)) {
                country = candidate;
            }
        }
    }
    if (country === UNKNOWN_COUNTRY_LABEL) {
        const fallback = lines.find(line => line && !/[0-9@]/.test(line) && line.length <= 40);
        if (fallback) country = fallback;
    }
    return country;
}

function extractCountryFromLine(line, email) {
    if (!line || !email) return '';
    const normalizedEmailIndex = line.toLowerCase().indexOf(email);
    if (normalizedEmailIndex === -1) return '';
    const remainder = line.slice(normalizedEmailIndex + email.length);
    const dashMatch = remainder.match(/-\s*([^-\n]+)/);
    if (dashMatch && dashMatch[1]) {
        return dashMatch[1].trim();
    }
    return '';
}

function findClosestCountryMarker(markers, index) {
    if (!markers || markers.length === 0) return '';
    let last = '';
    for (const marker of markers) {
        if (marker.lineIndex >= index) break;
        last = marker.value;
    }
    return last;
}

function parsePayoutEmailEntries(rawText, previousEntries) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const banRegex = /B5W|B5 2W|B5 2/i;
    const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;
    const entries = new Map();
    if (!rawText) return entries;

    const lines = rawText.split(/\r?\n/).map(line => line.trim());
    const countryMarkers = [];
    for (let idx = 0; idx < lines.length; idx++) {
        if (lines[idx].toLowerCase() === 'country') {
            let candidateIdx = idx + 1;
            while (candidateIdx < lines.length && !lines[candidateIdx]) candidateIdx++;
            const candidate = lines[candidateIdx];
            if (candidate && candidate.trim().length && candidate.toLowerCase() !== 'crm' && candidate.toLowerCase() !== 'country') {
                countryMarkers.push({ lineIndex: candidateIdx, value: candidate });
            }
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const emailMatch = line.match(emailRegex);
        if (!emailMatch) continue;

        const email = emailMatch[0].toLowerCase();
        const context = lines.slice(Math.max(0, i - 4), Math.min(lines.length, i + 5));
        const prevEntry = previousEntries?.get(email);
        let country = extractCountryFromLine(line, email) || determineCountryFromLines(context, ipRegex);
        if (country === UNKNOWN_COUNTRY_LABEL) {
            const countryHint = findClosestCountryMarker(countryMarkers, i);
            if (countryHint) {
                country = countryHint;
            }
        }
        if (country === UNKNOWN_COUNTRY_LABEL && prevEntry?.country) {
            country = prevEntry.country;
        }
        const isBanned = banRegex.test(context.join(' '));
        const existing = entries.get(email);
        const finalCountry = country !== UNKNOWN_COUNTRY_LABEL ? country : (prevEntry?.country || UNKNOWN_COUNTRY_LABEL);

        if (existing) {
            existing.isBanned = existing.isBanned || isBanned;
            if (country !== UNKNOWN_COUNTRY_LABEL) {
                existing.country = country;
            } else if (!existing.country && prevEntry?.country) {
                existing.country = prevEntry.country;
            }
        } else {
            entries.set(email, { country: finalCountry, isBanned });
        }
    }

    return entries;
}

function formatPayoutEntries(entries) {
    if (!entries || entries.size === 0) return '';
    return [...entries.keys()].join('\n');
}

function getPayoutsProcessingResult(rawText, previousEntries) {
    const entries = parsePayoutEmailEntries(rawText, previousEntries);
    const sanitizedText = formatPayoutEntries(entries);
    return { entries, sanitizedText };
}

function applySanitizedEmails(textarea, sanitizedText) {
    if (!textarea || !sanitizedText) return false;
    const trimmedSanitized = sanitizedText.trim();
    const currentTrimmed = textarea.value.trim();
    if (!trimmedSanitized || currentTrimmed === trimmedSanitized) return false;
    isApplyingAutoFilter = true;
    textarea.value = sanitizedText;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => {
        isApplyingAutoFilter = false;
    }, 0);
    return true;
}

/**
 * تنظيف صفحة PAYOUTS عند المغادرة
 */
export function cleanupPayoutsPage() {
    payoutsUploader?.destroy?.();
    payoutsUploader = null;
}


function setupImageUploader() {
    const uploadArea = document.getElementById('upload-area');
    const previews = document.getElementById('image-previews');
    payoutsUploader?.destroy?.();
    payoutsUploader = createImageUploader({
        uploadArea,
        previewsContainer: previews,
        maxImages: 3,
        allowPaste: true,
        compressionOptions: { maxSizeMB: 0.5, maxWidthOrHeight: 1920, useWebWorker: true },
        onChange: (files) => {
            uploadedFiles = files.map((f) => ({ file: f.file, originalName: f.originalName }));
            const dirty = uploadedFiles.length > 0;
            setFormDirty(dirty || isDirty);
            isDirty = dirty || isDirty;
        },
    });
}


function initializePageListeners() {
    const form = document.getElementById('payouts-form');
    if (!form) return;

    setupImageUploader();

    const emailsTextarea = form.querySelector('#emails');
    const copyBtn = document.getElementById('copy-report-btn');
    const walletInput = form.querySelector('#wallet-address');
    
    // Check wallet usage when typing
    if (walletInput) {
        let walletCheckTimeout;
        walletInput.addEventListener('input', () => {
            clearTimeout(walletCheckTimeout);
            walletCheckTimeout = setTimeout(() => {
                const address = walletInput.value.trim();
                if (address.length > 5) {
                    checkWalletUsage(address);
                } else {
                    const walletInfo = document.getElementById('wallet-usage-info');
                    if (walletInfo) {
                        walletInfo.style.display = 'none';
                    }
                }
            }, 500);
        });
    }
    
    const handlePayoutEmailAutoFilter = () => {
        if (!emailsTextarea || isApplyingAutoFilter) return;
        const result = getPayoutsProcessingResult(emailsTextarea.value, lastPayoutParseResult?.entries);
        lastPayoutParseResult = result;
        applySanitizedEmails(emailsTextarea, result.sanitizedText);
    };

    if (emailsTextarea) {
        emailsTextarea.addEventListener('input', handlePayoutEmailAutoFilter);
        emailsTextarea.addEventListener('paste', () => setTimeout(handlePayoutEmailAutoFilter, 150));
        emailsTextarea.addEventListener('blur', handlePayoutEmailAutoFilter);
        handlePayoutEmailAutoFilter();
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            handlePayoutEmailAutoFilter();
            const entries = lastPayoutParseResult?.entries;
            const walletAddress = walletInput?.value?.trim();
            const message = buildReportMessage(entries, walletAddress);
            if (!message) {
                showToast('لا توجد بيانات لنسخها.', true);
                return;
            }
            try {
                await copyTextToClipboard(message);
                showToast('تم نسخ بيانات التقرير.');
                flashCopySuccess(copyBtn);
            } catch (error) {
                console.error('Copy failed', error);
                showToast('فشل نسخ البيانات. حاول مرة أخرى.', true);
            }
        });
        copyBtn.addEventListener('mousedown', (e) => e.preventDefault());
    }

    const handlePayoutSubmit = async (event) => {
        event.preventDefault();
        handlePayoutEmailAutoFilter();
        const sanitizedText = lastPayoutParseResult?.sanitizedText?.trim();
        const entries = lastPayoutParseResult?.entries;
        if (!sanitizedText) {
            showToast('الرجاء لصق بيانات الإيميلات قبل الإرسال.', true);
            emailsTextarea?.focus();
            return;
        }
        const walletAddress = walletInput?.value?.trim();
        if (!walletAddress) {
            showToast('الرجاء إدخال عنوان المحفظة.', true);
            walletInput?.focus();
            return;
        }

        const submitBtn = form.querySelector('.submit-btn');
        const originalText = submitBtn ? submitBtn.innerText : 'إرسال التقرير';
        if (submitBtn) {
            submitBtn.innerText = 'جارٍ إرسال التقرير...';
            submitBtn.disabled = true;
        }

        try {
            const formData = new FormData();
            const reportText = buildReportMessage(entries, walletAddress) || 'عنوان المحفظة: ' + walletAddress;
            formData.append('report_text', reportText);
                // Backend expects lowercase 'payouts' (matches enum and archive mapping)
                formData.append('type', 'payouts');
            formData.append('emails', sanitizedText);
            uploadedFiles.forEach(({ file, originalName }) => {
                formData.append('images', file, originalName);
            });

            const result = await fetchWithAuth('/api/reports', { method: 'POST', body: formData });
            
            // Record wallet usage after successful report submission
            try {
                await fetchWithAuth('/api/wallet-usage/record', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: walletAddress })
                });
            } catch (walletError) {
                console.warn('Failed to record wallet usage:', walletError);
                // Don't fail the whole operation if wallet recording fails
            }
            
            const isWarning = result.warning === 'TELEGRAM_FAILED';
            const userStr = localStorage.getItem('user');
            const isAdmin = userStr ? JSON.parse(userStr).role === 'admin' : false;
            let toastMessage = result.message || 'تم إرسال التقرير.';
            if (isWarning && isAdmin) {
                toastMessage += ' (حدث خطأ أثناء إرسال التنبيه على تيليجرام)';
            }
            showToast(toastMessage, isWarning);

            setFormDirty(false);
            isDirty = false;
            window.scrollTo({ top: 0, behavior: 'smooth' });
            payoutsUploader?.reset?.();
            if (walletInput) walletInput.value = '';
            const walletInfo = document.getElementById('wallet-usage-info');
            if (walletInfo) {
                walletInfo.style.display = 'none';
                walletInfo.textContent = '';
            }
            if (emailsTextarea) emailsTextarea.value = '';
            lastPayoutParseResult = null;
            handlePayoutEmailAutoFilter();
            refreshHomePageData();
        } catch (error) {
            console.error('Failed to submit payout report:', error);
            showToast(error.message, true);
        } finally {
            if (submitBtn) {
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
            }
        }
    };

    form.addEventListener('input', () => {
        setFormDirty(true);
        isDirty = true;
    });

    form.addEventListener('submit', handlePayoutSubmit);

    // Enter to move to next field (skip textareas)
    form.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const target = e.target;
        if (!target || target.tagName === 'TEXTAREA') return;
        if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        const focusables = Array.from(form.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'));
        const idx = focusables.indexOf(target);
        if (idx > -1) {
            const next = focusables[idx + 1] || focusables[0];
            next && next.focus();
        }
    });
}
function getShiftFromHour(hour) {
    if (hour >= 8 && hour < 16) {
        return 'الصباحي';
    } else if (hour >= 16 && hour < 24) {
        return 'المسائي';
    } else {
        return 'الفجر';
    }
}

/**
 * تحديد الشفت الحالي بناءً على الوقت
 */
function getCurrentShift() {
    const now = new Date();
    const hour = now.getHours();
    return getShiftFromHour(hour);
}

/**
 * التحقق من استخدام عنوان المحفظة
 */
async function checkWalletUsage(walletAddress) {
    if (!walletAddress || walletAddress.trim() === '') return;
    
    try {
        const response = await fetchWithAuth(`/api/wallet-usage/check?address=${encodeURIComponent(walletAddress)}`);
        const data = response.data;
        
        const walletInfo = document.getElementById('wallet-usage-info');
        if (!walletInfo) return;
        
        if (!data || !data.lastUsed) {
            walletInfo.style.display = 'block';
            walletInfo.style.padding = '0.75rem';
            walletInfo.style.backgroundColor = '#d4edda';
            walletInfo.style.border = '1px solid #28a745';
            walletInfo.style.borderRadius = '6px';
            walletInfo.style.color = '#155724';
            walletInfo.innerHTML = `<i class="fas fa-check-circle"></i> <strong>عنوان جديد</strong> - لم يتم استخدام هذا العنوان من قبل`;
        } else {
            const lastUsedDate = new Date(data.lastUsed);
            const formattedDate = lastUsedDate.toLocaleDateString('ar-EG', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const shift = getShiftFromHour(lastUsedDate.getHours());
            walletInfo.style.display = 'block';
            walletInfo.style.padding = '0.75rem';
            walletInfo.style.backgroundColor = '#fff3cd';
            walletInfo.style.border = '1px solid #ffc107';
            walletInfo.style.borderRadius = '6px';
            walletInfo.style.color = '#856404';
            walletInfo.innerHTML = `<i class="fas fa-exclamation-triangle"></i> آخر استخدام: ${formattedDate} (${shift}) بواسطة <strong>${data.lastUser}</strong>`;
        }
    } catch (error) {
        console.error('Error checking wallet usage:', error);
    }
}

/**
 * عرض صفحة PAYOUTS
 */
export function renderPayoutsPage() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="report-form-page-container">
            <div class="page-header">
                <h1 class="page-title">إنشاء تقرير جديد</h1>
                <p class="page-subtitle">نوع التقرير: <strong>السحوبات</strong></p>
            </div>
            <div class="form-container">
                <form id="payouts-form">
                    <div class="form-group">
                        <label for="wallet-address">عنوان المحفظة <span style="color: var(--danger-color);">*</span></label>
                        <input type="text" id="wallet-address" name="wallet-address" 
                               placeholder="أدخل عنوان المحفظة" 
                               required>
                        <div id="wallet-usage-info" style="margin-top: 0.75rem; display: none;"></div>
                    </div>
                    
                    <div class="form-group">
                        <label for="emails">الإيميلات مع الدول <span style="color: var(--danger-color);">*</span></label>
                        <textarea id="emails" name="emails" rows="8" 
                                  placeholder="الصق البيانات من الجدول هنا وسيتم استخراج الإيميلات والدول تلقائياً&#10;&#10;أو اكتب يدوياً بالتنسيق:&#10;example@mail.com - Iraq&#10;another@mail.com - Egypt" 
                                  required></textarea>
                        <small style="color: var(--text-secondary); display: block; margin-top: 0.5rem;">
                            <i class="fas fa-info-circle"></i> الصق البيانات من جدول CRM وسيتم فلترة الإيميلات والدول تلقائياً
                        </small>
                    </div>

                    <div class="form-group">
                        <label>رفع صور (3 كحد أقصى)</label>
                        <div id="upload-area">
                            <p><i class="fas fa-cloud-upload-alt" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                            الصق الصور هنا باستخدام (Ctrl + V) أو اسحبها وأفلتها</p>
                        </div>
                        <div id="image-previews"></div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="submit" class="submit-btn">
                            <i class="fas fa-paper-plane"></i> إرسال التقرير
                        </button>
                        <button type="button" id="copy-report-btn" class="copy-btn">
                            <i class="fas fa-copy"></i> نسخ بيانات التقرير
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // تهيئة الأحداث
    initializePageListeners();
    
    // إعادة تعيين الحالة
    uploadedFiles = [];
    isDirty = false;
    setFormDirty(false);
}




