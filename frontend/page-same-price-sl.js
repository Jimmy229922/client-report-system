import { showToast } from './ui.js';

const STORAGE_KEY = 'samePriceSlInput';

// --- Utilities for datetime parsing and pairing ---

// Check if a timestamp is today
function isToday(timestamp) {
    if (!timestamp) return false;
    const date = new Date(timestamp);
    const today = new Date();
    return date.getFullYear() === today.getFullYear() &&
           date.getMonth() === today.getMonth() &&
           date.getDate() === today.getDate();
}
function parseDotDateParts(dateStr, timeStr) {
    const d = /^([0-9]{4})\.([0-9]{2})\.([0-9]{2})$/.exec(dateStr || '');
    const t = /^([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{3}))?$/.exec(timeStr || '');
    if (!d || !t) return null;
    const [ , Y, M, D ] = d.map((x, i) => i < 1 ? x : parseInt(x, 10));
    const [ , h, m, s, ms ] = t ? t.map((x, i) => i < 1 ? x : parseInt(x, 10)) : [];
    try {
        return new Date(Y, M - 1, D, h, m, s, ms || 0);
    } catch { return null; }
}

function parseCombinedDotDateTime(str) {
    const m = /^([0-9]{4})\.([0-9]{2})\.([0-9]{2})\s+([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{3}))?$/.exec(str || '');
    if (!m) return null;
    const Y = parseInt(m[1], 10);
    const M = parseInt(m[2], 10);
    const D = parseInt(m[3], 10);
    const h = parseInt(m[4], 10);
    const mi = parseInt(m[5], 10);
    const s = parseInt(m[6], 10);
    const ms = m[7] ? parseInt(m[7], 10) : 0;
    try {
        return new Date(Y, M - 1, D, h, mi, s, ms);
    } catch { return null; }
}

// dd/mm/yyyy HH:MM:SS(.ms)
function parseCombinedSlashDateTime(str) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{3}))?$/.exec(str || '');
    if (!m) return null;
    const D = parseInt(m[1], 10);
    const M = parseInt(m[2], 10);
    const Y = parseInt(m[3], 10);
    const h = parseInt(m[4], 10);
    const mi = parseInt(m[5], 10);
    const s = parseInt(m[6], 10);
    const ms = m[7] ? parseInt(m[7], 10) : 0;
    try {
        return new Date(Y, M - 1, D, h, mi, s, ms);
    } catch { return null; }
}

function parseSlashDateParts(dateStr, timeStr) {
    const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr || '');
    const t = /^([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{3}))?$/.exec(timeStr || '');
    if (!d || !t) return null;
    const D = parseInt(d[1], 10);
    const M = parseInt(d[2], 10);
    const Y = parseInt(d[3], 10);
    const h = parseInt(t[1], 10);
    const m = parseInt(t[2], 10);
    const s = parseInt(t[3], 10);
    const ms = t[4] ? parseInt(t[4], 10) : 0;
    try {
        return new Date(Y, M - 1, D, h, m, s, ms);
    } catch { return null; }
}

function parseAnyCombinedDateTime(str) {
    return parseCombinedDotDateTime(str) || parseCombinedSlashDateTime(str);
}

function parseAnySplitDateTime(dateStr, timeStr) {
    return parseDotDateParts(dateStr, timeStr) || parseSlashDateParts(dateStr, timeStr);
}

function findFirstDateTime(parts, startIdx = 0) {
    for (let j = startIdx; j < parts.length; j++) {
        const token = parts[j];
        const combined = parseAnyCombinedDateTime(token);
        if (combined) return { index: j, dt: combined, text: token };
        // Split date + time tokens
        if (j + 1 < parts.length) {
            const split = parseAnySplitDateTime(parts[j], parts[j + 1]);
            if (split) return { index: j, dt: split, text: `${parts[j]} ${parts[j + 1]}` };
        }
    }
    return null;
}

function findFirstCloseTime(parts, startIdx) {
    const f = findFirstDateTime(parts, startIdx);
    return f ? { index: f.index, dt: f.dt } : null;
}

let pairWindowMin = 10; // default proximity window in minutes for open times

function normalizeSymbol(sym) {
    if (!sym) return '';
    // remove broker suffixes like .inz or .m if any
    const s = String(sym).trim();
    return s.split('.')[0];
}

function lotKey(lot) {
    const n = Number.isFinite(lot) ? lot : NaN;
    return Number.isFinite(n) ? n.toFixed(6) : 'NaN';
}

