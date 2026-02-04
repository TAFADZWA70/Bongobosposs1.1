// FIXED CHART DATA GENERATION FUNCTIONS
// Replace the existing getChartData and related functions in your Finance.js

// Get chart data based on period - FIXED VERSION
function getChartData(period) {
    const now = new Date();
    let labels = [];
    let revenueData = [];
    let expenseData = [];

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

            revenueData.push(calculateRevenueForPeriodFromSales(dayStart, dayEnd));
            expenseData.push(calculateExpensesForPeriod(dayStart, dayEnd));
        }
    } else if (period === 'month') {
        // Current month by weeks
        const weeksInMonth = 4;
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        for (let i = 0; i < weeksInMonth; i++) {
            labels.push(`Week ${i + 1}`);

            const weekStart = new Date(monthStart);
            weekStart.setDate(monthStart.getDate() + (i * 7));

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);

            revenueData.push(calculateRevenueForPeriodFromSales(weekStart, weekEnd));
            expenseData.push(calculateExpensesForPeriod(weekStart, weekEnd));
        }
    } else if (period === 'quarter') {
        // Last 3 months
        for (let i = 2; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(date.toLocaleDateString('en-ZA', { month: 'short' }));

            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

            revenueData.push(calculateRevenueForPeriodFromSales(monthStart, monthEnd));
            expenseData.push(calculateExpensesForPeriod(monthStart, monthEnd));
        }
    } else if (period === 'year') {
        // Last 12 months
        for (let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(date.toLocaleDateString('en-ZA', { month: 'short' }));

            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

            revenueData.push(calculateRevenueForPeriodFromSales(monthStart, monthEnd));
            expenseData.push(calculateExpensesForPeriod(monthStart, monthEnd));
        }
    }

    return { labels, revenueData, expenseData };
}

// NEW FUNCTION: Calculate revenue from actual POS sales
async function calculateRevenueForPeriodFromSales(start, end) {
    try {
        let total = 0;

        // Get sales data from Firebase
        const salesRef = ref(db, `businesses/${businessId}/sales`);
        const salesSnap = await get(salesRef);

        if (salesSnap.exists()) {
            const allSales = salesSnap.val();

            Object.values(allSales).forEach(sale => {
                const saleDate = new Date(sale.soldAt || sale.date);

                if (saleDate >= start && saleDate <= end) {
                    total += sale.total || 0;
                }
            });
        }

        return total;
    } catch (error) {
        console.error('Error calculating revenue from sales:', error);
        return 0;
    }
}

