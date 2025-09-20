import { fetchWithAuth } from './api.js';
import { timeAgo } from './ui.js';

let statsChart = null; // To hold the chart instance

async function fetchAndRenderStats() {
    try {
        // Fetch general stats and recent reports in parallel
        const [statsResponse, reportsResponse] = await Promise.all([
            fetchWithAuth('/api/stats'),
            fetchWithAuth('/api/reports?limit=5') // Fetch last 5 reports
        ]);

        const statsResult = await statsResponse.json();
        const reportsResult = await reportsResponse.json();

        if (statsResult.data) {
            renderStatCards(statsResult.data);
            renderDistributionChart(statsResult.data);
        }

        if (reportsResult.data) {
            renderRecentReports(reportsResult.data);
        }

    } catch (error) {
        console.error('Failed to fetch home page data:', error);
        const statsGrid = document.getElementById('stats-grid');
        if (statsGrid) {
            statsGrid.innerHTML = '<p>فشل تحميل الإحصائيات.</p>';
        }
        const recentReportsContainer = document.getElementById('recent-reports-container');
        if (recentReportsContainer) {
            recentReportsContainer.innerHTML = '<p>فشل تحميل أحدث التقارير.</p>';
        }
    }
}

function renderStatCards(stats) {
    const statsGrid = document.getElementById('stats-grid');
    if (!statsGrid) return;

    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-card-icon"><i class="fas fa-file-alt"></i></div>
            <div class="stat-card-info">
                <h3>إجمالي التقارير <small>Total Reports</small></h3>
                <p>${stats.total || 0}</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon"><i class="fas fa-user-secret"></i></div>
            <div class="stat-card-info">
                <h3>تقارير مشبوهة <small>Suspicious</small></h3>
                <p>${stats.suspicious || 0}</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon"><i class="fas fa-money-bill-wave"></i></div>
            <div class="stat-card-info">
                <h3>إيداعات <small>Deposit</small></h3>
                <p>${stats.deposit || 0}</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon"><i class="fas fa-chart-line"></i></div>
            <div class="stat-card-info">
                <h3>صفقات جديدة <small>New Position</small></h3>
                <p>${stats.new_positions || 0}</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon"><i class="fas fa-credit-card"></i></div>
            <div class="stat-card-info">
                <h3>سحب رصيد <small>Credit Out</small></h3>
                <p>${stats.credit_out || 0}</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon"><i class="fas fa-exchange-alt"></i></div>
            <div class="stat-card-info">
                <h3>تحويل حسابات <small>Account Transfer</small></h3>
                <p>${stats.account_transfer || 0}</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon"><i class="fas fa-hand-holding-usd"></i></div>
            <div class="stat-card-info">
                <h3>دفعات <small>PAYOUTS</small></h3>
                <p>${stats.payouts || 0}</p>
            </div>
        </div>
    `;
}

function renderDistributionChart(stats) {
    const ctx = document.getElementById('stats-chart');
    if (!ctx) return;

    if (statsChart) {
        statsChart.destroy();
    }

    const labels = [
        'Suspicious',
        'Deposit',
        'New Position',
        'Credit Out',
        'تحويل حسابات',
        'PAYOUTS'
    ];
    const data = [
        stats.suspicious || 0,
        stats.deposit || 0,
        stats.new_positions || 0,
        stats.credit_out || 0,
        stats.account_transfer || 0,
        stats.payouts || 0
    ];

    // Filter out labels/data with 0 count to keep the chart clean
    const filteredLabels = [];
    const filteredData = [];
    data.forEach((value, index) => {
        if (value > 0) {
            filteredLabels.push(labels[index]);
            filteredData.push(value);
        }
    });

    if (filteredData.length === 0) {
        document.getElementById('chart-container').innerHTML = '<p class="chart-placeholder">لا توجد بيانات لعرضها في الرسم البياني بعد.</p>';
        return;
    }

    statsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: filteredLabels,
            datasets: [{
                label: 'توزيع التقارير',
                data: filteredData,
                backgroundColor: [
                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'
                ],
                borderColor: 'var(--card-bg)',
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'var(--text-color)',
                        font: {
                            family: 'inherit'
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'توزيع أنواع التقارير',
                    color: 'var(--text-color)',
                    font: {
                        size: 16,
                        family: 'inherit'
                    }
                }
            }
        }
    });
}

function renderRecentReports(reports) {
    const container = document.getElementById('recent-reports-container');
    if (!container) return;

    if (reports.length === 0) {
        container.innerHTML = '<p>لا توجد تقارير حديثة.</p>';
        return;
    }

    const reportsHtml = reports.map(report => {
        const authorHtml = report.users && report.users.username
            ? `<span class="report-author"><i class="fas fa-user-pen"></i> ${report.users.username}</span>`
            : '';
        return `
            <div class="recent-report-item">
                <div class="recent-report-header">
                    <a href="#archive" class="recent-report-title">${report.report_text.split('\n')[0]}</a>
                    <span class="recent-report-time">${timeAgo(report.timestamp)}</span>
                </div>
                ${authorHtml ? `<div class="recent-report-author">${authorHtml}</div>` : ''}
            </div>
        `;
    }).join('');

    container.innerHTML = reportsHtml;
}


export function renderHomePage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <h1 class="page-title">لوحة التحكم الرئيسية</h1>
        <div class="home-layout">
            <div class="home-main-column">
                <h2>نظرة عامة</h2>
                <div id="stats-grid" class="stats-grid">
                    <div class="spinner"></div>
                </div>
                <h2 style="margin-top: 2rem;">أحدث التقارير</h2>
                <div id="recent-reports-container" class="recent-reports-container">
                    <div class="spinner"></div>
                </div>
            </div>
            <div class="home-sidebar-column">
                <h2>توزيع التقارير</h2>
                <div class="chart-container" id="chart-container">
                    <canvas id="stats-chart"></canvas>
                </div>
            </div>
        </div>
    `;
    fetchAndRenderStats();
}
