import { handleTheme, updateNavbarUser, showToast, showConfirmModal, timeAgo } from './ui.js';
import { renderProfilePage } from './page-profile.js';
import { navigate, setFormDirty } from './router.js';
import { initIpWidget } from './ip-widget.js';
import { initTemplatesWidget } from './templates-widget.js';
import { checkAndStartTour } from './tour.js';
import { fetchWithAuth } from './api.js';
import { loadSpecialIdentifiers, listenForSpecialIdentifierUpdates } from './special-identifiers.js';
import { addUserToGrid } from './page-users.js';
import { addInstruction, updateInstruction, removeInstruction, fetchAndRenderSpecialIdentifiers } from './page-instructions.js';

// --- Global TinyMCE Ad-Blocker Fix ---
Object.defineProperty(window, 'tinymce', {
    configurable: true,
    set(value) {
        const originalInit = value.init;
        value.init = (config) => originalInit({ ...config, telemetry: false });
        Object.defineProperty(window, 'tinymce', { value, writable: true, configurable: true });
    }
});

/**
 * يعرض نافذة تنبيه خاصة ومميزة في منتصف الشاشة.
 * @param {string} message - رسالة التنبيه.
 */
export function showSpecialIpWarningModal(message) {
    // التحقق من وجود نافذة بالفعل لمنع ظهورها مرتين
    if (document.getElementById('special-ip-warning-modal')) {
        return; // إذا كانت النافذة موجودة، لا تفعل شيئاً
    } 

    const modal = document.createElement('div');
    modal.id = 'special-ip-warning-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 99999; /* A very high z-index to ensure it's on top of everything */
        pointer-events: auto; /* Ensure the overlay captures clicks */
        opacity: 0;
        transition: opacity 0.3s ease;
    `;

    modal.innerHTML = `
        <div style="background-color: var(--background-color); border: 2px solid var(--danger-color); border-radius: 12px; padding: 2rem 3rem; text-align: center; max-width: 500px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); transform: scale(0.9); transition: transform 0.3s ease;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--danger-color); margin-bottom: 1rem;"></i>
            <h2 style="color: var(--danger-color); margin-bottom: 1rem;">تنبيه هام جدًا!</h2>
            <p style="font-size: 1.2rem; line-height: 1.6; color: var(--text-color);">${message}</p>
        </div>
    `;

    document.body.appendChild(modal);

    // Trigger animations
    setTimeout(() => {
        modal.style.opacity = '1';
        modal.querySelector('div').style.transform = 'scale(1)';
    }, 10);

    // إضافة مستمع للنقر على الخلفية لإغلاق النافذة
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Audio element for notification sounds
const notificationSound = new Audio('notification.mp3');
const goldNotificationSound = new Audio('gold_notification.mp3');

let hasInteracted = false;
let stopUpdateAnimation = () => {};

document.body.addEventListener('click', () => { hasInteracted = true; }, { once: true });

function playSound(soundElement) {    
    if (!hasInteracted) return;
    soundElement.play().catch(error => {
        console.error(`Could not play notification sound. Name: ${error.name}, Message: ${error.message}. Ensure the audio file exists at the correct path.`);
    });
}

function startUpdateAnimation() {
    const canvas = document.getElementById('update-animation-canvas');
    if (!canvas) return () => {};

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const shapes = [];
    const shapeCount = 50;
    const colors = ['#4D5BF9', '#FFD700', '#4CAF50', '#f44336', '#9C27B0'];

    for (let i = 0; i < shapeCount; i++) {
        shapes.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 15 + 5,
            speed: Math.random() * 2 + 1,
            color: colors[Math.floor(Math.random() * colors.length)],
            type: Math.random() > 0.5 ? 'rect' : 'circle'
        });
    }

    let animationFrameId = null;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        shapes.forEach(shape => {
            shape.y += shape.speed;
            if (shape.y > canvas.height + shape.size) {
                shape.y = -shape.size;
                shape.x = Math.random() * canvas.width;
            }
            ctx.fillStyle = shape.color;
            ctx.globalAlpha = 0.6;
            if (shape.type === 'rect') {
                ctx.fillRect(shape.x, shape.y, shape.size, shape.size);
            } else {
                ctx.beginPath();
                ctx.arc(shape.x, shape.y, shape.size / 2, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        animationFrameId = requestAnimationFrame(draw);
    }
    draw();

    const resizeHandler = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resizeHandler);

    return () => {
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        window.removeEventListener('resize', resizeHandler);
        if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); }
    };
}

function handleImagePreviewModal() {
    const modal = document.getElementById('image-preview-modal');
    const modalImage = document.getElementById('modal-image-content');
    const closeBtn = document.getElementById('image-modal-close-btn');
    const prevBtn = document.getElementById('modal-prev-btn');
    const nextBtn = document.getElementById('modal-next-btn');

    let currentImageIndex = 0;
    let currentImageGallery = []; // This will hold the full /api/files/... URLs
    const objectUrlCache = new Map();

    const prefetchImage = async (src) => {
        if (!src || objectUrlCache.has(src)) {
            return;
        }
        console.log(`[Prefetch] ⏳ Pre-fetching image: ${src}`);
        try {
            const response = await fetchWithAuth(src, { method: 'GET', timeout: 120000 }, true);
            if (!response.ok) return;
            const imageBlob = await response.blob();
            const objectURL = URL.createObjectURL(imageBlob);
            objectUrlCache.set(src, objectURL);
            console.log(`[Prefetch] ✅ Image pre-fetched and cached: ${src}`);
        } catch (error) {
            console.warn(`[Prefetch] Failed to prefetch image: ${src}`, error);
        }
    };

    const loadAndShowImage = async (index) => {
        console.log(`[Preview] Attempting to load image at index ${index}.`);
        if (index < 0 || index >= currentImageGallery.length) return;
        currentImageIndex = index;

        const src = currentImageGallery[index];
        console.log(`[Preview] 🖼️ Image source URL: ${src}`);
        modalImage.src = '';
    
        if (objectUrlCache.has(src)) {
            console.log(`[Preview] 缓存 Image found in cache. Using cached Object URL.`);
            modalImage.src = objectUrlCache.get(src);
            modal.classList.add('show'); // Show modal since it's cached
        } else {
            console.log(`[Preview] ☁️ Image not in cache. Fetching from server...`);
            try {
                const response = await fetchWithAuth(src, { method: 'GET', timeout: 120000 }, true); // isRaw = true
                if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
                const imageBlob = await response.blob();
                const objectURL = URL.createObjectURL(imageBlob);
                objectUrlCache.set(src, objectURL);
                modalImage.src = objectURL;
                modal.classList.add('show'); // Show modal after successful fetch
                console.log(`[Preview] ✅ Image fetched and displayed successfully.`);
            } catch (error) {
                console.error('Modal image failed to load:', src, error.message);
                showToast('فشل تحميل الصورة. قد تكون مشكلة في الشبكة أو أن الصورة غير موجودة.', true);
                closeModal();
                return;
            }
        }

        prefetchImage(currentImageGallery[index + 1]);
        prefetchImage(currentImageGallery[index - 1]);

        prevBtn.style.display = (index > 0) ? 'block' : 'none';
        nextBtn.style.display = (index < currentImageGallery.length - 1) ? 'block' : 'none';
    };

    document.addEventListener('click', async (e) => {
        if (e.target && e.target.classList.contains('img-preview')) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Preview] 🖱️ Image preview click detected.', { targetSrc: e.target.dataset.src });

            const parentContainer = e.target.closest('.archive-image-thumbnails, #image-previews, .image-thumbnails-container, #evaluation-details-images');
            
            if (parentContainer) {
                const allImages = parentContainer.querySelectorAll('.img-preview');
                currentImageGallery = Array.from(allImages).map(img => img.dataset.src || img.src);
                
                const clickedSrc = e.target.dataset.src || e.target.src;
                const clickedIndex = currentImageGallery.indexOf(clickedSrc);

                console.log(`[Preview] 🖼️ Gallery created with ${currentImageGallery.length} images. Clicked index: ${clickedIndex}.`);
                
                await loadAndShowImage(clickedIndex);
            } else {
                const clickedSrc = e.target.dataset.src || e.target.src;
                currentImageGallery = [clickedSrc];
                console.log('[Preview] ❓ No gallery found. Treating as single image.');
                await loadAndShowImage(0);
            }
        }
    });

    const closeModal = () => {
        modal.classList.remove('show');
        for (const url of objectUrlCache.values()) {
            URL.revokeObjectURL(url);
        }
        objectUrlCache.clear();
        modalImage.src = '';
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    prevBtn.addEventListener('click', () => loadAndShowImage(currentImageIndex - 1));
    nextBtn.addEventListener('click', () => loadAndShowImage(currentImageIndex + 1));
}

function setupUIForUser() {
    const updateAppBtn = document.getElementById('update-app-btn');
    updateNavbarUser();

    const userStr = localStorage.getItem('user');
    if (userStr) {
        if (userStr && userStr !== 'undefined' && userStr !== 'null') {
            try {
                const user = JSON.parse(userStr);
                if (user && user.role === 'admin') {
                    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
                    if (updateAppBtn) updateAppBtn.classList.remove('hidden');
                }
                if (user && (user.role === 'admin' || user.role === 'shift-manager')) {
                    document.querySelectorAll('.shift-manager-only').forEach(el => el.classList.remove('hidden'));
                }
            } catch (error) {
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                location.reload();
            }
        }
    }
}

function showUpdateOverlay(initialMessage = 'جاري البحث عن تحديثات...') {
    let overlay = document.getElementById('update-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'update-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.8); backdrop-filter: blur(5px);
            z-index: 10000; display: flex; flex-direction: column;
            justify-content: center; align-items: center; color: white;
            transition: opacity 0.3s; opacity: 0;
        `;
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
        <canvas id="update-animation-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; opacity: 0.3;"></canvas>
        <div class="update-modal">
            <div class="update-header">
                <i id="update-icon" class="fas fa-sync-alt fa-spin"></i>
                <h3 id="update-status">${initialMessage}</h3>
            </div>
            <p id="update-subtitle">نحن نقوم بتحديث النظام الآن. قد يستغرق هذا بضع دقائق. لا تغلق هذه النافذة.</p>
            
            <div id="update-progress-wrapper" class="progress-wrapper hidden">
                <div class="progress-bar-container">
                    <div id="update-progress-bar" class="progress-bar"></div>
                </div>
                <span id="update-progress-text" class="progress-text">0%</span>
            </div>

            <div class="update-details">
                <button id="toggle-log-btn">عرض التفاصيل الفنية <i class="fas fa-chevron-down"></i></button>
                <div class="update-log-container hidden">
                    <pre id="update-log" class="update-log"></pre>
                </div>
            </div>

            <div id="update-footer" class="update-footer hidden">
                <div class="spinner"></div>
                <p>اكتمل التثبيت. جاري إعادة تشغيل الخادم للانتهاء...</p>
            </div>
            <button id="close-update-overlay-btn" class="submit-btn hidden" style="margin-top: 1.5rem; width: auto; padding: 0.5rem 1rem;">إغلاق</button>
        </div>
    `;
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.style.opacity = 1, 10);

    document.getElementById('close-update-overlay-btn').addEventListener('click', () => {
        stopUpdateAnimation();
        overlay.style.opacity = 0;
        setTimeout(() => overlay.classList.add('hidden'), 300);
    });

    document.getElementById('toggle-log-btn').addEventListener('click', (e) => {
        const logContainer = document.querySelector('.update-log-container');
        const icon = e.currentTarget.querySelector('i');
        logContainer.classList.toggle('hidden');
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
    });
}

function animateProgressBar(duration, onComplete) {
    const progressBar = document.getElementById('update-progress-bar');
    const progressText = document.getElementById('update-progress-text');
    const wrapper = document.getElementById('update-progress-wrapper');
    if (wrapper) wrapper.classList.remove('hidden');

    let start = null;
    const step = (timestamp) => {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        const percentage = Math.floor(progress * 100);
        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}%`;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            if (onComplete) onComplete();
        }
    };
    window.requestAnimationFrame(step);
}

