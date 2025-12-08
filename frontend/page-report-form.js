import imageCompression from 'https://esm.sh/browser-image-compression@2.0.2';
import { fetchWithAuth } from './api.js';
import { showToast, initTinyMCE } from './ui.js'; 
import { checkSpecialIdentifier } from './special-identifiers.js';
import { refreshHomePageData } from './page-home.js';
import { setFormDirty } from './router.js';
import { openTemplatesWidget } from './templates-widget.js';
 
let uploadedFiles = [];
let isApplyingPayoutsSanitizedValue = false;
let lastPayoutParseSnapshot = null;

// Module-level state for the templates flyout to allow resetting after submission.
let templateJustInserted = false;
let wasOpenedThisSession = false;

export function resetAdminTemplatesFlyoutState() {
    templateJustInserted = false;
    wasOpenedThisSession = false;
}

const handleSpecialIdentifiersUpdate = () => {
    const form = document.getElementById('report-form');
    if (!form || !window.location.hash.startsWith('#reports/')) return;

    const ipInput = form.querySelector('#ip-input');
    if (ipInput && ipInput.value) {
        checkSpecialIdentifier(ipInput.value, 'ip');
    }

    const emailInput = form.querySelector('#report-email');
    if (emailInput && emailInput.value) {
        checkSpecialIdentifier(emailInput.value, 'email');
    }
};

export function cleanupReportPage() {
    const fab = document.getElementById('templates-fab-btn');
    // Copy account number on click
    const widget = document.getElementById('templates-widget');
        if (widget) widget.classList.remove('show');
    document.removeEventListener('specialIdentifiersUpdated', handleSpecialIdentifiersUpdate);
}

// Apply transfer rules based on country and transfer source
async function applyTransferRules(form) {
    try {
        const countryInput = form.querySelector('#country');
        const transferSourceSelect = form.querySelector('#transfer-source-select');
        
        if (!countryInput || !transferSourceSelect) {
            return; // Not on a transfer form
        }

        const country = countryInput.value?.split(' | ')?.[0]?.trim() || '';
        const transferSource = transferSourceSelect.value;

        if (!country || !transferSource) {
            return; // Not enough information to apply rules
        }

        // Fetch transfer rules from backend
        const { data: rules } = await fetchWithAuth('/api/transfer-rules');
        
        if (!Array.isArray(rules) || rules.length === 0) {
            return; // No rules found
        }

        // Find applicable rule based on conditions
        const applicableRule = rules.find(rule => {
            if (!rule.isEnabled) return false;
            
            // Check if rule conditions match the current form state
            if (rule.conditions?.country && !rule.conditions.country.includes(country)) {
                return false;
            }
            
            if (rule.conditions?.source && !rule.conditions.source.includes(transferSource)) {
                return false;
            }
            
            return true;
        });

        if (applicableRule && applicableRule.toGroup) {
            // Log the applied rule (in a real scenario, this might update UI or form state)
            console.log(`Applied transfer rule: ${applicableRule.name} -> Group: ${applicableRule.toGroup}`);
        }
    } catch (err) {
        console.warn('Error applying transfer rules:', err);
        // Don't throw error as this is a secondary feature
    }
}

export function createDepositReportPageHTML(reportType) {
    return `
    <div class="report-form-page-container">
        <div class="page-header">
            <h1 class="page-title">إنشاء تقرير جديد</h1>
            <p class="page-subtitle">نوع التقرير: <strong>${reportType}</strong></p>
        </div>
        <div class="form-container">
            <form id="report-form">
                <!-- Form groups will be injected by init -->
            </form>
        </div>
    </div>
    `;
}

export function createGeneralReportPageHTML(reportType) {
    return `
    <div class="report-form-page-container">
        <div class="page-header">
            <h1 class="page-title">إنشاء تقرير جديد</h1>
            <p class="page-subtitle">نوع التقرير: <strong>${reportType}</strong></p>
        </div>
        <div class="form-container">
            <form id="report-form"></form>
        </div>
    </div>
    `;
}

export function createProfitLeverageReportPageHTML(reportType) {
    return `
    <div class="report-form-page-container">
        <div class="page-header">
            <h1 class="page-title">إنشاء تقرير جديد</h1>
            <p class="page-subtitle">نوع التقرير: <strong>${reportType}</strong></p>
        </div>
        <div class="form-container">
            <form id="report-form">
                <div class="form-group">
                    <label for="profit-leverage-raw-data">بيانات تقرير Profit Leverage الخام (من الإيميل)</label>
                    <textarea id="profit-leverage-raw-data" name="raw-data" rows="10" placeholder="الصق محتوى الإيميل هنا..."></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" id="process-profit-leverage-data" class="submit-btn">معالجة البيانات</button>
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

function getFormFields(reportType) {
    const commonFields = `
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
            <div class="form-group with-action">
                <label for="wallet-address">عنوان المحفظة <span style="color: var(--danger-color);">*</span></label>
                <div class="input-wrapper">
                    <input type="text" id="wallet-address" name="wallet-address" required>
                    <button type="button" class="input-action-btn" data-copy-target="wallet-address" title="نسخ عنوان المحفظة"><i class="fas fa-copy"></i></button>
                </div>
                <div id="wallet-usage-info" class="form-hint" style="margin-top: 8px; display: none;"></div>
            </div>
            <div class="form-group with-action">
                <label for="emails">الإيميلات (كل إيميل في سطر) <span style="color: var(--danger-color);">*</span></label>
                <div class="input-wrapper">
                    <textarea id="emails" name="emails" rows="4" placeholder="الصق بيانات السحوبات هنا ثم اضغط على زر المعالجة..." required></textarea>
                    <button type="button" class="input-action-btn" data-copy-target="emails" title="نسخ الإيميلات"><i class="fas fa-copy"></i></button>
                </div>
                <div id="email-duplicate-error" class="form-error-message" style="display: none; margin-top: 8px;"></div>
                <div id="parsed-email-summary" class="form-hint parsed-email-summary" aria-live="polite" style="margin-top: 8px; min-height: 60px;">
                    <p style="margin: 0;">???? ??? ????????? ??????? ?????? ?????? ??? ??? ??? ?????.</p>
                </div>
         <div class="form-actions" style="margin-top: 10px;">
            <button type="button" id="process-payouts-data" class="submit-btn" style="width: 100%;">معالجة البيانات الملصقة</button>
        </div>
    </div>
    ${imageUploadField}
    ${formActions}
`;
    } else if (reportType === 'Deposit Report') {
        return `
            ${commonFields}
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
            ${imageUploadField}
            ${formActions}
        `;
    } else if (reportType === 'Credit Out Report') {
        return `
            <div class="form-group">
                <label for="account-number">رقم الحساب <span style="color: var(--danger-color);">*</span></label>
                <input type="text" id="account-number" name="account-number" required>
            </div>
            <div class="form-group">
                <label for="report-email">البريد الإلكتروني <span style="color: var(--danger-color);">*</span></label>
                <input type="email" id="report-email" name="email" required>
            </div>
            <div class="form-group">
                <div class="notes-field-wrapper">
                    <label for="notes">الملاحظات <span style="color: var(--danger-color);">*</span></label>
                    <textarea id="notes" name="notes" rows="4" placeholder="اكتب ملاحظاتك هنا..." required></textarea>
                    <small class="form-hint">اضغط Enter للإرسال، أو Shift+Enter لسطر جديد.</small>
                </div>
            </div>
            ${imageUploadField}
            ${formActions}`;
    } else if (reportType === 'PROFIT WATCHING') {
        return `
            ${commonFields}
            <div class="form-group">
                <label for="report-email">البريد الإلكتروني <span style="color: var(--danger-color);">*</span></label>
                <input type="email" id="report-email" name="email" required>
            </div>
            <div class="form-group">
                <label>أرباح العميل</label>
                <div style="background-color: var(--background-color-offset); padding: 12px; border-radius: 8px; display: flex; align-items: center; gap: 12px;">
                    <input type="checkbox" id="profit-exceeded" name="profit-exceeded" style="width: 18px; height: 18px; accent-color: var(--primary-color);">
                    <label for="profit-exceeded" style="margin: 0; font-weight: normal;">أرباح العميل تخطت الـ 10000$</label>
                </div>
            </div>
            <div class="form-group">
                <div class="notes-field-wrapper">
                    <label for="notes">الملاحظات (اختياري)</label>
                    <textarea id="notes" name="notes" rows="4" placeholder="اكتب ملاحظاتك هنا..."></textarea>
                </div>
            </div>
            ${imageUploadField}
            ${formActions}
        `;
    } else if (reportType === '3Days Balance') {
        return `
            ${commonFields}
            <div class="form-group">
                <label for="report-email">البريد الإلكتروني <span style="color: var(--danger-color);">*</span></label>
                <input type="email" id="report-email" name="email" required>
            </div>
            <div class="form-group">
                <div class="notes-field-wrapper">
                    <label for="notes">الملاحظات <span style="color: var(--danger-color);">*</span></label>
                    <textarea id="notes" name="notes" rows="4" placeholder="اكتب ملاحظاتك هنا..." required></textarea>
                    <small class="form-hint">اضغط Enter للإرسال، أو Shift+Enter لسطر جديد.</small>
                </div>
            </div>
            ${imageUploadField}
            ${formActions}
        `;
    } else if (reportType === 'Profit Leverage') {
        return createProfitLeverageReportPageHTML(reportType);
    } else if (reportType === 'Employee Evaluation') {
        return `
            <div class="form-group">
                <label for="employee-id">الموظف <span style="color: var(--danger-color);">*</span></label>
                <select id="employee-id" name="employee-id" required>
                    <option value="" disabled selected>اختر موظفاً...</option>
                </select>
            </div>
            <div class="form-group">
                <label for="report-email">البريد الإلكتروني للعميل</label>
                <input type="email" id="report-email" name="email">
            </div>
            <div class="form-group">
                <label for="account-number">رقم حساب العميل</label>
                <input type="text" id="account-number" name="account-number">
            </div>
            <div class="form-group">
                <label for="error-level">مستوى الخطأ <span style="color: var(--danger-color);">*</span></label>
                <div class="segmented-control">
                    <input type="radio" id="error-level-low" name="error-level" value="صغير" checked>
                    <label for="error-level-low">صغير</label>
                    <input type="radio" id="error-level-medium" name="error-level" value="متوسط">
                    <label for="error-level-medium">متوسط</label>
                    <input type="radio" id="error-level-high" name="error-level" value="كبير">
                    <label for="error-level-high">كبير</label>
                </div>
            </div>
            <div class="form-group">
                <label for="action-taken">الإجراء المتخذ <span style="color: var(--danger-color);">*</span></label>
                <select id="action-taken" name="action-taken" required>
                    <option value="" disabled selected>اختر الإجراء...</option>
                    <option value="تنبيه شفهي">تنبيه شفهي</option>
                    <option value="كتاب تنبيه">كتاب تنبيه</option>
                    <option value="كتاب عقوبة">كتاب عقوبة</option>
                </select>
            </div>
            <div class="form-group">
                <div class="notes-field-wrapper">
                    <label for="mistake-details">تفاصيل الخطأ <span style="color: var(--danger-color);">*</span></label>
                    <textarea id="mistake-details" name="mistake-details" rows="4" placeholder="اكتب تفاصيل الخطأ هنا..." required></textarea>
                </div>
            </div>
            ${formActions}
        `;
    } else { // General and Account Transfer reports
        // لا تعرض حقل مصدر التحويل لتقرير Same Price and SL
        const transferSourceField = reportType === 'Same Price and SL' ? '' : `
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
        `;
        return `
            ${commonFields}
            <div class="form-group">
                <label for="report-email">البريد الإلكتروني <span style="color: var(--danger-color);">*</span></label>
                <input type="email" id="report-email" name="email" required>
            </div>
            ${transferSourceField}
            <div class="form-group">    
                <div class="notes-field-wrapper">
                    <label for="notes">الملاحظات <span style="color: var(--danger-color);">*</span></label>
                    <textarea id="notes" name="notes" rows="4" placeholder="اكتب ملاحظاتك هنا..." required></textarea>
                    <small class="form-hint">اضغط Enter للإرسال، أو Shift+Enter لسطر جديد.</small>
                </div>
            </div>
            ${imageUploadField}
            ${formActions}
        `;
    }
}

function getCommonReportData(form) {
    return {
        ip: form.querySelector('#ip-input')?.value.trim() || 'غير محدد',
        country: form.querySelector('#country')?.value.trim() || 'غير محدد',
        city: form.querySelector('#city')?.value.trim() || '',
        email: form.querySelector('#report-email')?.value.trim() || 'غير محدد',
        accountNumber: form.querySelector('#account-number')?.value.trim() || 'غير محدد',
        notes: form.querySelector('#notes')?.value.trim() || form.querySelector('#additional-notes')?.value.trim() || 'لا يوجد',
    };
}

function getReportPayload(reportType, form, options = {}) {

    let emailsArray = [];

    const mentions = reportType === 'Deposit Report' ? '' : '\n@ahmedelgma\n@batoulhassan';



    const reportTypeMap = {

        'Suspicious Report': { title: 'suspicious', hash: '#suspicious', type: 'suspicious' },

        'Deposit Report': { title: 'Deposit Report', hash: '#deposit_percentages', type: 'deposit_percentages' },

        'New Position Report': { title: 'new-positions', hash: '#new-positions', type: 'new-positions' },

        'Credit Out Report': { title: 'credit-out', hash: '#credit-out', type: 'credit-out' },

        'تحويل الحسابات': { title: 'تحويل الحسابات', hash: '#account_transfer', type: 'account_transfer' },

        'PAYOUTS': { title: 'PAYOUTS', hash: '#payouts', type: 'payouts' },

        'PROFIT WATCHING': { title: 'Profit Watching', hash: '#profit_watching', type: 'profit_watching' },

        '3Days Balance': { title: '3Days Balance', hash: '#3days_balance', type: '3days_balance' },

        'Profit Leverage': { title: 'Profit Leverage', hash: '#profit_leverage', type: 'profit_leverage' },

        'Employee Evaluation': { title: 'Employee Evaluation', hash: '#evaluations', type: 'evaluation' },

        'Same Price and SL': { title: 'Same Price and SL', hash: '#same_price_sl', type: 'same_price_sl' },

        'Deals with No profit': { title: 'Deals with No profit', hash: '#deals_no_profit', type: 'deals_no_profit' },

    };



    const { title, hash, type } = reportTypeMap[reportType] || { title: reportType, hash: '', type: 'other' };

    let body = '';

    const footer = `\n\n${hash}${mentions}`;

    let copyBody = ''; // نص مخصص للنسخ بدون HTML



    let processedProfitLeverageData = []; // Initialize here



    // Special handling for Employee Evaluation as it returns a different payload structure

    if (reportType === 'Employee Evaluation') {

        const employeeId = form.querySelector('#employee-id').value;

        const clientEmail = form.querySelector('#report-email').value;

        const clientAccountNumber = form.querySelector('#account-number').value;

        const errorLevel = form.querySelector('input[name="error-level"]:checked')?.value || 'صغير';

        const actionTaken = form.querySelector('#action-taken').value;

        const mistakeDetails = form.querySelector('#mistake-details').value;



        return {

            isEvaluation: true,

            evaluationData: {

                employeeId,

                clientEmail,

                clientAccountNumber,

                errorLevel,

                actionTaken,

                mistake: mistakeDetails, // 'mistake' is the field name in the schema

                details: mistakeDetails,

                image_urls: [] // Send empty array as images are removed

            }

        };

    }



    // General handling for other report types

    if (reportType === 'PAYOUTS') {

        const walletAddress = form.querySelector('#wallet-address').value;

        const emailsValue = form.querySelector('#emails').value;

        emailsArray = emailsValue.trim() ? emailsValue.split('\n').filter(e => e.trim()) : [];

        const formattedEmailsForBody = emailsArray.length > 0

            ? emailsArray.map(email => `<code>${email.trim()}</code>`).join('\n')

            : '<code>لا يوجد</code>';



        body = `عنوان المحفظة: <code>${walletAddress || 'غير محدد'}</code>\n\n`

             + `الإيميلات:\n`

             + `${formattedEmailsForBody}`

             + `\n--------------------\nاكثر من عميل يسحب علي نفس عنوان المحفظة`;

        copyBody = `عنوان المحفظة: ${walletAddress || 'غير محدد'}\n\n`

                 + `الإيميلات:\n`

                 + `${emailsArray.map(e => e.trim()).join('\n')}\n\n`

                 + `اكثر من عميل يسحب علي نفس عنوان المحفظة`;



    } else if (reportType === 'Deposit Report') {

        const common = getCommonReportData(form);

        let marginPercentage = form.querySelector('#margin-percentage').value;

        const floatingProfitStatus = form.querySelector('input[name="floating-profit-status"]:checked').value;

        const ipMatchStatus = form.querySelector('input[name="ip-match-status"]:checked').value;

        const bonusStatus = form.querySelector('input[name="bonus-status"]:checked').value;

        const additionalNotes = form.querySelector('#additional-notes')?.value.trim();



        if (marginPercentage && !marginPercentage.endsWith('%')) marginPercentage += '%';

        

        const [country] = common.country.split(' | ');

        body = `ip country: <code>${country}</code>\n`

             + `IP: <code>${common.ip}</code>\n`

             + `الإيميل: <code>${common.email}</code>\n`

             + `رقم الحساب: <code>${common.accountNumber}</code>\n`

             + `نسبة الهامش: <code>${marginPercentage || 'N/A'}</code>\n\n`

             + `الأرباح للصفقات العائمة (${floatingProfitStatus})\n`

             + `الـ IP الأخير (${ipMatchStatus}) لبلد التسجيل، العميل ${bonusStatus}`;



        if (additionalNotes) {

            body += `\nملاحظات إضافية: <code>${additionalNotes}</code>`;

        }



        copyBody = body.replace(/<\/?code>/g, ''); // Remove HTML for copy

    } else if (reportType === 'Credit Out Report') {

        const accountNumber = form.querySelector('#account-number')?.value.trim() || 'غير محدد';

        const email = form.querySelector('#report-email')?.value.trim() || 'غير محدد';

        const notes = form.querySelector('#notes')?.value.trim() || 'لا يوجد';



        body = `رقم الحساب: <code>${accountNumber}</code>\n`

             + `الإيميل: <code>${email}</code>\n`

             + `الملاحظات: <code>${notes}</code>`;



        copyBody = body.replace(/<\/?code>/g, ''); // Remove HTML for copy

    } else if (reportType === 'PROFIT WATCHING') {

        const common = getCommonReportData(form);

        const profitExceeded = form.querySelector('#profit-exceeded').checked;



        const [country] = common.country.split(' | ');

        body = `ip country: <code>${country}</code>\n`

             + `IP: <code>${common.ip}</code>\n`

             + `الإيميل: <code>${common.email}</code>\n`

             + `رقم الحساب: <code>${common.accountNumber}</code>\n`;

        

        if (profitExceeded) {

            body += `أرباح العميل تخطت الـ 10000$\n`;

        } else {

            body += `أرباح العميل اقل من الـ 10000$\n`;

        }



        if (common.notes && common.notes !== 'لا يوجد') {

            body += `الملاحظات: <code>${common.notes}</code>`;

        }



        copyBody = body.replace(/<\/?code>/g, ''); // Remove HTML for copy

    } else if (reportType === '3Days Balance') {

        const common = getCommonReportData(form);



        const [country] = common.country.split(' | ');

        body = `ip country: <code>${country}</code>\n`

             + `IP: <code>${common.ip}</code>\n`

             + `الإيميل: <code>${common.email}</code>\n`

             + `رقم الحساب: <code>${common.accountNumber}</code>\n`

             + `الملاحظات: <code>${common.notes}</code>`;



        copyBody = body.replace(/<\/?code>/g, ''); // Remove HTML for copy

    } else if (reportType === 'Profit Leverage') {

        const rawData = form.querySelector('#profit-leverage-raw-data').value;

        const lines = rawData.trim().split('\n');



        if (lines.length < 2) {

            showToast('الرجاء إدخال بيانات صحيحة (رأس وعمود واحد على الأقل).', true);

            // No return here, just set empty data

            body = '';

            copyBody = '';

            processedProfitLeverageData = [];

        } else {

            const header = lines[0].split(/\s+/);

            const clientLoginIndex = header.indexOf('Client');

            const newGroupIndex = header.indexOf('Group'); // New Group for the second 'Group'

            const leverageIndex = header.indexOf('leverage');

            const leverageChangedIndex = header.indexOf('changed');





            if (clientLoginIndex === -1 || newGroupIndex === -1 || leverageIndex === -1 || leverageChangedIndex === -1) {

                showToast('لا يمكن تحليل البيانات. تأكد من أن الرأس يحتوي على: Client Login, New Group, leverage, leverage changed', true);

                body = '';

                copyBody = '';

                processedProfitLeverageData = [];

            } else {

                // Adjust newGroupIndex to get the second occurrence of 'Group'

                const headerString = lines[0];

                const firstGroupIndex = headerString.indexOf("Group");

                const secondGroupIndex = headerString.indexOf("Group", firstGroupIndex + 1);



                let adjustedNewGroupIndex = -1;

                let tempStr = headerString;

                let counter = 0;

                while(tempStr.indexOf("Group") !== -1 && counter < 2) {

                    adjustedNewGroupIndex = adjustedNewGroupIndex + tempStr.indexOf("Group") + 1;

                    tempStr = tempStr.substring(tempStr.indexOf("Group") + 1);

                    counter++;

                }

                // Fallback if needed, though this logic should ideally be precise.

                if(secondGroupIndex !== -1) {

                    adjustedNewGroupIndex = header.slice(0, Math.floor(headerString.substring(0, secondGroupIndex).split(/\s+/).filter(s => s!=='').length)).join(' ').split(/\s+/).filter(s => s!=='').length -1;

                } else {

                    // If there's no second group, this can be an error or different format

                    adjustedNewGroupIndex = header.indexOf('New'); // Use 'New' as a heuristic if 'Group' is messy

                }



                let generatedCliches = [];

                let generatedCopyCliches = [];



                for (let i = 1; i < lines.length; i++) {

                    const parts = lines[i].split(/\s+/);

                    const clientLogin = parts[clientLoginIndex];

                    const newGroup = parts[adjustedNewGroupIndex];

                    const leverage = parts[leverageIndex];

                    const leverageChanged = parts.slice(-1)[0]; // Assuming 'leverage changed' is always the last column and the value is TRUE/FALSE



                    let cliche = '';

                    let copyCliche = '';



                    if (leverageChanged === 'TRUE') {

                        cliche = `رقم الحساب: <code>${clientLogin}</code> // <code>${newGroup}</code> Leverage: <code>${leverage}</code> Leverage Changed: <code>${leverageChanged}</code> تم تحويل الجروب إلى الفئة الثالثة وتم تغيير الرافعة المالية.`;

                        copyCliche = `رقم الحساب: ${clientLogin} // ${newGroup} Leverage: ${leverage} Leverage Changed: ${leverageChanged} تم تحويل الجروب إلى الفئة الثالثة وتم تغيير الرافعة المالية.`;

                    } else if (leverageChanged === 'FALSE') {

                        cliche = `مساء الخير، رقم الحساب: <code>${clientLogin}</code> // <code>${newGroup}</code> Leverage: <code>${leverage}</code> Leverage Changed: <code>${leverageChanged}</code> تم تحويل الجروب إلى الفئة الثالثة ولكن لم يتم تغيير الرافعة المالية بسبب وجود صفقات مفتوحة، وتم إبلاغ حضراتكم لتكونوا على علم بأنه سيتم تغيير الرافعة المالية عند إغلاق الصفقات.`;

                        copyCliche = `مساء الخير، رقم الحساب: ${clientLogin} // ${newGroup} Leverage: ${leverage} Leverage Changed: ${leverageChanged} تم تحويل الجروب إلى الفئة الثالثة ولكن لم يتم تغيير الرافعة المالية بسبب وجود صفقات مفتوحة، وتم إبلاغ حضراتكم لتكونوا على علم بأنه سيتم تغيير الرافعة المالية عند إغلاق الصفقات.`;

                    }

                    generatedCliches.push(cliche);

                    generatedCopyCliches.push(copyCliche);

                    processedProfitLeverageData.push({

                        clientLogin,

                        newGroup,

                        leverage,

                        leverageChanged,

                        cliche,

                        copyCliche

                    });

                }



                body = generatedCliches.join('\n\n');

                copyBody = generatedCopyCliches.join('\n\n');

            }

        }



    } else { // General and Account Transfer

        const common = getCommonReportData(form);

        const transferSourceSelect = form.querySelector('#transfer-source-select');

        let transferSource = '';
        
        // لتقرير Same Price and SL، لا يوجد حقل مصدر التحويل
        if (reportType !== 'Same Price and SL' && transferSourceSelect) {
            transferSource = transferSourceSelect.value;

            if (transferSource === 'other') {

                transferSource = form.querySelector('#transfer-source-other').value;

            } else if (!transferSource) {

                transferSource = 'لم يتم الاختيار';

            }
        }



        const [country] = common.country.split(' | ');

        body = `ip country: <code>${country}</code>\n`

             + `IP: <code>${common.ip}</code>\n`

             + `الإيميل: <code>${common.email}</code>\n`

             + `رقم الحساب: <code>${common.accountNumber}</code>\n`;
        
        // إضافة مصدر التحويل فقط إذا لم يكن التقرير من نوع Same Price and SL
        if (reportType !== 'Same Price and SL') {
            body += `مصدر التحويل: <code>${transferSource}</code>\n`;
        }
        
        body += `الملاحظات: <code>${common.notes}</code>`;



        copyBody = body.replace(/<\/?code>/g, ''); // Remove HTML for copy

    }



    return {

        reportText: `تقرير ${title}\n\n${body}${footer}`,

        reportType: type,

        copyText: `تقرير ${title}\n\n${copyBody}${footer}`,

        emails: reportType === 'PAYOUTS' ? emailsArray : undefined,

        processedProfitLeverageData: processedProfitLeverageData.length > 0 ? processedProfitLeverageData : undefined

    };
}

