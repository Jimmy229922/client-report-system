import { fetchWithAuth } from './api.js';

let reportsChartInstance = null;
let weeklyChartInstance = null;

function getThemeColor(variable) {
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

function renderReportsChart(stats) {
    const ctx = document.getElementById('reportsChart');
    if (!ctx) return;
    if (reportsChartInstance) {
        reportsChartInstance.destroy();
    }

    reportsChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Suspicious', 'Deposit', 'New Positions', 'Credit Out', 'Account Transfer', 'PAYOUTS'],
            datasets: [{
                label: 'عدد التقارير',
                data: [
                    stats.suspicious || 0,
                    stats.deposit || 0,
                    stats.new_positions || 0,
                    stats.credit_out || 0,
                    stats.account_transfer || 0,
                    stats.payouts || 0
                ],
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
                borderColor: getThemeColor('--card-bg'),
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top', labels: { color: getThemeColor('--text-color') } },
                tooltip: { bodyFont: { size: 14 }, titleFont: { size: 16 } },
            }
        }
    });
}

function renderWeeklyChart(weeklyData) {
    const ctx = document.getElementById('weeklyReportsChart');
    if (!ctx) return;
    if (weeklyChartInstance) {
        weeklyChartInstance.destroy();
    }

    const labels = [];
    const dataPoints = [];
    const dateMap = new Map(weeklyData.map(item => [item.date, item.count]));

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateString = d.toISOString().split('T')[0];
        const dayName = d.toLocaleDateString('ar-EG', { weekday: 'short' });
        labels.push(dayName);
        dataPoints.push(dateMap.get(dateString) || 0);
    }

    weeklyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'التقارير اليومية',
                data: dataPoints,
                fill: true,
                backgroundColor: 'rgba(77, 91, 249, 0.2)',
                borderColor: 'rgba(77, 91, 249, 1)',
                tension: 0.4,
                pointBackgroundColor: 'rgba(77, 91, 249, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(77, 91, 249, 1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { color: getThemeColor('--text-color'), precision: 0 } },
                x: { ticks: { color: getThemeColor('--text-color') } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

export async function renderHomePage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <h1 class="page-title">ملخص التقارير</h1>
        <div id="stats-grid-container" class="stats-grid">
            <div class="stat-card"><h3>إجمالي التقارير</h3><p><div class="spinner"></div></p></div>
            <div class="stat-card"><h3>Suspicious</h3><p><div class="spinner"></div></p></div>
            <div class="stat-card"><h3>Deposit</h3><p><div class="spinner"></div></p></div>
            <div class="stat-card"><h3>New Positions</h3><p><div class="spinner"></div></p></div>
            <div class="stat-card"><h3>Credit Out</h3><p><div class="spinner"></div></p></div>
            <div class="stat-card"><h3>تحويل الحسابات</h3><p><div class="spinner"></div></p></div>
            <div class="stat-card"><h3>PAYOUTS</h3><p><div class="spinner"></div></p></div>
        </div>
        <div class="home-layout">
            <div class="home-main-column">
                <div class="chart-container">
                    <h2 class="page-title" style="font-size: 1.8rem; margin-bottom: 2rem;">توزيع التقارير</h2>
                    <canvas id="reportsChart"></canvas>
                </div>
            </div>
            <div class="home-sidebar-column">
                <div class="chart-container">
                    <h2 class="page-title" style="font-size: 1.8rem; margin-bottom: 2rem;">التقارير على مدار الأسبوع</h2>
                    <canvas id="weeklyReportsChart"></canvas>
                </div>
            </div>
        </div>
    `;

    try {
        const [statsResponse, weeklyStatsResponse] = await Promise.all([
            fetchWithAuth('/api/stats'),
            fetchWithAuth('/api/stats/weekly')
        ]);

        if (!statsResponse.ok || !weeklyStatsResponse.ok) {
            throw new Error('Failed to fetch stats data.');
        }

        const statsResult = await statsResponse.json();
        const weeklyStatsResult = await weeklyStatsResponse.json();

        const statsGridContainer = document.getElementById('stats-grid-container');
        if (statsGridContainer && statsResult.data) {
            const stats = statsResult.data;
            statsGridContainer.innerHTML = `
                <div class="stat-card"><h3>إجمالي التقارير</h3><p>${stats.total || 0}</p></div>
                <div class="stat-card"><h3>Suspicious</h3><p>${stats.suspicious || 0}</p></div>
                <div class="stat-card"><h3>Deposit</h3><p>${stats.deposit || 0}</p></div>
                <div class="stat-card"><h3>New Positions</h3><p>${stats.new_positions || 0}</p></div>
                <div class="stat-card"><h3>Credit Out</h3><p>${stats.credit_out || 0}</p></div>
                <div class="stat-card"><h3>تحويل الحسابات</h3><p>${stats.account_transfer || 0}</p></div>
                    <div class="stat-card"><h3>PAYOUTS</h3><p>${stats.payouts || 0}</p></div>
            `;
            renderReportsChart(stats);
        }

        if (weeklyStatsResult.data) {
            renderWeeklyChart(weeklyStatsResult.data);
        }

    } catch (error) {
        console.error("Failed to fetch home page data:", error);
        mainContent.innerHTML = '<p>فشل تحميل بيانات الصفحة الرئيسية.</p>';
    }

    // Listen for theme changes to re-render charts
    document.addEventListener('themeChanged', () => {
        if (reportsChartInstance) {
            reportsChartInstance.options.plugins.legend.labels.color = getThemeColor('--text-color');
            reportsChartInstance.data.datasets[0].borderColor = getThemeColor('--card-bg');
            reportsChartInstance.update();
        }
        if (weeklyChartInstance) {
            weeklyChartInstance.options.scales.y.ticks.color = getThemeColor('--text-color');
            weeklyChartInstance.options.scales.x.ticks.color = getThemeColor('--text-color');
            weeklyChartInstance.update();
        }
    });
}