function checkServerStatus(attempts = 0) {
    const maxAttempts = 90;
    if (attempts >= maxAttempts) {
        const updateIcon = document.getElementById('update-icon');
        const footerEl = document.getElementById('update-footer');
        const statusEl = document.getElementById('update-status');
        const closeBtn = document.getElementById('close-update-overlay-btn');

        if (footerEl) footerEl.classList.add('hidden');
        if (statusEl) {
            statusEl.textContent = 'فشل الاتصال بالخادم بعد التحديث.';
            statusEl.style.color = '#ff9800';
        }
        if (closeBtn) closeBtn.classList.remove('hidden');

        const logEl = document.getElementById('update-log');
        if (logEl) {
            logEl.textContent += '\n\n--- \nفشل الاتصال بالخادم بعد التحديث. قد يكون لا يزال يعمل في الخلفية. حاول تحديث الصفحة يدوياً بعد قليل.';
        }
        if (updateIcon) {
            updateIcon.classList.remove('fa-spin', 'fa-sync-alt');
            updateIcon.classList.add('fa-exclamation-triangle');
            updateIcon.style.color = '#ff9800';
        }
        stopUpdateAnimation();
        return;
    }

    const progressBar = document.getElementById('update-progress-bar');
    const progressText = document.getElementById('update-progress-text');
    const percentage = Math.floor((attempts / maxAttempts) * 100);
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = `فحص الاتصال... ${percentage}%`;

    setTimeout(async () => {
        try {
            const response = await fetch(`/api/health?t=${Date.now()}`);
            if (response.ok) {
                const updateIcon = document.getElementById('update-icon');
                const statusEl = document.getElementById('update-status');
                if (statusEl) {
                    statusEl.textContent = 'تم إعادة تشغيل السيرفر بنجاح!';
                    statusEl.style.color = 'var(--success-color)';
                }
                if (updateIcon) {
                    updateIcon.classList.remove('fa-spin', 'fa-sync-alt');
                    updateIcon.classList.add('fa-check-circle');
                    updateIcon.style.color = 'var(--success-color)';
                }
                if (progressBar) progressBar.style.width = '100%';
                if (progressText) progressText.textContent = 'اكتمل 100%';
                const footerEl = document.getElementById('update-footer');
                if (footerEl) footerEl.classList.add('hidden');
 
                stopUpdateAnimation();
                showToast('تم إعادة تشغيل السيرفر بنجاح! سيتم تحديث الصفحة.');
                setTimeout(() => location.reload(), 2000);
            } else { checkServerStatus(attempts + 1); }
        } catch (error) { checkServerStatus(attempts + 1); }
    }, 1000);
}

