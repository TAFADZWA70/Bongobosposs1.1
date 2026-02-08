// ============================================================================
// FINANCE CHARTS MODULE - Chart.js Implementation (FIXED FOR SALES DATA)
// ============================================================================
// This module handles all chart rendering for the finance management system
// CRITICAL FIX: Now fetches sales data directly from Firebase for accurate revenue
// ============================================================================

import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

console.log('=== Finance Charts Module Loading (FIXED VERSION) ===');

// Global chart instances
let revenueExpensesChart = null;
let expenseBreakdownChart = null;

// Module state
let chartModule = {
    db: null,
    businessId: null,
    businessData: null,
    allBranches: {},
    expenses: {},
    paymentRequests: {},
    transactions: [],
    initialized: false
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initializeCharts(database, businessId, businessData, branches, expensesData, requestsData, transactionsData) {
    try {
        console.log('Initializing charts module...');

        chartModule.db = database;
        chartModule.businessId = businessId;
        chartModule.businessData = businessData;
        chartModule.allBranches = branches;
        chartModule.expenses = expensesData;
        chartModule.paymentRequests = requestsData;
        chartModule.transactions = transactionsData;
        chartModule.initialized = true;

        console.log('✓ Charts module initialized successfully');
        console.log('Business ID:', businessId);
        console.log('Expenses count:', Object.keys(expensesData).length);
        console.log('Payment requests count:', Object.keys(requestsData).length);

        return true;
    } catch (error) {
        console.error('Error initializing charts module:', error);
        return false;
    }
}

export function updateChartsData(expensesData, requestsData, transactionsData) {
    chartModule.expenses = expensesData;
    chartModule.paymentRequests = requestsData;
    chartModule.transactions = transactionsData;
    console.log('✓ Charts data updated');
}

// ============================================================================
// MAIN CHART SETUP FUNCTION
// ============================================================================

export function setupAllCharts() {
    if (!chartModule.initialized) {
        console.warn('Charts module not initialized. Call initializeCharts() first.');
        return;
    }

    try {
        console.log('Setting up all charts...');

        if (document.getElementById('revenueExpensesChart')) {
            setupRevenueExpensesChart();
        }

        if (document.getElementById('expenseBreakdownChart')) {
            setupExpenseBreakdownChart();
        }

        console.log('✓ All charts setup complete');
    } catch (error) {
        console.error('Error setting up charts:', error);
    }
}

// ============================================================================
// REVENUE VS EXPENSES CHART (LINE CHART) - FIXED TO USE SALES DATA
// ============================================================================

export function setupRevenueExpensesChart(period = null) {
    const canvas = document.getElementById('revenueExpensesChart');
    if (!canvas) {
        console.warn('Revenue chart canvas not found');
        return;
    }

    try {
        const selectedPeriod = period || document.getElementById('chartPeriod')?.value || 'month';

        console.log(`Setting up revenue chart for period: ${selectedPeriod}`);

        const ctx = canvas.getContext('2d');

        // Destroy existing chart if it exists
        if (revenueExpensesChart) {
            revenueExpensesChart.destroy();
        }

        if (typeof Chart === 'undefined') {
            console.error('Chart.js not loaded! Make sure Chart.js is included in your HTML.');
            return;
        }

        // *** CRITICAL FIX: Fetch chart data (now includes sales) ***
        getChartData(selectedPeriod).then(({ labels, revenueData, expenseData }) => {
            console.log('Chart data received:', { labels, revenueData, expenseData });

            // Create new chart
            revenueExpensesChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Revenue',
                            data: revenueData,
                            borderColor: 'rgb(16, 185, 129)',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            tension: 0.4,
                            fill: true,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            pointBackgroundColor: 'rgb(16, 185, 129)',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            pointHoverBackgroundColor: 'rgb(16, 185, 129)',
                            pointHoverBorderColor: '#fff'
                        },
                        {
                            label: 'Expenses',
                            data: expenseData,
                            borderColor: 'rgb(239, 68, 68)',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            tension: 0.4,
                            fill: true,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            pointBackgroundColor: 'rgb(239, 68, 68)',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            pointHoverBackgroundColor: 'rgb(239, 68, 68)',
                            pointHoverBorderColor: '#fff'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                usePointStyle: true,
                                padding: 15,
                                font: {
                                    size: 12,
                                    family: "'Poppins', sans-serif"
                                }
                            }
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleFont: {
                                size: 14,
                                family: "'Poppins', sans-serif"
                            },
                            bodyFont: {
                                size: 13,
                                family: "'Poppins', sans-serif"
                            },
                            padding: 12,
                            cornerRadius: 8,
                            callbacks: {
                                label: function (context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    const currency = chartModule.businessData?.currency || 'R';
                                    label += currency + ' ' + context.parsed.y.toLocaleString('en-ZA', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    });
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)',
                                drawBorder: false
                            },
                            ticks: {
                                font: {
                                    size: 11,
                                    family: "'Poppins', sans-serif"
                                },
                                callback: function (value) {
                                    const currency = chartModule.businessData?.currency || 'R';
                                    return currency + ' ' + value.toLocaleString('en-ZA');
                                }
                            }
                        },
                        x: {
                            grid: {
                                display: false,
                                drawBorder: false
                            },
                            ticks: {
                                font: {
                                    size: 11,
                                    family: "'Poppins', sans-serif"
                                }
                            }
                        }
                    }
                }
            });

            console.log('✓ Revenue vs Expenses chart created successfully');
        }).catch(error => {
            console.error('Error fetching chart data:', error);
        });

    } catch (error) {
        console.error('Error setting up revenue chart:', error);
    }
}