/**
 * يتحقق من وجود إيميلات مكررة في حقل الإيميلات الخاص بـ PAYOUTS.
 */
function setupPayoutsDuplicateCheck() {
    const emailsTextarea = document.getElementById('emails');
    const errorContainer = document.getElementById('email-duplicate-error');
    const submitBtn = document.querySelector('#report-form button[type="submit"]');

    if (!emailsTextarea || !errorContainer || !submitBtn) return;

    const checkDuplicates = () => {
        const text = emailsTextarea.value.trim();
        if (text === '') {
            errorContainer.style.display = 'none';
            emailsTextarea.classList.remove('is-invalid');
            submitBtn.disabled = false;
            return;
        }

        const emails = text.split('\n')
                           .map(line => line.split(' ')[0].trim().toLowerCase())
                           .filter(line => line !== '' && line.includes('@'));

        const emailCounts = emails.reduce((acc, email) => {
            acc[email] = (acc[email] || 0) + 1;
            return acc;
        }, {});

        const duplicates = Object.keys(emailCounts).filter(email => emailCounts[email] > 1);

        if (duplicates.length > 0) {
            errorContainer.textContent = `?? ?????: ??????? ?????? ????: ${duplicates.join(', ')}`;
            errorContainer.style.display = 'block';
            emailsTextarea.classList.add('is-invalid');
            submitBtn.disabled = true;
        } else {
            errorContainer.style.display = 'none';
            emailsTextarea.classList.remove('is-invalid');
            submitBtn.disabled = false;
        }
    };

    emailsTextarea.addEventListener('input', checkDuplicates);
    checkDuplicates(); // Initialize state on load
}
const UNKNOWN_COUNTRY_LABEL = 'Unknown';
const BANNED_MARKER = ' ( محظور )';

function escapeHtml(value) {
    if (!value) return '';
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

function parsePayoutEmailEntries(rawText, previousEntries) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const banRegex = /B5W|B5 2W|B5 2/i;
    const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;
    const entries = new Map();
    if (!rawText) return entries;

    const lines = rawText.split(/\r?\n/).map(line => line.trim());
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const emailMatch = line.match(emailRegex);
        if (!emailMatch) continue;

        const email = emailMatch[0].toLowerCase();
        const context = lines.slice(Math.max(0, i - 4), Math.min(lines.length, i + 5));
        const prevEntry = previousEntries?.get(email);
        let country = extractCountryFromLine(line, email) || determineCountryFromLines(context, ipRegex);
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

function formatPayoutEmailList(entries) {
    if (!entries || entries.size === 0) return '';
    return [...entries.entries()].map(([email, data]) => {
        let line = `${email} - ${data.country || UNKNOWN_COUNTRY_LABEL}`;
        if (data.isBanned) line += BANNED_MARKER;
        return line;
    }).join('\n');
}

function getPayoutsProcessingResult(rawText, previousEntries) {
    const entries = parsePayoutEmailEntries(rawText, previousEntries);
    const sanitizedText = formatPayoutEmailList(entries);
    return { entries, sanitizedText };
}

function renderPayoutsSummary(entries, container) {
    if (!container) return;
    if (!entries || entries.size === 0) {
        container.innerHTML = '<p style=\"margin: 0;\">سيتم عرض الايميلات المفلترة هنا بعد اللصق.</p>';
        return;
    }

    container.innerHTML = [...entries.entries()].map(([email, data]) => {
        const displayCountry = data.country === UNKNOWN_COUNTRY_LABEL ? 'غير معروف' : data.country;
        const bannedTag = data.isBanned ? '<span style=\"margin-left: 8px; color: var(--danger-color);\">(محظور)</span>' : '';
        return `<div class=\"payout-summary-row\" style=\"display:flex; justify-content:space-between; gap: 8px; align-items:center; padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,0.08);\"><span style=\"font-weight: 600; word-break: break-all;\">${escapeHtml(email)}</span><span style=\"opacity: 0.8;\">${escapeHtml(displayCountry)}</span>${bannedTag}</div>`;
    }).join('');
}
/**
 * يجمع كل أخطاء التحقق من النموذج في مصفوفة من الرسائل.
 * @param {HTMLFormElement} form - عنصر النموذج للتحقق منه.
 * @returns {string[]} مصفوفة من رسائل الخطأ.
 */
function getValidationErrors(form) {
    const errors = [];
    
    // التحقق من وجود النموذج وعناصره
    if (!form || !form.elements) return errors;

    // 1. التحقق من الحقول المطلوبة القياسية
    for (const element of form.elements) {
        if (!element.checkValidity()) {
            // تجاهل الحقول المخفية أو التي لا تحتوي على اسم
            if (element.type === 'hidden' || !element.name) continue;

            const label = form.querySelector(`label[for="${element.id}"]`);
            const labelText = label ? label.innerText.replace('*', '').trim() : (element.name || element.id);
            
            if (element.validity.valueMissing) {
                errors.push(`حقل "${labelText}" مطلوب.`);
            } else if (element.validity.patternMismatch) {
                // رسالة مخصصة للأنماط، مثل حقل نسبة الهامش
                const customMessage = element.getAttribute('data-pattern-error');
                errors.push(customMessage || `صيغة حقل "${labelText}" غير صحيحة.`);
            } else if (element.validity.typeMismatch) {
                errors.push(`الرجاء إدخال قيمة صالحة في حقل "${labelText}".`);
            }
        }
    }

    // 2. التحقق المخصص لحقل الدولة
    const countryInput = form.querySelector('#country');
    const ipInput = form.querySelector('#ip-input');
    if (countryInput && ipInput) {
        const countryValue = countryInput.value.trim();
        if (countryValue === 'جاري البحث...') {
            errors.push('الرجاء انتظار اكتمال البحث عن الدولة.');
        } else if (ipInput.required && (countryValue === 'فشل البحث' || countryValue === '')) {
            errors.push('يجب إدخال IP والانتظار حتى يتم تحديد الدولة بنجاح.');
        }
    }

    // 3. التحقق من الإيميلات المكررة (لتقرير PAYOUTS)
    const emailDuplicateError = form.querySelector('#email-duplicate-error');
    if (emailDuplicateError && emailDuplicateError.style.display !== 'none') {
        errors.push(emailDuplicateError.textContent.replace('⚠️ تنبيه: ', ''));
    }

    return errors;
}

/**
 * يتحقق من صحة النموذج ويعطل/يفعل أزرار الإرسال والنسخ.
 */
function updateFormState() {
    const form = document.getElementById('report-form');
    if (!form) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const copyBtn = form.querySelector('#copy-report-btn');
    const countryInput = form.querySelector('#country');

    let isFormValid = form.checkValidity();
    let customErrorMessages = [];

    // استخدم الدالة الجديدة للتحقق الشامل
    const validationErrors = getValidationErrors(form);
    if (validationErrors.length > 0) {
        isFormValid = false;
    }

    if (submitBtn) submitBtn.disabled = !isFormValid;
    if (copyBtn) copyBtn.disabled = !isFormValid;
}

// Minimal initializer for report pages used by router
export function initCreateReportPage() {
    const form = document.getElementById('report-form');
    if (!form) return;

    // Extract page title from the DOM
    const pageTitleEl = document.querySelector('.page-subtitle strong');
    const pageTitle = pageTitleEl ? pageTitleEl.innerText.trim() : '';

    // Initialize the full form logic
    initReportFormPage(pageTitle);
}

/**
 * يتحقق من البريد الإلكتروني المدخل ويعرض تنبيهاً خاصاً إذا تطابق مع القائمة.
 * @param {string} email - البريد الإلكتروني للتحقق منه.
 */
function checkSpecialEmail(email) {
    checkSpecialIdentifier(email, 'email');
}

// Helper functions for input type validation
function isIPFormat(value) {
    // Regex for IPv4 address
    return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value);
}

function isEmailFormat(value) {
    // Simple regex for email format
    return /^\S+@\S+\.\S+$/.test(value);
}

function isAccountNumberFormat(value) {
    // Assumes account numbers are typically just digits
    return /^\d+$/.test(value);
}

/**
 * Sets up real-time validation for input fields to check for type mismatches (e.g., email in IP field).
 * @param {HTMLInputElement} inputElement - The input field to validate.
 * @param {string} fieldName - A user-friendly name for the field (for toast messages).
 * @param {'ip'|'email'|'accountNumber'} expectedType - The type of input expected in this field.
 */