async function handleAppUpdate() {
    const confirmed = await showConfirmModal(
        'تأكيد تحديث النظام',
        'هل أنت متأكد من أنك تريد البحث عن تحديثات وتثبيتها؟ سيتم إعادة تشغيل السيرفر.',
        {
            iconClass: 'fas fa-cloud-download-alt',
            confirmText: 'نعم، تحديث'
        }
    );
    if (!confirmed) {
        return;
    }

    showUpdateOverlay();
    stopUpdateAnimation = startUpdateAnimation();
    const statusEl = document.getElementById('update-status');
    const logEl = document.getElementById('update-log');
    const footerEl = document.getElementById('update-footer');
    const closeBtn = document.getElementById('close-update-overlay-btn');
    const updateIcon = document.getElementById('update-icon');
 
    try {
        animateProgressBar(15000);
        const result = await fetchWithAuth('/api/system/update', {
            method: 'POST',
            timeout: 180000
        });
 
        statusEl.textContent = result.message;
        
        const progressBar = document.getElementById('update-progress-bar');
        const progressText = document.getElementById('update-progress-text');
        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = 'اكتمل 100%';
        
        if (result.log && result.log.trim() !== '') {
            logEl.textContent = result.log;
        } else {
            logEl.textContent = 'لم يتم إرجاع أي سجلات من الخادم. قد يكون التحديث قد تم بصمت أو أن النظام محدث بالفعل.';
        }

        if (result.needsRestart) {
            footerEl.classList.remove('hidden');
            statusEl.textContent = 'تم سحب التحديثات. جاري إعادة تشغيل الخادم...';
            if (progressText) progressText.textContent = '';
            checkServerStatus();
        } else {
            stopUpdateAnimation();
            closeBtn.classList.remove('hidden');
            if (updateIcon) {
                updateIcon.classList.remove('fa-spin', 'fa-sync-alt');
                updateIcon.classList.add('fa-check-circle');
                updateIcon.style.color = 'var(--success-color)';
            }
        }
    } catch (error) {
        stopUpdateAnimation();
        if (updateIcon) {
            updateIcon.classList.remove('fa-spin', 'fa-sync-alt');
            updateIcon.classList.add('fa-exclamation-triangle');
            updateIcon.style.color = 'var(--danger-color)';
        }
        statusEl.textContent = 'حدث خطأ أثناء التحديث!';
        statusEl.style.color = 'var(--danger-color)';
        logEl.textContent = error.log || error.message || 'خطأ غير معروف.';
        closeBtn.classList.remove('hidden');        
    }
}

