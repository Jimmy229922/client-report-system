import { showToast } from './ui.js';

function parseAccountData(accountsText, timestampsText) {
    const accountLines = accountsText.split('\n');
    const timestampLines = timestampsText.split('\n');
    const dataSet = new Set();

    // Iterate based on the number of account lines to ensure every account is processed.
    for (let i = 0; i < accountLines.length; i++) {
        const account = accountLines[i] ? accountLines[i].trim() : null;
        // Get the corresponding timestamp. If the line is empty or doesn't exist, it's null.
        const timestamp = timestampLines[i] ? timestampLines[i].trim() : null;
        
        if (account) { // Only add if there's an account number
            const uniqueKey = timestamp ? `${account}|${timestamp}` : account;
            dataSet.add(uniqueKey);
        }
    }
    return dataSet;
}

function performComparison() {
    const oldAccountsText = document.getElementById('old-accounts-data').value;
    const oldTimestampsText = document.getElementById('old-accounts-timestamp').value;
    const newAccountsText = document.getElementById('new-accounts-data').value;
    const newTimestampsText = document.getElementById('new-accounts-timestamp').value;

    const resultsContainer = document.getElementById('comparator-results');
    const resultsOutput = document.getElementById('comparator-results-output');
    const copyResultsBtn = document.getElementById('copy-results-btn');

    if (!newAccountsText) {
        showToast('الرجاء إدخال قائمة الحسابات الجديدة للمقارنة.', true);
        return;
    }

    const oldDataSet = parseAccountData(oldAccountsText, oldTimestampsText);
    const newAccountLines = newAccountsText.split('\n');
    const newTimestampLines = newTimestampsText.split('\n');
    
    const newAccountsWithTimestamp = [];
    const newAccountsWithoutTimestamp = [];

    for (let i = 0; i < newAccountLines.length; i++) {
        const account = newAccountLines[i] ? newAccountLines[i].trim() : null;
        const timestamp = newTimestampLines[i] ? newTimestampLines[i].trim() : null;

        if (account) {
            const uniqueKey = timestamp ? `${account}|${timestamp}` : account;

            if (!oldDataSet.has(uniqueKey)) {
                const newEntry = { account, timestamp, originalLine: i + 1 };
                if (timestamp) {
                    newAccountsWithTimestamp.push(newEntry);
                } else {
                    newAccountsWithoutTimestamp.push(newEntry);
                }
            }
        }
    }

    resultsContainer.classList.remove('hidden');

    let finalOutput = '';
    let counter = 1;

    const withTimestampHtml = newAccountsWithTimestamp
        .map(entry => `${counter++}. ${entry.account} ${entry.timestamp} (من السطر: ${entry.originalLine})`)
        .join('\n');

    const withoutTimestampHtml = newAccountsWithoutTimestamp
        .map(entry => `<span class="no-timestamp-result">${counter++}. ${entry.account} (من السطر: ${entry.originalLine})</span>`)
        .join('\n');

    if (withTimestampHtml) {
        finalOutput += withTimestampHtml;
    }

    if (withoutTimestampHtml) {
        if (finalOutput) {
            finalOutput += '\n\n<span class="result-separator">--- حسابات بدون تاريخ ---</span>\n\n';
        }
        finalOutput += withoutTimestampHtml;
    }

    if (finalOutput) {
        resultsOutput.innerHTML = finalOutput;
        copyResultsBtn.classList.remove('hidden');
    } else {
        resultsOutput.innerHTML = '<span class="no-results">لا توجد حسابات جديدة.</span>';
        copyResultsBtn.classList.add('hidden');
    }
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
            <p>أدخل قوائم الحسابات والتواريخ الموافقة لها (كل إدخال في سطر) لاستخراج الإدخالات الجديدة.</p>
        </div>

        <div class="comparator-container">
            <div class="comparator-column">
                <h2><i class="fas fa-database"></i> البيانات القديمة</h2>
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
        </div>

        <div id="comparator-results" class="results-container hidden">
            <div class="results-header">
                <h2><i class="fas fa-sparkles"></i> الحسابات الجديدة</h2>
                <button id="copy-results-btn" class="copy-btn hidden"><i class="fas fa-copy"></i> نسخ النتائج</button>
            </div>
            <pre id="comparator-results-output" class="results-output-box"></pre>
        </div>
    `;

    document.getElementById('compare-btn').addEventListener('click', performComparison);

    document.getElementById('copy-results-btn').addEventListener('click', () => {
        const resultsOutput = document.getElementById('comparator-results-output');
        navigator.clipboard.writeText(resultsOutput.innerText).then(() => {
            showToast('تم نسخ النتائج بنجاح.');
        }).catch(err => {
            showToast('فشل نسخ النتائج.', true);
            console.error('Copy failed:', err);
        });
    });

    setupLineNumberSync('old-accounts-data');
    setupLineNumberSync('old-accounts-timestamp');
    setupLineNumberSync('new-accounts-data');
    setupLineNumberSync('new-accounts-timestamp');
}