function setupFieldTypeValidation(inputElement, fieldName, expectedType) {
    if (!inputElement) return;

    const checkType = () => {
        const value = inputElement.value.trim();
        if (!value) {
            inputElement.classList.remove('is-invalid');
            return;
        }

        let isMismatch = false;
        let message = '';

        if (expectedType === 'ip' && (isEmailFormat(value) || isAccountNumberFormat(value))) {
            isMismatch = true;
            message = `تنبيه: يبدو أنك أدخلت ${isEmailFormat(value) ? 'بريد إلكتروني' : 'رقم حساب'} في حقل "${fieldName}".`;
        } else if (expectedType === 'email' && (isIPFormat(value) || isAccountNumberFormat(value))) {
            isMismatch = true;
            message = `تنبيه: يبدو أنك أدخلت ${isIPFormat(value) ? 'IP Address' : 'رقم حساب'} في حقل "${fieldName}".`;
        } else if (expectedType === 'accountNumber' && (isIPFormat(value) || isEmailFormat(value))) {
            isMismatch = true;
            message = `تنبيه: يبدو أنك أدخلت ${isIPFormat(value) ? 'IP Address' : 'بريد إلكتروني'} في حقل "${fieldName}".`;
        }

        if (isMismatch) showToast(message, true);
        inputElement.classList.toggle('is-invalid', isMismatch);
    };

    inputElement.addEventListener('input', checkType);
    inputElement.addEventListener('blur', checkType);
}

/**
 * Sets up automatic focus jumping to the next field for admins.
 * Now enabled for all users.
 * @param {string} reportType - The type of the current report.
 */
/**
 * Sets up automatic focus jumping to the next field for admins.
 * Now enabled for all users.
 * @param {string} reportType - The type of the current report.
 */
function setupFormAutoFocus(reportType) {
    const fieldSequences = {
        'Deposit Report': ['ip-input', 'account-number', 'report-email', 'margin-percentage', 'additional-notes'],
        'Credit Out Report': ['account-number', 'report-email', 'notes'],
        'PROFIT WATCHING': ['ip-input', 'account-number', 'report-email', 'notes'],
        'Suspicious Report': ['ip-input', 'account-number', 'report-email', 'transfer-source-select', 'notes'],
        'New Position Report': ['ip-input', 'account-number', 'report-email', 'transfer-source-select', 'notes'],
        'تحويل الحسابات': ['ip-input', 'account-number', 'report-email', 'transfer-source-select', 'notes'],
        'PAYOUTS': ['wallet-address', 'emails'],
        '3Days Balance': ['ip-input', 'account-number', 'report-email', 'notes'],
        'Same Price and SL': ['ip-input', 'account-number', 'report-email', 'notes'],
    };

    const sequence = fieldSequences[reportType];
    if (!sequence) return;

    const form = document.getElementById('report-form');

    const performFocus = (field) => {
        // Use a small timeout to prevent issues with event propagation
        setTimeout(() => {
            // إذا كان الحقل التالي هو قائمة مصدر التحويل، حدد "suspicious traders" تلقائياً
            if (field.id === 'transfer-source-select') {
                field.value = 'suspicious traders';
            }

            field.focus();
            field.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // إذا كان الحقل التالي هو قائمة منسدلة، افتحها تلقائياً
            if (field.tagName === 'SELECT' && typeof field.showPicker === 'function') {
                try {
                    field.showPicker();
                } catch (e) { /* تجاهل الأخطاء في المتصفحات التي لا تدعم showPicker بالكامل */ }
            }
        }, 50);
    };

    const focusNext = (currentId) => {
        const currentIndex = sequence.indexOf(currentId);
        if (currentIndex > -1 && currentIndex < sequence.length - 1) {
            const nextFieldId = sequence[currentIndex + 1];
            const nextField = form.querySelector(`#${nextFieldId}`);
            if (nextField) {
                const specialWarningModal = document.getElementById('special-ip-warning-modal');
                if (specialWarningModal) {
                    // Modal is visible, defer focus until it's closed.
                    const observer = new MutationObserver((mutationsList, obs) => {
                        if (!document.getElementById('special-ip-warning-modal')) {
                            performFocus(nextField);
                            obs.disconnect();
                        }
                    });
                    observer.observe(document.body, { childList: true });
                } else {
                    // Modal is not visible, focus immediately.
                    performFocus(nextField);
                }
            }
        }
    };

    // Add Enter key listener to all fields in the sequence
    sequence.forEach((fieldId, index) => {
        const field = form.querySelector(`#${fieldId}`);
        if (!field) return;

        // Handle Enter key for all non-textarea fields
        if (field.tagName !== 'TEXTAREA' && field.id !== 'ip-input') {
            field.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); // Prevent default behavior (like form submission)
                    
                    const nextFieldId = sequence[index + 1];
                    const isLastField = index === sequence.length - 1;
                    
                    if (isLastField) {
                        // If it's the last field before a textarea or the end, submit.
                        form.querySelector('.submit-btn').click();
                    } else {
                        focusNext(fieldId);
                    }
                }
            });
        }

        // Specific behavior for auto-jump without Enter
        if (field.id === 'account-number') {
            field.addEventListener('input', () => {
                if (field.value.length === 7) { // Assuming account numbers are 7 digits
                    focusNext(fieldId);
                }
            });
        } else if (field.id === 'report-email') {
            field.addEventListener('input', () => {
                if (isEmailFormat(field.value)) {
                    focusNext(fieldId);
                    field.blur(); // Remove focus after jumping
                }
            });
        }
    });

    // Special handling for IP input to focus next after country lookup
    const ipInputIndex = sequence.indexOf('ip-input');
    if (ipInputIndex !== -1 && ipInputIndex < sequence.length - 1) {
        form.dataset.nextFieldAfterIp = sequence[ipInputIndex + 1] || '';
    }
}

async function populateEmployeeDropdown() {
    const employeeSelect = document.getElementById('employee-id');
    if (!employeeSelect) return;
    // Populate employee dropdown - implementation can be added here if needed
}

async function initReportFormPage(pageTitle) {
    const form = document.getElementById('report-form');
    if (!form) return;

    // Inject form fields if the form is empty
    if (!form.innerHTML.trim()) {
        form.innerHTML = getFormFields(pageTitle);
    }

    const ipInput = form.querySelector('#ip-input');
    const emailInput = form.querySelector('#report-email');
    const accountNumberInput = form.querySelector('#account-number');
    const copyBtn = form.querySelector('#copy-report-btn');
    const uploadArea = form.querySelector('#upload-area');
    const imagePreviews = form.querySelector('#image-previews');
    const clearIpBtn = form.querySelector('#clear-ip-btn');

    if (ipInput && clearIpBtn) {
        ipInput.addEventListener('input', () => {
            clearIpBtn.classList.toggle('hidden', ipInput.value.length === 0);
        });
        clearIpBtn.addEventListener('click', () => {
            ipInput.value = '';
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

    form.addEventListener('input', () => {
        setFormDirty(true);
        updateFormState(); // التحقق من صحة النموذج عند أي إدخال
    });

    if (form.querySelector('#transfer-source-select')) { //NOSONAR
        form.querySelector('#transfer-source-select').addEventListener('change', (e) => {
            const isOther = e.target.value === 'other';
            const otherContainer = form.querySelector('#transfer-source-other-container');
            const otherInput = form.querySelector('#transfer-source-other');
            const notesTextarea = form.querySelector('#notes');

            // إخفاء رسالة فاحص IP عند تغيير المصدر لضمان عدم التداخل
            const specialIdentifierToast = document.getElementById('special-identifier-toast-container');
            if (specialIdentifierToast) {
                specialIdentifierToast.classList.remove('show');
            }

            otherContainer.style.display = isOther ? 'block' : 'none';
            otherInput.required = isOther;

            // تعديل جديد: التركيز دائماً على الملاحظات بعد اختيار المصدر
            if (notesTextarea) {
                // لا يتم التركيز هنا تلقائياً، سيتم التعامل معه عبر حدث الضغط على Enter
            }

            applyTransferRules(form); // Apply rules when source changes
        });

        // Also apply rules when the country is determined
        form.querySelector('#country')?.addEventListener('change', () => {
            applyTransferRules(form);
        });
    }

    form.querySelectorAll('textarea').forEach(textarea => {
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                form.querySelector('.submit-btn').click();
            }
        });
    });

    const handleFiles = async (files) => {
        const compressionOptions = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
        };

        for (const file of files) {
            if (file.type.startsWith('image/') && uploadedFiles.length < 3) {
                if (uploadedFiles.some(f => f.originalName === file.name && f.originalSize === file.size)) {
                    showToast('تم رفع هذه الصورة بالفعل.', true);
                    continue;
                }

                const previewContainer = createImagePreview(file, true); // Pass true for loading state

                try {
                    const compressedFile = await imageCompression(file, compressionOptions);
                    // Store both original and compressed file info
                    const fileData = {
                        file: compressedFile,
                        originalName: file.name,
                        originalSize: file.size,
                        previewUrl: URL.createObjectURL(compressedFile)
                    };
                    uploadedFiles.push(fileData);
                    // Update preview with final image and remove loading state
                    updateImagePreview(previewContainer, fileData);
                } catch (err) {
                    previewContainer.remove();
                    showToast('فشل ضغط الصورة.', true);
                }
            }
        }
    };

    if (uploadArea) {
        document.onpaste = (e) => window.location.hash.startsWith('#reports/') && handleFiles(e.clipboardData.files);
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
        });
    }

    const createImagePreview = (file, isLoading = false) => {
        const src = URL.createObjectURL(file);
        const container = document.createElement('div');
        container.className = 'img-preview-container';
        container.dataset.originalName = file.name; // Use for identification
        
        if (isLoading) {
            container.classList.add('loading');
            container.innerHTML = `
                <div class="img-preview-spinner"></div>
                <p class="img-preview-loading-text">جاري ضغط الصورة...</p>
            `;
        } else {
            container.dataset.blobUrl = src;
            container.innerHTML = `
                <img src="${src}" class="img-preview">
                <button type="button" class="remove-img-btn">&times;</button>
            `;
            container.querySelector('.remove-img-btn').onclick = () => {
                URL.revokeObjectURL(src);
                container.remove();
                uploadedFiles = uploadedFiles.filter(f => f.previewUrl !== src);
            };
        }
        // ...existing code...
        return container;
    };

    const updateImagePreview = (container, fileData) => {
        container.classList.remove('loading');
        container.dataset.blobUrl = fileData.previewUrl;
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


    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const validationErrors = getValidationErrors(form);
        if (validationErrors.length > 0) {
            showToast(validationErrors[0], true);
            form.reportValidity();
            return;
        }

        const submitBtn = form.querySelector('.submit-btn');
        submitBtn.innerText = 'جاري الإرسال...';
        submitBtn.disabled = true;

        const payload = getReportPayload(pageTitle, form);

        if (payload.isEvaluation) {
            const formData = new FormData();
            // Append all evaluation data fields to the FormData
            for (const key in payload.evaluationData) {
                formData.append(key, payload.evaluationData[key]);
            }

            try {
                const result = await fetchWithAuth('/api/evaluations', { 
                    method: 'POST', 
                    body: formData // Send FormData instead of JSON
                });
                showToast(result.message);
                setFormDirty(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                form.reset();
                refreshHomePageData();
            } catch (error) {
                showToast(error.message, true);
            } finally {
                submitBtn.innerText = 'إرسال التقرير';
                submitBtn.disabled = false;
            }
            return;
        }

        const formData = new FormData();
        formData.append('report_text', payload.reportText);
        
        // Append compressed files to the form data
        uploadedFiles.forEach(fileData => {
            // Use the original name for the server
            formData.append('images', fileData.file, fileData.originalName);
        });

        formData.append('type', payload.reportType);
        // Fix: The backend expects 'emails' as a string, not a JSON array.
        if (payload.emails) {
            formData.append('emails', payload.emails.join('\n'));
        }

        try {
            const result = await fetchWithAuth('/api/reports', { method: 'POST', body: formData });
            console.log('Report creation successful, API response:', result);

            const isWarning = result.warning === 'TELEGRAM_FAILED';
            let toastMessage = result.message;
            
            const userStr = localStorage.getItem('user');
            const isAdmin = userStr ? JSON.parse(userStr).role === 'admin' : false;
            if (isWarning && isAdmin) {
                toastMessage += ' (تحقق من توثيق ngrok أو إعدادات البوت)';
            }
            showToast(toastMessage, isWarning);
            setFormDirty(false);

            // Scroll to the top of the page after successful submission
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            // Clean up blob URLs and reset form
            uploadedFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
            form.reset();
            imagePreviews.innerHTML = '';
            uploadedFiles = [];

            refreshHomePageData();

            const countryInput = form.querySelector('#country');
            if (countryInput) countryInput.value = '';
            const countryIcon = form.querySelector('#country-icon');
            if (countryIcon) countryIcon.innerHTML = '';

            resetAdminTemplatesFlyoutState(); // Reset state to allow flyout on next report

        } catch (error) {
            console.error('Failed to submit report or log activity:', error);
            showToast(error.message, true);
        } finally {
            submitBtn.innerText = 'إرسال التقرير';
            submitBtn.disabled = false;
        }
    });

    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            // التحقق من صحة النموذج قبل النسخ
            const validationErrors = getValidationErrors(form);
            if (validationErrors.length > 0) {
                // عرض أول خطأ للمستخدم
                showToast(validationErrors[0], true);
                form.reportValidity();
                return;
            }

            const { copyText } = getReportPayload(pageTitle, form);

            try {
                await navigator.clipboard.writeText(copyText);

                const originalText = copyBtn.innerText;
                copyBtn.innerText = 'تم النسخ!';
                copyBtn.classList.add('copied');

                copyBtn.style.backgroundColor = '#28a745';
                copyBtn.style.borderColor = '#28a745';
                copyBtn.style.color = 'white';

                setTimeout(() => {
                    copyBtn.innerText = originalText;
                    copyBtn.classList.remove('copied');
                    copyBtn.style.backgroundColor = '';
                    copyBtn.style.borderColor = '';
                    copyBtn.style.color = '';
                }, 2000);

                // تسجيل النشاط في الخلفية
                await fetchWithAuth('/api/activity-logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'copy_report_data', details: { reportType: pageTitle } })
                });

            } catch (err) {
                showToast('فشل نسخ النص.', true);
                console.error('Copy or logging failed:', err);
            }
        });
    }

    // تحديث حالة النموذج عند التحميل الأولي
    updateFormState();

    // Setup input type validation for key fields
    setupFieldTypeValidation(ipInput, 'IP Address', 'ip');
    setupFieldTypeValidation(emailInput, 'البريد الإلكتروني', 'email');
    setupFieldTypeValidation(accountNumberInput, 'رقم الحساب', 'accountNumber');

    // إضافة جديدة: إخفاء رسالة فاحص IP عند كتابة رقم الحساب
    if (accountNumberInput) {
        accountNumberInput.addEventListener('input', () => {
            // ابحث عن حاوية رسائل التنبيه الخاصة بالمعرفات وأخفها
            const specialIdentifierToast = document.getElementById('special-identifier-toast-container');
            if (specialIdentifierToast) {
                specialIdentifierToast.classList.remove('show');
            }
        });
    }

    // Setup auto-focus for admins
    setupFormAutoFocus(pageTitle);
    setupTemplatesFlyout();

    // Add all other listeners that depend on the form being ready
    form.addEventListener('paste', handleFormPaste);
    if (ipInput) {
        ipInput.addEventListener('input', debounce(() => handleIpLookup(ipInput), 300));
        ipInput.addEventListener('blur', () => handleIpLookup(ipInput));
        ipInput.addEventListener('input', updateFormState);
    }

    // Enter to focus next field (skip textareas and modifiers)
    form.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const target = e.target;
        if (!target || target.tagName === 'TEXTAREA') return; // keep Enter for textareas
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

// Regexes for extracting common data types
const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const accountNumberRegex = /\b\d{6,7}\b/; // Now supports 6 or 7 digit account numbers

/**
 * Handles universal paste events on the report form to automatically fill fields.
 * @param {ClipboardEvent} e - The paste event.
 */
async function handleFormPaste(e) {
    const form = e.currentTarget;
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    let handled = false;

    const ipInput = form.querySelector('#ip-input');
    const emailInput = form.querySelector('#report-email');
    const accountNumberInput = form.querySelector('#account-number');

    const focusedElement = document.activeElement;

    // Extract potential values from pasted text
    const extractedIp = pastedText.match(ipRegex)?.[0];
    const extractedEmail = pastedText.match(emailRegex)?.[0];
    const extractedAccountNumber = pastedText.match(accountNumberRegex)?.[0];

    // 1. Try to fill the currently focused field first if the pasted content matches its type
    if (focusedElement === ipInput && extractedIp && ipInput.value !== extractedIp) {
        ipInput.value = extractedIp;
        ipInput.dispatchEvent(new Event('input', { bubbles: true }));
        handled = true;
    } else if (focusedElement === emailInput && extractedEmail && emailInput.value !== extractedEmail) {
        emailInput.value = extractedEmail;
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        handled = true;
    } else if (focusedElement === accountNumberInput && extractedAccountNumber && accountNumberInput.value !== extractedAccountNumber) {
        accountNumberInput.value = extractedAccountNumber;
        accountNumberInput.dispatchEvent(new Event('input', { bubbles: true }));
        handled = true;
    }

    // 2. If not handled by focused field, or if no specific field was focused, try to fill all relevant fields
    if (!handled) {
        let fieldsPopulated = 0;

        if (ipInput && extractedIp && ipInput.value !== extractedIp) {
            ipInput.value = extractedIp;
            ipInput.dispatchEvent(new Event('input', { bubbles: true }));
            fieldsPopulated++;
        }
        if (emailInput && extractedEmail && emailInput.value !== extractedEmail) {
            emailInput.value = extractedEmail;
            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
            fieldsPopulated++;
        }
        if (accountNumberInput && extractedAccountNumber && accountNumberInput.value !== extractedAccountNumber) {
            accountNumberInput.value = extractedAccountNumber;
            accountNumberInput.dispatchEvent(new Event('input', { bubbles: true }));
            fieldsPopulated++;
        }
        if (fieldsPopulated > 0) { handled = true; showToast(`تم لصق ${fieldsPopulated} حقول من الحافظة.`); }
    }

    if (handled) e.preventDefault(); // Prevent default paste if we handled it
}