async function handleGoldMarketUpload() {
    const modal = document.createElement('div');
    modal.id = 'gold-upload-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-dialog" style="max-width: 500px; text-align: center;">
            <div class="modal-header" style="justify-content: center; border-bottom: none; padding-bottom: 0;">
                <h3><i class="fas fa-exclamation-triangle" style="color: #FFD700;"></i> إرسال تنبيه إغلاق الذهب</h3>
            </div>
            <div class="modal-body" style="padding-top: 1rem;">
                <p style="margin-bottom: 1.5rem;">ارفع صورة إثبات إغلاق السوق. سيتم إرسالها تلقائياً.</p>
                <div id="gold-upload-area" style="border: 2px dashed var(--border-color); border-radius: 8px; padding: 2rem; text-align: center; color: #aaa; cursor: pointer; transition: all 0.2s ease;">
                    <i class="fas fa-cloud-upload-alt" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
                    <p>الصق الصورة هنا أو انقر للاختيار</p>
                </div>
                <input type="file" id="gold-upload-input" accept="image/*" class="hidden">
            </div>
            <div class="modal-footer" style="justify-content: center; border-top: 1px solid var(--border-color); padding-top: 1.5rem; margin-top: 1.5rem;">
                 <button id="gold-upload-cancel-btn" class="cancel-btn"><i class="fas fa-times"></i> إغلاق</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);

    const uploadArea = modal.querySelector('#gold-upload-area');
    const fileInput = modal.querySelector('#gold-upload-input');

    const handleFile = async (file) => {
        if (!file || !file.type.startsWith('image/')) {
            showToast('الرجاء رفع ملف صورة صالح.', true);
            return;
        }

        document.removeEventListener('paste', pasteHandler);
        modal.remove();
        
        showToast('جاري إرسال صورة إغلاق الذهب...');

        const formData = new FormData();
        formData.append('image', file);

        try {
            const result = await fetchWithAuth('/api/broadcast/gold-market-close-with-image', {
                method: 'POST',
                body: formData
            });
            showToast(result.message);
        } catch (error) {
            showToast(error.message, true);
        }
    };

    const closeModal = () => {
        document.removeEventListener('paste', pasteHandler);
        modal.classList.remove('show');
        modal.addEventListener('transitionend', () => modal.remove(), { once: true });
    };

    modal.querySelector('#gold-upload-cancel-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
    
    const pasteHandler = (e) => { const items = (e.clipboardData || window.clipboardData).items; for (const item of items) { if (item.type.indexOf('image') !== -1) { e.preventDefault(); const file = item.getAsFile(); handleFile(file); return; } } };
    document.addEventListener('paste', pasteHandler);
}

let healthCheckInterval = null;

function updateSystemHealth() {
    const container = document.getElementById('system-health-container');
    if (!container) {
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        return;
    }

    fetchWithAuth('/api/health')
        .then(result => {
            renderSystemHealth(true);
        })
        .catch((error) => {
            renderSystemHealth(false);
        });
}

function renderSystemHealth(isOverallHealthy) {
    const container = document.getElementById('system-health-container');
    if (!container) return;

    const timeString = new Date().toLocaleTimeString('ar-EG');
    const overallStatusText = isOverallHealthy ? 'النظام يعمل بشكل طبيعي' : 'توجد مشكلة في الاتصال';
    const overallStatusClass = isOverallHealthy ? 'healthy' : 'unhealthy';

    const userStr = localStorage.getItem('user');
    const isAdmin = userStr ? (JSON.parse(userStr).role === 'admin') : false;

    const adminControls = isAdmin ? `
        <div class="health-admin-controls">
            <button id="check-server-url-btn" class="submit-btn" style="font-size: 0.8rem; padding: 5px 10px; width: auto;">
                <i class="fas fa-link"></i> فحص رابط السيرفر
            </button>
        </div>
    ` : '';

    container.innerHTML = `
        <div class="health-main-status ${overallStatusClass}">
            <div class="status-light"></div>
            <span>${overallStatusText}</span>
        </div>
        ${adminControls}
        <div class="health-last-checked">
            <i class="fas fa-history"></i> آخر فحص: ${timeString}
        </div>
    `;

    if (isAdmin) {
        document.getElementById('check-server-url-btn')?.addEventListener('click', async () => {
            const result = await fetchWithAuth('/api/health/check-url');
            const url = result.serverUrl;
            showToast(`رابط السيرفر الحالي هو: ${url}. سيتم محاولة فتحه...`);
            window.open(url, '_blank');
        });
    }
}

