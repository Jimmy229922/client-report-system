import { showToast, showConfirmModal } from './ui.js';

function parseData(accountsText, timestampsText) {
    const accountLines = accountsText.split('\n');
    const timestampLines = timestampsText.split('\n');
    const combinedSet = new Set();
    const accountsOnlyMap = new Map();

    for (let i = 0; i < accountLines.length; i++) {
        const account = accountLines[i] ? accountLines[i].trim() : null;
        
        if (account) {
            if (!accountsOnlyMap.has(account)) {
                accountsOnlyMap.set(account, { originalLine: i + 1 });
            }
            const timestamp = timestampLines[i] ? timestampLines[i].trim() : null;
            const uniqueKey = timestamp ? `${account}|${timestamp}` : account;
            combinedSet.add(uniqueKey);
        }
    }
    return { combinedData: combinedSet, accountsOnly: accountsOnlyMap };
}

let comparisonResults = [];
let newAccountsForCopy = [];

const COMPARATOR_STATE_KEY = 'comparatorState'; // Key for sessionStorage to persist input data
const HIGHLIGHT_ROW_KEY = 'highlightRowId'; // Key for sessionStorage to highlight a row after returning from archive

function performComparison() {
    const oldAccountsText = document.getElementById('old-accounts-data').value;
    const oldTimestampsText = document.getElementById('old-accounts-timestamp').value;
    const newAccountsText = document.getElementById('new-accounts-data').value;
    const newTimestampsText = document.getElementById('new-accounts-timestamp').value;

    const resultsContainer = document.getElementById('comparator-results');
    const copyResultsBtn = document.getElementById('copy-results-btn');
    const copyNewAccountsBtn = document.getElementById('copy-new-accounts-btn');

    if (!newAccountsText) {
        showToast('الرجاء إدخال قائمة الحسابات الجديدة للمقارنة.', true);
        return;
    }

    sessionStorage.setItem(COMPARATOR_STATE_KEY, JSON.stringify({
        oldAccountsText, oldTimestampsText, newAccountsText, newTimestampsText
    }));
    
    const { combinedData: oldDataSet, accountsOnly: oldAccountsOnlyMap } = parseData(oldAccountsText, oldTimestampsText);

    const newAccountLines = newAccountsText.split('\n');
    const newTimestampLines = newTimestampsText.split('\n');
    
    const allResults = [];

    const accountFormatRegex = /^\d+$/;
    const timestampFormatRegex = /^\d{4}\.\d{2}\.\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}$/;

    for (let i = 0; i < newAccountLines.length; i++) {
        const accountLineRaw = newAccountLines[i] || '';
        const timestampLineRaw = newTimestampLines[i] || '';
        
        const accountMatch = accountLineRaw.trim().match(/^\d+$/);
        const accountTrimmed = accountMatch ? accountMatch[0] : null;
        const timestampTrimmed = timestampLineRaw.trim();

        if (!accountTrimmed) {
            if (accountLineRaw.trim() !== '') {
                allResults.push({
                    type: 'tainted',
                    account: accountLineRaw,
                    timestamp: timestampLineRaw,
                    originalLine: i + 1
                });
            }
            continue;
        }

        const isTimestampFormatValid = timestampTrimmed === '' || timestampFormatRegex.test(timestampTrimmed);

        if (isTimestampFormatValid) {
            if (timestampTrimmed) {
                const keyWithTimestamp = `${accountTrimmed}|${timestampTrimmed}`;
                const isDuplicate = oldDataSet.has(keyWithTimestamp) || oldAccountsOnlyMap.has(accountTrimmed);
                allResults.push({
                    type: isDuplicate ? 'duplicate' : 'new_with_timestamp',
                    account: accountLineRaw.trim(),
                    timestamp: timestampTrimmed,
                    originalLine: i + 1
                });
            } else {
                const isDuplicate = oldAccountsOnlyMap.has(accountTrimmed);
                allResults.push({
                    type: isDuplicate ? 'duplicate' : 'new_without_timestamp',
                    account: accountLineRaw.trim(),
                    timestamp: '',
                    originalLine: i + 1
                });
            }
        } else {
            allResults.push({
                type: 'tainted',
                account: accountLineRaw,
                timestamp: timestampLineRaw,
                originalLine: i + 1
            });
        }
    }

    // Find accounts from the old list that are missing in the new list
    const { accountsOnly: newAccountsOnlyMap } = parseData(newAccountsText, '');
    const missingAccounts = [];
    for (const [account, data] of oldAccountsOnlyMap.entries()) {
        if (!newAccountsOnlyMap.has(account)) {
            missingAccounts.push({ type: 'missing', account: account, timestamp: '---', originalLine: data.originalLine });
        }
    }

    const finalResults = [...allResults, ...missingAccounts];

    resultsContainer.classList.remove('hidden');
    comparisonResults = finalResults;
    renderResultsTable(finalResults);

    if (finalResults.length > 0) {
        copyResultsBtn.classList.remove('hidden');
    } else {
        copyResultsBtn.classList.add('hidden');
    }

    if (newAccountsForCopy.length > 0) {
        copyNewAccountsBtn.classList.remove('hidden');
    } else {
        copyNewAccountsBtn.classList.add('hidden');
    }
}