// ============================================================================
// EXPENSE BREAKDOWN CHART (DOUGHNUT CHART)
// ============================================================================

export function setupExpenseBreakdownChart(period = null) {
    const canvas = document.getElementById('expenseBreakdownChart');
    if (!canvas) {
        console.warn('Expense breakdown chart canvas not found');
        return;
    }

    try {
        const selectedPeriod = period || document.getElementById('expensePeriod')?.value || 'month';

        console.log(`Setting up expense breakdown chart for period: ${selectedPeriod}`);

        const ctx = canvas.getContext('2d');
        const { labels, data, colors } = getExpenseBreakdownData(selectedPeriod);

        console.log('Expense breakdown data:', { labels, data });

        // Destroy existing chart if it exists
        if (expenseBreakdownChart) {
            expenseBreakdownChart.destroy();
        }

        if (typeof Chart === 'undefined') {
            console.error('Chart.js not loaded! Make sure Chart.js is included in your HTML.');
            return;
        }

        // If no data, show empty state
        if (data.length === 0 || data.every(d => d === 0)) {
            expenseBreakdownChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['No Expenses'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['#e5e7eb'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            enabled: false
                        }
                    }
                }
            });
            console.log('✓ Empty expense breakdown chart displayed');
            return;
        }

        // Create new chart with data
        expenseBreakdownChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#fff',
                    hoverOffset: 10,
                    hoverBorderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: {
                                size: 12,
                                family: "'Poppins', sans-serif"
                            },
                            generateLabels: function (chart) {
                                const data = chart.data;
                                if (data.labels.length && data.datasets.length) {
                                    return data.labels.map((label, i) => {
                                        const value = data.datasets[0].data[i];
                                        const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                                        const percentage = ((value / total) * 100).toFixed(1);

                                        return {
                                            text: `${label} (${percentage}%)`,
                                            fillStyle: data.datasets[0].backgroundColor[i],
                                            hidden: false,
                                            index: i
                                        };
                                    });
                                }
                                return [];
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: {
                            size: 14,
                            family: "'Poppins', sans-serif"
                        },
                        bodyFont: {
                            size: 13,
                            family: "'Poppins', sans-serif"
                        },
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context) {
                                const label = context.label || '';
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                const currency = chartModule.businessData?.currency || 'R';

                                return [
                                    `${label}`,
                                    `${currency} ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
                                    `${percentage}% of total expenses`
                                ];
                            }
                        }
                    }
                }
            }
        });

        console.log('✓ Expense breakdown chart created successfully');
    } catch (error) {
        console.error('Error setting up expense breakdown chart:', error);
    }
}

// ============================================================================
// DATA PROCESSING FUNCTIONS - FIXED TO FETCH SALES FROM FIREBASE
// ============================================================================

/**
 * *** CRITICAL FIX: Now fetches sales data from Firebase ***
 * Get chart data for revenue vs expenses based on period
 */
async function getChartData(period) {
    const now = new Date();
    let labels = [];
    let revenueData = [];
    let expenseData = [];

    try {
        // Fetch sales data from Firebase
        const salesRef = ref(chartModule.db, `businesses/${chartModule.businessId}/sales`);
        const salesSnap = await get(salesRef);

        const allSales = salesSnap.exists() ? salesSnap.val() : {};
        console.log('Sales data fetched:', Object.keys(allSales).length, 'sales');

        if (period === 'week') {
            // Last 7 days
            for (let i = 6; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('en-ZA', { weekday: 'short' }));

                const dayStart = new Date(date);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(date);
                dayEnd.setHours(23, 59, 59, 999);

                revenueData.push(calculateRevenueForPeriod(dayStart, dayEnd, allSales));
                expenseData.push(calculateExpensesForPeriod(dayStart, dayEnd));
            }
        } else if (period === 'month') {
            // 4 weeks of current month
            const weeksInMonth = 4;
            for (let i = 0; i < weeksInMonth; i++) {
                labels.push(`Week ${i + 1}`);

                const weekStart = new Date(now.getFullYear(), now.getMonth(), 1 + (i * 7));
                const weekEnd = new Date(now.getFullYear(), now.getMonth(), 1 + ((i + 1) * 7) - 1);
                weekEnd.setHours(23, 59, 59, 999);

                revenueData.push(calculateRevenueForPeriod(weekStart, weekEnd, allSales));
                expenseData.push(calculateExpensesForPeriod(weekStart, weekEnd));
            }
        } else if (period === 'quarter') {
            // Last 3 months
            for (let i = 2; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                labels.push(date.toLocaleDateString('en-ZA', { month: 'short' }));

                const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
                const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
                monthEnd.setHours(23, 59, 59, 999);

                revenueData.push(calculateRevenueForPeriod(monthStart, monthEnd, allSales));
                expenseData.push(calculateExpensesForPeriod(monthStart, monthEnd));
            }
        } else if (period === 'year') {
            // Last 12 months
            for (let i = 11; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                labels.push(date.toLocaleDateString('en-ZA', { month: 'short' }));

                const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
                const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
                monthEnd.setHours(23, 59, 59, 999);

                revenueData.push(calculateRevenueForPeriod(monthStart, monthEnd, allSales));
                expenseData.push(calculateExpensesForPeriod(monthStart, monthEnd));
            }
        }

        console.log('Chart data processed:', {
            period,
            labels,
            totalRevenue: revenueData.reduce((a, b) => a + b, 0),
            totalExpenses: expenseData.reduce((a, b) => a + b, 0)
        });

        return { labels, revenueData, expenseData };
    } catch (error) {
        console.error('Error getting chart data:', error);
        return { labels: [], revenueData: [], expenseData: [] };
    }
}

/**
 * *** CRITICAL FIX: Now calculates revenue from sales data ***
 * Calculate revenue for a specific time period FROM SALES
 */
function calculateRevenueForPeriod(start, end, allSales) {
    let total = 0;

    // Calculate from sales data (primary source)
    if (allSales && typeof allSales === 'object') {
        Object.values(allSales).forEach(sale => {
            const saleDate = new Date(sale.soldAt || sale.date);
            if (saleDate >= start && saleDate <= end) {
                total += sale.total || 0;
            }
        });
    }

    // Also add manual revenue transactions (if any)
    if (chartModule.transactions && Array.isArray(chartModule.transactions)) {
        chartModule.transactions.forEach(transaction => {
            const transactionDate = new Date(transaction.timestamp);
            if (transaction.type === 'revenue' && transactionDate >= start && transactionDate <= end) {
                total += transaction.amount || 0;
            }
        });
    }

    return total;
}

/**
 * Calculate expenses for a specific time period
 */
function calculateExpensesForPeriod(start, end) {
    let total = 0;

    // Add recorded expenses
    if (chartModule.expenses && typeof chartModule.expenses === 'object') {
        Object.values(chartModule.expenses).forEach(expense => {
            const expenseDate = new Date(expense.date);
            if (expenseDate >= start && expenseDate <= end) {
                total += expense.amount || 0;
            }
        });
    }

    // Add approved payment requests
    if (chartModule.paymentRequests && typeof chartModule.paymentRequests === 'object') {
        Object.values(chartModule.paymentRequests).forEach(request => {
            if (request.status === 'approved' && request.authorizedAt) {
                const approvalDate = new Date(request.authorizedAt);
                if (approvalDate >= start && approvalDate <= end) {
                    total += request.amount || 0;
                }
            }
        });
    }

    return total;
}

/**
 * Get expense breakdown data by category
 */
function getExpenseBreakdownData(period) {
    const now = new Date();
    let start, end;

    if (period === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (period === 'quarter') {
        start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (period === 'year') {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    }

    const breakdown = {};

    // Process recorded expenses
    if (chartModule.expenses && typeof chartModule.expenses === 'object') {
        Object.values(chartModule.expenses).forEach(expense => {
            const expenseDate = new Date(expense.date);
            if (expenseDate >= start && expenseDate <= end) {
                const type = expense.type === 'custom' ? (expense.customName || 'Other') : expense.type;
                const categoryName = type.charAt(0).toUpperCase() + type.slice(1);
                breakdown[categoryName] = (breakdown[categoryName] || 0) + (expense.amount || 0);
            }
        });
    }

    // Process approved payment requests
    if (chartModule.paymentRequests && typeof chartModule.paymentRequests === 'object') {
        Object.values(chartModule.paymentRequests).forEach(request => {
            if (request.status === 'approved' && request.authorizedAt) {
                const approvalDate = new Date(request.authorizedAt);
                if (approvalDate >= start && approvalDate <= end) {
                    const categoryName = request.purpose.charAt(0).toUpperCase() + request.purpose.slice(1);
                    breakdown[categoryName] = (breakdown[categoryName] || 0) + (request.amount || 0);
                }
            }
        });
    }

    // Convert to arrays
    const labels = Object.keys(breakdown);
    const data = Object.values(breakdown);

    // Define color palette
    const colors = [
        '#3B82F6', // Blue
        '#10B981', // Green
        '#F59E0B', // Amber
        '#EF4444', // Red
        '#8B5CF6', // Purple
        '#EC4899', // Pink
        '#14B8A6', // Teal
        '#F97316', // Orange
        '#06B6D4', // Cyan
        '#84CC16', // Lime
        '#6366F1', // Indigo
        '#F43F5E'  // Rose
    ];

    return { labels, data, colors };
}

// ============================================================================
// CHART REFRESH AND UPDATE FUNCTIONS
// ============================================================================

export function refreshRevenueChart() {
    const period = document.getElementById('chartPeriod')?.value || 'month';
    setupRevenueExpensesChart(period);
}

export function refreshExpenseChart() {
    const period = document.getElementById('expensePeriod')?.value || 'month';
    setupExpenseBreakdownChart(period);
}

export function refreshAllCharts() {
    console.log('Refreshing all charts...');
    refreshRevenueChart();
    refreshExpenseChart();
}

export function destroyAllCharts() {
    if (revenueExpensesChart) {
        revenueExpensesChart.destroy();
        revenueExpensesChart = null;
    }
    if (expenseBreakdownChart) {
        expenseBreakdownChart.destroy();
        expenseBreakdownChart = null;
    }
    console.log('✓ All charts destroyed');
}

export function getRevenueChart() {
    return revenueExpensesChart;
}

export function getExpenseChart() {
    return expenseBreakdownChart;
}

console.log('=== ✓ Finance Charts Module Loaded Successfully (FIXED VERSION) ===');