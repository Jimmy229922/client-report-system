
document.addEventListener('DOMContentLoaded', () => {
    let currentUser = null;
    try {
        currentUser = JSON.parse(localStorage.getItem('user'));
    } catch (e) {
        console.error("Could not parse user from localStorage", e);
    }

    // --- UI & Modal Setup ---
    const fab = document.createElement('button');
    fab.className = 'trade-analyzer-fab';
    fab.innerHTML = '&#x1F50E;';
    fab.title = 'تحليل صفقات العميل';
    fab.style.display = 'none';
    document.body.appendChild(fab);

    const modalHtml = `
        <div id="tradeAnalyzerModal" class="trade-analyzer-modal">
            <div class="trade-analyzer-modal-content">
                <span class="trade-analyzer-close-btn">&times;</span>
                <h2>محلل صفقات العميل</h2>
                <div class="trade-analyzer-container">
                    <div class="trade-analyzer-inputs-grid">
                        <div class="trade-analyzer-input-area">
                            <h3>1. الصفقات المغلقة</h3>
                            <textarea id="trade-data-input" placeholder="الصق كشف الحساب (الصفقات المغلقة) هنا..."></textarea>
                        </div>
                        <div class="trade-analyzer-input-area">
                            <h3>2. الصفقات المفتوحة (اختياري)</h3>
                            <textarea id="open-trades-input" placeholder="الصق الصفقات المفتوحة هنا..."></textarea>
                        </div>
                    </div>
                    <div class="trade-analyzer-results-area">
                        <h3>نتيجة التحليل</h3>
                        <div id="analyzer-results"><p>ستظهر النتائج هنا.</p></div>
                    </div>
                </div>
            </div>
            <div class="trade-analyzer-modal-footer">
                <button id="analyze-trades-btn">تحليل الصفقات</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('tradeAnalyzerModal');
    const closeModalBtn = modal.querySelector('.trade-analyzer-close-btn');
    const analyzeBtn = document.getElementById('analyze-trades-btn');
    const inputArea = document.getElementById('trade-data-input');
    const openTradesInput = document.getElementById('open-trades-input');
    const resultsArea = document.getElementById('analyzer-results');

    // --- Event Listeners ---
    const toggleFabVisibility = () => {
        const hash = window.location.hash;
        if (currentUser && currentUser.role === 'admin' && hash.startsWith('#reports/deposit')) {
            fab.style.display = 'flex';
        } else {
            fab.style.display = 'none';
        }
    };

    window.addEventListener('hashchange', toggleFabVisibility);
    document.addEventListener('page-rendered', toggleFabVisibility);
    setTimeout(toggleFabVisibility, 500);

    fab.onclick = () => modal.style.display = 'block';
    closeModalBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == modal) modal.style.display = 'none';
    };

    analyzeBtn.onclick = () => {
        const rawData = inputArea.value.trim();
        const openTradesData = openTradesInput.value.trim();
        if (!rawData) {
            resultsArea.innerHTML = '<p>الرجاء لصق بيانات التداول لتحليلها.</p>';
            return;
        }
        const summary = parseTradeData(rawData, openTradesData);
        const allTrades = [...summary.closedTrades, ...summary.openTrades];
        const analysis = analyzeTrades(allTrades, summary.financials.totalDeposit);
        displayResults(analysis, summary);
    };

    // --- Core Functions ---
    function parseTradeData(closedTradesData, openTradesData) {
        const summary = {
            closedTrades: [],
            openTrades: [],
            financials: {
                totalDeposit: 0,
                totalWithdrawal: 0,
                totalBonusIn: 0,
                totalBonusOut: 0,
                otherTransactions: [],
            }
        };

        const lines = closedTradesData.split('\n').filter(line => line.trim() !== '');

        lines.forEach(line => {
            const parts = line.split(/\s+/).filter(Boolean);
            if (parts.length < 4) return;

            const type = parts[3];
            const amount = parseFloat(parts[8]);

            if ((type === 'Buy' || type === 'Sell') && parts.length >= 17) {
                const openTime = new Date(parts[0] + ' ' + parts[1]);
                const closeTime = new Date(parts[9] + ' ' + parts[10]);                
                const comment = parts.length > 17 ? parts.slice(17).join(' ').toLowerCase() : '';
                summary.closedTrades.push({
                    type, // 'Buy' or 'Sell'
                    openTime, closeTime,
                    durationSeconds: (closeTime - openTime) / 1000,
                    lot: parseFloat(parts[4]),
                    profit: parseFloat(parts[16]),
                    symbol: parts[5],
                    comment: comment
                });
            } else if (type === 'Balance') {
                if (amount > 0) summary.financials.totalDeposit += amount;
                else summary.financials.totalWithdrawal += amount;
            } else if (type === 'Bonus') {
                if (amount > 0) summary.financials.totalBonusIn += amount;
                else summary.financials.totalBonusOut += amount;
            } else if (type === 'Credit') {
                // Check if this credit is a welcome bonus
                const comment = parts.slice(9).join(' ').toLowerCase();
                if (comment.includes('welcome bonus')) {
                    if (amount > 0) summary.financials.totalBonusIn += amount;
                    else summary.financials.totalBonusOut += amount;
                }
            } else {
                summary.financials.otherTransactions.push(line);
            }
        });

        // Parse open trades
        const openLines = openTradesData.split('\n').filter(line => line.trim() !== '');
        openLines.forEach(line => {
            const parts = line.split(/\t/).filter(Boolean); // Open trades are often tab-separated
            if (parts.length >= 12 && (parts[3] === 'Buy' || parts[3] === 'Sell')) {
                const openTime = new Date(parts[2]);
                const currentProfit = parseFloat(parts[12]);
                summary.openTrades.push({
                    type: parts[3],
                    openTime,
                    closeTime: new Date(), // Represents 'now'
                    durationSeconds: (new Date() - openTime) / 1000,
                    lot: parseFloat(parts[4]),
                    profit: currentProfit,
                    symbol: parts[0],
                    comment: parts[9]?.toLowerCase() || '',
                    isOpen: true, // Flag to identify open trades
                });
            }
        });

        return summary;
    }

    function analyzeTrades(trades, totalDeposit) {
        let riskScore = 0;
        const reasons = [];
        const closedTradeCount = trades.filter(t => !t.isOpen).length;

        // --- Pre-computation for analysis ---
        const closedTrades = trades.filter(t => !t.isOpen);
        const openTrades = trades.filter(t => t.isOpen);
        const totalLots = closedTrades.reduce((sum, t) => sum + t.lot, 0);
        const totalProfit = closedTrades.reduce((sum, t) => sum + t.profit, 0);

        if (closedTradeCount === 0 && openTrades.length === 0) {
            return { banRecommended: false, riskScore: 0, reasons: [] };
        }

        if (totalDeposit === 0) {
            reasons.push('لم يتم الكشف عن أي إيداع، ولكن تم العثور على صفقات. قد يكون البونص نفسه في خطر.');
            return { banRecommended: true, riskScore: 100, reasons };
        }

        // --- Rule 1: Doubling deposit on the same day ---
        const tradesByDay = closedTrades.reduce((acc, trade) => {
            const day = trade.openTime.toISOString().split('T')[0];
            if (!acc[day]) acc[day] = 0;
            acc[day] += trade.profit;
            return acc;
        }, {});
        if (Object.values(tradesByDay).some(dailyProfit => dailyProfit >= totalDeposit)) {
            riskScore += 35;
            reasons.push(`مضاعفة الإيداع في يوم واحد، مما يشير إلى محاولة تداول عالية المخاطر.`);
        }
        // --- Rule 2: High Lot to Deposit Ratio ---
        const lotToDepositRatio = totalLots / totalDeposit;
        if (lotToDepositRatio > 0.01) { // e.g., > 5 lots for a $500 deposit
            riskScore += 30;
            reasons.push(`نسبة لوتات عالية جدًا (${totalLots.toFixed(2)}) مقارنة بالإيداع (${totalDeposit}).`);
        }

        // --- Rule 3: Quick Profit with Few Trades ---
        if (totalProfit >= totalDeposit && closedTradeCount > 0 && closedTradeCount <= 5) {
            riskScore += 40;
            reasons.push(`مضاعفة الإيداع في ${closedTradeCount} صفقات فقط، مما يشير إلى مخاطرة عالية.`);
        }

        // --- Rule 4: Scalping ---
        const scalpedTrades = closedTrades.filter(t => t.durationSeconds < 120);
        if (closedTradeCount > 0 && scalpedTrades.length / closedTradeCount > 0.6) {
            riskScore += 25;
            reasons.push(`نمط تداول سريع (Scalping): ${scalpedTrades.length} من أصل ${closedTradeCount} صفقة أُغلقت في أقل من دقيقتين.`);
        }

        // --- Rule 5: Large Single Trade Profit ---
        const maxProfit = Math.max(0, ...closedTrades.map(t => t.profit));
        if (maxProfit > totalDeposit * 0.8) {
            riskScore += 20;
            reasons.push(`صفقة واحدة حققت ربحًا ضخمًا (${maxProfit.toFixed(2)}) مقارنة بالإيداع.`);
        }

        // --- Rule 6: Simultaneous Closes (Potential Hedging) ---
        if (closedTradeCount > 2) {
            const closeTimes = trades.map(t => t.closeTime.getTime()).sort((a, b) => a - b);
            let simultaneousCount = 0, maxSimultaneous = 0;
            for (let i = 0; i < closeTimes.length - 1; i++) {
                if (closeTimes[i+1] - closeTimes[i] < 3000) simultaneousCount++;
                else { maxSimultaneous = Math.max(maxSimultaneous, simultaneousCount + 1); simultaneousCount = 0; }
            }
            maxSimultaneous = Math.max(maxSimultaneous, simultaneousCount + 1);
            if (maxSimultaneous >= 3 && maxSimultaneous / closedTradeCount > 0.4) {
                riskScore += 20;
                reasons.push(`إغلاق متزامن لـ ${maxSimultaneous} صفقات، مما قد يشير إلى تحوط (Hedging).`);
            }
        }

        // --- Rule 7: High-Frequency Trading (HFT) ---
        if (closedTradeCount > 10) {
            const timeDiffs = [];
            for (let i = 1; i < trades.length; i++) {
                timeDiffs.push((trades[i].openTime - trades[i-1].openTime) / 1000);
            }
            const avgTimeBetweenTrades = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
            if (avgTimeBetweenTrades < 10) { // Average less than 10 seconds between trades
                riskScore += 15;
                reasons.push(`نمط تداول عالي التردد (HFT): متوسط الوقت بين الصفقات أقل من 10 ثوانٍ.`);
            }
        }

        // --- Rule 8: Profit Factor ---
        const winningTrades = closedTrades.filter(t => t.profit > 0);
        const losingTrades = closedTrades.filter(t => t.profit < 0);
        const totalWin = winningTrades.reduce((sum, t) => sum + t.profit, 0);
        const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
        if (totalLoss > 0) {
            const profitFactor = totalWin / totalLoss;
            if (profitFactor > 10) {
                riskScore += 10;
                reasons.push(`عامل ربح مرتفع جدًا (${profitFactor.toFixed(1)}x)، مما قد يشير إلى استراتيجية غير متوازنة.`);
            }
        }

        // --- Rule 9: Comment Analysis ---
        const suspiciousComments = closedTrades.filter(t => t.comment.includes('[ea]') || t.comment.includes('arbitrage') || t.comment.includes('hedge'));
        if (suspiciousComments.length > 0) {
            riskScore += 25;
            reasons.push(`تم اكتشاف تعليقات مشبوهة في ${suspiciousComments.length} صفقات، مما قد يشير إلى استخدام أنظمة تداول آلية (EA) أو استراتيجيات ممنوعة.`);
        }

        return {
            banRecommended: riskScore >= 50,
            riskScore: Math.min(100, Math.round(riskScore)),
            reasons: reasons
        };
    }

    function displayResults(analysis, summary) {
        const { closedTrades, openTrades, financials } = summary;
        const { totalDeposit, totalWithdrawal, totalBonusIn, totalBonusOut } = financials;
        const closedTradeCount = closedTrades.length;
        const openTradeCount = openTrades.length;
        const totalProfit = closedTrades.reduce((sum, t) => sum + t.profit, 0);
        const floatingProfit = openTrades.reduce((sum, t) => sum + t.profit, 0);

        const recommendationClass = analysis.banRecommended ? 'ban' : 'no-ban';
        const recommendationText = analysis.banRecommended ? 'يوصى بالحظر' : 'لا يوصى بالحظر';

        let html = `<div class="recommendation ${recommendationClass}">${recommendationText} (مؤشر الخطورة: ${analysis.riskScore}%)</div>`;

        if (analysis.reasons.length > 0) {
            html += '<h3>العوامل المكتشفة:</h3><ul class="reasons-list">';
            analysis.reasons.forEach(reason => { html += `<li>${reason}</li>`; });
            html += '</ul>';
        } else if (closedTradeCount > 0) {
            html += '<p>لم يتم الكشف عن أي أنماط تداول مشبوهة بناءً على القواعد المحددة.</p>';
        }

        html += '<hr style="margin: 20px 0; border-color: #444;">';
        html += '<h3>الملخص المالي الشامل:</h3>';
        html += '<ul>';
        html += `<li><i class="fas fa-sign-in-alt"></i> إجمالي الإيداعات: <strong style="color: var(--success-color);">${totalDeposit.toFixed(2)}</strong></li>`;
        html += `<li><i class="fas fa-sign-out-alt"></i> إجمالي السحوبات: <strong style="color: var(--danger-color);">${Math.abs(totalWithdrawal).toFixed(2)}</strong></li>`;
        html += `<li><i class="fas fa-gift"></i> إجمالي البونص المضاف: <strong style="color: var(--success-color);">${totalBonusIn.toFixed(2)}</strong></li>`;
        html += `<li><i class="fas fa-minus-circle"></i> إجمالي البونص المسحوب: <strong style="color: var(--danger-color);">${Math.abs(totalBonusOut).toFixed(2)}</strong></li>`;
        html += `<hr style="margin: 10px 0; border-color: #333;">`;
        html += `<li><i class="fas fa-chart-line"></i> صافي أرباح الصفقات: <strong style="color: ${totalProfit >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">${totalProfit.toFixed(2)}</strong></li>`;
        if (openTradeCount > 0) {
            html += `<li><i class="fas fa-water"></i> الأرباح العائمة (مفتوحة): <strong style="color: ${floatingProfit >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">${floatingProfit.toFixed(2)}</strong></li>`;
            html += `<li><i class="fas fa-file-invoice-dollar"></i> الرصيد النهائي المتوقع: <strong>${(totalDeposit + totalWithdrawal + totalProfit + floatingProfit).toFixed(2)}</strong></li>`;
        } else {
            html += `<li><i class="fas fa-file-invoice-dollar"></i> الرصيد النهائي المقدر: <strong>${(totalDeposit + totalWithdrawal + totalProfit).toFixed(2)}</strong></li>`;
        }
        html += '</ul>';

        if (closedTradeCount > 0) {
             html += `<p style="margin-top:15px;"><strong>تفاصيل الصفقات المغلقة:</strong> ${closedTradeCount} صفقات تم تحليلها.</p>`;
        } else {
             html += '<p style="margin-top:15px;">لم يتم العثور على صفقات لتحليلها.</p>';
        }
        if (openTradeCount > 0) {
            html += `<p style="margin-top:5px;"><strong>تفاصيل الصفقات المفتوحة:</strong> ${openTradeCount} صفقات مفتوحة تم أخذها في الاعتبار.</p>`;
        }

        resultsArea.innerHTML = html;
    }
});
