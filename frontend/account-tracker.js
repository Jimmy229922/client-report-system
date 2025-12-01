const ACCOUNT_HISTORY_KEY = 'accountHistory';
let accountHistory = {};

const widget = document.getElementById('account-tracker-widget');
const list = document.getElementById('account-tracker-list');
const closeBtn = document.getElementById('account-tracker-close-btn');
const clearBtn = document.getElementById('clear-account-history-btn');

function saveHistory() {
    try {
        localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(accountHistory));
    } catch (e) {
        console.error("Failed to save account history to localStorage", e);
    }
}

function loadHistory() {
    try {
        const storedHistory = localStorage.getItem(ACCOUNT_HISTORY_KEY);
        if (storedHistory) {
            accountHistory = JSON.parse(storedHistory);
        }
    } catch (e) {
        console.error("Failed to load account history from localStorage", e);
        accountHistory = {};
    }
}

function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

function renderList() {
    list.innerHTML = ''; // Clear existing list

    if (Object.keys(accountHistory).length === 0) {
        list.innerHTML = `<li>لا توجد حسابات متعقبة بعد.</li>`;
        return;
    }

    const sortedAccounts = Object.entries(accountHistory).sort(([, a], [, b]) => b.timestamp - a.timestamp);

    for (const [account, data] of sortedAccounts) {
        const listItem = document.createElement('li');
        const now = new Date();
        const lastCopied = new Date(data.timestamp);
        
        const isDuplicate = data.isDuplicate && isSameDay(now, lastCopied);
        if (isDuplicate) {
            listItem.classList.add('is-duplicate');
        }

        listItem.innerHTML = `
            <span class="account-number">${account}</span>
            <span class="timestamp">${lastCopied.toLocaleString('ar-EG')}</span>
        `;
        list.appendChild(listItem);
    }
}

async function checkClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        const accountRegex = /^\d{7}$/;
        if (accountRegex.test(text.trim())) {
            const accountNumber = text.trim();
            const now = new Date();
            
            const isDuplicate = accountHistory.hasOwnProperty(accountNumber);

            accountHistory[accountNumber] = {
                timestamp: now.getTime(),
                isDuplicate: isDuplicate
            };

            saveHistory();
            renderList();
        }
    } catch (err) {
        // Ignore errors, likely due to browser focus or permissions
    }
}

export function initAccountTracker() {
    loadHistory();
    renderList();

    closeBtn.addEventListener('click', () => {
        widget.classList.remove('show');
    });

    clearBtn.addEventListener('click', () => {
        if (confirm('هل أنت متأكد أنك تريد مسح سجل الحسابات؟')) {
            accountHistory = {};
            saveHistory();
            renderList();
        }
    });

    // Start monitoring clipboard
    setInterval(checkClipboard, 1500); // Check every 1.5 seconds

    // Make widget draggable
    let isDragging = false;
    let offsetX, offsetY;

    const header = widget.querySelector('.account-tracker-header');

    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - widget.getBoundingClientRect().left;
        offsetY = e.clientY - widget.getBoundingClientRect().top;
        widget.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;

        // Constrain to viewport
        const widgetRect = widget.getBoundingClientRect();
        const bodyRect = document.body.getBoundingClientRect();

        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX + widgetRect.width > bodyRect.width) newX = bodyRect.width - widgetRect.width;
        if (newY + widgetRect.height > bodyRect.height) newY = bodyRect.height - widgetRect.height;

        widget.style.left = `${newX}px`;
        widget.style.top = `${newY}px`;
        widget.style.bottom = 'auto';
        widget.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        widget.style.cursor = 'default';
    });
}