function renderResultsTable(results) {
    const resultsOutput = document.getElementById('comparator-results-output');
    
    if (!results || results.length === 0) {
        resultsOutput.innerHTML = '<p class="no-results">لا توجد حسابات جديدة أو بيانات تالفة.</p>';
        return;
    }

    const newAndUnique = results.filter(r => r.type === 'new_with_timestamp' || r.type === 'new_without_timestamp');
    newAccountsForCopy = newAndUnique;
    const duplicates = results.filter(r => r.type === 'duplicate');
    const missing = results.filter(r => r.type === 'missing');
    const tainted = results.filter(r => r.type === 'tainted');

    const categories = [
        { data: newAndUnique, title: 'حسابات جديدة', icon: 'fa-sparkles', className: 'new-account-result', id: 'new-accounts-section' },
        { data: missing, title: 'حسابات مفقودة (كانت في القديم)', icon: 'fa-ghost', className: 'missing-account-result' },
        { data: duplicates, title: 'حسابات مكررة (تم تجاهلها)', icon: 'fa-copy', className: 'duplicate-account-result' },
        { data: tainted, title: 'بيانات تالفة (تم تجاهلها)', icon: 'fa-exclamation-triangle', className: 'tainted-result' }
    ];

    let html = '';
    let globalIndex = 1;

    categories.forEach(category => {
        if (category.data.length === 0) return;

        const tableRows = category.data.map(entry => {
            const accountForSearch = (entry.account.match(/\d+/) || [''])[0];
            const searchIcon = entry.type !== 'tainted' && accountForSearch ? `<a href="#archive?search=${accountForSearch}" class="search-in-archive-btn" data-line-id="${entry.originalLine}" title="بحث عن هذا الحساب في الأرشيف"><i class="fas fa-search"></i></a>` : '';
            const accountCellContent = `<div class="account-cell-content"><span class="copyable-account" title="اضغط للنسخ">${entry.account}</span>${searchIcon}</div>`;

            return `
                <tr class="${category.className}" data-line-id="${entry.originalLine}">
                    <td>${entry.type === 'missing' ? '-' : globalIndex++}</td>
                    <td class="account-cell">${accountCellContent}</td>
                    <td>${entry.timestamp || '---'}</td>
                    <td>${entry.originalLine}</td>
                </tr>
            `;
        }).join('');

        html += `
            <div class="result-category" ${category.id ? `id="${category.id}"` : ''}>
                <h3><i class="fas ${category.icon} ${category.className}"></i> ${category.title} (${category.data.length})</h3>
                <div class="table-wrapper">
                    <table class="results-table">
                        <thead><tr><th>#</th><th>رقم الحساب</th><th>التاريخ</th><th>السطر الأصلي</th></tr></thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </div>
        `;
    });

    resultsOutput.innerHTML = html;
    setupResultInteractions();
    checkAndHighlightRow();
}

