import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

export function renderSystemUpdatePage() {
    return `
        <div class="system-update-container">
            <div class="update-card">
                <div class="update-header">
                    <div class="update-icon-wrapper">
                        <i class="fas fa-sync-alt update-icon"></i>
                    </div>
                    <h1 class="update-title">تحديث النظام</h1>
                    <p class="update-subtitle">جلب آخر التحديثات من GitHub</p>
                </div>

                <div class="update-body">
                    <div class="update-info-box">
                        <i class="fas fa-info-circle"></i>
                        <div>
                            <h3>ماذا سيحدث؟</h3>
                            <ul>
                                <li>سحب أحدث التحديثات من المستودع</li>
                                <li>تثبيت التبعيات الجديدة</li>
                                <li>إعادة تشغيل الخادم تلقائياً</li>
                            </ul>
                        </div>
                    </div>

                    <div class="update-progress" id="update-progress" style="display: none;">
                        <div class="progress-steps">
                            <div class="progress-step" id="step-1">
                                <div class="step-icon">
                                    <i class="fas fa-download"></i>
                                </div>
                                <div class="step-content">
                                    <h4>جاري سحب التحديثات</h4>
                                    <p>يتم الاتصال بـ GitHub...</p>
                                </div>
                            </div>
                            
                            <div class="progress-step" id="step-2">
                                <div class="step-icon">
                                    <i class="fas fa-box"></i>
                                </div>
                                <div class="step-content">
                                    <h4>تثبيت التبعيات</h4>
                                    <p>يتم تحديث الحزم...</p>
                                </div>
                            </div>
                            
                            <div class="progress-step" id="step-3">
                                <div class="step-icon">
                                    <i class="fas fa-server"></i>
                                </div>
                                <div class="step-content">
                                    <h4>إعادة تشغيل الخادم</h4>
                                    <p>يتم إعادة تشغيل النظام...</p>
                                </div>
                            </div>
                            
                            <div class="progress-step" id="step-4">
                                <div class="step-icon">
                                    <i class="fas fa-check-circle"></i>
                                </div>
                                <div class="step-content">
                                    <h4>اكتمل التحديث</h4>
                                    <p>جاري إعادة الاتصال...</p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="progress-bar-container">
                            <div class="progress-bar" id="progress-bar"></div>
                        </div>
                        
                        <div class="progress-percentage" id="progress-percentage">0%</div>
                    </div>

                    <div class="update-actions">
                        <button class="btn-update-start" id="start-update-btn">
                            <i class="fas fa-rocket"></i>
                            <span>بدء التحديث</span>
                        </button>
                        <button class="btn-update-cancel" onclick="window.location.hash='#home'">
                            <i class="fas fa-times"></i>
                            <span>إلغاء</span>
                        </button>
                    </div>

                    <div class="update-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>تأكد من حفظ أي عمل جاري قبل التحديث</span>
                    </div>
                </div>
            </div>
        </div>

        <style>
            .system-update-container {
                min-height: calc(100vh - 80px);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 2rem;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                animation: gradientShift 15s ease infinite;
                background-size: 200% 200%;
            }

            @keyframes gradientShift {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }

            .update-card {
                background: white;
                border-radius: 24px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                max-width: 700px;
                width: 100%;
                overflow: hidden;
                animation: slideUp 0.6s ease-out;
            }

            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .update-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 3rem 2rem;
                text-align: center;
                position: relative;
                overflow: hidden;
            }

            .update-header::before {
                content: '';
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
                animation: rotate 20s linear infinite;
            }

            @keyframes rotate {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            .update-icon-wrapper {
                position: relative;
                z-index: 1;
                margin-bottom: 1.5rem;
            }

            .update-icon {
                font-size: 4rem;
                animation: spin 3s linear infinite;
                display: inline-block;
                filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
            }

            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            .update-title {
                font-size: 2.5rem;
                font-weight: 800;
                margin: 0;
                position: relative;
                z-index: 1;
                text-shadow: 0 2px 10px rgba(0,0,0,0.2);
            }

            .update-subtitle {
                font-size: 1.1rem;
                opacity: 0.95;
                margin: 0.5rem 0 0;
                position: relative;
                z-index: 1;
            }

            .update-body {
                padding: 2.5rem 2rem;
            }

            .update-info-box {
                background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                color: white;
                padding: 1.5rem;
                border-radius: 16px;
                display: flex;
                gap: 1rem;
                margin-bottom: 2rem;
                box-shadow: 0 4px 15px rgba(240, 147, 251, 0.3);
            }

            .update-info-box i {
                font-size: 2rem;
                flex-shrink: 0;
            }

            .update-info-box h3 {
                margin: 0 0 0.5rem;
                font-size: 1.2rem;
                font-weight: 700;
            }

            .update-info-box ul {
                margin: 0;
                padding-right: 1.2rem;
                list-style: none;
            }

            .update-info-box li {
                margin: 0.3rem 0;
                position: relative;
                padding-right: 1.2rem;
            }

            .update-info-box li::before {
                content: '✓';
                position: absolute;
                right: 0;
                font-weight: bold;
            }

            .update-progress {
                margin: 2rem 0;
            }

            .progress-steps {
                display: flex;
                flex-direction: column;
                gap: 1rem;
                margin-bottom: 2rem;
            }

            .progress-step {
                display: flex;
                gap: 1rem;
                align-items: center;
                padding: 1rem;
                border-radius: 12px;
                background: #f8f9fa;
                transition: all 0.3s ease;
                opacity: 0.4;
            }

            .progress-step.active {
                opacity: 1;
                background: linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%);
                box-shadow: 0 4px 15px rgba(142, 197, 252, 0.4);
                animation: pulse 2s ease-in-out infinite;
            }

            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.02); }
            }

            .progress-step.completed {
                opacity: 1;
                background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            }

            .step-icon {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                background: white;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                flex-shrink: 0;
            }

            .step-icon i {
                font-size: 1.5rem;
                color: #667eea;
            }

            .progress-step.active .step-icon i {
                animation: bounce 1s ease-in-out infinite;
            }

            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
            }

            .progress-step.completed .step-icon i {
                color: #10b981;
            }

            .step-content h4 {
                margin: 0 0 0.3rem;
                font-size: 1.1rem;
                color: #1f2937;
            }

            .step-content p {
                margin: 0;
                font-size: 0.9rem;
                color: #6b7280;
            }

            .progress-bar-container {
                height: 8px;
                background: #e5e7eb;
                border-radius: 999px;
                overflow: hidden;
                margin-bottom: 0.5rem;
            }

            .progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                border-radius: 999px;
                width: 0%;
                transition: width 0.5s ease;
            }

            .progress-percentage {
                text-align: center;
                font-size: 1.2rem;
                font-weight: 700;
                color: #667eea;
            }

            .update-actions {
                display: flex;
                gap: 1rem;
                margin-top: 2rem;
            }

            .btn-update-start,
            .btn-update-cancel {
                flex: 1;
                padding: 1rem 2rem;
                border: none;
                border-radius: 12px;
                font-size: 1.1rem;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
                transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
            }

            .btn-update-start {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            }

            .btn-update-start:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
            }

            .btn-update-start:active {
                transform: translateY(0);
            }

            .btn-update-start:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
            }

            .btn-update-cancel {
                background: #e5e7eb;
                color: #6b7280;
            }

            .btn-update-cancel:hover {
                background: #d1d5db;
            }

            .update-warning {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                margin-top: 1.5rem;
                padding: 1rem;
                background: #fef3c7;
                border-radius: 12px;
                color: #92400e;
                font-size: 0.9rem;
            }

            .update-warning i {
                font-size: 1.2rem;
                color: #f59e0b;
            }

            @media (max-width: 768px) {
                .system-update-container {
                    padding: 1rem;
                }

                .update-card {
                    border-radius: 16px;
                }

                .update-header {
                    padding: 2rem 1.5rem;
                }

                .update-title {
                    font-size: 2rem;
                }

                .update-body {
                    padding: 1.5rem;
                }

                .update-actions {
                    flex-direction: column;
                }
            }
        </style>
    `;
}