function findOpenTimePairs(trades, minutes) {
    const pairs = [];
    const bySymbolLot = new Map();
    const keyFor = (sym, lot) => `${normalizeSymbol(sym)}|${lotKey(lot)}`;
    
    trades.forEach(t => {
        const key = keyFor(t.symbol, t.lot);
        if (!bySymbolLot.has(key)) bySymbolLot.set(key, []);
        bySymbolLot.get(key).push(t);
    });

    const maxDiffMs = (minutes || 10) * 60 * 1000;
    const used = new Set();

    bySymbolLot.forEach(list => {
        // Separate by side
        const buys = list.filter(x => x.type === 'Buy');
        const sells = list.filter(x => x.type === 'Sell');
        
        buys.forEach(a => {
            sells.forEach(b => {
                // Only compare open times
                const aOpen = a.openTs;
                const bOpen = b.openTs;
                
                if (!aOpen || !bOpen) return;
                
                const openTimeDiff = Math.abs(aOpen - bOpen);
                if (openTimeDiff <= maxDiffMs) {
                    const id = [a.ticket, b.ticket].sort().join('|');
                    if (!used.has(id)) {
                        used.add(id);
                        const diffSeconds = Math.round(openTimeDiff / 1000);
                        const diffMinutes = Math.round(openTimeDiff / 60000 * 10) / 10; // round to 1 decimal
                        pairs.push({ 
                            a, 
                            b, 
                            diffMinutes: diffMinutes,
                            diffSeconds: diffSeconds,
                            openTimeDiff: openTimeDiff,
                            latestOpenTime: Math.max(aOpen, bOpen), // للترتيب
                            timeDiffDisplay: diffSeconds < 60 ? `${diffSeconds} ث` : `${diffMinutes} د`
                        });
                    }
                }
            });
        });
    });

    // ترتيب حسب أحدث وقت فتح (الأحدث أولاً)
    pairs.sort((x, y) => y.latestOpenTime - x.latestOpenTime);

    return pairs;
}

function parseTrades(raw) {
    const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
    const results = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let parts = line.split('\t');
        if (parts.length === 1) {
            // fallback to multi-space split if no tabs
            parts = line.trim().split(/\s+/);
        }

        if (parts.length < 7) {
            results.push({ lineNumber: i + 1, raw: line, valid: false, reason: 'أعمدة غير كافية' });
            continue;
        }

        // Robust parse: Find type position (Buy/Sell), allow optional leading columns and optional lot column
        const typeIdx = parts.findIndex(p => /^(buy|sell)$/i.test(p));
        if (typeIdx === -1) {
            results.push({ lineNumber: i + 1, raw: line, valid: false, reason: 'صيغة غير متوقعة' });
            continue;
        }

        const type = (/sell/i.test(parts[typeIdx]) ? 'Sell' : 'Buy');

        // Ticket best-effort: prefer a long integer token near the beginning or labeled Position
        let ticket = '';
        // Try the token before type if it looks like a ticket
        const ticketCandidates = [];
        if (typeIdx - 1 >= 0) ticketCandidates.push(parts[typeIdx - 1]);
        if (typeIdx - 2 >= 0) ticketCandidates.push(parts[typeIdx - 2]);
        if (typeIdx + 1 < parts.length) ticketCandidates.push(parts[typeIdx + 1]);
        // Also look early tokens
        if (parts[1]) ticketCandidates.push(parts[1]);
        const ticketToken = ticketCandidates.find(tok => /^\d{6,}$/.test(tok));
        if (ticketToken) ticket = ticketToken;

        // Lot detection: numeric close to type (prefer next token)
        const isNumeric = (x) => /^-?\d+(?:\.\d+)?$/.test(x || '');
        let lot = NaN;
        if (isNumeric(parts[typeIdx + 1])) lot = parseFloat(parts[typeIdx + 1]);
        else if (isNumeric(parts[typeIdx - 1])) lot = parseFloat(parts[typeIdx - 1]);
        else {
            // scan within ±3 tokens
            for (let d = 2; d <= 3; d++) {
                if (isNumeric(parts[typeIdx + d])) { lot = parseFloat(parts[typeIdx + d]); break; }
                if (isNumeric(parts[typeIdx - d])) { lot = parseFloat(parts[typeIdx - d]); break; }
            }
        }

        // Symbol detection: often before type (e.g., XAUUSD.INZO BUY 0.01)
        const isSymbol = (x) => /^[A-Za-z]{3,}[A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/.test((x || '').trim());
        let symbol = '';
        let symbolIdx = -1;
        if (isSymbol(parts[typeIdx - 1])) { symbol = parts[typeIdx - 1]; symbolIdx = typeIdx - 1; }
        else if (isSymbol(parts[typeIdx + 1])) { symbol = parts[typeIdx + 1]; symbolIdx = typeIdx + 1; }
        else if (isSymbol(parts[typeIdx + 2])) { symbol = parts[typeIdx + 2]; symbolIdx = typeIdx + 2; }

        // Find price and SL if present (don't invalidate row if missing)
        let priceIdx = -1, slIdx = -1;
        const scanStart = symbolIdx !== -1 ? symbolIdx + 1 : (typeIdx + 1);
        for (let j = scanStart; j < parts.length; j++) {
            if (isNumeric(parts[j])) { priceIdx = j; break; }
        }
        for (let j = priceIdx + 1; j > 0 && j < parts.length; j++) {
            if (isNumeric(parts[j])) { slIdx = j; break; }
        }

        const price = parseFloat(priceIdx !== -1 ? parts[priceIdx] : 'NaN');
        const sl = parseFloat(slIdx !== -1 ? parts[slIdx] : 'NaN');

        const equal = Number.isFinite(price) && Number.isFinite(sl) && Math.abs(price - sl) < 1e-9;

        // Open timestamp: first datetime anywhere in the row (supports dot and slash formats)
        const firstDt = findFirstDateTime(parts, 0);
        const openDt = firstDt ? firstDt.dt : null;
        const dt = firstDt ? firstDt.text : '';
        // Close timestamp: first datetime after SL/price/type
        const closeInfo = findFirstCloseTime(parts, (slIdx !== -1 ? slIdx + 1 : (priceIdx !== -1 ? priceIdx + 1 : typeIdx + 1)));
        const closeDt = closeInfo ? closeInfo.dt : null;
        const openTs = openDt ? openDt.getTime() : null;
        const closeTs = closeDt ? closeDt.getTime() : null;

        // Profit detection: only if there are enough tokens after SL (likely a full closed-trade row)
        let profit = NaN;
        let zeroProfit = false;
        if (slIdx !== -1 && parts.length >= slIdx + 4) {
            const nonEmpty = parts.map(p => (p ?? '').trim()).filter(p => p !== '');
            const profitStr = nonEmpty.length ? nonEmpty[nonEmpty.length - 1] : '';
            profit = parseFloat(profitStr);
            zeroProfit = Number.isFinite(profit) && Math.abs(profit) < 1e-9;
        }

        results.push({
            lineNumber: i + 1,
            raw: line,
            valid: true,
            dt,
            ticket,
            type,
            lot: lot,
            symbol,
            price,
            sl,
            equal,
            profit,
            zeroProfit,
            openTs,
            closeTs
        });
    }

    return results;
}