function setupResultInteractions() {
    const resultsOutput = document.getElementById('comparator-results-output');
    if (!resultsOutput) return;

    resultsOutput.addEventListener('click', (e) => {
        // Handle copying account number
        const copyTarget = e.target.closest('.copyable-account');
        if (copyTarget) {
            const accountNumber = copyTarget.textContent;
            navigator.clipboard.writeText(accountNumber).then(() => {
                showToast(`تم نسخ رقم الحساب: ${accountNumber}`);
            }).catch(err => {
                showToast('فشل نسخ الرقم.', true);
            });
            return; // Prevent other events
        }
        
        // Handle setting highlight flag for archive search
        const searchBtn = e.target.closest('.search-in-archive-btn');
        if (searchBtn) {
            const lineId = searchBtn.dataset.lineId;
            sessionStorage.setItem(HIGHLIGHT_ROW_KEY, lineId);
            sessionStorage.setItem('fromComparator', 'true');
        }
    });
}

function checkAndHighlightRow() {
    const highlightRowId = sessionStorage.getItem(HIGHLIGHT_ROW_KEY);
    if (highlightRowId) {
        const rowToHighlight = document.querySelector(`tr[data-line-id="${highlightRowId}"]`);
        if (rowToHighlight) {
            // Use a timeout to ensure the DOM is fully rendered and ready for scrolling
            setTimeout(() => { // Short delay for rendering
                rowToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Create and show the spotlight overlay
                const spotlightOverlay = document.createElement('div');
                spotlightOverlay.className = 'spotlight-overlay';
                document.body.appendChild(spotlightOverlay);
                
                // After scrolling is likely complete, apply the focus effects
                setTimeout(() => {
                    spotlightOverlay.classList.add('visible');
                    rowToHighlight.classList.add('focus-highlight');

                    // Remove the effect after a few seconds
                    setTimeout(() => {
                        spotlightOverlay.classList.remove('visible');
                        rowToHighlight.classList.remove('focus-highlight');
                        spotlightOverlay.addEventListener('transitionend', () => spotlightOverlay.remove());
                    }, 2500);
                }, 500); // Delay to allow scroll to finish
            }, 100);
        }
        sessionStorage.removeItem(HIGHLIGHT_ROW_KEY);
    }
}

function setupTableSorting() {
    const tables = document.querySelectorAll('.results-table');
    if (!tables) return;

    tables.forEach(table => {
        const headers = table.querySelectorAll('th[data-sort-key]');

        headers.forEach(header => {
            header.addEventListener('click', () => {
                const isAsc = header.classList.contains('sort-asc');
                const direction = isAsc ? -1 : 1;
                const sortType = header.dataset.sortType || 'string';
                const colIndex = Array.from(header.parentNode.children).indexOf(header);

                // Clear sorting classes from other tables' headers
                document.querySelectorAll('.results-table th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
                header.classList.toggle('sort-desc', !isAsc);
                header.classList.toggle('sort-asc', isAsc);

                const tbody = table.querySelector('tbody');
                const rows = Array.from(tbody.querySelectorAll('tr'));

                rows.sort((a, b) => {
                    let valA = a.children[colIndex].textContent.trim();
                    let valB = b.children[colIndex].textContent.trim();

                    if (sortType === 'number') {
                        valA = parseFloat(valA) || 0;
                        valB = parseFloat(valB) || 0;
                    }

                    if (valA < valB) return -1 * direction;
                    if (valA > valB) return 1 * direction;
                    return 0;
                });

                tbody.innerHTML = '';
                rows.forEach(row => tbody.appendChild(row));
            });
        });
    });
}

function setupLineNumberSync(textareaId) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;

    const lineNumbers = textarea.previousElementSibling;
    if (!lineNumbers || lineNumbers.tagName !== 'PRE') return;
    
    const updateLineNumbers = () => {
        const lineCount = textarea.value.split('\n').length || 1;
        lineNumbers.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
    };

    textarea.addEventListener('input', updateLineNumbers);
    textarea.addEventListener('scroll', () => {
        lineNumbers.scrollTop = textarea.scrollTop;
    });

    updateLineNumbers();
}

