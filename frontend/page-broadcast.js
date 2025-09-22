import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

async function populateUserSelect() {
    const select = document.getElementById('broadcast-user-select');
    if (!select) return;

    try {
        const result = await fetchWithAuth('/api/users');
        const users = result.data || [];
        // Filter out the admin user (ID 1) from the list of specific targets
        users.filter(u => u.id !== 1).forEach(user => {
            select.appendChild(new Option(user.username, user.id));
        });
    } catch (error) {
        console.error("Failed to populate user select for broadcast:", error);
        showToast('فشل تحميل قائمة الموظفين.', true);
    }
}

async function handleBroadcastSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    const payload = {
        message: form.querySelector('#broadcast-message').value,
        target: form.querySelector('#broadcast-target').value,
        userId: form.querySelector('#broadcast-user-select').value,
    };

    if (!payload.message) {
        showToast('الرجاء كتابة نص الرسالة.', true);
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

    try {
        const result = await fetchWithAuth('/api/broadcast/custom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showToast(result.message);
        form.reset();
        // Manually trigger change to hide user select if it was visible
        document.getElementById('broadcast-target').dispatchEvent(new Event('change'));
    } catch (error) {
        showToast(error.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال الإشعار';
    }
}

function initBroadcastPage() {
    const targetSelect = document.getElementById('broadcast-target');
    const userSelectContainer = document.getElementById('user-select-container');

    targetSelect.addEventListener('change', () => {
        userSelectContainer.classList.toggle('hidden', targetSelect.value !== 'specific');
    });

    document.getElementById('broadcast-form').addEventListener('submit', handleBroadcastSubmit);

    populateUserSelect();
}

export function renderBroadcastPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">إرسال إشعار مخصص</h1>
            <p>أرسل تنبيهات أو رسائل مباشرة إلى جميع الموظفين أو موظف معين.</p>
        </div>

        <div class="form-container" style="max-width: 700px;">
            <form id="broadcast-form">
                <div class="form-group"><label for="broadcast-message">نص الرسالة</label><textarea id="broadcast-message" rows="5" required placeholder="اكتب رسالتك هنا..."></textarea></div>
                <div class="form-group"><label for="broadcast-target">إرسال إلى</label><select id="broadcast-target"><option value="all">جميع الموظفين</option><option value="specific">موظف معين</option></select></div>
                <div class="form-group hidden" id="user-select-container"><label for="broadcast-user-select">اختر الموظف</label><select id="broadcast-user-select"></select></div>
                <button type="submit" class="submit-btn" style="width: auto; padding: 0.8rem 2rem;"><i class="fas fa-paper-plane"></i> إرسال الإشعار</button>
            </form>
        </div>
    `;
    initBroadcastPage();
}