async function loadAndDisplayVersion() {
    const versionSpan = document.getElementById('app-version-health');
    if (!versionSpan) return;
    try {
        const { version } = await fetchWithAuth('/api/version');
        versionSpan.textContent = `v${version || '?.?.?'}`;
    } catch (error) {
        console.error('Failed to load app version:', error);
        versionSpan.textContent = 'v?.?.?';
    }
}

async function fetchAndRenderNotifications() {
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notification-badge');
    if (!list || !badge) return;

    if (!list.querySelector('.notification-header')) {
        list.innerHTML = `
            <div class="notification-header">
                <h4>الإشعارات</h4>
                <button id="refresh-notifications-btn" class="icon-btn" title="تحديث"><i class="fas fa-sync-alt"></i></button>
            </div>
            <div id="notification-items-container"></div>
            <div class="notification-footer">
                <a href="#notifications">عرض كل الإشعارات</a>
            </div>
        `;
    }
    const itemsContainer = document.getElementById('notification-items-container');

    const userStr = localStorage.getItem('user');
    let isAdmin = false;
    let user = null;
    if (userStr) {
        try {
            // Assign to the user variable declared outside the try block
            user = JSON.parse(userStr);
            isAdmin = user.role === 'admin';
        } catch (e) { /* ignore */ }
    }

    try {
        const response = await fetchWithAuth('/api/notifications');
        let notifications = [];
        let unreadCountFromApi = 0;

        if (response && response.data && response.data.notifications) {
            notifications = response.data.notifications;
            unreadCountFromApi = response.data.unreadCount || 0;
        }

        const unreadCount = unreadCountFromApi > 0 ? unreadCountFromApi : notifications.filter(n => !n.is_read).length;
        
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        if (notifications.length === 0) {
            itemsContainer.innerHTML = '<div class="notification-item" style="text-align: center; color: #aaa;">لا توجد إشعارات.</div>';
            return;
        }

        itemsContainer.innerHTML = notifications.map(n => {
            const currentUserId = user ? user.id.toString() : null;
            const isLiked = n.likes && n.likes.includes(currentUserId);
            const adminDeleteBtn = isAdmin ? `<button class="delete-notification-btn" data-id="${n._id}" title="حذف هذا الإشعار">&times;</button>` : '';
            const iconHtml = n.icon ? `<i class="fas ${n.icon} notification-icon"></i>` : '<i class="fas fa-bell notification-icon"></i>';
            const typeClass = n.type ? `notification-type-${n.type}` : '';
            // Only show the like button if the notification type is not 'like'
            const likeButton = !isAdmin && n.type !== 'like' ? `<button class="like-notification-btn ${isLiked ? 'liked' : ''}" data-id="${n._id}" title="تأكيد القراءة"><i class="fas fa-heart"></i></button>` : '';

            return `
                <div class="notification-item-wrapper">
                    <a href="${n.link || '#'}" class="notification-item ${!n.is_read ? 'unread' : ''} ${typeClass}" data-id="${n._id}" data-notification-link>
                        ${iconHtml}
                        <div class="notification-content">
                            <p class="notification-message">${n.message}</p>
                            <span class="time">${timeAgo(n.created_at)}</span>
                        </div>
                    </a>
                    ${likeButton}
                    ${adminDeleteBtn}
                </div>`;
        }).join('');

    } catch (error) {
        console.error('Failed to fetch notifications:', error);
    }
}

/**
 * Dynamically adds a notification to the navbar dropdown list.
 * This function is called by the WebSocket event handler.
 * @param {object} notification - The notification object from the server.
 */
function addNotificationToDOM(notification) {
    const itemsContainer = document.getElementById('notification-items-container');
    const badge = document.getElementById('notification-badge');
    if (!itemsContainer || !badge) return;

    console.log('[UI Update] Adding notification to DOM:', notification);

    // Remove the "no notifications" message if it exists
    const noNotificationsMessage = itemsContainer.querySelector('.notification-item');
    if (noNotificationsMessage && noNotificationsMessage.textContent.includes('لا توجد إشعارات')) {
        itemsContainer.innerHTML = '';
    }

    // Re-use the rendering logic from fetchAndRenderNotifications
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const currentUserId = user ? user.id : null;
    const isAdmin = user ? user.role === 'admin' : false;
    const isLiked = notification.likes && notification.likes.includes(currentUserId);
    const adminDeleteBtn = isAdmin ? `<button class="delete-notification-btn" data-id="${notification._id}" title="حذف هذا الإشعار">&times;</button>` : '';
    const iconHtml = notification.icon ? `<i class="fas ${notification.icon} notification-icon"></i>` : '<i class="fas fa-bell notification-icon"></i>';
    const typeClass = notification.type ? `notification-type-${notification.type}` : '';
    const likeButton = !isAdmin && notification.type !== 'like' ? `<button class="like-notification-btn ${isLiked ? 'liked' : ''}" data-id="${notification._id}" title="تأكيد القراءة"><i class="fas fa-heart"></i></button>` : '';

    const newItem = document.createElement('div');
    newItem.className = 'notification-item-wrapper';
    newItem.innerHTML = `
        <a href="${notification.link || '#'}" class="notification-item unread ${typeClass}" data-id="${notification._id}" data-notification-link>
            ${iconHtml}
            <div class="notification-content">
                <p class="notification-message">${notification.message}</p>
                <span class="time">${timeAgo(notification.created_at)}</span>
            </div>
        </a>
        ${likeButton}
        ${adminDeleteBtn}
    `;
    itemsContainer.prepend(newItem);

    // Update badge
    const currentCount = parseInt(badge.textContent) || 0;
    const newCount = currentCount + 1;
    badge.textContent = newCount > 9 ? '9+' : newCount;
    badge.classList.remove('hidden');
}

