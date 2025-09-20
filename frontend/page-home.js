import { fetchWithAuth } from './api.js';

let weeklyChart = null; // To hold the chart instance

async function fetchAndRenderHomePageData() {
    try {
        // Fetch general stats and weekly activity in parallel
        const [statsResponse, weeklyStatsResponse] = await Promise.all([
            fetchWithAuth('/api/stats'),
            fetchWithAuth('/api/stats/weekly')
        ]);

        const statsResult = await statsResponse.json();
        const weeklyStatsResult = await weeklyStatsResponse.json();

        if (statsResult.data) {
            renderStatCards(statsResult.data);
        }

        if (weeklyStatsResult.data) {
            renderWeeklyChart(weeklyStatsResult.data);
        }

    } catch (error) {
        console.error('Failed to fetch home page data:', error);
        const statsGrid = document.getElementById('stats-grid');
        if (statsGrid) {
            statsGrid.innerHTML = '<p>فشل تحميل الإحصائيات.</p>';
        }
        const chartCard = document.querySelector('.chart-card');
        if(chartCard) {
            chartCard.innerHTML = '<h3>النشاط الأسبوعي</h3><p>فشل تحميل بيانات الرسم البياني.</p>';
        }
    }
}

function renderStatCards(stats) {
    const statsGrid = document.getElementById('stats-grid');
    if (!statsGrid) return;

    statsGrid.innerHTML = `
        <a href="#archive" class="stat-card total-reports">
            <div class="stat-card-icon"><i class="fas fa-file-alt"></i></div>
            <div class="stat-card-info">
                <h3>Total Reports <small>إجمالي التقارير</small></h3>
                <p>${stats.total || 0}</p>
            </div>
        </a>
        <a href="#reports/suspicious" class="stat-card suspicious">
            <div class="stat-card-icon"><i class="fas fa-user-secret"></i></div>
            <div class="stat-card-info">
                <h3>Suspicious <small>تقارير مشبوهة</small></h3>
                <p>${stats.suspicious || 0}</p>
            </div>
        </a>
        <a href="#reports/deposit" class="stat-card deposit">
            <div class="stat-card-icon"><i class="fas fa-money-bill-wave"></i></div>
            <div class="stat-card-info">
                <h3>Deposit <small>إيداعات</small></h3>
                <p>${stats.deposit || 0}</p>
            </div>
        </a>
        <a href="#reports/new-position" class="stat-card new-position">
            <div class="stat-card-icon"><i class="fas fa-chart-line"></i></div>
            <div class="stat-card-info">
                <h3>New Position <small>صفقات جديدة</small></h3>
                <p>${stats.new_positions || 0}</p>
            </div>
        </a>
        <a href="#reports/credit-out" class="stat-card credit-out">
            <div class="stat-card-icon"><i class="fas fa-credit-card"></i></div>
            <div class="stat-card-info">
                <h3>Credit Out <small>سحب رصيد</small></h3>
                <p>${stats.credit_out || 0}</p>
            </div>
        </a>
        <a href="#reports/account-transfer" class="stat-card account-transfer">
            <div class="stat-card-icon"><i class="fas fa-exchange-alt"></i></div>
            <div class="stat-card-info">
                <h3>Account Transfer <small>تحويل حسابات</small></h3>
                <p>${stats.account_transfer || 0}</p>
            </div>
        </a>
        <a href="#reports/payouts" class="stat-card payouts">
            <div class="stat-card-icon"><i class="fas fa-hand-holding-usd"></i></div>
            <div class="stat-card-info">
                <h3>PAYOUTS <small>دفعات</small></h3>
                <p>${stats.payouts || 0}</p>
            </div>
        </a>
    `;
}

function renderWeeklyChart(weeklyData) {
    const ctx = document.getElementById('weekly-chart');
    if (!ctx) return;

    if (weeklyChart) {
        weeklyChart.destroy();
    }

    // Prepare data for the last 7 days, ensuring correct order
    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
    }).reverse();

    const chartLabels = last7Days.map(dateStr => new Date(dateStr).toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric' }));
    const chartData = last7Days.map(dateStr => {
        const found = weeklyData.find(d => d.date === dateStr);
        return found ? found.count : 0;
    });

    weeklyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'التقارير المرسلة',
                data: chartData,
                borderColor: 'var(--accent-color)',
                backgroundColor: 'rgba(77, 91, 249, 0.2)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#fff',
                pointBorderColor: 'var(--accent-color)',
                pointHoverRadius: 7,
                pointHoverBackgroundColor: 'var(--accent-color)',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#aaa',
                        stepSize: 1 // Ensure y-axis shows whole numbers
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#aaa'
                    },
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

export function renderHomePage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="dashboard-header">
            <h1>لوحة التحكم</h1>
            <p>نظرة عامة سريعة على نشاط النظام والإحصائيات الرئيسية.</p>
        </div>
        <div class="home-grid">
            <div id="stats-grid" class="stats-grid">
                <div class="spinner"></div>
            </div>
            <div class="chart-card">
                <h3><i class="fas fa-chart-bar"></i> النشاط الأسبوعي</h3>
                <div class="chart-container">
                    <canvas id="weekly-chart"></canvas>
                </div>
            </div>
        </div>
    `;
    fetchAndRenderHomePageData();
}
