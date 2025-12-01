import { showToast } from './ui.js';

let tourSteps = [];
let currentStepIndex = 0;
let tooltip = null;

function createElements() {
    // Add class to body to handle overlay effect and prevent scrolling
    document.body.classList.add('tour-active');

    // Create tooltip
    tooltip = document.createElement('div');
    tooltip.id = 'tour-tooltip';
    tooltip.innerHTML = `
        <div id="tour-tooltip-text"></div>
        <div id="tour-tooltip-footer">
            <button id="tour-skip-btn">تخطي</button>
            <div class="tour-nav-buttons">
                <button id="tour-prev-btn" class="hidden">السابق</button>
                <button id="tour-next-btn">التالي</button>
            </div>
        </div>
    `;
    document.body.appendChild(tooltip);

    // Add event listeners
    document.getElementById('tour-skip-btn').addEventListener('click', endTour);
    document.getElementById('tour-next-btn').addEventListener('click', nextStep);
    document.getElementById('tour-prev-btn').addEventListener('click', prevStep);
}

function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        // Check immediately
        const element = document.querySelector(selector);
        if (element) {
            return resolve(element);
        }

        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                clearTimeout(timer);
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        const timer = setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Tour element not found: ${selector}`));
        }, timeout);
    });
}

async function showStep(index) {
    if (index < 0 || index >= tourSteps.length) {
        endTour();
        return;
    }

    currentStepIndex = index;
    const step = tourSteps[index];

    if (tooltip) tooltip.style.display = 'none';
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));

    if (step.action) {
        step.action();
    }

    try {
        const targetElement = await waitForElement(step.selector);

        // Scroll the element into view for clarity and a better user experience
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // A short delay to allow the scroll to finish before highlighting and showing the tooltip
        await new Promise(resolve => setTimeout(resolve, 300));

        targetElement.classList.add('tour-highlight');
        
        document.getElementById('tour-tooltip-text').innerHTML = step.text;

        tooltip.style.display = 'block';
        tooltip.style.transform = 'none';

        if (step.selector === '#main-content') {
            tooltip.style.top = '50%';
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
        } else {
            const targetRect = targetElement.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            let top = targetRect.bottom + 10;
            let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

            if (top + tooltipRect.height > window.innerHeight) top = targetRect.top - tooltipRect.height - 10;
            if (left < 10) left = 10;
            if (left + tooltipRect.width > window.innerWidth) left = window.innerWidth - tooltipRect.width - 10;

            tooltip.style.top = `${top}px`;
            tooltip.style.left = `${left}px`;
        }

        document.getElementById('tour-prev-btn').classList.toggle('hidden', index === 0);
        document.getElementById('tour-next-btn').textContent = (index === tourSteps.length - 1) ? 'إنهاء' : 'التالي';
    } catch (error) {
        console.error(error.message);
        showToast(`تعذر العثور على عنصر الجولة. الانتقال للخطوة التالية.`, true);
        nextStep();
    }
}

function nextStep() { showStep(currentStepIndex + 1); }
function prevStep() { showStep(currentStepIndex - 1); }

async function endTour() {
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
    document.body.classList.remove('tour-active');
    if (tooltip) tooltip.remove();
    
    // Update backend first
    try {
        const token = localStorage.getItem('token');
        if (token) {
            await fetch('/api/profile/tour-completed', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
    } catch (error) {
        // Silently fail, not critical if this fails.
    }

    // Then update localStorage to reflect the change immediately
    updateUserInLocalStorage({ has_completed_tour: true });

    showToast('اكتملت الجولة التعريفية! أهلاً بك.');
    setTimeout(() => {
        if (window.location.hash !== '#home') window.location.hash = '#home';
    }, 1500);
}

export function startTour(steps) {
    if (!steps || steps.length === 0) return;
    tourSteps = steps;
    createElements();
    showStep(0);
}

function updateUserInLocalStorage(update) {
    const userStr = localStorage.getItem('user');
    if (userStr) {
        try {
            let user = JSON.parse(userStr);
            user = { ...user, ...update };
            localStorage.setItem('user', JSON.stringify(user));
        } catch (e) { console.error("Failed to update user in localStorage", e); }
    }
}

export function checkAndStartTour(force = false) {
    setTimeout(() => {
        const userStr = localStorage.getItem('user');
        if (!userStr) return;
        try {            
            const user = JSON.parse(userStr);
            if (force || !user.has_completed_tour) {
                const isAdmin = user.role === 'admin';
                
                const steps = [
                    { selector: '#navbar .nav-brand', text: 'مرحباً بك في نظام تقارير INZO! هذا هو شعار النظام والزر الرئيسي للعودة للصفحة الرئيسية.' },
                    { selector: '.nav-links .dropdown', text: 'من هنا، يمكنك الوصول إلى نماذج إنشاء التقارير المختلفة حسب نوعها.' },
                    { 
                        action: () => { window.location.hash = '#archive'; },
                        selector: '#main-content .page-title', 
                        text: 'هذه هي صفحة الأرشيف، حيث يمكنك تصفح جميع التقارير السابقة والبحث فيها.' 
                    },
                    { 
                        action: () => { window.location.hash = '#instructions'; },
                        selector: '#main-content .page-title', 
                        text: 'هنا تجد صفحة التعليمات، وهي مرجع سريع للإجراءات والسياسات المتبعة في القسم.' 
                    },
                    { 
                        action: () => { window.location.hash = '#comparator'; },
                        selector: '#main-content .page-title', 
                        text: 'وهذه أداة متقدمة لمقارنة قوائم الحسابات واستخراج البيانات الجديدة بسهولة.' 
                    },
                    { 
                        action: () => { window.location.hash = '#home'; }, // Go back to home to ensure buttons are visible
                        selector: '#quick-ip-check-btn', 
                        text: 'أداة سريعة لفحص أي IP تقوم بنسخه. ستظهر تلقائياً عند نسخ IP صالح.' 
                    },
                    { 
                        selector: '#theme-toggle-btn', 
                        text: 'استخدم هذا الزر للتبديل بين الوضع الليلي والنهاري لتريح عينيك.' 
                    },
                    { 
                        selector: '#user-profile-btn', 
                        text: 'من هنا يمكنك الوصول لملفك الشخصي، تحديث النظام، وإعادة الجولة التعريفية.' 
                    },
                ];

                if (isAdmin) {
                    steps.push({ 
                        action: () => { window.location.hash = '#users'; },
                        selector: '#main-content .page-title', 
                        text: 'بصفتك مسؤولاً، يمكنك من هنا إدارة الموظفين، إضافة مستخدمين جدد، وتحديد صلاحياتهم.' 
                    });
                }

                steps.push({ 
                    action: () => { window.location.hash = '#home'; },
                    selector: '.dashboard-header', 
                    text: 'أخيراً، هذه هي لوحة التحكم الرئيسية. هنا يمكنك رؤية إحصائيات سريعة عن نشاط النظام. استمتع بالعمل!' 
                });
                
                startTour(steps);
            }
        } catch(e) { /* ignore */ }
    }, 1000);
}