function handleNotifications() {
    const btn = document.getElementById('notifications-btn');
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notification-badge');

    if (!btn || !list) return;

    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isVisible = list.style.display === 'block';
        list.style.display = isVisible ? 'none' : 'block';

        if (!isVisible && !badge.classList.contains('hidden')) {
            badge.classList.add('hidden');
            list.querySelectorAll('.unread').forEach(item => item.classList.remove('unread'));
            await fetchWithAuth('/api/notifications/mark-read', { method: 'POST' });
        }
    });

    document.addEventListener('click', (e) => {
        if (list.style.display === 'block' && !list.contains(e.target) && !btn.contains(e.target)) {
            list.style.display = 'none';
        }
    });

    list.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-notification-btn');
        const refreshBtn = e.target.closest('#refresh-notifications-btn');
        const notificationLink = e.target.closest('[data-notification-link]');
        const likeBtn = e.target.closest('.like-notification-btn');

        if (refreshBtn) {
            e.preventDefault();
            e.stopPropagation();
            const icon = refreshBtn.querySelector('i');
            icon.classList.add('fa-spin');
            await fetchAndRenderNotifications();
            // The spinner removal is handled inside fetchAndRenderNotifications
            return;
        }

        if (notificationLink) {
            // Don't prevent default, allow navigation
            // But also don't let it bubble up to the like button handler
            return;
        }

        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();

            const notificationId = deleteBtn.dataset.id;

            const confirmed = await showConfirmModal(
                'تأكيد الحذف',
                'هل أنت متأكد من حذف هذا الإشعار؟',
                {
                    iconClass: 'fas fa-trash-alt',
                    iconColor: 'var(--danger-color)',
                    confirmText: 'نعم، حذف',
                    confirmClass: 'submit-btn danger-btn'
                }
            );

            if (confirmed) {
                try {
                    console.log(`[Notification Delete] Sending delete request for ID: ${notificationId}`);
                    const result = await fetchWithAuth(`/api/notifications/${notificationId}`, { method: 'DELETE' });
                    console.log('[Notification Delete] Server response:', result);
                    showToast(result.message);
                    fetchAndRenderNotifications();
                } catch (error) { 
                    console.error('[Notification Delete] Error during deletion:', error);
                    showToast(error.message, true); 
                } 
            }
        }

        if (likeBtn && !likeBtn.classList.contains('liked')) {
            e.preventDefault();
            e.stopPropagation();
            const notificationId = likeBtn.dataset.id;
            likeBtn.classList.add('liked');
            likeBtn.disabled = true;
            const heartIcon = likeBtn.querySelector('i');
            if (heartIcon) {
                heartIcon.style.color = 'var(--danger-color)';
            }
            try {
                await fetchWithAuth(`/api/notifications/${notificationId}/like`, { method: 'POST' });
                showToast('تم تأكيد القراءة.');
            } catch (error) {
                showToast(error.message, true);
            }
        }
    });
}

let eventSource = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectInterval = 5000;