/**
 * Handle paste events where clipboard contains two columns (account + timestamp)
 * If detected, split the pasted data into the account and timestamp textareas
 * and append them to existing content. Otherwise allow default paste.
 */
function handlePasteForTextareas(pasteEvent, accountEl, timestampEl) {
    try {
        const clipboardText = (pasteEvent.clipboardData || window.clipboardData).getData('text') || '';
        if (!clipboardText) return;

        const lines = clipboardText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) return;

        const timestampFormatRegex = /^\d{4}\.\d{2}\.\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}$/;
        const accountRegex = /^\d+$/;

        // Detect whether each non-empty line contains at least two columns (tab/comma/space separated)
        const looksLikeTwoColumns = lines.every(line => {
            const parts = line.split(/\t|,/).map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) return true;
            const spaceParts = line.trim().split(/\s+/);
            return spaceParts.length >= 2 && (accountRegex.test(spaceParts[0]) || timestampFormatRegex.test(spaceParts.slice(1).join(' ')));
        });

        if (!looksLikeTwoColumns) {
            // Let normal paste proceed
            return;
        }

        pasteEvent.preventDefault();

        const accounts = [];
        const timestamps = [];

        lines.forEach(line => {
            let parts = line.split(/\t|,/).map(p => p.trim()).filter(Boolean);
            if (parts.length < 2) {
                parts = line.trim().split(/\s+/);
            }
            const accountMatch = (parts[0] || '').match(/\d+/);
            const account = accountMatch ? accountMatch[0] : (parts[0] || '');
            const ts = parts.slice(1).join(' ').trim();
            accounts.push(account);
            timestamps.push(ts);
        });

        // Append to existing values, preserving current lines
        const existingAccounts = (accountEl.value || '').split(/\r?\n/);
        const existingTimestamps = (timestampEl.value || '').split(/\r?\n/);

        // If existing arrays contain a single empty string, convert to empty arrays
        const cleanExistingAccounts = existingAccounts.length === 1 && existingAccounts[0] === '' ? [] : existingAccounts;
        const cleanExistingTimestamps = existingTimestamps.length === 1 && existingTimestamps[0] === '' ? [] : existingTimestamps;

        accountEl.value = cleanExistingAccounts.concat(accounts).join('\n');
        timestampEl.value = cleanExistingTimestamps.concat(timestamps).join('\n');

        // Trigger input events so line-number sync and other listeners update
        accountEl.dispatchEvent(new Event('input'));
        timestampEl.dispatchEvent(new Event('input'));

        showToast('تم لصق البيانات وفصلها إلى أعمدة الأرقام والتواريخ.');
    } catch (err) {
        console.error('Paste handling failed:', err);
        // If anything goes wrong, allow normal paste to proceed
    }
}