let currentFilter = 'all'; // Track filter state
let accountColorCache = {}; // Cache for account colors

function getAccountColor(ticket) {
    if (!ticket) return '#6c757d';
    
    // Check cache first
    if (accountColorCache[ticket]) {
        return accountColorCache[ticket];
    }
    
    const hash = ticket.toString().split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0);
    const colors = [
        '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
        '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
        '#f1c40f', '#8e44ad', '#16a085', '#27ae60',
        '#2980b9', '#c0392b', '#d35400', '#7f8c8d'
    ];
    const color = colors[Math.abs(hash) % colors.length];
    
    // Cache the result
    accountColorCache[ticket] = color;
    return color;
}

function renderResults(results) {
    // Clear cache for new results
    accountColorCache = {};
    
    const container = document.getElementById('same-price-sl-results');
    if (!container) return;

    const valid = results.filter(r => r.valid);
    const flagged = valid.filter(r => r.equal);
    const zeroProfitRows = valid.filter(r => r.zeroProfit);
    const pairs = findOpenTimePairs(valid, pairWindowMin);

    let html = '';
    
    // Professional Stats Cards
    html += `
    <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
        <div class="stat-card" style="background: var(--card-background); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: 0 4px 6px rgba(0,0,0,0.05); display: flex; flex-direction: column; align-items: center; text-align: center; transition: transform 0.2s;">
            <div class="stat-icon" style="width: 48px; height: 48px; border-radius: 50%; background: rgba(52, 152, 219, 0.1); color: #3498db; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 12px;">
                <i class="fas fa-list-ol"></i>
            </div>
            <div class="stat-value" style="font-size: 24px; font-weight: 700; color: var(--text-color); margin-bottom: 4px;">${results.length}</div>
            <div class="stat-label" style="font-size: 13px; color: var(--muted-text-color); font-weight: 500;">إجمالي الصفقات</div>
        </div>

        <div class="stat-card" style="background: var(--card-background); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: 0 4px 6px rgba(0,0,0,0.05); display: flex; flex-direction: column; align-items: center; text-align: center; transition: transform 0.2s;">
            <div class="stat-icon" style="width: 48px; height: 48px; border-radius: 50%; background: rgba(255, 193, 7, 0.1); color: #ffc107; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 12px;">
                <i class="fas fa-equals"></i>
            </div>
            <div class="stat-value" style="font-size: 24px; font-weight: 700; color: var(--text-color); margin-bottom: 4px;">${flagged.length}</div>
            <div class="stat-label" style="font-size: 13px; color: var(--muted-text-color); font-weight: 500;">Price = S/L</div>
        </div>

        <div class="stat-card" style="background: var(--card-background); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: 0 4px 6px rgba(0,0,0,0.05); display: flex; flex-direction: column; align-items: center; text-align: center; transition: transform 0.2s;">
            <div class="stat-icon" style="width: 48px; height: 48px; border-radius: 50%; background: rgba(23, 162, 184, 0.1); color: #17a2b8; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 12px;">
                <i class="fas fa-coins"></i>
            </div>
            <div class="stat-value" style="font-size: 24px; font-weight: 700; color: var(--text-color); margin-bottom: 4px;">${zeroProfitRows.length}</div>
            <div class="stat-label" style="font-size: 13px; color: var(--muted-text-color); font-weight: 500;">الربح = 0.00</div>
        </div>

        <div class="stat-card" style="background: var(--card-background); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: 0 4px 6px rgba(0,0,0,0.05); display: flex; flex-direction: column; align-items: center; text-align: center; transition: transform 0.2s;">
            <div class="stat-icon" style="width: 48px; height: 48px; border-radius: 50%; background: rgba(156, 39, 176, 0.1); color: #9c27b0; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 12px;">
                <i class="fas fa-link"></i>
            </div>
            <div class="stat-value" style="font-size: 24px; font-weight: 700; color: var(--text-color); margin-bottom: 4px;">${pairs.length}</div>
            <div class="stat-label" style="font-size: 13px; color: var(--muted-text-color); font-weight: 500;">أزواج متقاربة</div>
        </div>
    </div>

    <div class="results-header" style="display:flex; justify-content:space-between; align-items:center; gap:15px; flex-wrap:wrap; margin-bottom:15px;">
                <h2 style="margin:0; font-size: 1.25rem;"><i class="fas fa-table"></i> تفاصيل النتائج</h2>
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <button id="copy-flagged-btn" class="copy-btn"><i class="fas fa-copy"></i> نسخ النتائج</button>
                </div>
            </div>`;

    html += `<div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
                <button class="filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all"><i class="fas fa-th"></i> الكل</button>
                <button class="filter-btn ${currentFilter === 'price-sl' ? 'active' : ''}" data-filter="price-sl"><i class="fas fa-equals"></i> Price=S/L فقط</button>
                <button class="filter-btn ${currentFilter === 'profit-zero' ? 'active' : ''}" data-filter="profit-zero"><i class="fas fa-coins"></i> الربح=0 فقط</button>
                <button class="filter-btn ${currentFilter === 'open-pairs' ? 'active' : ''}" data-filter="open-pairs"><i class="fas fa-link"></i> فتح متقارب (متعاكس)</button>
            </div>`;

    html += `
        <div id="pairs-controls" style="display:${currentFilter === 'open-pairs' ? 'flex' : 'none'}; gap:10px; align-items:center; margin-bottom:12px;">
            <label for="pair-window-min">حد التقارب لوقت الفتح (دقائق):</label>
            <input type="number" id="pair-window-min" min="1" value="${pairWindowMin}" style="width: 100px;">
            <button id="apply-pairs-window" class="filter-btn"><i class="fas fa-check"></i> تطبيق</button>
        </div>
    `;

    if (results.length === 0) {
        container.innerHTML = html + '<p class="no-results">لا توجد بيانات.</p>';
        return;
    }

    // Apply filter - work from valid rows, not combined
    let displayRows = [];
    if (currentFilter === 'all') {
        // Show all rows that match any condition including pairs
        const combined = [];
        const seen = new Set();
        
        // Add Price=SL and Profit=0 matches
        valid.forEach(r => {
            if ((r.equal || r.zeroProfit) && !seen.has(r.lineNumber)) {
                seen.add(r.lineNumber);
                combined.push(r);
            }
        });
        
        // Add trades that are part of open-time pairs
        pairs.forEach(pair => {
            if (!seen.has(pair.a.lineNumber)) {
                seen.add(pair.a.lineNumber);
                combined.push(pair.a);
            }
            if (!seen.has(pair.b.lineNumber)) {
                seen.add(pair.b.lineNumber);
                combined.push(pair.b);
            }
        });
        
        // Sort by open time (latest first)
        combined.sort((a, b) => {
            const aTime = a.openTs || 0;
            const bTime = b.openTs || 0;
            return bTime - aTime;
        });
        
        displayRows = combined;
    } else if (currentFilter === 'price-sl') {
        displayRows = flagged;
        // Sort by latest first
        displayRows.sort((a, b) => (b.openTs || 0) - (a.openTs || 0));
    } else if (currentFilter === 'profit-zero') {
        displayRows = zeroProfitRows;
        // Sort by latest first
        displayRows.sort((a, b) => (b.openTs || 0) - (a.openTs || 0));
    }

    // If open-pairs filter selected, render pair table
    if (currentFilter === 'open-pairs') {
        const pairRows = pairs.map((p, idx) => {
            const a = p.a; const b = p.b;
            const pairColorClass = `pair-color-${(idx % 6) + 1}`; // 6 different colors
            const row = (t, pairInfo = null, isFirst = false) => `
                <tr class="pair-row ${pairColorClass}">
                    <td>${isFirst ? idx + 1 : ''}</td>
                    <td>${t.dt || ''}</td>
                    <td>${t.ticket || ''}</td>
                    <td>${t.type || ''}</td>
                    <td>${t.symbol || ''}</td>
                    <td>${Number.isFinite(t.lot) ? t.lot : ''}</td>
                    <td>${Number.isFinite(t.price) ? t.price : ''}</td>
                    <td>${Number.isFinite(t.sl) ? t.sl : ''}</td>
                    <td>${Number.isFinite(t.profit) ? t.profit.toFixed(2) : ''}</td>
                    <td>${pairInfo ? pairInfo.timeDiffDisplay : ''}</td>
                </tr>`;
            
            const separator = idx < pairs.length - 1 ? `
                <tr class="pair-separator">
                    <td colspan="10"><hr style="border: 1px solid var(--border-color); margin: 8px 0;"></td>
                </tr>` : '';
            
            return row(a, p, true) + row(b) + separator;
        }).join('');

        html += `
            <div class="table-wrapper">
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>وقت الفتح</th>
                            <th>التذكرة</th>
                            <th>النوع</th>
                            <th>الرمز</th>
                            <th>اللوت</th>
                            <th>السعر</th>
                            <th>S/L</th>
                            <th>الربح</th>
                            <th>فرق الفتح</th>
                        </tr>
                    </thead>
                    <tbody>${pairRows}</tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
        setupFilterButtons(results);
        
        // Setup pairs controls after HTML is rendered
        setupPairsControls(results);

        const copyBtn = document.getElementById('copy-flagged-btn');
        if (copyBtn && pairs.length > 0) {
            copyBtn.addEventListener('click', () => {
                const text = pairs.map(p => `${p.a.raw}\n${p.b.raw}`).join('\n--------------------\n');
                navigator.clipboard.writeText(text).then(() => showToast(`تم نسخ ${pairs.length} زوجًا من صفقات الفتح المتقاربة.`))
                    .catch(() => showToast('تعذّر النسخ إلى الحافظة.', true));
            });
        }
        return;
    }

    if (displayRows.length === 0) {
        container.innerHTML = html + '<p class="no-results">لا توجد نتائج للفلتر المحدد.</p>';
        setupFilterButtons(results); // Re-attach filter listeners
        return;
    }

    // Special handling for "all" filter - show organized sections
    if (currentFilter === 'all') {
        const priceSLRows = displayRows.filter(r => r.equal);
        const profitZeroRows = displayRows.filter(r => r.zeroProfit && !r.equal);
        const pairTrades = displayRows.filter(r => {
            const isInPair = pairs.some(p => p.a.lineNumber === r.lineNumber || p.b.lineNumber === r.lineNumber);
            return isInPair && !r.equal && !r.zeroProfit;
        });

        // Sort each section by latest first
        priceSLRows.sort((a, b) => (b.openTs || 0) - (a.openTs || 0));
        profitZeroRows.sort((a, b) => (b.openTs || 0) - (a.openTs || 0));

        let sectionsHtml = '';
        
        // Price = S/L Section
        if (priceSLRows.length > 0) {
            const priceSLTable = priceSLRows.map((r, index) => {
                const accountColor = getAccountColor(r.ticket);
                const isRecent = isToday(r.openTs);
                return `
                <tr class="highlight-equal ${isRecent ? 'recent-trade' : ''}">
                    <td>${r.lineNumber}</td>
                    <td class="datetime-cell">${r.dt || ''}</td>
                    <td class="account-cell" style="color: ${accountColor}; font-weight: 600;">
                        ${r.ticket || ''}
                        ${isRecent ? '<span class="recent-badge">جديد</span>' : ''}
                    </td>
                    <td class="type-cell ${r.type === 'Buy' ? 'buy-type' : 'sell-type'}">${r.type || ''}</td>
                    <td class="symbol-cell">${r.symbol || ''}</td>
                    <td class="price-cell">${Number.isFinite(r.price) ? r.price : ''}</td>
                    <td class="sl-cell">${Number.isFinite(r.sl) ? r.sl : ''}</td>
                    <td class="profit-cell ${Number.isFinite(r.profit) && r.profit > 0 ? 'profit-positive' : (Number.isFinite(r.profit) && r.profit < 0 ? 'profit-negative' : '')}">${Number.isFinite(r.profit) ? r.profit.toFixed(2) : ''}</td>
                </tr>`
            }).join('');
            
            sectionsHtml += `
                <div class="results-section" id="price-sl-section">
                    <h3 class="section-header price-sl-header">
                        <i class="fas fa-equals"></i> صفقات Price = S/L (${priceSLRows.length})
                        <small style="float: left; font-weight: normal; opacity: 0.8;">مرتبة حسب الأحدث</small>
                    </h3>
                    <div class="table-wrapper">
                        <table class="results-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>التاريخ</th>
                                    <th>التذكرة</th>
                                    <th>النوع</th>
                                    <th>الرمز</th>
                                    <th>السعر</th>
                                    <th>S/L</th>
                                    <th>الربح</th>
                                </tr>
                            </thead>
                            <tbody>${priceSLTable}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Profit = 0 Section
        if (profitZeroRows.length > 0) {
            const profitZeroTable = profitZeroRows.map((r, index) => {
                const accountColor = getAccountColor(r.ticket);
                const isRecent = isToday(r.openTs);
                return `
                <tr class="highlight-zero-profit ${isRecent ? 'recent-trade' : ''}">
                    <td>${r.lineNumber}</td>
                    <td class="datetime-cell">${r.dt || ''}</td>
                    <td class="account-cell" style="color: ${accountColor}; font-weight: 600;">
                        ${r.ticket || ''}
                        ${isRecent ? '<span class="recent-badge">جديد</span>' : ''}
                    </td>
                    <td class="type-cell ${r.type === 'Buy' ? 'buy-type' : 'sell-type'}">${r.type || ''}</td>
                    <td class="symbol-cell">${r.symbol || ''}</td>
                    <td class="price-cell">${Number.isFinite(r.price) ? r.price : ''}</td>
                    <td class="sl-cell">${Number.isFinite(r.sl) ? r.sl : ''}</td>
                    <td class="profit-cell">${Number.isFinite(r.profit) ? r.profit.toFixed(2) : ''}</td>
                </tr>`
            }).join('');
            
            sectionsHtml += `
                <div class="results-section" id="profit-zero-section">
                    <h3 class="section-header profit-zero-header">
                        <i class="fas fa-coins"></i> صفقات الربح = 0.00 (${profitZeroRows.length})
                        <small style="float: left; font-weight: normal; opacity: 0.8;">مرتبة حسب الأحدث</small>
                    </h3>
                    <div class="table-wrapper">
                        <table class="results-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>التاريخ</th>
                                    <th>التذكرة</th>
                                    <th>النوع</th>
                                    <th>الرمز</th>
                                    <th>السعر</th>
                                    <th>S/L</th>
                                    <th>الربح</th>
                                </tr>
                            </thead>
                            <tbody>${profitZeroTable}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Paired Trades Section
        if (pairs.length > 0) {
            const pairRows = pairs.map((p, idx) => {
                const a = p.a; const b = p.b;
                const pairColorClass = `pair-color-${(idx % 6) + 1}`;
                const accountColorA = getAccountColor(a.ticket);
                const accountColorB = getAccountColor(b.ticket);
                const pairIsToday = isToday(a.openTs) || isToday(b.openTs);
                
                const row = (t, pairInfo = null, isFirst = false, accountColor) => {
                    const tradeIsToday = isToday(t.openTs);
                    return `
                    <tr class="pair-row ${pairColorClass} ${tradeIsToday ? 'recent-trade' : ''}">
                        <td>${isFirst ? idx + 1 : ''}</td>
                        <td class="datetime-cell">${t.dt || ''}</td>
                        <td class="account-cell" style="color: ${accountColor}; font-weight: 600;">
                            ${t.ticket || ''}
                            ${tradeIsToday && isFirst ? '<span class="recent-badge">جديد</span>' : ''}
                        </td>
                        <td class="type-cell ${t.type === 'Buy' ? 'buy-type' : 'sell-type'}">${t.type || ''}</td>
                        <td class="symbol-cell">${t.symbol || ''}</td>
                        <td class="lot-cell">${Number.isFinite(t.lot) ? t.lot : ''}</td>
                        <td class="price-cell">${Number.isFinite(t.price) ? t.price : ''}</td>
                        <td class="sl-cell">${Number.isFinite(t.sl) ? t.sl : ''}</td>
                        <td class="profit-cell ${Number.isFinite(t.profit) && t.profit > 0 ? 'profit-positive' : (Number.isFinite(t.profit) && t.profit < 0 ? 'profit-negative' : '')}">${Number.isFinite(t.profit) ? t.profit.toFixed(2) : ''}</td>
                        <td class="diff-cell">${pairInfo ? pairInfo.timeDiffDisplay : ''}</td>
                    </tr>`;
                };
                
                const separator = idx < pairs.length - 1 ? `
                    <tr class="pair-separator">
                        <td colspan="10"><hr style="border: 1px solid var(--border-color); margin: 8px 0;"></td>
                    </tr>` : '';
                
                return row(a, p, true, accountColorA) + row(b, null, false, accountColorB) + separator;
            }).join('');
            
            sectionsHtml += `
                <div class="results-section" id="pairs-section">
                    <h3 class="section-header pairs-header">
                        <i class="fas fa-link"></i> صفقات الفتح المتقاربة المتعاكسة (${pairs.length} زوج)
                        <small style="float: left; font-weight: normal; opacity: 0.8;">مرتبة حسب الأحدث</small>
                    </h3>
                    <div class="table-wrapper">
                        <table class="results-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>وقت الفتح</th>
                                    <th>التذكرة</th>
                                    <th>النوع</th>
                                    <th>الرمز</th>
                                    <th>اللوت</th>
                                    <th>السعر</th>
                                    <th>S/L</th>
                                    <th>الربح</th>
                                    <th>فرق الفتح</th>
                                </tr>
                            </thead>
                            <tbody>${pairRows}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        html += sectionsHtml;
        
        container.innerHTML = html;
        setupFilterButtons(results);
        setupPairsControls(results);

        const copyBtn = document.getElementById('copy-flagged-btn');
        if (copyBtn && displayRows.length > 0) {
            copyBtn.addEventListener('click', () => {
                const text = displayRows.map(f => f.raw).join('\n');
                navigator.clipboard.writeText(text).then(() => {
                    showToast(`تم نسخ ${displayRows.length} سطرًا.`);
                }).catch(() => showToast('تعذّر النسخ إلى الحافظة.', true));
            });
        }
        return;
    }

    // Determine which columns to show based on filter
    const showProfitCol = (currentFilter === 'profit-zero' || currentFilter === 'all');
    const showSlCol = (currentFilter === 'price-sl' || currentFilter === 'all');

    // Show all categories with different highlighting
    const rows = displayRows.map((r, index) => {
        let highlightClass = '';
        if (r.equal) highlightClass = 'highlight-equal';
        else if (r.zeroProfit) highlightClass = 'highlight-zero-profit';
        else {
            // Check if this trade is part of a pair
            const isInPair = pairs.some(p => p.a.lineNumber === r.lineNumber || p.b.lineNumber === r.lineNumber);
            if (isInPair) highlightClass = 'highlight-pair-trade';
        }
        
        const accountColor = getAccountColor(r.ticket);
        const isRecent = isToday(r.openTs);
        
        return `
        <tr class="${highlightClass} ${isRecent ? 'recent-trade' : ''}">
            <td>${r.lineNumber}</td>
            <td class="datetime-cell">${r.dt || ''}</td>
            <td class="account-cell" style="color: ${accountColor}; font-weight: 600;">
                ${r.ticket || ''}
                ${isRecent ? '<span class="recent-badge">جديد</span>' : ''}
            </td>
            <td class="type-cell ${r.type === 'Buy' ? 'buy-type' : 'sell-type'}">${r.type || ''}</td>
            <td class="symbol-cell">${r.symbol || ''}</td>
            <td class="price-cell">${Number.isFinite(r.price) ? r.price : ''}</td>
            ${showSlCol ? `<td class="sl-cell">${Number.isFinite(r.sl) ? r.sl : ''}</td>` : ''}
            ${showProfitCol ? `<td class="profit-cell ${Number.isFinite(r.profit) && r.profit > 0 ? 'profit-positive' : (Number.isFinite(r.profit) && r.profit < 0 ? 'profit-negative' : '')}">${Number.isFinite(r.profit) ? r.profit.toFixed(2) : ''}</td>` : ''}
        </tr>`
    }).join('');

    html += `
        <div class="table-wrapper">
            <table class="results-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>التاريخ</th>
                        <th>التذكرة</th>
                        <th>النوع</th>
                        <th>الرمز</th>
                        <th>السعر</th>
                        ${showSlCol ? '<th>S/L</th>' : ''}
                        ${showProfitCol ? '<th>الربح</th>' : ''}
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p style="margin-top:10px; color: var(--muted-text-color);">
            دلالة الألوان: <span class="highlight-equal" style="padding:2px 6px; border-radius:4px;">Price = S/L</span>
            &nbsp;|&nbsp; <span class="highlight-zero-profit" style="padding:2px 6px; border-radius:4px;">الربح = 0.00</span>
            &nbsp;|&nbsp; <span class="highlight-pair-trade" style="padding:2px 6px; border-radius:4px;">صفقة متقاربة</span>
        </p>
    `;

    container.innerHTML = html;

    setupFilterButtons(results);

    const copyBtn = document.getElementById('copy-flagged-btn');
    if (copyBtn && displayRows.length > 0) {
        copyBtn.addEventListener('click', () => {
            if (displayRows.length === 0) {
                showToast('لا توجد صفوف مطابقة للنسخ.', true);
                return;
            }
            const text = displayRows.map(f => f.raw).join('\n');
            navigator.clipboard.writeText(text).then(() => {
                showToast(`تم نسخ ${displayRows.length} سطرًا.`);
            }).catch(() => showToast('تعذّر النسخ إلى الحافظة.', true));
        });
    }
}

function setupFilterButtons(results) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentFilter = e.currentTarget.dataset.filter;
            renderResults(results);
        });
    });
}

