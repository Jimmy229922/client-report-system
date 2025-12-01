import { showToast, showConfirmModal } from './ui.js';
import { fetchWithAuth } from './api.js';

export function renderDataFilterPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
    <div class="comparator-page-container data-filter-page-container">
        <div class="page-header">
            <h1 class="page-title"><i class="fas fa-project-diagram"></i> أداة فلترة البيانات المترابطة</h1>
            <p>استخرج الارتباطات الفريدة بين أرقام الحسابات (7 أرقام) وعناوين IP.</p>
        </div>
        <div class="form-container" style="max-width: 1000px;">
            <div class="form-group textarea-group">
                <label for="data-input">ألصق البيانات هنا</label>
                <div class="textarea-with-linenumbers">
                    <pre class="line-numbers">1</pre>
                    <textarea id="data-input" rows="15" placeholder="الأداة ستبحث عن أرقام حسابات (7 أرقام) وعناوين IP المرتبطة بها وتستخرج الارتباطات الفريدة."></textarea>
                    <button id="clear-data-input-btn" class="clear-btn hidden" title="مسح المحتوى">&times;</button>
                </div>
            </div>
            <div class="comparator-actions">
                <button id="process-data-btn" class="submit-btn"><i class="fas fa-cogs"></i> معالجة وفلترة</button>
                <button id="reset-filter-btn" class="cancel-btn"><i class="fas fa-sync-alt"></i> إعادة تعيين</button>
            </div>
            <div class="results-container hidden" id="results-container">
                <div class="results-header">
                    <h2><i class="fas fa-stream"></i> النتائج الفريدة (<span id="result-count">0</span>)</h2>
                    <div id="result-actions" class="result-actions">
                        <button id="copy-accounts-only-btn" class="copy-btn btn-sm"><i class="fas fa-user-tag"></i> نسخ الحسابات فقط</button>
                        <button id="export-excel-btn" class="submit-btn btn-sm" style="background-color: var(--success-color);"><i class="fas fa-file-excel"></i> تصدير إلى Excel</button>
                    </div>
                </div>
                <div id="result-section-content" class="results-output-box">
                    <div class="table-container modern-table-container">
                        <div class="empty-state">
                            <i class="fas fa-search-plus"></i><p>ستظهر النتائج هنا بعد المعالجة...</p>
                        </div>
                    </div>
                </div>
                <button id="scroll-to-top-btn" class="scroll-to-top-btn hidden" title="العودة للأعلى"><i class="fas fa-arrow-up"></i></button>
            </div>
        </div>
    </div>
    `;

    const processBtn = document.getElementById('process-data-btn');
    const dataInput = document.getElementById('data-input');
    const clearBtn = document.getElementById('clear-data-input-btn');
    const resetBtn = document.getElementById('reset-filter-btn');
    const resultsContainer = document.getElementById('results-container');
    let resultOutput = document.getElementById('result-output');
    const resultSectionContent = document.getElementById('result-section-content');
    let currentResults = [];
    const DATA_FILTER_STATE_KEY = 'dataFilterState';
    const HIGHLIGHT_ROW_KEY = 'highlightRowId';

    const extractDataFromText = (text) => {
        const accountRegex = /\b\d{7}\b/g;
        const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/g;
        const pairs = new Map();
        const blocks = text.split('⋮');
        let lineNumber = 0;

        for (const block of blocks) {
            lineNumber++;
            const accountMatches = block.match(accountRegex) || [];
            const ipMatches = block.match(ipRegex) || [];
            if (accountMatches.length > 0 && ipMatches.length > 0) {
                for (const account of accountMatches) {
                    const key = `${account}|${ipMatches[0]}`;
                    if (!pairs.has(key)) {
                        pairs.set(key, { account, ip: ipMatches[0], originalLine: lineNumber });
                    }
                }
            }
        }
        return Array.from(pairs.values()).sort((a, b) => 
            a.account.localeCompare(b.account, undefined, { numeric: true })
        );
    };

    const renderResultsTable = (results) => {
        const tableContainer = resultSectionContent.querySelector('.table-container');
        const actionsContainer = document.getElementById('result-actions');
        const resultCountSpan = document.getElementById('result-count');

        if (resultCountSpan) {
            resultCountSpan.textContent = results.length;
        }

        if (results.length > 0) {
            const tableRows = results.slice(0, 1000).map((item, index) => {
                const accountCellContent = `<div class="account-cell-content"><span class="copyable-account" title="اضغط للنسخ">${item.account}</span><a href="#archive?search=${item.account}" class="search-in-archive-btn" data-line-id="${item.originalLine}" title="بحث عن هذا الحساب في الأرشيف"><i class="fas fa-search"></i></a></div>`;
                const ipCellContent = `<span class="copyable-account" title="اضغط للنسخ">${item.ip}</span>`;
                return `<tr data-line-id="${item.originalLine}">
                    <td>${index + 1}</td>
                    <td class="account-cell">${accountCellContent}</td>
                    <td class="ip-cell">${ipCellContent}</td>
                    <td>${item.originalLine}</td>
                </tr>`;
            }).join('');

            tableContainer.innerHTML = `
                <div class="result-category">
                    <h3><i class="fas fa-stream"></i> الارتباطات الفريدة (${results.length})</h3>
                    <div class="table-wrapper">
                        <table class="results-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th data-sort-key="account" data-sort-type="number">رقم الحساب</th>
                                    <th data-sort-key="ip" data-sort-type="string">الآي بي</th>
                                    <th data-sort-key="originalLine" data-sort-type="number">السطر الأصلي</th>
                                </tr>
                            </thead>
                            <tbody id="result-output">${tableRows}</tbody>
                        </table>
                    </div>
                    ${results.length > 1000 ? '<p class="more-results">تم عرض أول 1000 نتيجة فقط. استخدم تصدير Excel للحصول على كل النتائج.</p>' : ''}
                </div>
            `;
            if (actionsContainer) {
                actionsContainer.classList.remove('hidden');
            }
        } else {
            tableContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>لم يتم العثور على أي ارتباطات مطابقة (رقم حساب من 7 أرقام + IP).</p>
                </div>
            `;
            if (actionsContainer) {
                actionsContainer.classList.add('hidden');
            }
        }

        resultOutput = document.getElementById('result-output');
        setupSorting();
        setupResultInteractions();
        checkAndHighlightRow();
    };

    const handleProcess = async () => {
        const text = dataInput.value;
        if (!text.trim()) {
            showToast('حقل الإدخال فارغ.', true);
            return;
        }

        const originalBtnText = processBtn.innerHTML;
        processBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المعالجة...';
        processBtn.disabled = true;

        try {
            const uniquePairs = extractDataFromText(text);
            currentResults = uniquePairs || [];
            resultsContainer.classList.remove('hidden');
            renderResultsTable(uniquePairs);
            showToast(`تمت المعالجة! تم العثور على ${uniquePairs.length} ارتباط فريد.`);

            // مسح حقل الإدخال لتخفيف العبء على المتصفح
            dataInput.value = '';
            dataInput.dispatchEvent(new Event('input', { bubbles: true })); // لتحديث أرقام الأسطر وزر المسح

            // حفظ النتائج فقط في sessionStorage
            sessionStorage.setItem(DATA_FILTER_STATE_KEY, JSON.stringify({
                results: uniquePairs
            }));

        } catch (error) {
            console.error('Data filtering failed:', error);
            showToast(error.message || 'فشلت عملية الفلترة. حاول مرة أخرى.', true);
            resultsContainer.classList.add('hidden');
            currentResults = [];
        } finally {
            processBtn.innerHTML = originalBtnText;
            processBtn.disabled = false;
        }
    };

    const handleCopyAccountsOnly = () => {
        if (currentResults.length === 0) {
            showToast('لا توجد حسابات لنسخها.', true);
            return;
        }
        const accountsText = currentResults.map(item => item.account).join('\n');
        navigator.clipboard.writeText(accountsText).then(() => 
            showToast(`تم نسخ ${currentResults.length} حساب بنجاح.`)
        );
    };

    const handleExportExcel = () => {
        if (currentResults.length === 0) {
            showToast('لا توجد بيانات لتصديرها.', true);
            return;
        }
        const { utils, writeFile } = window.XLSX;
        const dataToExport = currentResults.map((item, index) => ({
            '#': index + 1,
            'رقم الحساب': item.account,
            'الآي بي': item.ip,
            'السطر الأصلي': item.originalLine
        }));
        const worksheet = utils.json_to_sheet(dataToExport);
        const workbook = utils.book_new();
        utils.book_append_sheet(workbook, worksheet, 'Filtered Data');
        writeFile(workbook, 'FilteredData.xlsx');
        showToast('تم بدء تصدير ملف Excel.');
    };

    const setupResultInteractions = () => {
        resultSectionContent.addEventListener('click', (e) => {
            const copyTarget = e.target.closest('.copyable-account');
            if (copyTarget) {
                const textToCopy = copyTarget.textContent;
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showToast(`تم نسخ: ${textToCopy}`);
                }).catch(() => showToast('فشل نسخ النص.', true));
                return;
            }

            const searchBtn = e.target.closest('.search-in-archive-btn');
            if (searchBtn) {
                sessionStorage.setItem('fromDataFilter', 'true');
                sessionStorage.setItem(HIGHLIGHT_ROW_KEY, searchBtn.dataset.lineId);
            }
        });
    };

    const checkAndHighlightRow = () => {
        const highlightRowId = sessionStorage.getItem(HIGHLIGHT_ROW_KEY);
        if (highlightRowId) {
            const rowToHighlight = document.querySelector(`tr[data-line-id="${highlightRowId}"]`);
            if (rowToHighlight) {
                setTimeout(() => {
                    rowToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const spotlightOverlay = document.createElement('div');
                    spotlightOverlay.className = 'spotlight-overlay';
                    document.body.appendChild(spotlightOverlay);
                    setTimeout(() => {
                        spotlightOverlay.classList.add('visible');
                        rowToHighlight.classList.add('focus-highlight');
                        setTimeout(() => {
                            spotlightOverlay.classList.remove('visible');
                            rowToHighlight.classList.remove('focus-highlight');
                            spotlightOverlay.addEventListener('transitionend', () => spotlightOverlay.remove());
                        }, 2500);
                    }, 500);
                }, 100);
            }
            sessionStorage.removeItem(HIGHLIGHT_ROW_KEY);
        }
    };

    const setupSorting = () => {
        const headers = resultSectionContent.querySelectorAll('th[data-sort-key]');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const sortKey = header.dataset.sortKey;
                const sortType = header.dataset.sortType || 'string';
                const isAsc = header.classList.contains('sort-asc');
                const direction = isAsc ? -1 : 1;

                currentResults.sort((a, b) => {
                    let valA = a[sortKey];
                    let valB = b[sortKey];
                    if (sortType === 'number') {
                        valA = parseInt(valA, 10) || 0;
                        valB = parseInt(valB, 10) || 0;
                    }
                    if (valA < valB) return -1 * direction;
                    if (valA > valB) return 1 * direction;
                    return 0;
                });

                headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
                header.classList.toggle('sort-asc', !isAsc);
                header.classList.toggle('sort-desc', isAsc);
                renderResultsTable(currentResults);
            });
        });
    };

    const setupLineNumberSync = () => {
        const textarea = document.getElementById('data-input');
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
    };

    processBtn.addEventListener('click', handleProcess);
    resetBtn.addEventListener('click', async () => {
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
            dataInput.value = '';
            resultsContainer.classList.add('hidden');
            resultSectionContent.querySelector('.table-container').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search-plus"></i><p>ستظهر النتائج هنا بعد المعالجة...</p>
                </div>
            `;
            showToast('تم إعادة تعيين الأداة.');
            sessionStorage.removeItem(DATA_FILTER_STATE_KEY);
            dataInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    const resultActionsContainer = document.getElementById('result-actions');
    resultActionsContainer.addEventListener('click', (e) => {
        if (e.target.closest('#copy-accounts-only-btn')) handleCopyAccountsOnly();
        if (e.target.closest('#export-excel-btn')) handleExportExcel();
    });
    
    clearBtn.addEventListener('click', () => {
        dataInput.value = '';
        dataInput.focus();
        dataInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    dataInput.addEventListener('input', () => {
        clearBtn.classList.toggle('hidden', dataInput.value.trim() === '');
    });

    mainContent.addEventListener('scroll', (e) => {
        if (e.target.id === 'results-container') {
            const scrollTopBtn = e.target.querySelector('#scroll-to-top-btn');
            if (scrollTopBtn) {
                scrollTopBtn.classList.toggle('hidden', e.target.scrollTop < 200);
            }
        }
    }, true);

    mainContent.addEventListener('click', (e) => {
        if (e.target.closest('#scroll-to-top-btn')) {
            resultsContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    setupLineNumberSync();

    // --- Load state from sessionStorage on page load ---
    const savedStateJSON = sessionStorage.getItem(DATA_FILTER_STATE_KEY);
    if (savedStateJSON) {
        try {
            const savedState = JSON.parse(savedStateJSON);
            // استعادة النتائج فقط، وليس النص المُدخل
            if (savedState.results && savedState.results.length > 0) {
                currentResults = savedState.results || [];
                resultsContainer.classList.remove('hidden');
                renderResultsTable(currentResults);
                dataInput.dispatchEvent(new Event('input', { bubbles: true })); // Update clear button visibility
            }
        } catch (e) {
            console.error("Failed to restore data filter state:", e);
            sessionStorage.removeItem(DATA_FILTER_STATE_KEY);
        }
    }
}