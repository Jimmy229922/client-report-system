import { showToast } from './ui.js';

function parseOldData(accountsText, timestampsText) {
    const accountLines = accountsText.split('\n');
    const timestampLines = timestampsText.split('\n');
    const combinedSet = new Set();
    const accountsOnlySet = new Set();

    // Iterate based on the number of account lines to ensure every account is processed.
    for (let i = 0; i < accountLines.length; i++) {
        const account = accountLines[i] ? accountLines[i].trim() : null;
        
        if (account) { // Only add if there's an account number
            accountsOnlySet.add(account);
            // Get the corresponding timestamp. If the line is empty or doesn't exist, it's null.
            const timestamp = timestampLines[i] ? timestampLines[i].trim() : null;
            const uniqueKey = timestamp ? `${account}|${timestamp}` : account;
            combinedSet.add(uniqueKey);
        }
    }
    return { combinedSet, accountsOnlySet };
}

let comparisonResults = []; // Module-level variable to store results for copying
const COMPARATOR_STATE_KEY = 'comparatorState'; // Key for sessionStorage

function performComparison() {
    const oldAccountsText = document.getElementById('old-accounts-data').value;
    const oldTimestampsText = document.getElementById('old-accounts-timestamp').value;
    const newAccountsText = document.getElementById('new-accounts-data').value;
    const newTimestampsText = document.getElementById('new-accounts-timestamp').value;

    const resultsContainer = document.getElementById('comparator-results');
    const copyResultsBtn = document.getElementById('copy-results-btn');

    if (!newAccountsText) {
        showToast('الرجاء إدخال قائمة الحسابات الجديدة للمقارنة.', true);
        return;
    }

    // Save current input to sessionStorage
    sessionStorage.setItem(COMPARATOR_STATE_KEY, JSON.stringify({
        oldAccountsText, oldTimestampsText, newAccountsText, newTimestampsText
    }));

    // 1. Get the sets of old, known entries
    const { combinedSet: oldDataSet, accountsOnlySet: oldAccountsOnlySet } = parseOldData(oldAccountsText, oldTimestampsText);

    // 2. Process new data, validating and categorizing each line
    const newAccountLines = newAccountsText.split('\n');
    const newTimestampLines = newTimestampsText.split('\n');
    
    const allResults = [];

    const accountFormatRegex = /^\d+$/;
    const timestampFormatRegex = /^\d{4}\.\d{2}\.\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}$/;

    for (let i = 0; i < newAccountLines.length; i++) {
        const accountLineRaw = newAccountLines[i] || '';
        const timestampLineRaw = newTimestampLines[i] || '';
        const accountTrimmed = accountLineRaw.trim();
        const timestampTrimmed = timestampLineRaw.trim();

        if (!accountTrimmed) continue;

        const isAccountFormatValid = accountFormatRegex.test(accountTrimmed);
        const isTimestampFormatValid = timestampTrimmed === '' || timestampFormatRegex.test(timestampTrimmed);

        if (isAccountFormatValid && isTimestampFormatValid) {
            if (timestampTrimmed) {
                const uniqueKey = `${accountTrimmed}|${timestampTrimmed}`;
                if (!oldDataSet.has(uniqueKey)) {
                    allResults.push({ 
                        type: 'with_timestamp',
                        account: accountTrimmed, 
                        timestamp: timestampTrimmed, 
                        originalLine: i + 1 
                    });
                }
            } else {
                const isDuplicate = oldAccountsOnlySet.has(accountTrimmed);
                allResults.push({
                    type: 'without_timestamp',
                    account: accountTrimmed,
                    timestamp: '',
                    isDuplicate: isDuplicate,
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

    // 3. Render the results into a table
    resultsContainer.classList.remove('hidden');
    comparisonResults = allResults; // Store results for the copy function
    renderResultsTable(allResults);

    if (allResults.length > 0) {
        copyResultsBtn.classList.remove('hidden');
    } else {
        copyResultsBtn.classList.add('hidden');
    }
}

function renderResultsTable(results) {
    const resultsOutput = document.getElementById('comparator-results-output');
    
    if (!results || results.length === 0) {
        resultsOutput.innerHTML = '<p class="no-results">لا توجد حسابات جديدة أو بيانات تالفة.</p>';
        return;
    }

    // Re-categorize results as per the new request
    const newAndUnique = results.filter(r => r.type === 'with_timestamp' || (r.type === 'without_timestamp' && !r.isDuplicate));
    const duplicates = results.filter(r => r.type === 'without_timestamp' && r.isDuplicate);
    const tainted = results.filter(r => r.type === 'tainted');

    const categories = [
        { data: newAndUnique, title: 'حسابات جديدة', icon: 'fa-sparkles', className: 'new-account-result', id: 'new-accounts-section' },
        { data: duplicates, title: 'حسابات مكررة (بدون تاريخ)', icon: 'fa-copy', className: 'duplicate-account-result' },
        { data: tainted, title: 'بيانات تالفة (تم تجاهلها)', icon: 'fa-exclamation-triangle', className: 'tainted-result' }
    ];

    let html = '';
    let globalIndex = 1;

    categories.forEach(category => {
        const categoryResults = category.data;
        if (categoryResults.length === 0) return;

        const categoryId = category.id ? `id="${category.id}"` : '';

        const tableRows = categoryResults.map(entry => {
            let statusText = '';
            let statusClass = '';
            let accountDisplay = entry.account;
            let timestampDisplay = entry.timestamp;
            let isTainted = false;

            switch (entry.type) {
                case 'with_timestamp':
                    statusText = 'جديد';
                    statusClass = 'new-account-result';
                    break;
                case 'without_timestamp':
                    statusText = entry.isDuplicate ? 'مكرر' : 'جديد';
                    statusClass = entry.isDuplicate ? 'duplicate-account-result' : 'new-account-result';
                    timestampDisplay = 'بدون تاريخ';
                    break;
                case 'tainted':
                    statusText = 'تالف';
                    statusClass = 'tainted-result';
                    isTainted = true;
                    accountDisplay = entry.account.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    timestampDisplay = entry.timestamp.replace(/</g, "&lt;").replace(/>/g, "&gt;") || '---';
                    break;
            }

            const searchIcon = isTainted ? '' : `<a href="#archive?search=${entry.account}" class="search-in-archive-btn" data-line-id="${entry.originalLine}" title="بحث عن هذا الحساب في الأرشيف"><i class="fas fa-search"></i></a>`;
            const accountCellContent = `<div class="account-cell-content"><span class="copyable-account" title="اضغط للنسخ">${accountDisplay}</span>${searchIcon}</div>`;

            return `
                <tr class="${statusClass}" data-line-id="${entry.originalLine}">
                    <td>${globalIndex++}</td>
                    <td class="account-cell">${accountCellContent}</td>
                    <td>${timestampDisplay}</td>
                    <td>${statusText}</td>
                    <td>${entry.originalLine}</td>
                </tr>
            `;
        }).join('');

        html += `
            <div class="result-category" ${categoryId}>
                <h3><i class="fas ${category.icon} ${category.className}"></i> ${category.title} (${categoryResults.length})</h3>
                <div class="table-wrapper">
                    <table class="results-table">
                        <thead>
                            <tr>
                                <th data-sort-key="index" data-sort-type="number">#</th>
                                <th data-sort-key="account" data-sort-type="string">رقم الحساب</th>
                                <th data-sort-key="timestamp" data-sort-type="string">التاريخ</th>
                                <th data-sort-key="status" data-sort-type="string">الحالة</th>
                                <th data-sort-key="originalLine" data-sort-type="number">السطر الأصلي</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    resultsOutput.innerHTML = html;

    setupResultInteractions();
    setupTableSorting();

    // Check for highlighting after rendering
    const highlightRowId = sessionStorage.getItem('highlight-row');
    console.log(`[Focus Debug] 1. التحقق من وجود طلب تركيز. رقم السطر المطلوب: ${highlightRowId || 'لا يوجد'}`);

    if (highlightRowId) {
        const rowToHighlight = resultsOutput.querySelector(`tr[data-line-id="${highlightRowId}"]`);
        console.log('[Focus Debug] 2. البحث عن الصف في الجدول:', rowToHighlight ? 'تم العثور عليه' : 'لم يتم العثور عليه');

        if (rowToHighlight) {
            // --- START: Improved Dimming and Focus Logic ---
            console.log('[Focus Debug] 3. الصف موجود. جاري التمرير والتظليل...');

            // Use a small timeout to ensure the DOM is fully rendered and ready for scrolling
            setTimeout(() => {
                // 1. Scroll to the section first
                const newAccountsSection = document.getElementById('new-accounts-section');
                if (newAccountsSection) {
                    newAccountsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    rowToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }

                // After a delay for scrolling, apply the highlight effect
                setTimeout(() => {
                    console.log('[Focus Debug] 4. اكتمل التمرير. جاري تطبيق تأثير التركيز.');
                    document.body.classList.add('tour-active'); // Prevents body scroll, used by tour.js
                    rowToHighlight.classList.add('focus-highlight');

                    // 3. Clean up after the animation is done
                    setTimeout(() => {
                        rowToHighlight.classList.remove('focus-highlight');
                        document.body.classList.remove('tour-active');
                    }, 2500); // Must match the animation duration in CSS
                }, 500); // Delay to allow scroll to finish
            }, 100); // Short delay to ensure rendering is complete
            // --- END: Improved Dimming and Focus Logic ---
        } else {
            console.error(`[Focus Debug] خطأ: لم يتم العثور على الصف المطلوب (data-line-id="${highlightRowId}") في الجدول.`);
        }
        sessionStorage.removeItem('highlight-row');
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
            sessionStorage.setItem('highlight-row', lineId);
            // The default <a> behavior will handle navigation
        }
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
        // Sync scroll position
        lineNumbers.scrollTop = textarea.scrollTop;
    });
    
    // Also sync on window resize as scrollbars might appear/disappear
    try {
        new ResizeObserver(updateLineNumbers).observe(textarea);
    } catch(e) {
        // Fallback for older browsers that don't support ResizeObserver
        window.addEventListener('resize', updateLineNumbers);
    }

    updateLineNumbers();
}

export function renderComparatorPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">أداة مقارنة الحسابات</h1>
            <p>قم بلصق بيانات الكشوفات القديمة والجديدة. ستقوم الأداة تلقائياً بتصفية وعرض الحسابات الجديدة فقط.</p>
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
                <h2><i class="fas fa-sparkles"></i> الحسابات الجديدة</h2>
                <button id="copy-results-btn" class="copy-btn hidden"><i class="fas fa-copy"></i> نسخ النتائج</button>
            </div>
            <div id="comparator-results-output" class="results-output-box"></div>
        </div>
    `;

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
            document.getElementById('old-accounts-data').value = '';
            document.getElementById('old-accounts-timestamp').value = '';
            document.getElementById('new-accounts-data').value = '';
            document.getElementById('new-accounts-timestamp').value = '';
            document.getElementById('comparator-results').classList.add('hidden');
            document.getElementById('comparator-results-output').innerHTML = '';
            sessionStorage.removeItem(COMPARATOR_STATE_KEY);
            sessionStorage.removeItem('highlight-row'); // Also clear highlight flag
            showToast('تم إعادة تعيين الأداة.');
        }
    });

    document.getElementById('copy-results-btn').addEventListener('click', () => {
        if (!comparisonResults || comparisonResults.length === 0) {
            showToast('لا توجد نتائج لنسخها.', true);
            return;
        }

        let textToCopy = '';
        const headers = ['#', 'رقم الحساب', 'التاريخ', 'الحالة', 'السطر الأصلي'].join('\t');

        document.querySelectorAll('.result-category').forEach(categoryEl => {
            const title = categoryEl.querySelector('h3').textContent.trim();
            textToCopy += `--- ${title} ---\n`;
            textToCopy += headers + '\n';

            categoryEl.querySelectorAll('tbody tr').forEach(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                const rowData = cells.map((td, index) => {
                    if (index === 1) { // Account column
                        const accountSpan = td.querySelector('.copyable-account');
                        return accountSpan ? accountSpan.textContent.trim() : '';
                    }
                    return td.textContent.trim();
                }).join('\t');
                textToCopy += rowData + '\n';
            });
            textToCopy += '\n';
        });

        navigator.clipboard.writeText(textToCopy.trim()).then(() => {
            showToast('تم نسخ جميع النتائج (كجدول) بنجاح.');
        }).catch(err => {
            showToast('فشل نسخ النتائج.', true);
            console.error('Copy failed:', err);
        });
    });

    // Restore state from sessionStorage on page load
    const savedStateJSON = sessionStorage.getItem(COMPARATOR_STATE_KEY);
    if (savedStateJSON) {
        try {
            const savedState = JSON.parse(savedStateJSON);
            document.getElementById('old-accounts-data').value = savedState.oldAccountsText || '';
            document.getElementById('old-accounts-timestamp').value = savedState.oldTimestampsText || '';
            document.getElementById('new-accounts-data').value = savedState.newAccountsText || '';
            document.getElementById('new-accounts-timestamp').value = savedState.newTimestampsText || '';
            
            if (savedState.newAccountsText) {
                performComparison();
            }
        } catch (e) {
            console.error("Failed to restore comparator state:", e);
            sessionStorage.removeItem(COMPARATOR_STATE_KEY);
        }
    }

    setupLineNumberSync('old-accounts-data');
    setupLineNumberSync('old-accounts-timestamp');
    setupLineNumberSync('new-accounts-data');
    setupLineNumberSync('new-accounts-timestamp');
}