// ENHANCED: Calculate expenses for period (keep existing logic)
function calculateExpensesForPeriod(start, end) {
    let total = 0;

    // Calculate from recorded expenses
    if (expenses && typeof expenses === 'object') {
        Object.values(expenses).forEach(expense => {
            const expenseDate = new Date(expense.date);
            if (expenseDate >= start && expenseDate <= end) {
                total += expense.amount || 0;
            }
        });
    }

    // Calculate from approved payment requests
    if (paymentRequests && typeof paymentRequests === 'object') {
        Object.values(paymentRequests).forEach(request => {
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

// UPDATED: Setup revenue vs expenses chart with async data loading
async function setupRevenueExpensesChart() {
    const canvas = document.getElementById('revenueExpensesChart');
    if (!canvas) {
        console.warn('Revenue chart canvas not found');
        return;
    }

    try {
        const ctx = canvas.getContext('2d');
        const period = document.getElementById('chartPeriod')?.value || 'month';

        // Show loading indicator
        canvas.style.opacity = '0.5';

        // Get data asynchronously
        const chartData = await getChartDataAsync(period);
        const { labels, revenueData, expenseData } = chartData;

        // Destroy existing chart
        if (revenueExpensesChart) {
            revenueExpensesChart.destroy();
        }

        if (typeof Chart === 'undefined') {
            console.error('Chart.js not loaded');
            canvas.style.opacity = '1';
            return;
        }

        // Create new chart with real data
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
                        borderWidth: 3,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    },
                    {
                        label: 'Expenses',
                        data: expenseData,
                        borderColor: 'rgb(239, 68, 68)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 3,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                size: 14,
                                weight: 'bold'
                            },
                            padding: 15
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: {
                            size: 14,
                            weight: 'bold'
                        },
                        bodyFont: {
                            size: 13
                        },
                        callbacks: {
                            label: function (context) {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                const currency = businessData?.currency || 'R';
                                return `${label}: ${currency} ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                const currency = businessData?.currency || 'R';
                                return currency + ' ' + value.toLocaleString();
                            },
                            font: {
                                size: 12
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: {
                                size: 12
                            }
                        }
                    }
                }
            }
        });

        // Remove loading indicator
        canvas.style.opacity = '1';

        console.log('✓ Revenue vs Expenses chart updated with real data:', {
            period,
            dataPoints: labels.length,
            totalRevenue: revenueData.reduce((a, b) => a + b, 0).toFixed(2),
            totalExpenses: expenseData.reduce((a, b) => a + b, 0).toFixed(2)
        });

    } catch (error) {
        console.error('Error setting up revenue chart:', error);
        canvas.style.opacity = '1';
    }
}

// ASYNC VERSION of getChartData for proper data loading
async function getChartDataAsync(period) {
    const now = new Date();
    let labels = [];
    let revenueData = [];
    let expenseData = [];

    if (period === 'week') {
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            labels.push(date.toLocaleDateString('en-ZA', { weekday: 'short' }));

            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);

            const revenue = await calculateRevenueForPeriodFromSales(dayStart, dayEnd);
            const expense = calculateExpensesForPeriod(dayStart, dayEnd);

            revenueData.push(revenue);
            expenseData.push(expense);
        }
    } else if (period === 'month') {
        const weeksInMonth = 4;
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        for (let i = 0; i < weeksInMonth; i++) {
            labels.push(`Week ${i + 1}`);

            const weekStart = new Date(monthStart);
            weekStart.setDate(monthStart.getDate() + (i * 7));

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);

            const revenue = await calculateRevenueForPeriodFromSales(weekStart, weekEnd);
            const expense = calculateExpensesForPeriod(weekStart, weekEnd);

            revenueData.push(revenue);
            expenseData.push(expense);
        }
    } else if (period === 'quarter') {
        for (let i = 2; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(date.toLocaleDateString('en-ZA', { month: 'short' }));

            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

            const revenue = await calculateRevenueForPeriodFromSales(monthStart, monthEnd);
            const expense = calculateExpensesForPeriod(monthStart, monthEnd);

            revenueData.push(revenue);
            expenseData.push(expense);
        }
    } else if (period === 'year') {
        for (let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(date.toLocaleDateString('en-ZA', { month: 'short' }));

            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

            const revenue = await calculateRevenueForPeriodFromSales(monthStart, monthEnd);
            const expense = calculateExpensesForPeriod(monthStart, monthEnd);

            revenueData.push(revenue);
            expenseData.push(expense);
        }
    }

    return { labels, revenueData, expenseData };
}

// UPDATED: Get expense breakdown data with real Firebase data
async function getExpenseBreakdownData(period) {
    const now = new Date();
    let start, end;

    if (period === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === 'quarter') {
        start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === 'year') {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    }

    const breakdown = {};

    // Get expenses from Firebase
    try {
        const expensesRef = ref(db, `businesses/${businessId}/finances/expenses`);
        const expensesSnap = await get(expensesRef);

        if (expensesSnap.exists()) {
            const allExpenses = expensesSnap.val();

            Object.values(allExpenses).forEach(expense => {
                const expenseDate = new Date(expense.date);
                if (expenseDate >= start && expenseDate <= end) {
                    const type = expense.type === 'custom' ? expense.customName : expense.type;
                    breakdown[type] = (breakdown[type] || 0) + (expense.amount || 0);
                }
            });
        }

        // Get approved payment requests
        const requestsRef = ref(db, `businesses/${businessId}/finances/paymentRequests`);
        const requestsSnap = await get(requestsRef);

        if (requestsSnap.exists()) {
            const allRequests = requestsSnap.val();

            Object.values(allRequests).forEach(request => {
                if (request.status === 'approved' && request.authorizedAt) {
                    const approvalDate = new Date(request.authorizedAt);
                    if (approvalDate >= start && approvalDate <= end) {
                        breakdown[request.purpose] = (breakdown[request.purpose] || 0) + (request.amount || 0);
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error getting expense breakdown:', error);
    }

    const labels = Object.keys(breakdown);
    const data = Object.values(breakdown);
    const colors = [
        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16'
    ];

    return { labels, data, colors };
}

// UPDATED: Setup expense breakdown chart with async loading
async function setupExpenseBreakdownChart() {
    const canvas = document.getElementById('expenseBreakdownChart');
    if (!canvas) {
        console.warn('Expense chart canvas not found');
        return;
    }

    try {
        const ctx = canvas.getContext('2d');
        const period = document.getElementById('expensePeriod')?.value || 'month';

        // Show loading
        canvas.style.opacity = '0.5';

        const { labels, data, colors } = await getExpenseBreakdownData(period);

        if (expenseBreakdownChart) {
            expenseBreakdownChart.destroy();
        }

        if (typeof Chart === 'undefined') {
            console.error('Chart.js not loaded');
            canvas.style.opacity = '1';
            return;
        }

        expenseBreakdownChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            font: {
                                size: 12
                            },
                            padding: 15
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        callbacks: {
                            label: function (context) {
                                const label = context.label || '';
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                const currency = businessData?.currency || 'R';
                                return `${label}: ${currency} ${value.toFixed(2)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });

        canvas.style.opacity = '1';

        console.log('✓ Expense breakdown chart updated with real data:', {
            period,
            categories: labels.length,
            totalExpenses: data.reduce((a, b) => a + b, 0).toFixed(2)
        });

    } catch (error) {
        console.error('Error setting up expense chart:', error);
        canvas.style.opacity = '1';
    }
}

// UPDATED: Setup charts wrapper with async support
async function setupCharts() {
    try {
        await setupRevenueExpensesChart();
        await setupExpenseBreakdownChart();
        console.log('✓ All charts initialized with real data');
    } catch (error) {
        console.error('Error in setupCharts:', error);
    }
}

console.log('✓ Fixed chart functions loaded - charts will now use real sales and expense data');