/**
 * Sets up the logic to automatically open the templates flyout for admins under specific conditions.
 * Now enabled for all users.
 */
function setupTemplatesFlyout() {
    const notesFields = document.querySelectorAll('#notes, #additional-notes');
    notesFields.forEach(textarea => {
        if (textarea) {
            textarea.addEventListener('focus', (e) => {
                // Do not open if:
                // 1. It was already opened in this session.
                // 2. A template was just inserted.
                // 3. The field already has text.
                if (wasOpenedThisSession || templateJustInserted || textarea.value.trim() !== '') {
                    return;
                }

                const flyout = document.getElementById('templates-flyout');
                const fabBtn = document.getElementById('templates-fab-btn');

                if (flyout && !flyout.classList.contains('open') && fabBtn) {
                    wasOpenedThisSession = true; // Mark as opened for this session
                    const templateInsertedHandler = () => {
                        templateJustInserted = true;
                        flyout.removeEventListener('templateInserted', templateInsertedHandler);
                    };
                    flyout.addEventListener('templateInserted', templateInsertedHandler);
                    fabBtn.click();
                }
            });
        }
    });
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

let isIpLookupInProgress = false;

async function handleIpLookup(ipInput) {
    if (isIpLookupInProgress) return;

    const form = ipInput.closest('form');
    if (!form) return;

    const ip = ipInput.value.trim();

    // Don't do anything if IP is empty
    if (!ip) {
        // Clear country info if IP is cleared
        const countryInput = form.querySelector('#country');
        const cityInput = form.querySelector('#city');
        const countryIcon = form.querySelector('#country-icon');
        if (countryInput) countryInput.value = '';
        if (cityInput) cityInput.value = '';
        if (countryIcon) {
            countryIcon.className = 'fas fa-globe';
            countryIcon.innerHTML = '';
        }
        return;
    }

    const countryInput = form.querySelector('#country');
    const cityInput = form.querySelector('#city');
    const countryIcon = form.querySelector('#country-icon');

    if (!countryInput || !cityInput || !countryIcon) return;

    const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;
    const match = ip.match(ipRegex);
    const extractedIp = match ? match[0] : null;

    // If no valid IP is found, don't proceed
    if (!extractedIp) {
        countryInput.value = 'IP غير صالح';
        countryIcon.className = 'fas fa-exclamation-triangle';
        countryIcon.innerHTML = '';
        return;
    }

    countryInput.value = "جاري البحث...";
    countryIcon.className = 'fas fa-spinner fa-spin';
    countryIcon.innerHTML = '';

    // Check if the extracted IP is in the special identifiers list
    checkSpecialIdentifier(extractedIp, 'ip');

    try {
        isIpLookupInProgress = true;
        const response = await fetch(`https://ipwhois.app/json/${extractedIp}`);
        const data = await response.json();
        if (data.success) {
            const displayValue = data.country;
            countryInput.value = displayValue;
            cityInput.value = ''; // Do not store city
            countryIcon.className = 'fas fa-globe';
            countryIcon.innerHTML = `<img src="${data.country_flag}" alt="${data.country_code}" style="width: 20px; height: auto;">`;
            // Manually trigger a change event so other listeners (like transfer rules) can react
            countryInput.dispatchEvent(new Event('change', { bubbles: true }));

            // Admin Auto-Focus: Move to the next field after successful lookup
            const nextFieldId = form.dataset.nextFieldAfterIp;
            if (nextFieldId) {
                const nextField = form.querySelector(`#${nextFieldId}`);
                if (nextField) {
                    setTimeout(() => { // Use timeout to ensure other events complete
                        nextField.focus();
                        nextField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 50);
                }
            }
        } else {
            throw new Error(data.message || 'Invalid IP address');
        }
    } catch (error) {
        countryInput.value = 'فشل البحث';
        countryIcon.className = 'fas fa-exclamation-triangle';
        countryIcon.innerHTML = '';
    } finally {
        isIpLookupInProgress = false;
        updateFormState(); // تحديث حالة الأزرار بعد انتهاء البحث
    }
}

// Handle IP Lookup for Bulk Forms
async function handleBulkIpLookup(ipInput, countryInput, countryIcon) {
    if (!ipInput || !countryInput || !countryIcon) return;

    const ip = ipInput.value.trim();

    // Don't do anything if IP is empty
    if (!ip) {
        countryInput.value = '';
        countryIcon.className = 'fas fa-globe bulk-country-icon';
        countryIcon.innerHTML = '';
        return;
    }

    const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;
    const match = ip.match(ipRegex);
    const extractedIp = match ? match[0] : null;

    // If no valid IP is found, don't proceed
    if (!extractedIp) {
        countryInput.value = 'IP غير صالح';
        countryIcon.className = 'fas fa-exclamation-triangle bulk-country-icon';
        countryIcon.innerHTML = '';
        return;
    }

    // Clean the IP input - keep only the extracted IP
    ipInput.value = extractedIp;

    countryInput.value = "جاري البحث...";
    countryIcon.className = 'fas fa-spinner fa-spin bulk-country-icon';
    countryIcon.innerHTML = '';

    try {
        const response = await fetch(`https://ipwhois.app/json/${extractedIp}`);
        const data = await response.json();
        if (data.success) {
            const displayValue = data.country;
            countryInput.value = displayValue;
            countryIcon.className = 'bulk-country-icon';
            countryIcon.innerHTML = `<img src="${data.country_flag}" alt="${data.country_code}" style="width: 24px; height: auto; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">`;
            
            // Auto-focus to email field after successful lookup
            const form = ipInput.closest('form');
            if (form) {
                const emailInput = form.querySelector('.bulk-email-input');
                if (emailInput) {
                    setTimeout(() => {
                        emailInput.focus();
                        emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                }
            }
        } else {
            throw new Error(data.message || 'Invalid IP address');
        }
    } catch (error) {
        countryInput.value = 'فشل البحث';
        countryIcon.className = 'fas fa-exclamation-triangle bulk-country-icon';
        countryIcon.innerHTML = '';
    }
}

async function openTemplatesModalForInsert(targetTextarea) {
    const modal = document.getElementById('templates-inserter-modal');
    const listContainer = document.getElementById('templates-inserter-list');
    const searchInput = document.getElementById('template-inserter-search');
    if (!modal || !listContainer || !searchInput) return;

    listContainer.innerHTML = '<div class="spinner"></div>';
    modal.classList.add('show');

    try {
        const response = await fetchWithAuth('/api/templates');
        const templates = response.data || [];

        const renderList = (filteredTemplates) => {
            if (filteredTemplates.length === 0) {
                listContainer.innerHTML = '<p>لا توجد قوالب مطابقة.</p>';
                return;
            }
            listContainer.innerHTML = '';
            filteredTemplates.forEach(template => {
                const item = document.createElement('div');
                item.className = 'template-inserter-item';
                item.innerHTML = `<div class="template-inserter-title">${template.title}</div>`;
                item.addEventListener('click', () => {
                    const currentVal = targetTextarea.value;
                    // Append the new content, adding a newline if there's existing content.
                    const separator = currentVal.trim().length > 0 ? '\n' : '';
                    targetTextarea.value = currentVal + separator + template.content;
                    targetTextarea.dispatchEvent(new Event('input', { bubbles: true })); // To trigger form state updates
                    modal.classList.remove('show');
                });
                listContainer.appendChild(item);
            });
        };

        renderList(templates);

        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const filtered = templates.filter(t => t.title.toLowerCase().includes(searchTerm) || t.content.toLowerCase().includes(searchTerm));
            renderList(filtered);
        });

    } catch (error) {
        showToast('فشل تحميل القوالب.', true);
        listContainer.innerHTML = '<p>حدث خطأ.</p>';
    }
}

document.addEventListener('click', (e) => {
    if (e.target.matches('[data-action="open-templates-modal"]')) {
        const wrapper = e.target.closest('.notes-field-wrapper');
        if (wrapper) {
            const textarea = wrapper.querySelector('textarea');
            if (textarea) {
                openTemplatesModalForInsert(textarea);
            }
        }
    }
});

document.getElementById('templates-inserter-close-btn')?.addEventListener('click', () => {
    document.getElementById('templates-inserter-modal').classList.remove('show');
});

export function renderBulkDepositReportPage() {
    return createBulkDepositReportPageHTML();
}

export function initBulkDepositReportPage() {
    const bulkDataEl = document.getElementById('bulk-data');
    const cardsContainer = document.getElementById('bulk-cards-container');
    const sendAllBtn = document.getElementById('send-all-bulk');
    const summaryEl = document.getElementById('bulk-summary');
    const countEl = document.getElementById('bulk-count');

    if (!bulkDataEl || !cardsContainer) return;

    // Auto parse on input (debounced)
    const debouncedProcess = debounce(() => {
        const rawData = bulkDataEl.value;
        if (!rawData.trim()) return;
        
        const reportsData = parseBulkDepositData(rawData);
        
        // Filter and keep only account numbers with their margin percentages
        const filteredText = reportsData.map(r => {
            const margin = r.marginPercentage ? r.marginPercentage : '';
            return `${r.accountNumber} ${margin}`;
        }).join('\n');
        
        // Update textarea with filtered data
        if (filteredText !== bulkDataEl.value) {
            bulkDataEl.value = filteredText;
        }
        
        renderBulkDepositReportForms(reportsData, cardsContainer);
        if (summaryEl && countEl) {
            countEl.textContent = String(reportsData.length);
            summaryEl.style.display = reportsData.length > 0 ? 'flex' : 'none';
        }
        if (sendAllBtn) {
            sendAllBtn.disabled = reportsData.length === 0;
            sendAllBtn.onclick = async () => {
                if (reportsData.length === 0) { showToast('لا توجد حسابات لإرسالها.', true); return; }
                await sendAllBulkReports(reportsData);
            };
        }
    }, 400);

    bulkDataEl.addEventListener('input', debouncedProcess);
    bulkDataEl.addEventListener('paste', () => setTimeout(debouncedProcess, 60));

    // Removed manual process button; parsing is automatic.
}

function createBulkDepositReportPageHTML() {
    return `
    <div class="report-form-page-container">
        <div class="page-header">
            <h1 class="page-title">إنشاء تقارير إيداع مجمعة</h1>
            <p class="page-subtitle">الصق بيانات التداول ليتم تقسيمها إلى بطاقات تقارير فردية.</p>
        </div>
        <div class="form-container">
            <div class="form-group">
                <label for="bulk-data">بيانات التداول الخام</label>
                <textarea id="bulk-data" name="bulk-data" rows="15" placeholder="الصق البيانات هنا... يتم الفصل بين كل عميل بناءً على رقم الحساب (7 أرقام)."></textarea>
            </div>
            <div id="bulk-summary" class="bulk-summary" style="display:none;">
                <span class="summary-label"><i class="fas fa-users"></i> إجمالي الحسابات:</span>
                <span id="bulk-count" class="summary-count-badge">0</span>
            </div>
            <div id="bulk-cards-container" class="bulk-cards-container">
                <!-- Report cards will be injected here -->
            </div>
            
            <!-- Send All Button -->
            <div class="send-all-container">
                <button type="button" id="send-all-bulk" class="send-all-btn" disabled>
                    <i class="fas fa-paper-plane"></i>
                    إرسال جميع الحسابات للجروب
                </button>
            </div>
        </div>
    </div>
    <style>
        .bulk-summary {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            margin: 10px 0 0;
            border: 1px solid var(--border-color);
            border-radius: 10px;
            background: var(--background-color-offset);
        }
        .bulk-summary .summary-label {
            color: var(--text-color);
            font-weight: 600;
        }
        .bulk-summary .summary-count-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 36px;
            height: 28px;
            padding: 0 10px;
            border-radius: 999px;
            background: var(--primary-color);
            color: #fff;
            font-weight: 700;
        }
        .send-all-container {
            margin: 30px auto 20px;
            max-width: 400px;
            text-align: center;
        }
        
        .send-all-btn {
            background: linear-gradient(135deg, var(--primary-color), #0056b3);
            color: white;
            border: none;
            padding: 16px 32px;
            border-radius: 50px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 8px 20px rgba(0, 123, 255, 0.4);
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            min-width: 280px;
            justify-content: center;
        }
        
        .send-all-btn:hover:not(:disabled) {
            transform: translateY(-3px);
            box-shadow: 0 12px 28px rgba(0, 123, 255, 0.5);
            background: linear-gradient(135deg, #0056b3, var(--primary-color));
        }
        
        .send-all-btn:active:not(:disabled) {
            transform: translateY(-1px);
        }
        
        .send-all-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
            opacity: 0.6;
        }
        
        .send-all-btn i {
            font-size: 1.1rem;
        }
        
        .bulk-cards-container {
            margin-top: 1.5rem;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
            gap: 1.5rem;
            padding: 0.5rem;
        }
        .bulk-report-card {
            border: 2px solid var(--border-color);
            border-inline-start: 6px solid var(--card-accent, var(--primary-color));
            border-radius: 12px;
            padding: 1.25rem;
            background: linear-gradient(180deg, var(--background-color-offset), rgba(0,0,0,0.02));
            box-shadow: 0 3px 8px rgba(0,0,0,0.08);
            display: flex;
            flex-direction: column;
            gap: 0.85rem;
            transition: all .2s ease;
            cursor: pointer;
            position: relative;
            margin-bottom: 3.5rem;
        }
        .bulk-cards-container .bulk-report-card:nth-child(odd) { --card-accent: #0d6efd; }
        .bulk-cards-container .bulk-report-card:nth-child(even) { --card-accent: #20c997; }
        .bulk-report-card::after {
            content: '';
            position: absolute;
            bottom: -1.75rem;
            left: 50%;
            transform: translateX(-50%);
            width: 70%;
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--border-color) 15%, var(--card-accent, var(--primary-color)) 50%, var(--border-color) 85%, transparent);
            opacity: 0.8;
        }
        .bulk-report-card::before {
            content: '◆';
            position: absolute;
            bottom: -1.95rem;
            left: 50%;
            transform: translateX(-50%);
            color: var(--card-accent, var(--primary-color));
            font-size: 0.8rem;
            z-index: 1;
        }
        .bulk-card-index-badge {
            position: absolute;
            top: 10px;
            inset-inline-end: 10px;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--card-accent, var(--primary-color));
            color: #fff;
            font-weight: 800;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            border: 2px solid #fff1;
        }
        .bulk-report-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.12);
        }
        .bulk-report-card.selected {
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px var(--primary-color-translucent), 0 5px 20px rgba(0,0,0,0.15);
            background: linear-gradient(to bottom, var(--primary-color-translucent) 0%, var(--background-color-offset) 100%);
        }
        .bulk-report-card h3 {
            margin: 0 0 0.75rem;
            font-size: 1.15rem;
            font-weight: 700;
            color: var(--primary-color);
            display: flex;
            align-items: center;
            gap: 8px;
            padding-bottom: 0.75rem;
            border-bottom: 2px solid var(--border-color);
        }
        .bulk-report-card h3 code {
            font-size: 1rem;
            background: var(--primary-color);
            color: #fff;
            padding: 4px 10px;
            border-radius: 6px;
            font-weight: 600;
        }
        .bulk-report-card form {
            display: grid;
            grid-template-columns: 1fr;
            gap: 0.75rem;
        }
        .bulk-report-card .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
        }
        .bulk-report-card .form-row.single-column {
            grid-template-columns: 1fr;
        }
        .bulk-report-card .form-group {
            margin: 0;
        }
        .bulk-report-card .form-group.full-width {
            grid-column: 1 / -1;
        }
        .bulk-report-card label {
            font-size: 0.8rem;
            font-weight: 600;
            margin-bottom: 6px;
            display: block;
            color: var(--text-color);
        }
        .bulk-report-card input[type=text],
        .bulk-report-card input[type=email],
        .bulk-report-card textarea {
            font-size: 0.9rem;
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
            width: 100%;
            transition: border-color .2s ease;
        }
        .bulk-report-card input[type=text]:focus,
        .bulk-report-card input[type=email]:focus,
        .bulk-report-card textarea:focus {
            border-color: var(--primary-color);
            outline: none;
            box-shadow: 0 0 0 3px var(--primary-color-translucent);
        }
        .bulk-report-card textarea {
            min-height: 60px;
            resize: vertical;
        }
        .bulk-report-card .segmented-control {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 5px;
            margin-top: 5px;
        }
        .bulk-report-card .segmented-control input {
            display: none;
        }
        .bulk-report-card .segmented-control label {
            background: var(--background-color);
            border: 1.5px solid var(--border-color);
            padding: 6px 0;
            text-align: center;
            font-size: 0.75rem;
            cursor: pointer;
            border-radius: 8px;
            font-weight: 500;
            transition: all .2s ease;
        }
        .bulk-report-card .segmented-control label:hover {
            background: var(--primary-color-translucent);
        }
        .bulk-report-card .segmented-control input:checked + label {
            background: var(--primary-color);
            color: #fff;
            border-color: var(--primary-color);
            font-weight: 600;
        }
        .bulk-report-card .upload-area {
            font-size: 0.75rem;
            padding: 1rem;
            border: 2px dashed var(--border-color);
            border-radius: 10px;
            text-align: center;
            color: var(--text-color-secondary);
            background: var(--background-color);
            transition: all .2s ease;
            cursor: pointer;
        }
        .bulk-report-card .upload-area:hover {
            border-color: var(--primary-color);
            background: var(--primary-color-translucent);
        }
        .bulk-report-card .upload-area.dragover {
            background: var(--primary-color);
            color: #fff;
            border-color: var(--primary-color);
        }
        .bulk-report-card .image-previews {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 8px;
        }
        .bulk-report-card .img-preview-container {
            position: relative;
            width: 80px;
            height: 80px;
            border-radius: 10px;
            overflow: hidden;
            border: 2px solid var(--border-color);
        }
        .bulk-report-card .img-preview-container.loading {
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--background-color);
            font-size: 0.7rem;
        }
        .bulk-report-card .img-preview {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .bulk-report-card .remove-img-btn {
            position: absolute;
            top: 4px;
            right: 4px;
            background: rgba(220, 53, 69, 0.9);
            color: #fff;
            border: none;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            font-size: 0.75rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all .2s ease;
        }
        .bulk-report-card .remove-img-btn:hover {
            background: rgba(220, 53, 69, 1);
            transform: scale(1.1);
        }
        .bulk-report-card .submit-btn {
            font-size: 0.85rem;
            padding: 10px 16px;
            border-radius: 8px;
            font-weight: 600;
            margin-top: 0.5rem;
        }
        .bulk-report-card code {
            font-size: 0.8rem;
        }
        .bulk-report-card .ip-group {
            position: relative;
        }
        .bulk-report-card .bulk-country-icon {
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            pointer-events: none;
            z-index: 1;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .bulk-report-card .form-group > div[style*="position:relative"] {
            position: relative;
        }
        .bulk-report-card .bulk-country-input {
            padding-left: 35px !important;
            font-weight: 600;
            color: var(--text-color);
        }
        .bulk-report-card .bulk-ip-input {
            padding-right: 32px !important; /* مساحة لزر × */
            direction: ltr;
            text-align: left;
        }
        .bulk-report-card .clear-ip-btn {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            background: var(--danger-color);
            color: #fff;
            border: none;
            border-radius: 50%;
            width: 22px;
            height: 22px;
            font-size: 1rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.8;
            transition: opacity .2s ease;
            z-index: 2;
        }
        .bulk-report-card .clear-ip-btn:hover {
            opacity: 1;
        }
        .bulk-report-card .clear-ip-btn.hidden {
            display: none;
        }
    </style>
    `;
}

function parseBulkDepositData(rawData) {
    const reports = [];
    const accountRegex = /\b\d{6,7}\b/g;
    
    const matches = [...rawData.matchAll(accountRegex)];
    if (matches.length === 0) return [];

    for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const nextMatch = matches[i + 1];

        const accountNumber = currentMatch[0];
        const startIndex = currentMatch.index;
        const endIndex = nextMatch ? nextMatch.index : rawData.length;
        
        const chunk = rawData.substring(startIndex, endIndex);

        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;
        
        // Extract margin percentage
        let marginPercentage = '';
        
        // Check if this is already filtered data (format: "accountNumber marginPercentage")
        const filteredPattern = /^\d{6,7}\s+(\d+\.?\d*)$/;
        const filteredMatch = chunk.trim().match(filteredPattern);
        
        if (filteredMatch) {
            // Already filtered, just extract the margin
            marginPercentage = filteredMatch[1];
            console.log(`Pre-filtered - Account: ${accountNumber}, Margin: ${marginPercentage}`);
        } else {
            // Raw data - need to parse
            const lines = chunk.trim().split(/\r?\n/).filter(line => line.trim());
            
            console.log(`\n=== Analyzing Account ${accountNumber} ===`);
            console.log('Chunk length:', chunk.length);
            
            // Find all decimal numbers in the chunk
            const decimalPattern = /\b(\d+\.\d+)\b/g;
            const decimalMatches = [...chunk.matchAll(decimalPattern)];
            const decimalNumbers = decimalMatches.map(m => parseFloat(m[1]));
            
            console.log('Decimal numbers found:', decimalNumbers);
            
            // Strategy 1: Look for number with % sign
            const percentPattern = /(\d+\.?\d*)\s*%/g;
            const percentMatches = [...chunk.matchAll(percentPattern)];
            
            if (percentMatches.length > 0) {
                const percentValues = percentMatches.map(m => parseFloat(m[1]));
                console.log('Percent values found:', percentValues);
                
                const validMargins = percentValues.filter(v => v >= 0 && v <= 500);
                if (validMargins.length > 0) {
                    marginPercentage = validMargins[0].toString();
                    console.log('Selected margin from %:', marginPercentage);
                }
            }
            
            // Strategy 2: Look at decimal numbers
            if (!marginPercentage && decimalNumbers.length > 0) {
                const likelyMargins = decimalNumbers.filter(n => n >= 0 && n <= 200 && n % 1 !== 0);
                console.log('Likely margin candidates:', likelyMargins);
                
                if (likelyMargins.length > 0) {
                    const positiveDecimals = decimalNumbers.filter(n => n > 0 && n < 200);
                    if (positiveDecimals.length >= 4) {
                        marginPercentage = positiveDecimals[3].toString();
                        console.log('Selected margin (4th positive decimal):', marginPercentage);
                    } else if (likelyMargins.length > 0) {
                        marginPercentage = likelyMargins[likelyMargins.length - 1].toString();
                        console.log('Selected margin (last likely):', marginPercentage);
                    }
                }
            }

            console.log(`Final - Account: ${accountNumber}, Margin: ${marginPercentage}`);
        }

        const emailMatch = chunk.match(emailRegex);
        const ipMatch = chunk.match(ipRegex);

        reports.push({
            accountNumber: accountNumber,
            email: emailMatch ? emailMatch[0] : '',
            ip: ipMatch ? ipMatch[0] : '',
            marginPercentage: marginPercentage
        });
    }
    
    return reports;
}

function renderBulkReportCards(reportsData, container) {
    container.innerHTML = '';
    if (reportsData.length === 0) {
        showToast('لم يتم العثور على أرقام حسابات صالحة.', true);
        return;
    }

    reportsData.forEach((data, index) => {
        const card = document.createElement('div');
        card.className = 'bulk-report-card';
        card.innerHTML = `
            <h3>الحساب: <code>${data.accountNumber}</code></h3>
            <p><strong>الإيميل:</strong> ${data.email ? `<code>${data.email}</code>` : 'لم يتم العثور عليه'}</p>
            <p><strong>IP:</strong> ${data.ip ? `<code>${data.ip}</code>` : 'لم يتم العثور عليه'}</p>
            <div class="form-actions" style="margin-top: 1rem; padding: 0;">
                <button type="button" class="submit-btn create-report-from-bulk-btn" data-index="${index}">إنشاء تقرير</button>
            </div>
        `;
        container.appendChild(card);
    });

    // Event delegation for better performance
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.create-report-from-bulk-btn');
        if (!btn) return;
        const index = btn.dataset.index;
        const reportData = reportsData[index];
        if (!reportData) return;
        sessionStorage.setItem('prefillData', JSON.stringify(reportData));
        window.location.hash = '#reports/deposit';
    });
}