function setupPairsControls(results) {
    const controls = document.getElementById('pairs-controls');
    if (!controls) return;
    
    const input = document.getElementById('pair-window-min');
    const btn = document.getElementById('apply-pairs-window');
    
    if (btn && input) {
        // Remove any existing listeners to avoid duplicates
        btn.replaceWith(btn.cloneNode(true));
        const newBtn = document.getElementById('apply-pairs-window');
        
        newBtn.addEventListener('click', () => {
            const v = parseInt(input.value, 10);
            if (!Number.isFinite(v) || v < 1) {
                showToast('يرجى إدخال رقم صحيح أكبر من 0', true);
                input.value = pairWindowMin;
                return;
            }
            pairWindowMin = v;
            showToast(`تم تحديث حد التقارب إلى ${v} دقيقة`);
            renderResults(results);
        });
        
        // Allow Enter key to apply changes
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                newBtn.click();
            }
        });
    }
}

export function renderSamePriceSLPage() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
    <div class="comparator-page-container">
        <div class="page-header">
            <h1 class="page-title"><i class="fas fa-equals"></i> فحص Price = S/L</h1>
            <p>الصق كشف الصفقات وسيتم تمييز الصفقات التي يكون فيها السعر مساويًا لوقف الخسارة (الحقل بعد الرمز مباشرة).</p>
        </div>

        <div class="form-group textarea-group">
            <label for="price-sl-input">بيانات الصفقات</label>
            <div class="textarea-with-linenumbers">
                <pre class="line-numbers">1</pre>
                <textarea id="price-sl-input" placeholder="2025.11.12 20:11:47\t112810685\tBuy\t0.01\tXAUUSD\t4199.53\t4199.53\t..."></textarea>
            </div>
            <small class="column-hint">التفريغ المدعوم: مفصول بتبويب (Tab) أو مسافات. نتوقع الأعمدة: التاريخ، التذكرة، النوع، اللوت، الرمز، السعر، S/L، ...</small>
        </div>

        <div class="comparator-actions" style="margin-top: 10px;">
            <button id="run-price-sl-check" class="submit-btn"><i class="fas fa-play"></i> فحص</button>
            <button id="clear-price-sl-input" class="cancel-btn"><i class="fas fa-eraser"></i> مسح</button>
        </div>

        <div id="same-price-sl-results" class="results-container" style="margin-top: 20px;"></div>
    </div>`;

    // Reuse line-number sync from comparator style
    const textarea = document.getElementById('price-sl-input');
    const lineNumbers = textarea.previousElementSibling;
    
    // Optimized line numbers update with debouncing
    let lineNumberTimeout;
    const updateLineNumbers = () => {
        clearTimeout(lineNumberTimeout);
        lineNumberTimeout = setTimeout(() => {
            const count = textarea.value.split('\n').length || 1;
            // Only update if changed to avoid unnecessary reflows
            const newContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
            if (lineNumbers.textContent !== newContent) {
                lineNumbers.textContent = newContent;
            }
        }, 100);
    };
    
    textarea.addEventListener('input', updateLineNumbers);
    textarea.addEventListener('scroll', () => { lineNumbers.scrollTop = textarea.scrollTop; });

    // Restore last input
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) textarea.value = saved;
    updateLineNumbers();

    const run = () => {
        const raw = textarea.value.trim();
        sessionStorage.setItem(STORAGE_KEY, raw);
        if (!raw) {
            showToast('الرجاء لصق بيانات الصفقات أولاً.', true);
            document.getElementById('same-price-sl-results').innerHTML = '';
            return;
        }
        
        // Show loading indicator
        const resultsDiv = document.getElementById('same-price-sl-results');
        resultsDiv.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div class="spinner" style="margin: 0 auto 20px;"></div>
                <p style="color: var(--text-secondary);">جاري المعالجة...</p>
            </div>
        `;
        
        // Use setTimeout to allow UI to update before heavy processing
        setTimeout(() => {
            const results = parseTrades(raw);
            renderResults(results);
            // Auto-clear to avoid lag from large inputs
            textarea.value = '';
            updateLineNumbers();
            sessionStorage.removeItem(STORAGE_KEY);
        }, 50);
    };

    document.getElementById('run-price-sl-check').addEventListener('click', run);
    document.getElementById('clear-price-sl-input').addEventListener('click', () => {
        textarea.value = '';
        updateLineNumbers();
        sessionStorage.removeItem(STORAGE_KEY);
        document.getElementById('same-price-sl-results').innerHTML = '';
    });

    // Quick UX: run automatically if restored
    if (textarea.value.trim()) run();

    // Inject minimal style for highlight if not present
    const styleId = 'same-price-sl-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .highlight-equal { background-color: rgba(255, 193, 7, 0.15); }
            .highlight-zero-profit { background-color: rgba(23, 162, 184, 0.18); }
            .badge { 
                display: inline-block; 
                padding: 6px 12px; 
                margin: 4px;
                border-radius: 16px; 
                font-size: 13px; 
                font-weight: 600;
                white-space: nowrap;
            }
            .filter-btn {
                padding: 6px 12px;
                border: 2px solid var(--border-color);
                background: var(--card-background);
                color: var(--text-color);
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            }
            .filter-btn:hover {
                background: var(--hover-background);
                border-color: var(--accent-color);
            }
            .filter-btn.active {
                background: var(--accent-color);
                color: white;
                border-color: var(--accent-color);
            }
            .pair-color-1 { background-color: rgba(255, 193, 7, 0.1); }
            .pair-color-2 { background-color: rgba(23, 162, 184, 0.1); }
            .pair-color-3 { background-color: rgba(40, 167, 69, 0.1); }
            .pair-color-4 { background-color: rgba(220, 53, 69, 0.1); }
            .pair-color-5 { background-color: rgba(102, 16, 242, 0.1); }
            .pair-color-6 { background-color: rgba(253, 126, 20, 0.1); }
            .pair-separator td { padding: 0; }
            .pair-separator hr { margin: 8px 0; border: 1px solid var(--border-color); }
            .highlight-pair-trade { background-color: rgba(156, 39, 176, 0.15); }
            .results-section {
                margin-bottom: 2rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .section-header {
                margin: 0;
                padding: 1rem 1.5rem;
                font-size: 1.1rem;
                font-weight: 600;
                border-bottom: 1px solid var(--border-color);
            }
            .price-sl-header {
                background: linear-gradient(135deg, rgba(255, 193, 7, 0.2), rgba(255, 193, 7, 0.1));
                color: #856404;
            }
            .profit-zero-header {
                background: linear-gradient(135deg, rgba(23, 162, 184, 0.2), rgba(23, 162, 184, 0.1));
                color: #0c5460;
            }
            .pairs-header {
                background: linear-gradient(135deg, rgba(156, 39, 176, 0.2), rgba(156, 39, 176, 0.1));
                color: #6a1b9a;
            }
            .results-section .table-wrapper {
                margin: 0;
                border: none;
                border-radius: 0;
            }
            .results-section .results-table {
                margin-bottom: 0;
            }
            .recent-trade {
                box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.3);
                position: relative;
                animation: glow 2s ease-in-out infinite alternate;
            }
            @keyframes glow {
                from { box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.3); }
                to { box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.6); }
            }
            .recent-badge {
                display: inline-block;
                background: linear-gradient(45deg, #ff6b6b, #ffa500);
                color: white;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 10px;
                margin-right: 5px;
                font-weight: bold;
                animation: pulse 1.5s ease-in-out infinite;
            }
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
            .datetime-cell {
                color: var(--muted-text-color);
                font-family: monospace;
                font-size: 12px;
            }
            .account-cell {
                font-family: monospace;
                font-weight: 600 !important;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
            }
            .type-cell {
                font-weight: 600;
                text-transform: uppercase;
            }
            .buy-type {
                color: #27ae60;
                background: rgba(39, 174, 96, 0.1);
                padding: 4px 8px;
                border-radius: 4px;
            }
            .sell-type {
                color: #e74c3c;
                background: rgba(231, 76, 60, 0.1);
                padding: 4px 8px;
                border-radius: 4px;
            }
            .symbol-cell {
                font-weight: 600;
                color: var(--accent-color);
            }
            .price-cell, .sl-cell, .lot-cell {
                font-family: monospace;
                text-align: right;
            }
            .profit-cell {
                font-family: monospace;
                font-weight: 600;
                text-align: right;
            }
            .profit-positive {
                color: #27ae60;
                background: rgba(39, 174, 96, 0.1);
            }
            .profit-negative {
                color: #e74c3c;
                background: rgba(231, 76, 60, 0.1);
            }
            .diff-cell {
                font-family: monospace;
                font-weight: 600;
                color: #8e44ad;
                text-align: center;
            }
        `;
        document.head.appendChild(style);
    }
}