function initRealtimeNotifications() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.warn('[SSE] لا يوجد توكن متاح. لن يتم بدء الاتصال اللحظي.');
        return;
    }

    if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
        console.warn(`[SSE] An existing EventSource was found with readyState: ${eventSource.readyState}. Closing it before creating a new one.`);
        eventSource.close();
        eventSource = null;
    }

    let lastHeartbeat = 0;
    let heartbeatCheckInterval = null;

    const updateIndicator = (isConnected) => {
        // console.log(`[SSE Status] تحديث المؤشر. الحالة: ${isConnected ? 'متصل' : 'غير متصل'}`);
        const statusIndicator = document.getElementById('notification-status-indicator');
        if (statusIndicator) {
            if (isConnected) {
                statusIndicator.classList.remove('disconnected');
                statusIndicator.classList.add('connected');
                statusIndicator.title = `متصل بالتحديثات اللحظية (آخر تحديث: ${new Date().toLocaleTimeString()})`;
            } else {
                statusIndicator.classList.remove('connected');
                statusIndicator.classList.add('disconnected');
                statusIndicator.title = 'انقطع الاتصال اللحظي، جاري إعادة المحاولة...';
            }
        }
    };

    const reconnect = () => {
        if (reconnectAttempts >= maxReconnectAttempts) {
            console.error('[SSE] تم الوصول إلى الحد الأقصى لمحاولات إعادة الاتصال.');
            showToast('فشل الاتصال اللحظي بعد عدة محاولات. يرجى إعادة تحميل الصفحة.', true);
            updateIndicator(false);
            return;
        }

        console.log(`[SSE] جاري إعادة المحاولة ${reconnectAttempts + 1}/${maxReconnectAttempts}...`);
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30 seconds
        setTimeout(() => {
            initRealtimeNotifications();
        }, delay);
    };

    const setupEventSource = () => {        
        eventSource = new EventSource(`/api/events?token=${token}`);
        reconnectAttempts = 0;

        eventSource.onopen = () => {
            // console.log('[EventSource] تم فتح الاتصال بنجاح. (readyState: OPEN)');
            lastHeartbeat = Date.now();
            updateIndicator(true);

            if (heartbeatCheckInterval) clearInterval(heartbeatCheckInterval);
            heartbeatCheckInterval = setInterval(() => {
                if (lastHeartbeat !== 0 && Date.now() - lastHeartbeat > 60000) { // Increased from 35000 to 60000
                    console.warn('[SSE Heartbeat] لم يتم استلام نبضة قلب منذ أكثر من 60 ثانية. إعادة الاتصال...');
                    eventSource.close();
                    reconnect();
                    clearInterval(heartbeatCheckInterval);
                }
            }, 15000);
        };

        eventSource.addEventListener('heartbeat', (event) => {
            lastHeartbeat = Date.now();
            updateIndicator(true);
        });

        eventSource.addEventListener('connected', (event) => {
            // console.log('[EventSource] رسالة "connected" من الخادم.');
            updateIndicator(true);
        });

        eventSource.addEventListener('error', (event) => {
            if (event.data) {
                try {
                    const errorData = JSON.parse(event.data);
                    const authFailed = errorData.message === 'Authentication failed.' || errorData.message === 'No token provided.';
                    const connExists = errorData.message === 'Connection already exists.';
                    
                    if (authFailed || connExists) {
                        const reason = authFailed ? 'Authentication failed' : (connExists ? 'Connection already exists' : 'Unknown error');
                        console.error(`[SSE] Unrecoverable error: ${reason}. Stopping reconnect attempts.`);
                        eventSource.close();
                        updateIndicator(false);
                        if (authFailed) showToast('فشل الاتصال اللحظي. قد تحتاج لتحديث الصفحة أو تسجيل الدخول مرة أخرى.', true);
                    }
                } catch (e) {
                    // Not a structured JSON error, handled by onerror below
                }
            }
        });

        eventSource.addEventListener('gold_market_closed', (event) => {
            showToast('تنبيه: تم إيقاف سوق الذهب!');
            playSound(goldNotificationSound);
            fetchAndRenderNotifications();
        });

        eventSource.addEventListener('notification_created', (event) => {
            console.log('[SSE] Received "notification_created" event:', event.data);
            const notificationData = JSON.parse(event.data);
            showToast(notificationData.message || 'لديك إشعار جديد!');
            playSound(notificationSound);
            addNotificationToDOM(notificationData);
        });


        eventSource.addEventListener('notification_deleted', (event) => {
            fetchAndRenderNotifications();
        });

        eventSource.addEventListener('instruction_created', (event) => {
            const { instruction } = JSON.parse(event.data);
            showToast(`تمت إضافة تعليمة جديدة: ${instruction.title.replace(/<[^>]*>?/gm, '')}`);
            playSound(notificationSound);
            fetchAndRenderNotifications();
            if (window.location.hash.startsWith('#instructions')) {
                addInstruction(instruction);
            }
        });

        eventSource.addEventListener('instruction_updated', (event) => {
            if (window.location.hash.startsWith('#instructions')) {
                const { instruction } = JSON.parse(event.data);
                updateInstruction(instruction);
            }
        });

        eventSource.addEventListener('instruction_deleted', (event) => {
            if (window.location.hash.startsWith('#instructions')) {
                const { id } = JSON.parse(event.data);
                removeInstruction(id);
            }
        });

        eventSource.addEventListener('special_identifier_updated', (event) => {
            if (window.location.hash.startsWith('#instructions')) {
                fetchAndRenderSpecialIdentifiers();
            }
        });

        eventSource.addEventListener('user_created', (event) => {
            if (window.location.hash.startsWith('#users')) {
                const { user } = JSON.parse(event.data);
                addUserToGrid(user);
                showToast(`تمت إضافة مستخدم جديد: ${user.username}`);
            }
        });

        eventSource.addEventListener('user_updated', (event) => {
            const eventData = JSON.parse(event.data);
            const updatedUser = eventData.user || eventData;
            const currentUserStr = localStorage.getItem('user');
            if (!currentUserStr) return;

            let currentUser;
            try {
                currentUser = JSON.parse(currentUserStr);
            } catch (e) {
                return;
            }

            if (currentUser.id.toString() === updatedUser.id.toString()) {
                localStorage.setItem('user', JSON.stringify(updatedUser));
                updateNavbarUser();
                showToast('تم تحديث بيانات ملفك الشخصي من قبل المسؤول.');
                if (window.location.hash === '#profile') {
                    renderProfilePage();
                }
            }
        });

        eventSource.onerror = (err) => {
            if (eventSource.readyState === EventSource.CLOSED) {
                console.log('[EventSource] Connection was closed intentionally. Aborting generic onerror handler.');
                return;
            }
            console.error('[EventSource] حدث خطأ في الاتصال:', {
                readyState: eventSource.readyState,
                url: eventSource.url,
                error: err
            });
            updateIndicator(false);
            eventSource.close();
            reconnect();
        };
    };

    fetchWithAuth('/api/verify-token')
        .then(response => {
            setupEventSource();
        })
        .catch(error => {
            console.error('[SSE] فشل التحقق من التوكن:', error.message);
            showToast('تحذير: تعذر التحقق من التوكن. سيتم محاولة الاتصال اللحظي بدون تحقق.', true);
            setupEventSource();
        });
}