// Send all bulk cards as individual reports with delay to avoid Telegram rate limits
async function sendAllBulkReports(reportsData) {
    try {
        // Get all forms to extract complete data including images
        const forms = document.querySelectorAll('form.bulk-report-form');

        // Validate all forms first
        let invalidForms = [];
        forms.forEach((form, index) => {
            if (!form.checkValidity()) {
                const accountNumber = form.querySelector('.bulk-account-input')?.value.trim() || `${index + 1}`;
                invalidForms.push(accountNumber);
            }
        });

        if (invalidForms.length > 0) {
            showToast(`يرجى ملء جميع الحقول المطلوبة للحسابات: ${invalidForms.join(', ')}`, true);
            return;
        }

        let successCount = 0;
        let failCount = 0;

        // Show progress toast
        showToast(`جاري إرسال ${forms.length} حساب...`, false);

        // Use 3 seconds between messages
        const delayMs = 3000;

        // Send a preface text message indicating how many reports will be sent
        try {
            const introText = `تنبيه: سيتم إرسال ${forms.length} تقرير إيداع الآن.`;
            const introFormData = new FormData();
            introFormData.append('report_text', introText);
            introFormData.append('type', 'bulk_deposit_percentages');
            introFormData.append('skip_archive', 'true');
            await fetchWithAuth('/api/reports', { method: 'POST', body: introFormData });
            // Small delay before starting to send reports
            await new Promise(resolve => setTimeout(resolve, delayMs));
        } catch (err) {
            console.error('Failed to send intro message:', err);
        }

        // Send each account separately
        for (let i = 0; i < forms.length; i++) {
            const form = forms[i];
            let accountNumber = 'غير معروف';
            let reportText = '';

            try {
                // Extract data from form
                const ip = form.querySelector('.bulk-ip-input')?.value.trim() || 'غير محدد';
                const countryRaw = form.querySelector('.bulk-country-input')?.value.trim() || 'غير محدد';
                const [country] = countryRaw.split(' | ');
                const email = form.querySelector('.bulk-email-input')?.value.trim() || 'غير محدد';
                accountNumber = form.querySelector('.bulk-account-input')?.value.trim() || 'غير محدد';
                let marginPercentage = form.querySelector('.bulk-margin-input')?.value.trim() || 'N/A';

                // Add % if not present
                if (marginPercentage && marginPercentage !== 'N/A' && !marginPercentage.endsWith('%')) {
                    marginPercentage += '%';
                }

                const floating = form.querySelector("input[name^='floating-profit-status']:checked")?.value || 'موجب';
                const ipMatch = form.querySelector("input[name^='ip-match-status']:checked")?.value || 'مطابق';
                const bonus = form.querySelector("input[name^='bonus-status']:checked")?.value || 'غير محظور من البونص';
                const notes = form.querySelector('textarea[name="additional-notes"]')?.value.trim();

                // Build report text in the requested format
                let body = `ip country: ${country}\nIP: ${ip}\nالإيميل: ${email}\nرقم الحساب: ${accountNumber}\nنسبة الهامش: ${marginPercentage}\n\nالأرباح للصفقات العائمة (${floating})\nالـ IP الأخير (${ipMatch}) لبلد التسجيل، العميل ${bonus}`;

                if (notes) {
                    body += `\n\nملاحظات إضافية: ${notes}`;
                }

                reportText = `تقرير Deposit Report\n\n${body}\n\n#deposit_percentages`;

                // Create FormData with images
                const formData = new FormData();
                formData.append('report_text', reportText);
                formData.append('type', 'bulk_deposit_percentages');

                // Add images for this specific form
                const files = bulkFormFilesMap.get(form.id) || [];
                files.forEach(f => formData.append('images', f.file, f.originalName));

                // Send the report
                await fetchWithAuth('/api/reports', { method: 'POST', body: formData });
                successCount++;
                console.log(`✅ Account ${i + 1} sent successfully:`, accountNumber);

                // Delay between requests to respect Telegram rate limits (3 seconds)
                if (i < forms.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }

            } catch (err) {
                console.error(`❌ Failed to send account ${i + 1} (${accountNumber}):`, err);
                console.error('Error details:', {
                    message: err.message,
                    stack: err.stack,
                    accountNumber,
                    reportText: reportText.substring(0, 200)
                });
                failCount++;
            }
        }

        // Show final result
        if (failCount === 0) {
            showToast(`تم إرسال جميع الحسابات بنجاح (${successCount} حساب) ✅`);

            // Clear everything after successful send (like refresh)
            setTimeout(() => {
                // Clear the bulk data textarea
                const bulkDataEl = document.getElementById('bulk-data');
                if (bulkDataEl) bulkDataEl.value = '';

                // Clear all cards
                const cardsContainer = document.getElementById('bulk-cards-container');
                if (cardsContainer) cardsContainer.innerHTML = '';
                // Reset summary
                const summaryEl = document.getElementById('bulk-summary');
                const countEl = document.getElementById('bulk-count');
                if (summaryEl && countEl) {
                    countEl.textContent = '0';
                    summaryEl.style.display = 'none';
                }

                // Clear the files map
                bulkFormFilesMap.clear();

                // Disable send all button
                const sendAllBtn = document.getElementById('send-all-bulk');
                if (sendAllBtn) sendAllBtn.disabled = true;

                showToast('تم تنظيف الصفحة، يمكنك البدء من جديد! 🔄', false);
            }, 1500);
        } else {
            showToast(`تم إرسال ${successCount} حساب بنجاح، فشل ${failCount} حساب`, true);
        }

    } catch (error) {
        console.error('Failed to send bulk reports:', error);
        showToast(error.message || 'فشل إرسال التقارير.', true);
    }
}

// ---- New: Full per-account deposit report forms on bulk page ----
function renderBulkDepositReportForms(reportsData, container) {
    container.innerHTML = '';
    if (!reportsData || reportsData.length === 0) {
        return;
    }
    const formsFragment = document.createDocumentFragment();
    reportsData.forEach((data, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'bulk-report-card';
        wrapper.setAttribute('data-index', String(index + 1));
        wrapper.innerHTML = `
            <div class="bulk-card-index-badge" title="ترتيب الحساب">${index + 1}</div>
            <h3>الحساب: <code class="clickable-account" data-account="${data.accountNumber}" title="اضغط للنسخ" style="cursor: pointer; user-select: none;">${data.accountNumber}</code></h3>
            <form class="bulk-report-form" data-account="${data.accountNumber}" id="bulk-form-${index}">
                <!-- IP and Country in one row -->
                <div class="form-row">
                    <div class="form-group ip-group">
                        <label>IP Address <span style="color: var(--danger-color);">*</span></label>
                        <div style="position:relative;">
                            <input type="text" name="ip" class="bulk-ip-input" placeholder="الصق الـ IP" autocomplete="off" value="${data.ip || ''}" required dir="ltr">
                            <button type="button" class="clear-ip-btn hidden" title="مسح">&times;</button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>ip country <span style="color: var(--danger-color);">*</span></label>
                        <div style="position:relative;">
                            <input type="text" name="country" class="bulk-country-input" readonly placeholder="سيتم تحديدها تلقائياً...">
                            <i class="fas fa-globe bulk-country-icon"></i>
                        </div>
                        <input type="hidden" name="city" class="bulk-city-input">
                    </div>
                </div>
                
                <!-- Account Number and Email in one row -->
                <div class="form-row">
                    <div class="form-group">
                        <label>رقم الحساب <span style="color: var(--danger-color);">*</span></label>
                        <input type="text" name="account-number" class="bulk-account-input" required value="${data.accountNumber}">
                    </div>
                    <div class="form-group">
                        <label>البريد الإلكتروني <span style="color: var(--danger-color);">*</span></label>
                        <input type="email" name="email" class="bulk-email-input" required value="${data.email || ''}">
                    </div>
                </div>
                
                <!-- Margin Percentage in one row -->
                <div class="form-row">
                    <div class="form-group">
                        <label>نسبة الهامش <span style="color: var(--danger-color);">*</span></label>
                        <input type="text" name="margin-percentage" class="bulk-margin-input" placeholder="مثال: 78.21" required pattern="[0-9]+(\.[0-9]{1,2})?%?" data-pattern-error="الرجاء إدخال نسبة الهامش كرقم صحيح أو عشري (مثال: 78.21)." value="${data.marginPercentage || ''}">
                    </div>
                </div>
                
                <!-- Floating Profit Status and IP Match Status in one row -->
                <div class="form-row">
                    <div class="form-group">
                        <label>حالة الأرباح العائمة <span style="color: var(--danger-color);">*</span></label>
                        <div class="segmented-control">
                            <input type="radio" name="floating-profit-status-${index}" value="موجب" id="floating-positive-${index}" checked>
                            <label for="floating-positive-${index}">موجب</label>
                            <input type="radio" name="floating-profit-status-${index}" value="سالب" id="floating-negative-${index}">
                            <label for="floating-negative-${index}">سالب</label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>حالة الـ IP الأخير <span style="color: var(--danger-color);">*</span></label>
                        <div class="segmented-control">
                            <input type="radio" name="ip-match-status-${index}" value="مطابق" id="ip-match-${index}" checked>
                            <label for="ip-match-${index}">مطابق</label>
                            <input type="radio" name="ip-match-status-${index}" value="غير مطابق" id="ip-nomatch-${index}">
                            <label for="ip-nomatch-${index}">غير مطابق</label>
                        </div>
                    </div>
                </div>
                
                <!-- Bonus Status in one row -->
                <div class="form-row">
                    <div class="form-group">
                        <label>حالة البونص <span style="color: var(--danger-color);">*</span></label>
                        <div class="segmented-control">
                            <input type="radio" name="bonus-status-${index}" value="غير محظور من البونص" id="bonus-allowed-${index}" checked>
                            <label for="bonus-allowed-${index}">غير محظور</label>
                            <input type="radio" name="bonus-status-${index}" value="محظور من البونص" id="bonus-blocked-${index}">
                            <label for="bonus-blocked-${index}">محظور</label>
                        </div>
                    </div>
                </div>
                
                <!-- Additional Notes -->
                <div class="form-group full-width">
                    <div class="notes-field-wrapper">
                        <label>ملاحظات إضافية (اختياري)</label>
                        <textarea name="additional-notes" class="clickable-notes" rows="2" placeholder="اكتب ملاحظاتك الإضافية هنا..." title="اضغط للنسخ" style="cursor: pointer;"></textarea>
                    </div>
                </div>
                
                <!-- Upload Images -->
                <div class="form-group full-width">
                    <label>رفع صور (3 كحد أقصى)</label>
                    <div class="upload-area" data-upload-area>الصق الصور أو اسحبها هنا</div>
                    <div class="image-previews" data-image-previews></div>
                </div>
                
                <div class="form-actions">
                    <button type="submit" class="submit-btn">إرسال التقرير</button>
                </div>
            </form>
        `;
        formsFragment.appendChild(wrapper);
    });
    container.appendChild(formsFragment);
    initBulkFormsBehavior(container);
}