export function initSystemUpdatePage() {
    const startBtn = document.getElementById('start-update-btn');
    const progressContainer = document.getElementById('update-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressPercentage = document.getElementById('progress-percentage');

    if (!startBtn) return;

    startBtn.addEventListener('click', async () => {
        // Show progress
        progressContainer.style.display = 'block';
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>جاري التحديث...</span>';

        try {
            // Step 1: Downloading
            activateStep(1);
            updateProgress(25);
            await sleep(1000);

            // Send update request
            const result = await fetchWithAuth('/api/tools/update-system', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            // Step 2: Installing dependencies
            activateStep(2);
            updateProgress(50);
            await sleep(2000);

            // Step 3: Restarting server
            activateStep(3);
            updateProgress(75);
            await sleep(2000);

            // Step 4: Complete
            activateStep(4);
            updateProgress(100);
            
            showToast('تم التحديث بنجاح! جاري إعادة الاتصال...', false);
            
            // Reload after server restart
            setTimeout(() => {
                window.location.reload();
            }, 3000);

        } catch (error) {
            showToast(error.message || 'فشل تحديث النظام.', true);
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-rocket"></i><span>إعادة المحاولة</span>';
            progressContainer.style.display = 'none';
            resetSteps();
        }
    });

    function activateStep(stepNumber) {
        // Mark previous steps as completed
        for (let i = 1; i < stepNumber; i++) {
            const step = document.getElementById(`step-${i}`);
            if (step) {
                step.classList.remove('active');
                step.classList.add('completed');
            }
        }
        
        // Activate current step
        const currentStep = document.getElementById(`step-${stepNumber}`);
        if (currentStep) {
            currentStep.classList.add('active');
        }
    }

    function updateProgress(percentage) {
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
        if (progressPercentage) {
            progressPercentage.textContent = `${percentage}%`;
        }
    }

    function resetSteps() {
        for (let i = 1; i <= 4; i++) {
            const step = document.getElementById(`step-${i}`);
            if (step) {
                step.classList.remove('active', 'completed');
            }
        }
        updateProgress(0);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