export function renderComparatorPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
    <div class="comparator-page-container">
        <div class="page-header">
            <h1 class="page-title"><i class="fas fa-balance-scale-right"></i> أداة مقارنة الحسابات</h1>
            <p>قارن بين كشفين لتحديد الحسابات الجديدة, المكررة, والمفقودة.</p>
        </div>

        <div class="comparator-container">
            <div class="comparator-column">
                <h2><i class="fas fa-database"></i> البيانات القديمة</h2>
                <p class="column-hint">ضع هنا البيانات التي تم تدقيقها مسبقاً.</p>
                <div class="form-group textarea-group">
                    <label for="old-accounts-data">أرقام الحسابات (كل حساب في سطر)</label>
                    <div class="textarea-with-linenumbers">
                        <pre class="line-numbers">1</pre>
                        <textarea id="old-accounts-data" placeholder="3215587\n3212138\n3212126"></textarea>
                    </div>
                </div>
                <div class="form-group textarea-group">
                    <label for="old-accounts-timestamp">التواريخ الموافقة (كل تاريخ في سطر)</label>
                    <div class="textarea-with-linenumbers">
                        <pre class="line-numbers">1</pre>
                        <textarea id="old-accounts-timestamp" placeholder="2025.09.19 18:31:00.900\n2025.09.21 19:25:03.359\n... (اختياري)"></textarea>
                    </div>
                </div>
            </div>

            <div class="comparator-column">
                <h2><i class="fas fa-file-alt"></i> البيانات الجديدة</h2>
                <p class="column-hint">ضع هنا البيانات الجديدة التي تريد فحصها.</p>
                <div class="form-group textarea-group">
                    <label for="new-accounts-data">أرقام الحسابات (كل حساب في سطر)</label>
                    <div class="textarea-with-linenumbers">
                        <pre class="line-numbers">1</pre>
                        <textarea id="new-accounts-data" placeholder="3215587\n3212138\n3201182"></textarea>
                    </div>
                </div>
                <div class="form-group textarea-group">
                    <label for="new-accounts-timestamp">التواريخ الموافقة (كل تاريخ في سطر)</label>
                    <div class="textarea-with-linenumbers">
                        <pre class="line-numbers">1</pre>
                        <textarea id="new-accounts-timestamp" placeholder="2025.09.19 18:31:00.900\n2025.09.21 19:25:03.359\n... (اختياري)"></textarea>
                    </div>
                </div>
            </div>
        </div>

        <div class="comparator-actions">
            <button id="compare-btn" class="submit-btn"><i class="fas fa-exchange-alt"></i> مقارنة</button>
            <button id="reset-comparator-btn" class="cancel-btn"><i class="fas fa-sync-alt"></i> إعادة تعيين</button>
        </div>

        <div id="comparator-results" class="results-container hidden">
            <div class="results-header">
                <h2><i class="fas fa-sparkles"></i> نتيجة المقارنة  </h2>
                <button id="copy-new-accounts-btn" class="copy-btn hidden" style="background-color: var(--accent-color);"><i class="fas fa-copy"></i> نسخ الحسابات الجديدة</button>
                <button id="copy-results-btn" class="copy-btn hidden"><i class="fas fa-copy"></i> نسخ كل النتائج</button>
            </div>
            <div id="comparator-results-output" class="results-output-box"></div>
            <button id="scroll-to-top-btn" class="scroll-to-top-btn hidden" title="العودة للأعلى"><i class="fas fa-arrow-up"></i></button>
        </div>
    </div>
    `;

    const oldAccountsData = document.getElementById('old-accounts-data');
    const oldAccountsTimestamp = document.getElementById('old-accounts-timestamp');
    const newAccountsData = document.getElementById('new-accounts-data');
    const newAccountsTimestamp = document.getElementById('new-accounts-timestamp');

    // Enable smart paste: if clipboard contains two columns (account + timestamp),
    // split them into the paired textareas automatically.
    [oldAccountsData, oldAccountsTimestamp, newAccountsData, newAccountsTimestamp].forEach(el => {
        if (!el) return;
        const pairId = el.id.endsWith('-data') ? el.id.replace('-data', '-timestamp') : el.id.replace('-timestamp', '-data');
        const otherEl = document.getElementById(pairId);
        el.addEventListener('paste', (e) => {
            const accountEl = el.id.endsWith('-data') ? el : otherEl;
            const timestampEl = el.id.endsWith('-timestamp') ? el : otherEl;
            handlePasteForTextareas(e, accountEl, timestampEl);
        });
    });

    const savedStateJSON = sessionStorage.getItem(COMPARATOR_STATE_KEY);
    if (savedStateJSON) {
        try {
            const savedState = JSON.parse(savedStateJSON);
            oldAccountsData.value = savedState.oldAccountsText || '';
            oldAccountsTimestamp.value = savedState.oldTimestampsText || '';
            newAccountsData.value = savedState.newAccountsText || '';
            newAccountsTimestamp.value = savedState.newTimestampsText || '';
            
            if (savedState.newAccountsText) {
                performComparison(); // Re-run comparison to display results
            }
        } catch (e) {
            console.error("Failed to restore comparator state:", e);
            sessionStorage.removeItem(COMPARATOR_STATE_KEY);
        }
    }

    document.getElementById('compare-btn').addEventListener('click', performComparison);

    document.getElementById('reset-comparator-btn').addEventListener('click', async () => {
        const confirmed = await showConfirmModal(
            'تأكيد إعادة التعيين',
            'هل أنت متأكد من رغبتك في مسح جميع الحقول والنتائج؟ لا يمكن التراجع عن هذا الإجراء.',
            {
                iconClass: 'fas fa-sync-alt',
                iconColor: 'var(--danger-color)',
                confirmText: 'نعم، إعادة تعيين',
                confirmClass: 'submit-btn danger-btn'
            }
        );
        if (confirmed) {
            oldAccountsData.value = '';
            oldAccountsTimestamp.value = '';
            newAccountsData.value = '';
            newAccountsTimestamp.value = '';
            document.getElementById('comparator-results').classList.add('hidden');
            document.getElementById('comparator-results-output').innerHTML = '';
            sessionStorage.removeItem(COMPARATOR_STATE_KEY); // Clear saved state
            sessionStorage.removeItem(HIGHLIGHT_ROW_KEY); // Also clear highlight flag
            showToast('تم إعادة تعيين الأداة.');
        }
    });

    const copyResultsHandler = () => {
        if (!comparisonResults || comparisonResults.length === 0) return;
        let textToCopy = '';
        document.querySelectorAll('.result-category').forEach(categoryEl => {
            const title = categoryEl.querySelector('h3').textContent.trim();
            textToCopy += `--- ${title} ---\n`;
            const headers = Array.from(categoryEl.querySelectorAll('th')).map(th => th.textContent.trim()).join('\t');
            textToCopy += headers + '\n';
            categoryEl.querySelectorAll('tbody tr').forEach(row => {
                const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim()).join('\t');
                textToCopy += cells + '\n';
            });
            textToCopy += '\n';
        });
        navigator.clipboard.writeText(textToCopy.trim()).then(() => showToast('تم نسخ جميع النتائج بنجاح.'));
    };

    const copyNewAccountsHandler = () => {
        if (!newAccountsForCopy || newAccountsForCopy.length === 0) {
            showToast('لا توجد نتائج لنسخها.', true);
            return;
        }
        const textToCopy = newAccountsForCopy.map((entry, index) => {
            const account = `رقم الحساب: ${entry.account}`;
            const timestamp = `التاريخ: ${entry.timestamp || '---'}`;
            const line = `السطر الأصلي: ${entry.originalLine}`;
            return `${index + 1}. ${account}\n   ${timestamp}\n   ${line}`;
        }).join('\n--------------------\n');
        navigator.clipboard.writeText(textToCopy).then(() => showToast(`تم نسخ ${newAccountsForCopy.length} من الحسابات الجديدة.`));
    };

    document.getElementById('copy-results-btn').addEventListener('click', copyResultsHandler);
    document.getElementById('copy-new-accounts-btn').addEventListener('click', copyNewAccountsHandler);

    setupLineNumberSync('old-accounts-data');
    setupLineNumberSync('old-accounts-timestamp');
    setupLineNumberSync('new-accounts-data');
    setupLineNumberSync('new-accounts-timestamp');
}
document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.getElementById('main-content');
    mainContent.addEventListener('scroll', (e) => {
        if (e.target.id === 'comparator-results') {
            const scrollTopBtn = e.target.querySelector('#scroll-to-top-btn');
            if (scrollTopBtn) {
                scrollTopBtn.classList.toggle('hidden', e.target.scrollTop < 200);
            }
        }
    }, true);
    mainContent.addEventListener('click', (e) => {
        if (e.target.closest('#scroll-to-top-btn')) {
            document.getElementById('comparator-results').scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.getElementById('main-content');
    mainContent.addEventListener('scroll', (e) => {
        if (e.target.id === 'comparator-results') {
            const scrollTopBtn = e.target.querySelector('#scroll-to-top-btn');
            if (scrollTopBtn) {
                scrollTopBtn.classList.toggle('hidden', e.target.scrollTop < 200);
            }
        }
    }, true); // Use capture phase to ensure it fires

    mainContent.addEventListener('click', (e) => {
        if (e.target.closest('#scroll-to-top-btn')) {
            document.getElementById('comparator-results').scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
});