const bulkFormFilesMap = new Map();
let selectedBulkFormId = null;

function initBulkFormsBehavior(container) {
    const forms = container.querySelectorAll('form.bulk-report-form');

    // Copy account number on click
    container.addEventListener('click', (e) => {
        if (e.target.classList.contains('clickable-account')) {
            const accountNum = e.target.getAttribute('data-account');
            if (accountNum) {
                navigator.clipboard.writeText(accountNum).then(() => {
                    showToast(`تم نسخ رقم الحساب: ${accountNum}`);
                }).catch(err => {
                    console.error('Failed to copy:', err);
                });
            }
            return;
        }
        
        // Copy notes on click
        if (e.target.classList.contains('clickable-notes') && e.target.value.trim()) {
            const notesText = e.target.value.trim();
            navigator.clipboard.writeText(notesText).then(() => {
                showToast(`تم نسخ الملاحظات`);
            }).catch(err => {
                console.error('Failed to copy notes:', err);
            });
            return;
        }
    });

    // Selection highlight logic
    container.addEventListener('click', (e) => {
        const card = e.target.closest('.bulk-report-card');
        if (!card) return;
        container.querySelectorAll('.bulk-report-card.selected').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const formEl = card.querySelector('form.bulk-report-form');
        selectedBulkFormId = formEl ? formEl.id : null;
    });
    
    // Enter to move to next field inside bulk forms (skip textareas and modifiers)
    container.addEventListener('keydown', (e) => {
        if (!e.target.closest('form.bulk-report-form')) return;
        if (e.key !== 'Enter') return;
        const target = e.target;
        if (!target || target.tagName === 'TEXTAREA') return;
        if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        const currentForm = target.closest('form.bulk-report-form');
        const focusables = Array.from(currentForm.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'));
        const idx = focusables.indexOf(target);
        if (idx > -1) {
            const next = focusables[idx + 1] || focusables[0];
            next && next.focus();
        }
    });
    forms.forEach(form => {
        bulkFormFilesMap.set(form.id, []);
        const ipInput = form.querySelector('.bulk-ip-input');
        const countryInput = form.querySelector('.bulk-country-input');
        const countryIcon = form.querySelector('.bulk-country-icon');
        const clearIpBtn = form.querySelector('.clear-ip-btn');
        const uploadArea = form.querySelector('[data-upload-area]');
        const previews = form.querySelector('[data-image-previews]');
        const emailInput = form.querySelector('.bulk-email-input');

        // Sanitize email field to keep only the first valid email address
        if (emailInput) {
            const sanitize = () => {
                const val = emailInput.value || '';
                const m = val.match(emailRegex);
                if (m) emailInput.value = m[0];
            };
            emailInput.addEventListener('input', sanitize);
            emailInput.addEventListener('blur', sanitize);
            emailInput.addEventListener('paste', () => setTimeout(sanitize, 0));
        }

        if (ipInput && countryInput) {
            const runLookup = debounce(() => handleBulkIpLookup(ipInput, countryInput, countryIcon), 300);
            ipInput.addEventListener('input', () => {
                if (clearIpBtn) clearIpBtn.classList.toggle('hidden', ipInput.value.length === 0);
                runLookup();
            });
            ipInput.addEventListener('blur', () => handleBulkIpLookup(ipInput, countryInput, countryIcon));
            
            // Auto-lookup if IP is already filled
            if (ipInput.value.trim() && !countryInput.value.trim()) {
                handleBulkIpLookup(ipInput, countryInput, countryIcon);
            }
        }
        if (clearIpBtn) {
            clearIpBtn.addEventListener('click', () => {
                ipInput.value = '';
                countryInput.value = '';
                if (countryIcon) {
                    countryIcon.className = 'fas fa-globe bulk-country-icon';
                    countryIcon.innerHTML = '';
                }
                clearIpBtn.classList.add('hidden');
                ipInput.focus();
            });
        }

        // Image handling via shared helper
        const handleFiles = (files) => handleFilesForBulkForm(form, files, previews);

        if (uploadArea) {
            uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
            uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
            uploadArea.addEventListener('drop', e => { e.preventDefault(); uploadArea.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
            uploadArea.addEventListener('paste', e => { handleFiles(e.clipboardData.files); });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const marginEl = form.querySelector('.bulk-margin-input');
            if (marginEl && marginEl.value && !marginEl.value.endsWith('%')) marginEl.value += '%';
            if (!form.checkValidity()) { form.reportValidity(); return; }
            const submitBtn = form.querySelector('.submit-btn');
            submitBtn.disabled = true; submitBtn.innerText = 'جاري الإرسال...';
            try {
                const ip = form.querySelector('.bulk-ip-input')?.value.trim() || 'غير محدد';
                const countryRaw = form.querySelector('.bulk-country-input')?.value.trim() || 'غير محدد';
                const [country] = countryRaw.split(' | ');
                const email = form.querySelector('.bulk-email-input')?.value.trim() || 'غير محدد';
                const accountNumber = form.querySelector('.bulk-account-input')?.value.trim() || 'غير محدد';
                const marginPercentage = form.querySelector('.bulk-margin-input')?.value.trim() || 'N/A';
                const floating = form.querySelector("input[name^=\"floating-profit-status\"]:checked")?.value || "????";
                const ipMatch = form.querySelector("input[name^=\"ip-match-status\"]:checked")?.value || "?????";
                const bonus = form.querySelector('input[name^="bonus-status"]:checked')?.value || 'غير محظور من البونص';
                const notes = form.querySelector('textarea[name="additional-notes"]')?.value.trim();
                let body = `ip country: <code>${country}</code>\nIP: <code>${ip}</code>\nالإيميل: <code>${email}</code>\nرقم الحساب: <code>${accountNumber}</code>\nنسبة الهامش: <code>${marginPercentage}</code>\n\nالأرباح للصفقات العائمة (${floating})\nالـ IP الأخير (${ipMatch}) لبلد التسجيل، العميل ${bonus}`;
                if (notes) body += `\nملاحظات إضافية: <code>${notes}</code>`;
                const footer = `\n\n#deposit_percentages`;
                const formData = new FormData();
                formData.append('report_text', `تقرير Deposit Report\n\n${body}${footer}`);
                formData.append('type', 'deposit_percentages');
                const files = bulkFormFilesMap.get(form.id) || [];
                files.forEach(f => formData.append('images', f.file, f.originalName));
                const result = await fetchWithAuth('/api/reports', { method: 'POST', body: formData });
                showToast(result.message || 'تم إرسال التقرير.');
                submitBtn.innerText = 'تم الإرسال';
                setTimeout(() => { submitBtn.innerText = 'إرسال التقرير'; submitBtn.disabled = false; }, 1500);
            } catch (err) {
                console.error(err);
                showToast(err.message || 'فشل الإرسال.', true);
                submitBtn.disabled = false; submitBtn.innerText = 'إرسال التقرير';
            }
        });
    });

    // Global paste routing to selected form
    document.onpaste = (e) => {
        if (!window.location.hash.startsWith('#reports/deposit-percentage')) return;
        const files = e.clipboardData?.files;
        if (!files || !files.length) return;
        if (!selectedBulkFormId) {
            showToast('اختر بطاقة حساب أولاً قبل لصق الصور.', true);
            return;
        }
        const targetForm = document.getElementById(selectedBulkFormId);
        if (!targetForm) return;
        const previews = targetForm.querySelector('[data-image-previews]');
        handleFilesForBulkForm(targetForm, files, previews);
    };
}

function sanitizeBulkDataKeepAccounts(text) {
    if (!text) return '';
    const accounts = [...text.matchAll(/\b\d{6,7}\b/g)].map(m => m[0]);
    return accounts.join('\n');
}

function handleFilesForBulkForm(form, files, previews) {
    if (!files || !files.length || !form || !previews) return;
    const existing = bulkFormFilesMap.get(form.id) || [];
    const compressionOptions = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
    [...files].forEach(async (file) => {
        if (!file.type.startsWith('image/')) return;
        if (existing.length >= 3) { showToast('تم الوصول للحد الأقصى للصور لهذا الحساب.', true); return; }
        if (existing.some(f => f.originalName === file.name && f.originalSize === file.size)) { showToast('تم رفع هذه الصورة بالفعل.', true); return; }
        const previewContainer = document.createElement('div');
        previewContainer.className = 'img-preview-container loading';
        previewContainer.innerHTML = `<div class="img-preview-spinner"></div>`;
        previews.appendChild(previewContainer);
        try {
            const compressed = await imageCompression(file, compressionOptions);
            const blobUrl = URL.createObjectURL(compressed);
            const fileData = { file: compressed, originalName: file.name, originalSize: file.size, previewUrl: blobUrl };
            existing.push(fileData);
            bulkFormFilesMap.set(form.id, existing);
            previewContainer.classList.remove('loading');
            previewContainer.innerHTML = `<img src="${blobUrl}" class="img-preview"><button type="button" class="remove-img-btn">&times;</button>`;
            previewContainer.querySelector('.remove-img-btn').onclick = () => {
                URL.revokeObjectURL(blobUrl);
                previewContainer.remove();
                bulkFormFilesMap.set(form.id, bulkFormFilesMap.get(form.id).filter(f => f.previewUrl !== blobUrl));
            };
        } catch (err) {
            previewContainer.remove();
            showToast('فشل ضغط الصورة.', true);
        }
    });
}

// =====================================================================
// Bulk Transfer Reports (تحويل الحسابات المجمعة)
// =====================================================================

export function renderBulkTransferReportPage() {
    return createBulkTransferReportPageHTML();
}

export function initBulkTransferReportPage() {
    const bulkDataEl = document.getElementById('bulk-transfer-data');
    const cardsContainer = document.getElementById('bulk-transfer-cards-container');
    const sendAllBtn = document.getElementById('send-all-bulk-transfer');
    const summaryEl = document.getElementById('bulk-transfer-summary');
    const countEl = document.getElementById('bulk-transfer-count');

    if (!bulkDataEl || !cardsContainer) return;

    // Auto parse on input (debounced)
    const debouncedProcess = debounce(() => {
        const rawData = bulkDataEl.value;
        if (!rawData.trim()) return;
        
        const reportsData = parseBulkTransferData(rawData);
        
        // Filter and keep only account numbers
        const filteredText = reportsData.map(r => r.accountNumber).join('\n');
        
        // Update textarea with filtered data
        if (filteredText !== bulkDataEl.value) {
            bulkDataEl.value = filteredText;
        }
        
        renderBulkTransferReportForms(reportsData, cardsContainer);
        if (summaryEl && countEl) {
            countEl.textContent = String(reportsData.length);
            summaryEl.style.display = reportsData.length > 0 ? 'flex' : 'none';
        }
        if (sendAllBtn) {
            sendAllBtn.disabled = reportsData.length === 0;
            sendAllBtn.onclick = async () => {
                if (reportsData.length === 0) return;
                await sendAllBulkTransferReports(reportsData);
            };
        }
    }, 400);

    bulkDataEl.addEventListener('input', debouncedProcess);
    bulkDataEl.addEventListener('paste', () => setTimeout(debouncedProcess, 60));

    // Global paste handler for bulk transfer page
    document.onpaste = (e) => {
        console.log('📋 Global paste event triggered:', {
            location: window.location.hash,
            selectedFormId: selectedBulkTransferFormId,
            hasFiles: e.clipboardData?.files?.length > 0
        });

        if (window.location.hash === '#reports/bulk-transfer' && selectedBulkTransferFormId) {
            const form = document.getElementById(selectedBulkTransferFormId);
            console.log('🎯 Found selected form:', form?.id);

            if (form) {
                const previews = form.querySelector('.image-previews');
                console.log('🖼️ Found previews container:', !!previews);

                handleFilesForBulkTransferForm(form, e.clipboardData.files, previews);
            } else {
                console.log('❌ Selected form not found in DOM');
            }
        } else {
            console.log('❌ Paste conditions not met:', {
                isBulkTransferPage: window.location.hash === '#reports/bulk-transfer',
                hasSelectedForm: !!selectedBulkTransferFormId
            });
        }
    };
}

function createBulkTransferReportPageHTML() {
    return `
    <div class="report-form-page-container">
        <div class="page-header">
            <h1 class="page-title">إنشاء تقارير تحويل الحسابات المجمعة</h1>
            <p class="page-subtitle">الصق أرقام الحسابات ليتم تقسيمها إلى بطاقات تقارير فردية.</p>
        </div>
        <div class="form-container">
            <div class="form-group">
                <label for="bulk-transfer-data">أرقام الحسابات الخام</label>
                <textarea id="bulk-transfer-data" name="bulk-transfer-data" rows="15" placeholder="الصق أرقام الحسابات هنا... (كل رقم في سطر)"></textarea>
            </div>
            <div id="bulk-transfer-summary" class="bulk-summary" style="display:none;">
                <span class="summary-label"><i class="fas fa-users"></i> إجمالي الحسابات:</span>
                <span id="bulk-transfer-count" class="summary-count-badge">0</span>
            </div>
            <div id="bulk-transfer-cards-container" class="bulk-cards-container">
                <!-- Report cards will be injected here -->
            </div>
            
            <!-- Send All Button -->
            <div class="send-all-container">
                <button type="button" id="send-all-bulk-transfer" class="send-all-btn" disabled>
                    <i class="fas fa-paper-plane"></i>
                    إرسال جميع التقارير للجروب
                </button>
            </div>
        </div>
    </div>
    <style>
        .bulk-summary {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            margin: 10px 0 0;
            border: 1px solid var(--border-color);
            border-radius: 10px;
            background: var(--background-color-offset);
        }
        .bulk-summary .summary-label {
            color: var(--text-color);
            font-weight: 600;
        }
        .bulk-summary .summary-count-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 36px;
            height: 28px;
            padding: 0 10px;
            border-radius: 999px;
            background: var(--primary-color);
            color: #fff;
            font-weight: 700;
        }
        .send-all-container {
            margin: 30px auto 20px;
            max-width: 400px;
            text-align: center;
        }
        
        .send-all-btn {
            background: linear-gradient(135deg, var(--primary-color), #0056b3);
            color: white;
            border: none;
            padding: 16px 32px;
            border-radius: 50px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 8px 20px rgba(0, 123, 255, 0.4);
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            min-width: 280px;
            justify-content: center;
        }
        
        .send-all-btn:hover:not(:disabled) {
            transform: translateY(-3px);
            box-shadow: 0 12px 28px rgba(0, 123, 255, 0.5);
            background: linear-gradient(135deg, #0056b3, var(--primary-color));
        }
        
        .send-all-btn:active:not(:disabled) {
            transform: translateY(-1px);
        }
        
        .send-all-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
            opacity: 0.6;
        }
        
        .send-all-btn i {
            font-size: 1.1rem;
        }
        
        .bulk-cards-container {
            margin-top: 1.5rem;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
            gap: 1.5rem;
            padding: 0.5rem;
        }
        .bulk-report-card {
            border: 2px solid var(--border-color);
            border-inline-start: 6px solid var(--card-accent, var(--primary-color));
            border-radius: 12px;
            padding: 1.25rem;
            background: linear-gradient(180deg, var(--background-color-offset), rgba(0,0,0,0.02));
            box-shadow: 0 3px 8px rgba(0,0,0,0.08);
            display: flex;
            flex-direction: column;
            gap: 0.85rem;
            transition: all .2s ease;
            cursor: pointer;
            position: relative;
            margin-bottom: 3.5rem;
        }
        .bulk-cards-container .bulk-report-card:nth-child(odd) { --card-accent: #0d6efd; }
        .bulk-cards-container .bulk-report-card:nth-child(even) { --card-accent: #20c997; }
        .bulk-report-card::after {
            content: '';
            position: absolute;
            bottom: -1.75rem;
            left: 50%;
            transform: translateX(-50%);
            width: 70%;
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--border-color) 15%, var(--card-accent, var(--primary-color)) 50%, var(--border-color) 85%, transparent);
            opacity: 0.8;
        }
        .bulk-report-card::before {
            content: '◆';
            position: absolute;
            bottom: -1.95rem;
            left: 50%;
            transform: translateX(-50%);
            color: var(--card-accent, var(--primary-color));
            font-size: 0.8rem;
            z-index: 1;
        }
        .bulk-card-index-badge {
            position: absolute;
            top: 10px;
            inset-inline-end: 10px;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--card-accent, var(--primary-color));
            color: #fff;
            font-weight: 800;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            border: 2px solid #fff1;
        }
        .bulk-report-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.12);
        }
        .bulk-report-card.selected {
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px var(--primary-color-translucent), 0 5px 20px rgba(0,0,0,0.15);
            background: linear-gradient(to bottom, var(--primary-color-translucent) 0%, var(--background-color-offset) 100%);
        }
        .bulk-report-card h3 {
            margin: 0 0 0.75rem;
            font-size: 1.15rem;
            font-weight: 700;
            color: var(--primary-color);
            display: flex;
            align-items: center;
            gap: 8px;
            padding-bottom: 0.75rem;
            border-bottom: 2px solid var(--border-color);
        }
        .bulk-report-card h3 code {
            font-size: 1rem;
            background: var(--primary-color);
            color: #fff;
            padding: 4px 10px;
            border-radius: 6px;
            font-weight: 600;
        }
        .bulk-report-card form {
            display: grid;
            grid-template-columns: 1fr;
            gap: 0.75rem;
        }
        .bulk-report-card .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
        }
        .bulk-report-card .form-row.single-column {
            grid-template-columns: 1fr;
        }
        .bulk-report-card .form-group {
            margin: 0;
        }
        .bulk-report-card .form-group.full-width {
            grid-column: 1 / -1;
        }
        .bulk-report-card label {
            font-size: 0.8rem;
            font-weight: 600;
            margin-bottom: 6px;
            display: block;
            color: var(--text-color);
        }
        .bulk-report-card input[type=text],
        .bulk-report-card input[type=email],
        .bulk-report-card select,
        .bulk-report-card textarea {
            font-size: 0.9rem;
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
            width: 100%;
            transition: border-color .2s ease;
        }
        .bulk-report-card input[type=text]:focus,
        .bulk-report-card input[type=email]:focus,
        .bulk-report-card select:focus,
        .bulk-report-card textarea:focus {
            border-color: var(--primary-color);
            outline: none;
            box-shadow: 0 0 0 3px var(--primary-color-translucent);
        }
        .bulk-report-card textarea {
            min-height: 80px;
            resize: vertical;
        }
        .bulk-report-card .upload-area {
            font-size: 0.75rem;
            padding: 1rem;
            border: 2px dashed var(--border-color);
            border-radius: 10px;
            text-align: center;
            color: var(--text-color-secondary);
            background: var(--background-color);
            transition: all .2s ease;
            cursor: pointer;
        }
        .bulk-report-card .upload-area:hover {
            border-color: var(--primary-color);
            background: var(--primary-color-translucent);
        }
        .bulk-report-card .upload-area.dragover {
            background: var(--primary-color);
            color: #fff;
            border-color: var(--primary-color);
        }
        .bulk-report-card .image-previews {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 8px;
        }
        .bulk-report-card .img-preview-container {
            position: relative;
            width: 80px;
            height: 80px;
            border-radius: 10px;
            overflow: hidden;
            border: 2px solid var(--border-color);
        }
        .bulk-report-card .img-preview-container.loading {
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--background-color);
            font-size: 0.7rem;
        }
        .bulk-report-card .img-preview {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .bulk-report-card .remove-img-btn {
            position: absolute;
            top: 4px;
            right: 4px;
            background: rgba(220, 53, 69, 0.9);
            color: #fff;
            border: none;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            font-size: 0.75rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all .2s ease;
        }
        .bulk-report-card .remove-img-btn:hover {
            background: rgba(220, 53, 69, 1);
            transform: scale(1.1);
        }
        .bulk-report-card .submit-btn {
            font-size: 0.85rem;
            padding: 10px 16px;
            border-radius: 8px;
            font-weight: 600;
            margin-top: 0.5rem;
        }
        .bulk-report-card code {
            font-size: 0.8rem;
        }
        .bulk-report-card .ip-group {
            position: relative;
        }
        .bulk-report-card .bulk-country-icon {
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            pointer-events: none;
            z-index: 1;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .bulk-report-card .form-group > div[style*="position:relative"] {
            position: relative;
        }
        .bulk-report-card .bulk-country-input {
            padding-left: 35px !important;
            font-weight: 600;
            color: var(--text-color);
        }
        .bulk-report-card .bulk-ip-input {
            padding-right: 32px !important;
            direction: ltr;
            text-align: left;
        }
        .bulk-report-card .clear-ip-btn {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            background: var(--danger-color);
            color: #fff;
            border: none;
            border-radius: 50%;
            width: 22px;
            height: 22px;
            font-size: 1rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.8;
            transition: opacity .2s ease;
            z-index: 2;
        }
        .bulk-report-card .clear-ip-btn:hover {
            opacity: 1;
        }
        .bulk-report-card .clear-ip-btn.hidden {
            display: none;
        }
    </style>
    `;
}

function parseBulkTransferData(rawData) {
    const reports = [];
    const lines = rawData.split('\n').map(l => l.trim()).filter(l => l);
    
    console.log('📝 Parsing bulk transfer data, total lines:', lines.length);
    
    const accountRegex = /\b\d{6,7}\b/;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;
    
    let currentAccount = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const accountMatch = line.match(accountRegex);
        const ipMatch = line.match(ipRegex);
        const emailMatch = line.match(emailRegex);
        
        // If we find an account number, start processing it
        if (accountMatch) {
            // If we already have a current account being built, save it first
            if (currentAccount && currentAccount.accountNumber) {
                reports.push(currentAccount);
            }
            
            // Start a new account
            currentAccount = {
                accountNumber: accountMatch[0],
                email: '',
                ip: ''
            };
            console.log('🆕 New account started:', accountMatch[0]);
            
            // Check if this same line has IP or email
            if (ipMatch && !currentAccount.ip) {
                currentAccount.ip = ipMatch[0];
                console.log('🌐 IP added from same line:', ipMatch[0]);
            }
            if (emailMatch && !currentAccount.email) {
                currentAccount.email = emailMatch[0];
                console.log('📧 Email added from same line:', emailMatch[0]);
            }
        } else if (currentAccount) {
            // Continue building current account from subsequent lines
            if (ipMatch && !currentAccount.ip) {
                currentAccount.ip = ipMatch[0];
                console.log('🌐 IP added:', ipMatch[0]);
            }
            if (emailMatch && !currentAccount.email) {
                currentAccount.email = emailMatch[0];
                console.log('📧 Email added:', emailMatch[0]);
            }
        }
    }
    
    // Don't forget the last account
    if (currentAccount && currentAccount.accountNumber) {
        reports.push(currentAccount);
    }
    
    // Remove duplicates based on account number, but merge information
    const uniqueReports = [];
    const accountMap = new Map();
    
    for (const report of reports) {
        console.log(`🔍 Processing report for account ${report.accountNumber}: IP=${report.ip}, Email=${report.email}`);
        
        if (accountMap.has(report.accountNumber)) {
            // Merge information from duplicate accounts
            const existing = accountMap.get(report.accountNumber);
            if (!existing.ip && report.ip) {
                existing.ip = report.ip;
                console.log(`🔄 Updated IP for account ${report.accountNumber}: ${report.ip}`);
            }
            if (!existing.email && report.email) {
                existing.email = report.email;
                console.log(`🔄 Updated email for account ${report.accountNumber}: ${report.email}`);
            }
        } else {
            accountMap.set(report.accountNumber, { ...report });
            console.log(`✅ Added new account: ${report.accountNumber} with IP: ${report.ip}`);
        }
    }
    
    // Convert map to array
    for (const report of accountMap.values()) {
        uniqueReports.push(report);
    }
    
    console.log('✨ Final parsed reports:', uniqueReports);
    console.log('📊 Report details:');
    uniqueReports.forEach((report, index) => {
        console.log(`  ${index + 1}. Account: ${report.accountNumber}, IP: ${report.ip || 'none'}, Email: ${report.email || 'none'}`);
    });
    
    console.log('🔗 Total unique accounts processed:', uniqueReports.length);
    return uniqueReports;
}

function renderBulkTransferReportForms(reportsData, container) {
    container.innerHTML = '';
    if (!reportsData || reportsData.length === 0) {
        return;
    }
    
    const formsFragment = document.createDocumentFragment();
    const ipInputsToTrigger = [];

    reportsData.forEach((data, index) => {
        const wrapper = document.createElement('form');
        wrapper.className = 'bulk-report-card bulk-transfer-form';
        wrapper.setAttribute('data-index', String(index + 1));
        wrapper.setAttribute('data-account', data.accountNumber);
        wrapper.id = `bulk-form-${index}`;
        wrapper.innerHTML = `
            <div class="bulk-card-index-badge" title="ترتيب الحساب">${index + 1}</div>
            <h3>الحساب: <code class="clickable-account" data-account="${data.accountNumber}" title="اضغط للنسخ" style="cursor: pointer; user-select: none;">${data.accountNumber}</code></h3>
                <!-- IP and Country in one row -->
                <div class="form-row">
                    <div class="form-group ip-group">
                        <label>IP Address <span style="color: var(--danger-color);">*</span></label>
                        <div style="position:relative;">
                            <input type="text" name="ip" class="bulk-ip-input" placeholder="الصق الـ IP هنا لجلب ip country" autocomplete="off" value="${data.ip || ''}" required dir="ltr">
                            <button type="button" class="clear-ip-btn hidden" title="مسح">&times;</button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>ip country <span style="color: var(--danger-color);">*</span></label>
                        <div style="position:relative;">
                            <input type="text" name="country" class="bulk-country-input" readonly placeholder="سيتم تحديدها تلقائياً...">
                            <i class="fas fa-globe bulk-country-icon"></i>
                        </div>
                        <input type="hidden" name="city" class="bulk-city-input">
                    </div>
                </div>
                
                <!-- Account Number and Email in one row -->
                <div class="form-row">
                    <div class="form-group">
                        <label>رقم الحساب <span style="color: var(--danger-color);">*</span></label>
                        <input type="text" name="account-number" class="bulk-account-input" required value="${data.accountNumber}">
                    </div>
                    <div class="form-group">
                        <label>البريد الإلكتروني <span style="color: var(--danger-color);">*</span></label>
                        <input type="email" name="email" class="bulk-email-input" required value="${data.email || ''}">
                    </div>
                </div>
                
                <!-- Transfer Source in one row -->
                <div class="form-row single-column">
                    <div class="form-group full-width">
                        <label>مصدر التحويل <span style="color: var(--danger-color);">*</span></label>
                        <select name="transfer-source" class="bulk-transfer-source" required>
                            <option value="" disabled>اختر مصدراً...</option>
                            <option value="2 ACTIONS">2 ACTIONS</option>
                            <option value="PROFIT SUMMARY">PROFIT SUMMARY</option>
                            <option value="suspicious traders" selected>suspicious traders</option>
                            <option value="NEW POSITIONS">NEW POSITIONS</option>
                            <option value="Deals with No profit">Deals with No profit</option>
                            <option value="Same Price">Same Price</option>
                            <option value="other">Other:</option>
                        </select>
                    </div>
                </div>
                
                <!-- Notes -->
                <div class="form-group full-width">
                    <div class="notes-field-wrapper">
                        <label>الملاحظات <span style="color: var(--danger-color);">*</span></label>
                        <textarea name="notes" class="clickable-notes bulk-notes-input" rows="3" placeholder="اكتب ملاحظاتك هنا...&#10;اضغط Enter للإرسال، أو Shift+Enter لسطر جديد." title="اضغط للنسخ" style="cursor: pointer;" required></textarea>
                    </div>
                </div>
                
                <!-- Upload Images -->
                <div class="form-group full-width">
                    <label>رفع صور (3 كحد أقصى)</label>
                    <div class="upload-area" data-upload-area>الصق الصور هنا باستخدام (Win + V) أو اسحبها وأفلتها</div>
                    <div class="image-previews" data-image-previews></div>
                </div>
                
                <div class="form-actions">
                    <button type="submit" class="submit-btn">إرسال التقرير</button>
                </div>
            </form>
        `;
        
        // Attach individual debounce listener
        const ipInput = wrapper.querySelector('.bulk-ip-input');
        if (ipInput) {
            // Set the IP value from parsed data
            if (data.ip) {
                ipInput.value = data.ip;
                console.log(`🌐 IP set for account ${data.accountNumber}: ${data.ip}`);
            }
            ipInput.addEventListener('input', debounce(() => performBulkIpLookup(ipInput), 300));
            if (data.ip) {
                ipInputsToTrigger.push(ipInput);
            } else {
                console.log(`⚠️ No IP found for account ${data.accountNumber}`);
            }
        }

        formsFragment.appendChild(wrapper);
    });
    container.appendChild(formsFragment);
    initBulkTransferFormsBehavior(container);

    // Trigger initial lookups sequentially
    (async () => {
        console.log(`🚀 Starting IP lookups for ${ipInputsToTrigger.length} accounts`);
        console.log('IP inputs to trigger:', ipInputsToTrigger);
        for (const input of ipInputsToTrigger) {
            console.log(`🔍 Looking up IP: ${input.value}, input element:`, input);
            await performBulkIpLookup(input);
            await new Promise(r => setTimeout(r, 200)); // Small delay to be nice to API
        }
        console.log('✅ All IP lookups completed');
    })();
}

async function performBulkIpLookup(ipInput) {
    const form = ipInput.closest('form');
    console.log('🔍 IP input element:', ipInput);
    console.log('🔍 Closest form:', form);
    if (!form) {
        console.error('❌ Could not find form for IP input:', ipInput);
        return;
    }
    
    const countryInput = form.querySelector('.bulk-country-input');
    const countryIcon = form.querySelector('.bulk-country-icon');
    const clearIpBtn = form.querySelector('.clear-ip-btn');

    if (clearIpBtn) clearIpBtn.classList.toggle('hidden', ipInput.value.length === 0);

    const ip = ipInput.value.trim();
    if (!ip) {
        countryInput.value = '';
        countryIcon.className = 'fas fa-globe bulk-country-icon';
        countryIcon.innerHTML = '';
        return;
    }

    const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;
    const match = ip.match(ipRegex);
    const extractedIp = match ? match[0] : null;

    if (!extractedIp) {
        countryIcon.className = 'fas fa-exclamation-triangle bulk-country-icon';
        countryIcon.innerHTML = '';
        return;
    }

    if (ip !== extractedIp) {
        ipInput.value = extractedIp;
    }

    countryIcon.className = 'fas fa-spinner fa-spin bulk-country-icon';
    countryIcon.innerHTML = '';

    try {
        const response = await fetch(`https://ipwhois.app/json/${extractedIp}`);
        const data = await response.json();
        if (data.success) {
            countryInput.value = data.country;
            countryIcon.className = 'fas fa-globe bulk-country-icon';
            countryIcon.innerHTML = `<img src="${data.country_flag}" alt="${data.country_code}" style="width: 20px; height: auto;">`;
        } else {
            throw new Error(data.message || 'Invalid IP address');
        }
    } catch (error) {
        countryIcon.className = 'fas fa-exclamation-triangle bulk-country-icon';
        countryIcon.innerHTML = '';
    }
}

const bulkTransferFormFilesMap = new Map();
let selectedBulkTransferFormId = null;

function initBulkTransferFormsBehavior(container) {
    const forms = container.querySelectorAll('form.bulk-transfer-form');

    // Clear IP Button Logic (Delegated)
    container.addEventListener('click', (e) => {
        if (e.target.classList.contains('clear-ip-btn')) {
            const btn = e.target;
            const form = btn.closest('form');
            const ipInput = form.querySelector('.bulk-ip-input');
            const countryInput = form.querySelector('.bulk-country-input');
            const countryIcon = form.querySelector('.bulk-country-icon');

            ipInput.value = '';
            countryInput.value = '';
            countryIcon.className = 'fas fa-globe bulk-country-icon';
            countryIcon.innerHTML = '';
            btn.classList.add('hidden');
            ipInput.focus();
            return;
        }
    });

    // Copy account number on click
    container.addEventListener('click', (e) => {
        if (e.target.classList.contains('clickable-account')) {
            console.log('👆 Clicked on account number:', e.target.getAttribute('data-account'));

            // First, select the form/card
            const card = e.target.closest('.bulk-report-card');
            console.log('🎯 Found card:', card ? 'YES' : 'NO');

            if (card) {
                container.querySelectorAll('.bulk-report-card.selected').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                const formEl = card.querySelector('form.bulk-transfer-form');
                selectedBulkTransferFormId = formEl ? formEl.id : null;
                console.log('✅ Selected form ID:', selectedBulkTransferFormId);
            }
            
            const accountNum = e.target.getAttribute('data-account');
            if (accountNum) {
                navigator.clipboard.writeText(accountNum).then(() => {
                    showToast(`تم نسخ رقم الحساب: ${accountNum}`);
                }).catch(err => {
                    console.error('Failed to copy account number:', err);
                });
            }
            return;
        }
        // Open templates on click for notes
        if (e.target.classList.contains('clickable-notes')) {
            if (!e.target.dataset.templatesOpened) {
                openTemplatesWidget(e.target);
                e.target.dataset.templatesOpened = 'true';
            }
            return;
        }
    });

    // Selection highlight logic - runs first to ensure form selection
    container.addEventListener('click', (e) => {
        const card = e.target.closest('.bulk-report-card');
        if (!card) return;
        
        console.log('🎨 Card selection triggered:', {
            target: e.target.className,
            cardFound: !!card,
            currentSelectedId: selectedBulkTransferFormId
        });
        
        container.querySelectorAll('.bulk-report-card.selected').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        
        // Find the form - it could be the target itself or inside the card
        const formEl = e.target.closest('form.bulk-transfer-form') || card.querySelector('form.bulk-transfer-form');
        selectedBulkTransferFormId = formEl ? formEl.id : null;
        
        console.log('✅ New selected form ID:', selectedBulkTransferFormId, 'formEl found:', !!formEl);
    }, true); // Use capture phase to run first
    
    // Enter to move to next field inside bulk forms (skip textareas and modifiers)
    container.addEventListener('keydown', (e) => {
        if (!e.target.closest('form.bulk-transfer-form')) return;
        if (e.key !== 'Enter') return;
        const target = e.target;
        if (!target || target.tagName === 'TEXTAREA') return;
        if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        const currentForm = target.closest('form.bulk-transfer-form');
        const focusables = Array.from(currentForm.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'));
        const idx = focusables.indexOf(target);
        if (idx > -1) {
            const next = focusables[idx + 1] || focusables[0];
            next && next.focus();
        }
    });

    // File Upload Logic (Drag & Drop)
    container.querySelectorAll('.upload-area').forEach(area => {
        const form = area.closest('form');
        if (!form) return;
        const previews = form.querySelector('.image-previews');
        if (!previews) return;

        area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('dragover'); });
        area.addEventListener('dragleave', () => area.classList.remove('dragover'));
        area.addEventListener('drop', (e) => {
            e.preventDefault();
            area.classList.remove('dragover');
            console.log('📥 Files dropped on upload area:', {
                formId: form.id,
                filesCount: e.dataTransfer.files.length,
                selectedFormId: selectedBulkTransferFormId
            });
            handleFilesForBulkTransferForm(form, e.dataTransfer.files, previews);
        });
        
        // Click to select form
        area.addEventListener('click', () => {
            const card = area.closest('.bulk-report-card');
            if (card) card.click();
        });
    });

    // Individual form submit logic
    forms.forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!form.checkValidity()) { 
                form.reportValidity(); 
                return; 
            }
            
            // Show warning message before sending individual report
            // Note: No individual warnings - only bulk warnings from frontend
            const submitBtn = form.querySelector('.submit-btn');
            const originalText = submitBtn.innerText;
            submitBtn.disabled = true; 
            submitBtn.innerText = 'جاري الإرسال...';
            
            try {
            
                const ip = form.querySelector('.bulk-ip-input')?.value.trim() || 'غير محدد';
                const countryRaw = form.querySelector('.bulk-country-input')?.value.trim() || 'غير محدد';
                const [country] = countryRaw.split(' | ');
                const email = form.querySelector('.bulk-email-input')?.value.trim() || 'غير محدد';
                const accountNumber = form.querySelector('.bulk-account-input')?.value.trim() || 'غير محدد';
                const transferSource = form.querySelector('.bulk-transfer-source')?.value || 'غير محدد';
                
                const notes = form.querySelector('textarea[name="notes"]')?.value.trim() || '';

                let body = `ip country: ${country}\nIP: ${ip}\nالإيميل: ${email}\nرقم الحساب: ${accountNumber}\nمصدر التحويل: ${transferSource}`;

                if (notes) {
                    body += `\n\nالملاحظات:\n${notes}`;
                }

                const reportText = `تقرير تحويل الحسابات\n\n${body}\n\n#account_transfer`;

                const formData = new FormData();
                formData.append('report_text', reportText);
                formData.append('type', 'bulk_transfer_accounts');

                const files = bulkTransferFormFilesMap.get(form.id) || [];
                files.forEach(f => formData.append('images', f.file, f.originalName));

                console.log('📤 Sending individual bulk transfer report:', {
                    accountNumber,
                    reportText: reportText.substring(0, 100) + '...',
                    imageCount: files.length,
                    skipArchive: false, // Individual reports should be archived
                    willBeArchived: true // Explicit confirmation
                });

                await fetchWithAuth('/api/reports', { method: 'POST', body: formData });
                
                showToast(`تم إرسال تقرير الحساب ${accountNumber} بنجاح ✅`);
                submitBtn.innerText = 'تم الإرسال';
                
                // Remove this form from the page after successful send
                setTimeout(() => {
                    const card = form.closest('.bulk-report-card');
                    if (card) {
                        card.remove();
                        // Update count
                        const countEl = document.getElementById('bulk-transfer-count');
                        if (countEl) {
                            const currentCount = parseInt(countEl.textContent) || 0;
                            countEl.textContent = Math.max(0, currentCount - 1);
                        }
                    }
                }, 1500);
                
            } catch (err) {
                console.error('Failed to send individual transfer report:', err);
                showToast(err.message || 'فشل إرسال التقرير.', true);
                submitBtn.disabled = false; 
                submitBtn.innerText = originalText;
            }
        });
    });
}

    // Removed stray reportsData.forEach block (was outside any function)
    // ...existing code...