function showChangelogModal(changelog) {
    const modal = document.getElementById('changelog-modal');
    const titleEl = document.getElementById('changelog-title');
    const bodyEl = document.getElementById('changelog-body');
    const okBtn = document.getElementById('changelog-modal-ok-btn');
    const closeBtn = document.getElementById('changelog-modal-close-btn');

    if (!modal || !titleEl || !bodyEl || !okBtn || !closeBtn) return;

    titleEl.innerHTML = `ما الجديد في الإصدار <span class="app-version-badge" style="color: var(--accent-color)">v${changelog.version}</span>`;
    
    const versionsToShow = Array.isArray(changelog) ? changelog : [changelog];

    bodyEl.innerHTML = versionsToShow.map(versionEntry => {
        const changeTypeMap = {
            new: { icon: 'fa-plus-circle', text: 'إضافة جديدة', class: 'new' },
            improvement: { icon: 'fa-arrow-alt-circle-up', text: 'تحسين', class: 'improvement' },
            fix: { icon: 'fa-wrench', text: 'إصلاح', class: 'fix' }
        };

        const changesHtml = versionEntry.changes.map(change => {
            const typeInfo = changeTypeMap[change.type] || { icon: 'fa-info-circle', text: 'تغيير', class: '' };
            return `
                <li>
                    <i class="fas ${typeInfo.icon} changelog-item-icon ${typeInfo.class}"></i>
                    <div>
                        <strong>${typeInfo.text}:</strong>
                        <p>${change.description}</p>
                    </div>
                </li>
            `;
        }).join('');

        return `
            <div class="changelog-version-group">
                <h4>
                    الإصدار v${versionEntry.version}
                    <span class="changelog-date">${new Date(versionEntry.date).toLocaleDateString('ar-EG')}</span>
                </h4>
                <ul>${changesHtml}</ul>
            </div>
        `;
    }).join('');

    const closeModal = () => modal.classList.remove('show');

    okBtn.onclick = closeModal;
    closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    modal.classList.add('show');
}

let isAppInitialized = false;

function initApp() {
    if (isAppInitialized) {
        console.warn('[App] initApp() was called more than once. Execution blocked to prevent re-initialization.');
        return;
    }
    isAppInitialized = true;
    // console.log('[App] Initializing application...');
    const navBrand = document.querySelector('.nav-brand');

    // --- إضافة فاصل مرئي بعد الشعار ---
    if (navBrand && !document.querySelector('.navbar-brand-separator')) {
        const separator = document.createElement('div');
        separator.className = 'navbar-brand-separator';
        separator.style.cssText = `
            width: 1px;
            height: 35px;
            background-color: var(--border-color);
            margin: 0 24px 0 8px;
        `;
        navBrand.after(separator);
    }

    handleTheme();
    const notificationsBtn = document.getElementById('notifications-btn');
    if (notificationsBtn && !document.getElementById('notification-status-indicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'notification-status-indicator';
        indicator.className = 'status-indicator disconnected';
        indicator.title = 'انقطع الاتصال اللحظي، جاري إعادة المحاولة...';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'notification-btn-wrapper';
        notificationsBtn.parentNode.insertBefore(wrapper, notificationsBtn);
        wrapper.appendChild(notificationsBtn);
        wrapper.appendChild(indicator);
    }
    
    const navActions = document.querySelector('.nav-actions');
    if (navActions && !document.getElementById('gold-market-close-btn')) {
        const goldButton = document.createElement('button');
        goldButton.id = 'gold-market-close-btn';
        goldButton.className = 'icon-btn admin-only hidden';
        goldButton.title = 'إرسال تنبيه إغلاق سوق الذهب';
        goldButton.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #FFD700;"></i>';
        
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        if (themeToggleBtn) {
            themeToggleBtn.insertAdjacentElement('afterend', goldButton);
        } else {
            navActions.prepend(goldButton);
        }

        goldButton.addEventListener('click', handleGoldMarketUpload);
    }

    handleImagePreviewModal();
    initIpWidget();
    initTemplatesWidget();
    listenForSpecialIdentifierUpdates(); // تفعيل المستمع لتحديثات التبليغات الخاصة
    loadSpecialIdentifiers(); // تحميل قائمة التبليغات الخاصة

    const restartTourBtn = document.getElementById('restart-tour-btn');
    if (restartTourBtn) {
        restartTourBtn.addEventListener('click', () => checkAndStartTour(true));
    }

    // System Update Button (Admin only)
    const updateSystemBtn = document.getElementById('update-system-btn');
    if (updateSystemBtn) {
        updateSystemBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.hash = '#system-update';
        });
    }

    document.getElementById('logout-btn').addEventListener('click', async () => {
        const confirmed = await showConfirmModal(
            'تسجيل الخروج',
            'هل أنت متأكد من رغبتك في تسجيل الخروج؟',
            {
                iconClass: 'fas fa-sign-out-alt',
                iconColor: 'var(--danger-color)',
                confirmText: 'نعم، تسجيل الخروج',
                confirmClass: 'submit-btn danger-btn',
                cancelText: 'إلغاء'
            }
        );
        if (confirmed) {
            // Log the logout activity before clearing session
            const userStr = localStorage.getItem('user');
            const userEmail = userStr ? JSON.parse(userStr).email : null;

            try {
                await fetchWithAuth('/api/activity-logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'logout', details: { email: userEmail } })
                });
            } catch (e) { /* Silently fail, logout is more important */ }
            if (healthCheckInterval) clearInterval(healthCheckInterval);
            if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
                eventSource.close();
            }
            const theme = localStorage.getItem('theme');
            localStorage.clear();
            if (theme) {
                localStorage.setItem('theme', theme);
            }
            window.location.replace('/');
        }
    });

    window.addEventListener('hashchange', navigate);
    
    setupUIForUser();
    navigate();

    handleNotifications();
    fetchAndRenderNotifications();
    initRealtimeNotifications();
    if (sessionStorage.getItem('justLoggedIn') === 'true') {
        showToast('تم تسجيل الدخول بنجاح!');
        sessionStorage.removeItem('justLoggedIn');
    }

    loadAndDisplayVersion();
    updateSystemHealth();
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    healthCheckInterval = setInterval(updateSystemHealth, 30000);
}

export { initApp };