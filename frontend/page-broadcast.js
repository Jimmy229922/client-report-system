import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

async function populateUserSelect() {
    const select = document.getElementById('broadcast-user-select');
    if (!select) return;

    try {
        const result = await fetchWithAuth('/api/users');
        const users = result.data || [];
        // Use user._id which is the actual ObjectId string from MongoDB
        users.forEach(user => {
            select.appendChild(new Option(user.username, user._id));
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

    console.log('Sending broadcast with payload:', payload);

    if (!payload.message) {
        showToast('الرجاء كتابة نص الرسالة.', true);
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

    try {
        let result;
        if (payload.target === 'specific' && payload.userId) {
            // Use the specific user notification endpoint
            result = await fetchWithAuth(`/api/users/${payload.userId}/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: payload.message })
            });
        } else {
            // Use the general broadcast endpoint
            result = await fetchWithAuth('/api/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: payload.message }) });
        }

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

    document.getElementById('test-notification-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('test-notification-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            console.log('[Broadcast] Sending test notification request...');
            const result = await fetchWithAuth('/api/notifications/test', { method: 'POST' });
            showToast(result.message);
        } catch (error) {
            showToast(error.message, true);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-bell"></i> إرسال إشعار تجريبي';
        }
    });

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
                <div class="form-group">
                    <label for="broadcast-message">نص الرسالة</label>
                    <textarea id="broadcast-message" rows="8" required placeholder="اكتب رسالتك هنا..."></textarea>
                </div>
                <div class="form-group"><label for="broadcast-target">إرسال إلى</label><select id="broadcast-target"><option value="all">جميع الموظفين</option><option value="specific">موظف معين</option></select></div>
                <div class="form-group hidden" id="user-select-container"><label for="broadcast-user-select">اختر الموظف</label><select id="broadcast-user-select"></select></div>
                <button type="submit" class="submit-btn" style="width: auto; padding: 0.8rem 2rem;"><i class="fas fa-paper-plane"></i> إرسال الإشعار</button>
            </form>
        </div>

        <div class="form-container" style="max-width: 700px; margin-top: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="margin: 0;">اختبار الإشعارات اللحظية</h3>
                    <p style="margin: 0.5rem 0 0 0; color: #aaa;">اضغط لإرسال إشعار تجريبي لنفسك والتأكد من أن النظام يعمل.</p>
                </div>
                <button id="test-notification-btn" class="submit-btn" style="width: auto; background-color: var(--success-color);"><i class="fas fa-bell"></i> إرسال إشعار تجريبي</button>
            </div>
        </div>
    `;
    initBroadcastPage();
}