function handleFilesForBulkTransferForm(form, files, previews) {
    console.log('🔍 handleFilesForBulkTransferForm called:', {
        formId: form?.id,
        filesCount: files?.length,
        previews: !!previews,
        selectedFormId: selectedBulkTransferFormId
    });

    if (!files || !files.length || !form || !previews) {
        console.log('❌ handleFilesForBulkTransferForm: Missing required parameters');
        return;
    }
    
    // Initialize if not exists
    if (!bulkTransferFormFilesMap.has(form.id)) {
        bulkTransferFormFilesMap.set(form.id, []);
    }

    const compressionOptions = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
    
    [...files].forEach(async (file) => {
        if (!file.type.startsWith('image/')) return;
        
        // Check current count dynamically
        const currentFiles = bulkTransferFormFilesMap.get(form.id) || [];
        if (currentFiles.length >= 3) { 
            showToast('الحد الأقصى 3 صور لكل تقرير.', true); 
            return; 
        }
        
        if (currentFiles.some(f => f.originalName === file.name && f.originalSize === file.size)) return;
        
        const previewContainer = document.createElement('div');
        previewContainer.className = 'img-preview-container loading';
        previewContainer.innerHTML = `<div class="img-preview-spinner"></div>`;
        previews.appendChild(previewContainer);
        
        let fileToUpload = file;
        try {
            try {
                fileToUpload = await imageCompression(file, compressionOptions);
            } catch (compressionErr) {
                console.warn('Image compression failed, using original file:', compressionErr);
                fileToUpload = file;
            }

            const previewUrl = URL.createObjectURL(fileToUpload);
            const fileData = { file: fileToUpload, originalName: file.name, originalSize: file.size, previewUrl };
            
            // Re-fetch to be safe with concurrency
            const updatedFiles = bulkTransferFormFilesMap.get(form.id) || [];
            if (updatedFiles.length >= 3) {
                 // Race condition hit, remove this one
                 previewContainer.remove();
                 URL.revokeObjectURL(previewUrl);
                 showToast('الحد الأقصى 3 صور لكل تقرير.', true);
                 return;
            }

            bulkTransferFormFilesMap.set(form.id, [...updatedFiles, fileData]);
            
            previewContainer.classList.remove('loading');
            previewContainer.innerHTML = `
                <img src="${previewUrl}" class="img-preview">
                <button type="button" class="remove-img-btn">&times;</button>
            `;
            previewContainer.querySelector('.remove-img-btn').onclick = () => {
                previewContainer.remove();
                URL.revokeObjectURL(previewUrl);
                const current = bulkTransferFormFilesMap.get(form.id) || [];
                bulkTransferFormFilesMap.set(form.id, current.filter(f => f.previewUrl !== previewUrl));
            };
        } catch (err) {
            console.error('Error processing file:', err);
            previewContainer.remove();
            showToast('فشل معالجة الصورة.', true);
        }
    });
}

