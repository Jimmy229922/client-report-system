import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

let templatesCache = [];
 
/**
 * يتحقق من وجود إيميلات مكررة في حقل النص.
 * @param {HTMLTextAreaElement} textarea - حقل النص للتحقق منه.
 * @param {HTMLElement} errorContainer - العنصر الذي ستُعرض فيه رسالة الخطأ.
 */
function checkForDuplicateEmails(textarea, errorContainer) {
    const text = textarea.value.trim();
    const submitBtn = document.querySelector('#report-form button[type="submit"]');

    if (text === '') {
        errorContainer.style.display = 'none';
        errorContainer.textContent = '';
        textarea.classList.remove('is-invalid');
        return;
    }

    // استخراج الإيميلات من النص، مع تجاهل الأسطر الفارغة والحساسية لحالة الأحرف
    const emails = text.split('\n')
                       .map(line => line.trim().toLowerCase())
                       .filter(line => line !== '' && line.includes('@')); // تحقق بسيط من أن السطر يحتوي على @

    // البحث عن التكرار
    const emailCounts = emails.reduce((acc, email) => {
        acc[email] = (acc[email] || 0) + 1;
        return acc;
    }, {});

    const duplicates = Object.keys(emailCounts).filter(email => emailCounts[email] > 1);

    if (duplicates.length > 0) {
        // إذا وجد تكرار، أظهر رسالة الخطأ
        const duplicateEmailsStr = duplicates.join(', ');
        errorContainer.textContent = `⚠️ تنبيه: الإيميل التالي مكرر: ${duplicateEmailsStr}`;
        errorContainer.style.display = 'block';
        textarea.classList.add('is-invalid'); // إضافة تنسيق للخطأ
        if (submitBtn) submitBtn.disabled = true; // تعطيل زر الإرسال
    } else {
        // إذا لم يوجد تكرار، أخفِ الرسالة
        errorContainer.style.display = 'none';
        errorContainer.textContent = '';
        textarea.classList.remove('is-invalid'); // إزالة تنسيق الخطأ
        if (submitBtn) submitBtn.disabled = false; // تفعيل زر الإرسال
    }
}

function handleReportTypeChange() {
    const reportTypeSelect = document.getElementById('report-type');
    const reportTextarea = document.getElementById('report-text');
    const errorContainer = document.getElementById('email-duplicate-error');
    const duplicateCheckWrapper = document.getElementById('duplicate-check-wrapper');

    if (!reportTypeSelect || !reportTextarea || !errorContainer || !duplicateCheckWrapper) return;

    const handleInput = () => checkForDuplicateEmails(reportTextarea, errorContainer);

    reportTypeSelect.addEventListener('change', (e) => {
        const selectedType = e.target.value;
        // تفعيل التحقق فقط إذا كان نوع التقرير هو PAYOUTS
        if (selectedType === 'payouts') {
            duplicateCheckWrapper.style.display = 'block';
            reportTextarea.addEventListener('input', handleInput);
            // قم بالتحقق فورًا عند التغيير
            checkForDuplicateEmails(reportTextarea, errorContainer);
        } else {
            duplicateCheckWrapper.style.display = 'none';
            reportTextarea.removeEventListener('input', handleInput);
            reportTextarea.classList.remove('is-invalid');
            // التأكد من تفعيل زر الإرسال عند تغيير النوع
            document.querySelector('#report-form button[type="submit"]').disabled = false;
        }
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true; // يتم تعطيله بالفعل عند وجود تكرار، لكن هذا للتأكيد
    submitBtn.innerHTML = '<div class="spinner-inline"></div> جار الإرسال...';

    const formData = new FormData(form);

    try {
        const result = await fetchWithAuth('/api/reports', {
            method: 'POST',
            body: formData,
        });
        showToast(result.message || 'تم إرسال التقرير بنجاح.');
        form.reset();
        // إعادة تعيين حالة التحقق من التكرار بعد الإرسال
        document.getElementById('report-text').dispatchEvent(new Event('input')); // لإعادة تعيين التحقق من التكرار
    } catch (error) {
        showToast(error.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

function initReportsPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">إنشاء تقرير جديد</h1>
            <p>املأ النموذج التالي لإرسال تقريرك. يمكنك استخدام القوالب السريعة لتسهيل العملية.</p>
        </div>

        <form id="report-form" class="report-form">
            <div class="form-row">
                <div class="form-group">
                    <label for="report-type">نوع التقرير</label>
                    <select id="report-type" name="type" required>
                        <option value="">-- اختر نوع --</option>
                        <option value="suspicious">Suspicious</option>
                        <option value="credit-out">Credit-Out</option>
                        <option value="payouts">PAYOUTS</option>
                        <option value="deposit_percentages">Deposit Percentages</option>
                        <option value="new-positions">New Positions</option>
                        <option value="account_transfer">Account Transfer</option>
                    </select>
                </div>
            </div>

            <div class="form-actions" style="margin-bottom: 1rem;">
                <a href="#reports/deposit-bulk" class="copy-btn">افتح Deposit Builder</a>
            </div>

            <div class="form-group">
                <label for="report-text">نص التقرير</label>
                <textarea id="report-text" name="report_text" rows="12" placeholder="اكتب محتوى تقريرك هنا..." required></textarea>
                <div id="duplicate-check-wrapper" style="display: none; margin-top: 8px;">
                    <div id="email-duplicate-error" class="form-error-message"></div>
                </div>
            </div>

            <div class="form-group">
                <label for="report-images">إرفاق صور (اختياري، 3 كحد أقصى)</label>
                <input type="file" id="report-images" name="images" multiple accept="image/*">
            </div>

            <div class="form-actions">
                <button type="submit" class="submit-btn"><i class="fas fa-paper-plane"></i> إرسال التقرير</button>
            </div>
        </form>
    `;

    handleReportTypeChange();

    const form = document.getElementById('report-form');
    form?.addEventListener('submit', handleFormSubmit);
}

export function renderReportsPage() {
    initReportsPage();
}