async function sendAllBulkTransferReports(reportsData) {
    try {
        const forms = document.querySelectorAll('form.bulk-transfer-form');

        // Validate all forms first
        let invalidForms = [];
        forms.forEach((form, index) => {
            if (!form.checkValidity()) {
                const accountNumber = form.querySelector('.bulk-account-input')?.value.trim() || `${index + 1}`;
                invalidForms.push(accountNumber);
            }
        });

        if (invalidForms.length > 0) {
            showToast(`يرجى ملء جميع الحقول المطلوبة للحسابات: ${invalidForms.join(', ')}`, true);
            return;
        }

        let successCount = 0;
        let failCount = 0;
        const failedAccounts = []; // Track failed accounts for retry
        const delayMs = 3000; // 3 seconds between reports to prevent rate limiting

        // Send warning message to Telegram before starting bulk send
        try {
            console.log(`📢 Sending bulk warning message for ${forms.length} reports`);
            const warningMessage = `تنبيه: سيتم إرسال ${forms.length} تقرير تحويل حسابات الآن.`;
            const warningFormData = new FormData();
            warningFormData.append('report_text', warningMessage);
            warningFormData.append('type', 'bulk_transfer_accounts');
            warningFormData.append('skip_archive', 'true'); // Don't save warning in archive
            
            await fetchWithAuth('/api/reports', { method: 'POST', body: warningFormData });
            console.log('✅ Bulk warning message sent to Telegram');
            
            // Small delay before starting to send reports
            await new Promise(resolve => setTimeout(resolve, delayMs));
        } catch (warningError) {
            console.warn('⚠️ Failed to send warning message:', warningError);
            // Continue with sending reports even if warning fails
        }

        showToast(`جاري إرسال ${forms.length} تقرير...`, false);

        for (let i = 0; i < forms.length; i++) {
            const form = forms[i];
            let accountNumber = 'غير معروف';
            let reportText = '';

            try {
                const ip = form.querySelector('.bulk-ip-input')?.value.trim() || 'غير محدد';
                const countryRaw = form.querySelector('.bulk-country-input')?.value.trim() || 'غير محدد';
                const [country] = countryRaw.split(' | ');
                const email = form.querySelector('.bulk-email-input')?.value.trim() || 'غير محدد';
                accountNumber = form.querySelector('.bulk-account-input')?.value.trim() || 'غير محدد';
                const transferSource = form.querySelector('.bulk-transfer-source')?.value || 'غير محدد';
                
                const notes = form.querySelector('textarea[name="notes"]')?.value.trim() || '';

                let body = `ip country: ${country}\nIP: ${ip}\nالإيميل: ${email}\nرقم الحساب: ${accountNumber}\nمصدر التحويل: ${transferSource}`;

                if (notes) {
                    body += `\n\nالملاحظات:\n${notes}`;
                }

                reportText = `تقرير تحويل الحسابات\n\n${body}\n\n#account_transfer`;

                const formData = new FormData();
                formData.append('report_text', reportText);
                formData.append('type', 'bulk_transfer_accounts');

                const files = bulkTransferFormFilesMap.get(form.id) || [];
                files.forEach(f => formData.append('images', f.file, f.originalName));

                console.log(`📤 Sending bulk transfer report ${i + 1}/${forms.length}:`, {
                    accountNumber,
                    reportText: reportText.substring(0, 100) + '...',
                    imageCount: files.length,
                    skipArchive: false, // Bulk reports should be archived individually
                    willBeArchived: true // Explicit confirmation
                });

                await fetchWithAuth('/api/reports', { method: 'POST', body: formData });
                successCount++;
                console.log(`✅ Transfer report ${i + 1} sent successfully:`, accountNumber);

                if (i < forms.length - 1) {
                    console.log(`⏱️ Waiting 3 seconds before next report (${i + 2}/${forms.length}) to prevent rate limiting...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }

            } catch (err) {
                console.error(`❌ Failed to send transfer report ${i + 1} (${accountNumber}):`, err);
                
                // Check if it's a rate limiting error and retry once
                if (err.message && err.message.includes('Too Many Requests')) {
                    console.log(`🔄 Retrying report ${i + 1} after rate limit...`);
                    try {
                        // Wait longer before retry
                        await new Promise(resolve => setTimeout(resolve, 30000));
                        await fetchWithAuth('/api/reports', { method: 'POST', body: formData });
                        successCount++;
                        console.log(`✅ Transfer report ${i + 1} sent successfully on retry:`, accountNumber);
                    } catch (retryErr) {
                        console.error(`❌ Retry failed for transfer report ${i + 1} (${accountNumber}):`, retryErr);
                        failCount++;
                        failedAccounts.push(accountNumber);
                    }
                } else {
                    failCount++;
                    failedAccounts.push(accountNumber);
                }
            }
        }

        // If there are failed accounts, send notification and retry
        if (failedAccounts.length > 0) {
            console.log(`⚠️ ${failedAccounts.length} reports failed. Sending notification and retrying...`);
            
            // Send notification about failed accounts
            try {
                const failureMessage = `🚨 فشل إرسال ${failedAccounts.length} تقرير تحويل حسابات:\n${failedAccounts.join('\n')}\n\n🔄 جاري إعادة المحاولة...`;
                const failureFormData = new FormData();
                failureFormData.append('report_text', failureMessage);
                failureFormData.append('type', 'bulk_transfer_accounts');
                failureFormData.append('skip_archive', 'true');
                
                await fetchWithAuth('/api/reports', { method: 'POST', body: failureFormData });
                console.log('✅ Failure notification sent to Telegram');
            } catch (notifyError) {
                console.warn('⚠️ Failed to send failure notification:', notifyError);
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Retry failed accounts
            console.log('🔄 Starting retry for failed accounts...');
            let retrySuccessCount = 0;
            let retryFailCount = 0;
            
            for (let j = 0; j < failedAccounts.length; j++) {
                const failedAccount = failedAccounts[j];
                console.log(`🔄 Retrying account ${failedAccount} (${j + 1}/${failedAccounts.length})...`);
                
                try {
                    // Find the form for this account
                    const form = Array.from(forms).find(f => {
                        const accountInput = f.querySelector('.bulk-account-input');
                        return accountInput && accountInput.value.trim() === failedAccount;
                    });
                    
                    if (!form) {
                        console.error(`❌ Could not find form for account ${failedAccount}`);
                        retryFailCount++;
                        continue;
                    }
                    
                    // Recreate the report data
                    const ip = form.querySelector('.bulk-ip-input')?.value.trim() || 'غير محدد';
                    const countryRaw = form.querySelector('.bulk-country-input')?.value.trim() || 'غير محدد';
                    const [country] = countryRaw.split(' | ');
                    const email = form.querySelector('.bulk-email-input')?.value.trim() || 'غير محدد';
                    const transferSource = form.querySelector('.bulk-transfer-source')?.value || 'غير محدد';
                    
                    const notes = form.querySelector('textarea[name="notes"]')?.value.trim() || '';

                    let body = `ip country: ${country}\nIP: ${ip}\nالإيميل: ${email}\nرقم الحساب: ${failedAccount}\nمصدر التحويل: ${transferSource}`;

                    if (notes) {
                        body += `\n\nالملاحظات:\n${notes}`;
                    }

                    const reportText = `تقرير تحويل الحسابات\n\n${body}\n\n#account_transfer`;

                    const retryFormData = new FormData();
                    retryFormData.append('report_text', reportText);
                    retryFormData.append('type', 'bulk_transfer_accounts');

                    const files = bulkTransferFormFilesMap.get(form.id) || [];
                    files.forEach(f => retryFormData.append('images', f.file, f.originalName));

                    await fetchWithAuth('/api/reports', { method: 'POST', body: retryFormData });
                    retrySuccessCount++;
                    console.log(`✅ Retry successful for account ${failedAccount}`);
                    
                    // Remove from failed list
                    const index = failedAccounts.indexOf(failedAccount);
                    if (index > -1) {
                        failedAccounts.splice(index, 1);
                        j--; // Adjust loop index since we removed an item
                    }
                    
                    // Wait between retries
                    if (j < failedAccounts.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                    
                } catch (retryErr) {
                    console.error(`❌ Retry failed for account ${failedAccount}:`, retryErr);
                    retryFailCount++;
                }
            }
            
            // Update final counts
            successCount += retrySuccessCount;
            failCount = retryFailCount; // Only count final failures
        }

        if (failCount === 0) {
            // Wait for a few seconds after last report before sending success notification
            await new Promise(resolve => setTimeout(resolve, delayMs));
            
            // Send success notification to Telegram
            try {
                console.log(`🎉 All ${successCount} reports sent successfully. Sending success notification to Telegram...`);
                const successMessage = `✅ تم إرسال جميع التقارير بنجاح!\n\n📊 إجمالي التقارير المرسلة: ${successCount}\n📅 التاريخ والوقت: ${new Date().toLocaleString('ar-SA')}\n\nنوع التقرير: تحويل الحسابات المجمعة`;
                const successFormData = new FormData();
                successFormData.append('report_text', successMessage);
                successFormData.append('type', 'bulk_transfer_accounts');
                successFormData.append('skip_archive', 'true'); // Don't save success notification in archive
                
                await fetchWithAuth('/api/reports', { method: 'POST', body: successFormData });
                console.log('✅ Success notification sent to Telegram');
            } catch (successNotifyError) {
                console.warn('⚠️ Failed to send success notification:', successNotifyError);
                // Don't show error to user as the main operation succeeded
            }

            showToast(`تم إرسال جميع التقارير بنجاح (${successCount} تقرير) ✅`);

            setTimeout(() => {
                const bulkDataEl = document.getElementById('bulk-transfer-data');
                if (bulkDataEl) bulkDataEl.value = '';

                const cardsContainer = document.getElementById('bulk-transfer-cards-container');
                if (cardsContainer) cardsContainer.innerHTML = '';

                const summaryEl = document.getElementById('bulk-transfer-summary');
                const countEl = document.getElementById('bulk-transfer-count');
                if (summaryEl && countEl) {
                    countEl.textContent = '0';
                    summaryEl.style.display = 'none';
                }

                bulkTransferFormFilesMap.clear();

                const sendAllBtn = document.getElementById('send-all-bulk-transfer');
                if (sendAllBtn) sendAllBtn.disabled = true;

                showToast('تم تنظيف الصفحة، يمكنك البدء من جديد! 🔄', false);
            }, 1500);
        } else {
            showToast(`تم إرسال ${successCount} تقرير بنجاح، فشل ${failCount} تقرير`, true);
        }

    } catch (error) {
        console.error('Failed to send bulk transfer reports:', error);
        showToast(error.message || 'فشل إرسال التقارير.', true);
    }
}

