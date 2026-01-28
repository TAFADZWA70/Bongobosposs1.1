import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, remove } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

// Import change management module for cash on hand
import {
    initChangeManagement,
    getTodaysChange,
    hasChangeForToday,
    getChangeSummary,
    getDailyRecordsData
} from './changemanagement.js';

const firebaseConfig = {
    apiKey: "AIzaSyDuZ980qpXORaxy_B10LNhUZ2KDfrngrwU",
    authDomain: "bongobosspos.firebaseapp.com",
    databaseURL: "https://bongobosspos-default-rtdb.firebaseio.com",
    projectId: "bongobosspos",
    storageBucket: "bongobosspos.firebasestorage.app",
    messagingSenderId: "773564291065",
    appId: "1:773564291065:web:aba370070c91aaba2e0f28"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/**
 * FINANCE MANAGEMENT SYSTEM
 * 
 * DATABASE STRUCTURE:
 * /businesses/{businessId}/finances/
 *   ├── paymentRequests/{requestId}
 *   │   ├── amount
 *   │   ├── purpose
 *   │   ├── description
 *   │   ├── notes
 *   │   ├── branchId
 *   │   ├── branchName
 *   │   ├── requestedBy
 *   │   ├── requestedByName
 *   │   ├── requestedAt
 *   │   ├── status (pending, approved, rejected)
 *   │   ├── authorizedBy
 *   │   ├── authorizedByName
 *   │   ├── authorizedAt
 *   │   └── rejectionReason
 *   │
 *   ├── expenses/{expenseId}
 *   │   ├── type
 *   │   ├── customName (if custom type)
 *   │   ├── amount
 *   │   ├── date
 *   │   ├── description
 *   │   ├── branchId
 *   │   ├── branchName
 *   │   ├── isRecurring
 *   │   ├── recurringFrequency
 *   │   ├── recordedBy
 *   │   ├── recordedByName
 *   │   ├── recordedAt
 *   │   ├── lastModifiedBy
 *   │   └── lastModifiedAt
 *   │
 *   └── transactions/{transactionId}
 *       ├── type (payment, expense, revenue)
 *       ├── amount
 *       ├── description
 *       ├── branchId
 *       ├── date
 *       └── timestamp
 */

// Global variables
let currentUser = null;
let userData = null;
let businessId = null;
let businessData = null;
let allBranches = {};
let paymentRequests = {};
let expenses = {};
let transactions = [];
let revenueExpensesChart = null;
let expenseBreakdownChart = null;

// Generate clean ID from email
function generateCleanId(email) {
    const username = email.split('@')[0];
    return username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

// Check user role and permissions
function hasPermission(action) {
    if (!userData || !userData.role) return false;

    const role = userData.role.toLowerCase();

    const permissions = {
        'view': ['owner', 'partner', 'admin', 'manager', 'employee'],
        'request-payment': ['owner', 'partner', 'admin', 'manager', 'employee'],
        'authorize-payment': ['owner', 'partner', 'admin'],
        'record-expense': ['owner', 'partner', 'admin'],
        'view-reports': ['owner', 'partner', 'admin', 'manager']
    };

    return permissions[action]?.includes(role) || false;
}

// Check authentication and load data
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../Authentication Pages/Register.html';
        return;
    }

    currentUser = user;
    await loadUserData();
});

// Load user data
async function loadUserData() {
    try {
        const userId = generateCleanId(currentUser.email);
        const userRef = ref(db, `users/${userId}`);
        const userSnap = await get(userRef);

        if (!userSnap.exists()) {
            console.error('User data not found');
            window.location.href = '../Authentication Pages/Register.html';
            return;
        }

        userData = userSnap.val();
        businessId = userData.businessId;

        if (!businessId) {
            showToast('No business found. Please complete business setup first.', 'error');
            setTimeout(() => {
                window.location.href = '../Authentication Pages/BusinessSetupWizard.html';
            }, 2000);
            return;
        }

        if (!hasPermission('view')) {
            showToast('You do not have permission to access finance management', 'error');
            setTimeout(() => {
                window.location.href = 'Dashboard.html';
            }, 2000);
            return;
        }

        await loadBusinessInfo();
        await loadBranches();

        // Initialize change management for cash on hand
        initChangeManagement(
            currentUser,
            userData,
            businessId,
            businessData,
            allBranches
        );

        await loadFinanceData();
        await updateDashboardStats();
        displayPendingRequests();
        displayRecentTransactions();
        setupCharts();
        setupUIPermissions();

        // Hide loading screen
        document.getElementById('loadingScreen').classList.add('hidden');

    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Failed to load user data', 'error');
    }
}

// Setup UI based on permissions
function setupUIPermissions() {
    const requestPaymentBtn = document.getElementById('requestPaymentBtn');
    const recordExpenseBtn = document.getElementById('recordExpenseBtn');

    if (!hasPermission('request-payment') && requestPaymentBtn) {
        requestPaymentBtn.style.display = 'none';
    }

    if (!hasPermission('record-expense') && recordExpenseBtn) {
        recordExpenseBtn.style.display = 'none';
    }
}

// Load business info
async function loadBusinessInfo() {
    try {
        const businessRef = ref(db, `businesses/${businessId}`);
        const snapshot = await get(businessRef);

        if (snapshot.exists()) {
            businessData = snapshot.val();

            document.getElementById('businessName').textContent = businessData.businessName || 'Business Name';
            document.getElementById('businessType').textContent = businessData.businessType || 'Business Type';

            if (businessData.logo) {
                const logoContainer = document.getElementById('businessLogoContainer');
                logoContainer.innerHTML = `<img src="${businessData.logo}" alt="Business Logo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }
        }
    } catch (error) {
        console.error('Error loading business info:', error);
    }
}

// Load branches
async function loadBranches() {
    try {
        const branchesRef = ref(db, `businesses/${businessId}/branches`);
        const snapshot = await get(branchesRef);

        const expenseBranch = document.getElementById('expenseBranch');
        const expenseBranchFilter = document.getElementById('expenseBranchFilter');

        if (snapshot.exists()) {
            allBranches = snapshot.val();

            [expenseBranch, expenseBranchFilter].forEach(element => {
                if (element) {
                    if (element.id !== 'expenseBranch') {
                        element.innerHTML = '<option value="all">All Branches</option>';
                    } else {
                        element.innerHTML = '<option value="">Select branch</option>';
                    }

                    Object.entries(allBranches).forEach(([branchId, branch]) => {
                        const option = new Option(branch.branchName, branchId);
                        element.appendChild(option);
                    });
                }
            });
        }
    } catch (error) {
        console.error('Error loading branches:', error);
    }
}

// Load all finance data
async function loadFinanceData() {
    try {
        // Load payment requests
        const requestsRef = ref(db, `businesses/${businessId}/finances/paymentRequests`);
        const requestsSnap = await get(requestsRef);
        paymentRequests = requestsSnap.exists() ? requestsSnap.val() : {};

        // Load expenses
        const expensesRef = ref(db, `businesses/${businessId}/finances/expenses`);
        const expensesSnap = await get(expensesRef);
        expenses = expensesSnap.exists() ? expensesSnap.val() : {};

        // Load transactions
        const transactionsRef = ref(db, `businesses/${businessId}/finances/transactions`);
        const transactionsSnap = await get(transactionsRef);
        if (transactionsSnap.exists()) {
            transactions = Object.entries(transactionsSnap.val())
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } else {
            transactions = [];
        }

    } catch (error) {
        console.error('Error loading finance data:', error);
    }
}

// Update dashboard statistics  
async function updateDashboardStats() {
    const currency = businessData?.currency || 'R';

    // Calculate cash on hand from change management
    const today = new Date().toISOString().split('T')[0];
    const changeRecords = getDailyRecordsData();

    let totalCashOnHand = 0;
    let coinsAmount = 0;
    let notesAmount = 0;

    // Sum up today's change across all branches
    Object.values(changeRecords).forEach(record => {
        if (record.date === today && record.status === 'active') {
            totalCashOnHand += record.totalChange;
            coinsAmount += record.totalCoins;
            notesAmount += record.totalNotes;
        }
    });

    const cashOnHandEl = document.getElementById('cashOnHand');
    const cashChangeEl = document.getElementById('cashChange');
    if (cashOnHandEl) {
        cashOnHandEl.textContent = `${currency} ${totalCashOnHand.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    }
    if (cashChangeEl) {
        cashChangeEl.innerHTML = `
            <div style="font-size: 0.85rem;">
                Coins: ${currency} ${coinsAmount.toFixed(2)} | 
                Notes: ${currency} ${notesAmount.toFixed(2)}
            </div>
        `;
    }

    // Calculate monthly revenue from actual POS sales
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let monthlyRevenue = 0;

    // Fetch real sales data from POS system
    const salesRef = ref(db, `businesses/${businessId}/sales`);
    const salesSnap = await get(salesRef);

    if (salesSnap.exists()) {
        const allSales = salesSnap.val();
        Object.values(allSales).forEach(sale => {
            const saleDate = new Date(sale.soldAt || sale.date);
            if (saleDate >= startOfMonth) {
                monthlyRevenue += sale.total || 0;
            }
        });
    }

    // Also add any manual revenue transactions
    transactions.forEach(transaction => {
        if (transaction.type === 'revenue' && new Date(transaction.timestamp) >= startOfMonth) {
            monthlyRevenue += transaction.amount;
        }
    });

    const totalRevenueEl = document.getElementById('totalRevenue');
    const revenueChangeEl = document.getElementById('revenueChange');
    if (totalRevenueEl) {
        totalRevenueEl.textContent = `${currency} ${monthlyRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    }
    if (revenueChangeEl) {
        // Calculate last month revenue for comparison
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        let lastMonthRevenue = 0;

        if (salesSnap.exists()) {
            const allSales = salesSnap.val();
            Object.values(allSales).forEach(sale => {
                const saleDate = new Date(sale.soldAt || sale.date);
                if (saleDate >= lastMonthStart && saleDate <= lastMonthEnd) {
                    lastMonthRevenue += sale.total || 0;
                }
            });
        }

        const revenueChange = lastMonthRevenue > 0
            ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1)
            : 0;

        revenueChangeEl.innerHTML = `
            <i class="fas fa-arrow-${revenueChange >= 0 ? 'up' : 'down'}"></i>
            ${revenueChange >= 0 ? '+' : ''}${revenueChange}% vs last month
        `;
        revenueChangeEl.className = revenueChange >= 0 ? 'stat-change positive' : 'stat-change negative';
    }

    // Calculate monthly expenses
    let monthlyExpenses = 0;
    Object.values(expenses).forEach(expense => {
        if (new Date(expense.date) >= startOfMonth) {
            monthlyExpenses += expense.amount;
        }
    });

    // Add approved payment requests to expenses
    Object.values(paymentRequests).forEach(request => {
        if (request.status === 'approved' && new Date(request.authorizedAt) >= startOfMonth) {
            monthlyExpenses += request.amount;
        }
    });

    const totalExpensesEl = document.getElementById('totalExpenses');
    const expensesChangeEl = document.getElementById('expensesChange');
    if (totalExpensesEl) {
        totalExpensesEl.textContent = `${currency} ${monthlyExpenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    }
    if (expensesChangeEl) {
        // Calculate last month expenses for comparison
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        let lastMonthExpenses = 0;

        Object.values(expenses).forEach(expense => {
            const expenseDate = new Date(expense.date);
            if (expenseDate >= lastMonthStart && expenseDate <= lastMonthEnd) {
                lastMonthExpenses += expense.amount;
            }
        });

        Object.values(paymentRequests).forEach(request => {
            if (request.status === 'approved') {
                const approvalDate = new Date(request.authorizedAt);
                if (approvalDate >= lastMonthStart && approvalDate <= lastMonthEnd) {
                    lastMonthExpenses += request.amount;
                }
            }
        });

        const expensesChange = lastMonthExpenses > 0
            ? ((monthlyExpenses - lastMonthExpenses) / lastMonthExpenses * 100).toFixed(1)
            : 0;

        expensesChangeEl.innerHTML = `
            <i class="fas fa-arrow-${expensesChange >= 0 ? 'up' : 'down'}"></i>
            ${expensesChange >= 0 ? '+' : ''}${expensesChange}% vs last month
        `;
        expensesChangeEl.className = expensesChange >= 0 ? 'stat-change negative' : 'stat-change positive';
    }

    // Calculate net profit
    const netProfit = monthlyRevenue - monthlyExpenses;
    const profitMargin = monthlyRevenue > 0 ? ((netProfit / monthlyRevenue) * 100).toFixed(2) : 0;

    const netProfitEl = document.getElementById('netProfit');
    const profitMarginEl = document.getElementById('profitMargin');
    if (netProfitEl) {
        netProfitEl.textContent = `${currency} ${netProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
        netProfitEl.style.color = netProfit >= 0 ? 'var(--secondary-color)' : 'var(--danger-color)';
    }
    if (profitMarginEl) {
        profitMarginEl.textContent = `${profitMargin}% margin`;
        profitMarginEl.style.color = parseFloat(profitMargin) >= 0 ? 'var(--secondary-color)' : 'var(--danger-color)';
    }
}

// Display pending payment requests
function displayPendingRequests() {
    const tbody = document.getElementById('pendingRequestsBody');
    if (!tbody) return;

    const currency = businessData?.currency || 'R';

    const pendingRequests = Object.entries(paymentRequests)
        .filter(([_, request]) => request.status === 'pending')
        .sort((a, b) => new Date(b[1].requestedAt) - new Date(a[1].requestedAt));

    const pendingCountEl = document.getElementById('pendingCount');
    if (pendingCountEl) {
        pendingCountEl.textContent = pendingRequests.length;
    }

    if (pendingRequests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No pending requests
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = pendingRequests.map(([requestId, request]) => `
        <tr>
            <td>${formatDate(request.requestedAt)}</td>
            <td>${request.requestedByName}</td>
            <td><strong>${currency} ${request.amount.toFixed(2)}</strong></td>
            <td><span class="badge ${request.purpose}">${request.purpose.toUpperCase()}</span></td>
            <td><span class="status-badge pending"><i class="fas fa-clock"></i> Pending</span></td>
            <td>
                <div class="action-buttons">
                    ${hasPermission('authorize-payment') ? `
                        <button class="btn-approve" onclick="approvePayment('${requestId}')">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="btn-reject" onclick="rejectPayment('${requestId}')">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    ` : `
                        <span style="color: var(--gray-500);">Awaiting authorization</span>
                    `}
                </div>
            </td>
        </tr>
    `).join('');
}

// Display recent transactions
function displayRecentTransactions() {
    const container = document.getElementById('transactionsList');
    if (!container) return;

    const currency = businessData?.currency || 'R';

    const recentTransactions = transactions.slice(0, 10);

    if (recentTransactions.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #94a3b8;">
                <i class="fas fa-receipt" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                No recent transactions
            </div>
        `;
        return;
    }

    container.innerHTML = recentTransactions.map(transaction => {
        const isRevenue = transaction.type === 'revenue';
        const icon = isRevenue ? 'fa-arrow-up' : 'fa-arrow-down';

        return `
            <div class="transaction-item ${isRevenue ? 'revenue' : 'expense'}">
                <div class="transaction-info">
                    <div class="transaction-icon">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="transaction-details">
                        <h4>${transaction.description}</h4>
                        <p>${transaction.branchId ? allBranches[transaction.branchId]?.branchName || 'Unknown Branch' : 'All Branches'}</p>
                    </div>
                </div>
                <div class="transaction-amount">
                    <div class="amount-value ${isRevenue ? 'positive' : 'negative'}">
                        ${isRevenue ? '+' : '-'}${currency} ${transaction.amount.toFixed(2)}
                    </div>
                    <div class="amount-time">${formatTimeAgo(transaction.timestamp)}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Setup charts
function setupCharts() {
    setupRevenueExpensesChart();
    setupExpenseBreakdownChart();
}

// Setup revenue vs expenses chart
function setupRevenueExpensesChart() {
    const canvas = document.getElementById('revenueExpensesChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Get data for current month
    const period = document.getElementById('chartPeriod')?.value || 'month';
    const { labels, revenueData, expenseData } = getChartData(period);

    if (revenueExpensesChart) {
        revenueExpensesChart.destroy();
    }

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
                    fill: true
                },
                {
                    label: 'Expenses',
                    data: expenseData,
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return 'R ' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

// Setup expense breakdown chart
function setupExpenseBreakdownChart() {
    const canvas = document.getElementById('expenseBreakdownChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const period = document.getElementById('expensePeriod')?.value || 'month';
    const { labels, data, colors } = getExpenseBreakdownData(period);

    if (expenseBreakdownChart) {
        expenseBreakdownChart.destroy();
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
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: R ${value.toFixed(2)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Get chart data based on period
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

            const dayStart = new Date(date).setHours(0, 0, 0, 0);
            const dayEnd = new Date(date).setHours(23, 59, 59, 999);

            revenueData.push(calculateRevenueForPeriod(dayStart, dayEnd));
            expenseData.push(calculateExpensesForPeriod(dayStart, dayEnd));
        }
    } else if (period === 'month') {
        // Current month by week
        const weeksInMonth = 4;
        for (let i = 0; i < weeksInMonth; i++) {
            labels.push(`Week ${i + 1}`);

            const weekStart = new Date(now.getFullYear(), now.getMonth(), 1 + (i * 7));
            const weekEnd = new Date(now.getFullYear(), now.getMonth(), 1 + ((i + 1) * 7) - 1);

            revenueData.push(calculateRevenueForPeriod(weekStart, weekEnd));
            expenseData.push(calculateExpensesForPeriod(weekStart, weekEnd));
        }
    } else if (period === 'quarter') {
        // Last 3 months
        for (let i = 2; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(date.toLocaleDateString('en-ZA', { month: 'short' }));

            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

            revenueData.push(calculateRevenueForPeriod(monthStart, monthEnd));
            expenseData.push(calculateExpensesForPeriod(monthStart, monthEnd));
        }
    } else if (period === 'year') {
        // Last 12 months
        for (let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(date.toLocaleDateString('en-ZA', { month: 'short' }));

            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

            revenueData.push(calculateRevenueForPeriod(monthStart, monthEnd));
            expenseData.push(calculateExpensesForPeriod(monthStart, monthEnd));
        }
    }

    return { labels, revenueData, expenseData };
}

// Calculate revenue for period
function calculateRevenueForPeriod(start, end) {
    let total = 0;
    transactions.forEach(transaction => {
        const transactionDate = new Date(transaction.timestamp);
        if (transaction.type === 'revenue' && transactionDate >= start && transactionDate <= end) {
            total += transaction.amount;
        }
    });
    return total;
}

// Calculate expenses for period
function calculateExpensesForPeriod(start, end) {
    let total = 0;

    // Regular expenses
    Object.values(expenses).forEach(expense => {
        const expenseDate = new Date(expense.date);
        if (expenseDate >= start && expenseDate <= end) {
            total += expense.amount;
        }
    });

    // Approved payment requests
    Object.values(paymentRequests).forEach(request => {
        if (request.status === 'approved') {
            const approvalDate = new Date(request.authorizedAt);
            if (approvalDate >= start && approvalDate <= end) {
                total += request.amount;
            }
        }
    });

    return total;
}

// Get expense breakdown data
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

    // Calculate expenses by type
    Object.values(expenses).forEach(expense => {
        const expenseDate = new Date(expense.date);
        if (expenseDate >= start && expenseDate <= end) {
            const type = expense.type === 'custom' ? expense.customName : expense.type;
            breakdown[type] = (breakdown[type] || 0) + expense.amount;
        }
    });

    // Add payment requests by purpose
    Object.values(paymentRequests).forEach(request => {
        if (request.status === 'approved') {
            const approvalDate = new Date(request.authorizedAt);
            if (approvalDate >= start && approvalDate <= end) {
                breakdown[request.purpose] = (breakdown[request.purpose] || 0) + request.amount;
            }
        }
    });

    const labels = Object.keys(breakdown);
    const data = Object.values(breakdown);
    const colors = [
        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16'
    ];

    return { labels, data, colors };
}

// Submit payment request
async function submitPaymentRequest(requestData) {
    try {
        const requestsRef = ref(db, `businesses/${businessId}/finances/paymentRequests`);
        const newRequestRef = push(requestsRef);

        const request = {
            amount: requestData.amount,
            purpose: requestData.purpose,
            description: requestData.description,
            notes: requestData.notes || '',
            branchId: userData.branchId || '',
            branchName: userData.branchId ? allBranches[userData.branchId]?.branchName : 'N/A',
            requestedBy: generateCleanId(currentUser.email),
            requestedByName: userData.displayName,
            requestedAt: new Date().toISOString(),
            status: 'pending'
        };

        await set(newRequestRef, request);

        // Add to transactions
        const transactionRef = ref(db, `businesses/${businessId}/finances/transactions`);
        const newTransactionRef = push(transactionRef);
        await set(newTransactionRef, {
            type: 'expense',
            amount: request.amount,
            description: `Payment request: ${request.purpose} - ${request.description}`,
            branchId: request.branchId,
            date: new Date().toISOString().split('T')[0],
            timestamp: new Date().toISOString(),
            status: 'pending'
        });

        await loadFinanceData();
        return { success: true };

    } catch (error) {
        console.error('Error submitting payment request:', error);
        throw error;
    }
}

// Approve payment request
window.approvePayment = async function (requestId) {
    if (!hasPermission('authorize-payment')) {
        showToast('You do not have permission to authorize payments', 'error');
        return;
    }

    try {
        const requestRef = ref(db, `businesses/${businessId}/finances/paymentRequests/${requestId}`);

        await update(requestRef, {
            status: 'approved',
            authorizedBy: generateCleanId(currentUser.email),
            authorizedByName: userData.displayName,
            authorizedAt: new Date().toISOString()
        });

        // Update transaction status
        const request = paymentRequests[requestId];
        const transactionsRef = ref(db, `businesses/${businessId}/finances/transactions`);
        const transactionsSnap = await get(transactionsRef);

        if (transactionsSnap.exists()) {
            Object.entries(transactionsSnap.val()).forEach(async ([txId, tx]) => {
                if (tx.description.includes(request.description) && tx.status === 'pending') {
                    await update(ref(db, `businesses/${businessId}/finances/transactions/${txId}`), {
                        status: 'approved'
                    });
                }
            });
        }

        showToast('Payment request approved', 'success');
        await loadFinanceData();
        await updateDashboardStats();
        displayPendingRequests();
        displayRecentTransactions();

    } catch (error) {
        console.error('Error approving payment:', error);
        showToast('Failed to approve payment', 'error');
    }
};

// Reject payment request
window.rejectPayment = async function (requestId) {
    if (!hasPermission('authorize-payment')) {
        showToast('You do not have permission to authorize payments', 'error');
        return;
    }

    const reason = prompt('Enter reason for rejection:');
    if (!reason) return;

    try {
        const requestRef = ref(db, `businesses/${businessId}/finances/paymentRequests/${requestId}`);

        await update(requestRef, {
            status: 'rejected',
            authorizedBy: generateCleanId(currentUser.email),
            authorizedByName: userData.displayName,
            authorizedAt: new Date().toISOString(),
            rejectionReason: reason
        });

        // Update transaction status
        const request = paymentRequests[requestId];
        const transactionsRef = ref(db, `businesses/${businessId}/finances/transactions`);
        const transactionsSnap = await get(transactionsRef);

        if (transactionsSnap.exists()) {
            Object.entries(transactionsSnap.val()).forEach(async ([txId, tx]) => {
                if (tx.description.includes(request.description) && tx.status === 'pending') {
                    await update(ref(db, `businesses/${businessId}/finances/transactions/${txId}`), {
                        status: 'rejected'
                    });
                }
            });
        }

        showToast('Payment request rejected', 'success');
        await loadFinanceData();
        await updateDashboardStats();
        displayPendingRequests();
        displayRecentTransactions();

    } catch (error) {
        console.error('Error rejecting payment:', error);
        showToast('Failed to reject payment', 'error');
    }
};

// Record expense
async function recordExpense(expenseData) {
    try {
        const expensesRef = ref(db, `businesses/${businessId}/finances/expenses`);
        const newExpenseRef = push(expensesRef);

        const expense = {
            type: expenseData.type,
            customName: expenseData.type === 'custom' ? expenseData.customName : null,
            amount: expenseData.amount,
            date: expenseData.date,
            description: expenseData.description,
            branchId: expenseData.branchId,
            branchName: allBranches[expenseData.branchId]?.branchName || 'Unknown',
            isRecurring: expenseData.isRecurring,
            recurringFrequency: expenseData.isRecurring ? expenseData.recurringFrequency : null,
            recordedBy: generateCleanId(currentUser.email),
            recordedByName: userData.displayName,
            recordedAt: new Date().toISOString(),
            lastModifiedBy: userData.displayName,
            lastModifiedAt: new Date().toISOString()
        };

        await set(newExpenseRef, expense);

        // Add to transactions
        const transactionRef = ref(db, `businesses/${businessId}/finances/transactions`);
        const newTransactionRef = push(transactionRef);
        await set(newTransactionRef, {
            type: 'expense',
            amount: expense.amount,
            description: `${expense.type === 'custom' ? expense.customName : expense.type}: ${expense.description}`,
            branchId: expense.branchId,
            date: expense.date,
            timestamp: new Date().toISOString(),
            status: 'completed'
        });

        await loadFinanceData();
        return { success: true };

    } catch (error) {
        console.error('Error recording expense:', error);
        throw error;
    }
}

// Format date helper
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Format time ago helper
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return date.toLocaleDateString('en-ZA');
}

// Helper functions
function setLoading(button, isLoading) {
    if (!button) return;

    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');

    if (isLoading) {
        if (btnText) btnText.style.display = 'none';
        if (btnLoader) btnLoader.style.display = 'inline-block';
        button.disabled = true;
    } else {
        if (btnText) btnText.style.display = 'inline-block';
        if (btnLoader) btnLoader.style.display = 'none';
        button.disabled = false;
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById(type === 'success' ? 'successToast' : 'errorToast');
    const messageSpan = type === 'success' ?
        document.getElementById('toastMessage') :
        document.getElementById('errorToastMessage');

    if (toast && messageSpan) {
        messageSpan.textContent = message;
        toast.style.display = 'flex';

        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }
}

// Event Listeners

// Mobile menu toggle
const menuToggle = document.getElementById('menuToggle');
if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('active');
    });
}

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to logout?')) {
            try {
                await signOut(auth);
                window.location.href = '../Index.html';
            } catch (error) {
                console.error('Logout error:', error);
                showToast('Failed to logout', 'error');
            }
        }
    });
}

// Refresh button
const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
        await loadFinanceData();
        await updateDashboardStats();
        displayPendingRequests();
        displayRecentTransactions();
        setupCharts();
        showToast('Data refreshed', 'success');
    });
}

// Request payment button
const requestPaymentBtn = document.getElementById('requestPaymentBtn');
if (requestPaymentBtn) {
    requestPaymentBtn.addEventListener('click', () => {
        const modal = document.getElementById('requestPaymentModal');
        if (modal) modal.classList.add('active');
    });
}

// Request payment form submission
const requestPaymentForm = document.getElementById('requestPaymentForm');
if (requestPaymentForm) {
    requestPaymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const requestData = {
            amount: parseFloat(document.getElementById('requestAmount').value),
            purpose: document.getElementById('requestPurpose').value,
            description: document.getElementById('requestDescription').value.trim(),
            notes: document.getElementById('requestNotes').value.trim()
        };

        const btn = document.getElementById('submitRequestPayment');
        setLoading(btn, true);

        try {
            await submitPaymentRequest(requestData);
            showToast('Payment request submitted successfully', 'success');

            const modal = document.getElementById('requestPaymentModal');
            if (modal) modal.classList.remove('active');
            requestPaymentForm.reset();

            await updateDashboardStats();
            displayPendingRequests();
            displayRecentTransactions();

        } catch (error) {
            console.error('Error submitting request:', error);
            showToast('Failed to submit payment request', 'error');
        } finally {
            setLoading(btn, false);
        }
    });
}

// Record expense button
const recordExpenseBtn = document.getElementById('recordExpenseBtn');
if (recordExpenseBtn) {
    recordExpenseBtn.addEventListener('click', () => {
        const modal = document.getElementById('recordExpenseModal');
        const dateInput = document.getElementById('expenseDate');
        if (modal) modal.classList.add('active');
        if (dateInput) dateInput.valueAsDate = new Date();
    });
}

// Expense type change
const expenseType = document.getElementById('expenseType');
if (expenseType) {
    expenseType.addEventListener('change', (e) => {
        const customGroup = document.getElementById('customExpenseGroup');
        if (customGroup) {
            customGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
        }
    });
}

// Recurring expense checkbox
const expenseRecurring = document.getElementById('expenseRecurring');
if (expenseRecurring) {
    expenseRecurring.addEventListener('change', (e) => {
        const recurringOptions = document.getElementById('recurringOptions');
        if (recurringOptions) {
            recurringOptions.style.display = e.target.checked ? 'block' : 'none';
        }
    });
}

// Record expense form submission
const recordExpenseForm = document.getElementById('recordExpenseForm');
if (recordExpenseForm) {
    recordExpenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const expenseData = {
            type: document.getElementById('expenseType').value,
            customName: document.getElementById('customExpenseName')?.value.trim() || '',
            amount: parseFloat(document.getElementById('expenseAmount').value),
            date: document.getElementById('expenseDate').value,
            description: document.getElementById('expenseDescription').value.trim(),
            branchId: document.getElementById('expenseBranch').value,
            isRecurring: document.getElementById('expenseRecurring').checked,
            recurringFrequency: document.getElementById('recurringFrequency')?.value || null
        };

        if (expenseData.type === 'custom' && !expenseData.customName) {
            showToast('Please enter custom expense name', 'error');
            return;
        }

        const btn = document.getElementById('submitRecordExpense');
        setLoading(btn, true);

        try {
            await recordExpense(expenseData);
            showToast('Expense recorded successfully', 'success');

            const modal = document.getElementById('recordExpenseModal');
            if (modal) modal.classList.remove('active');
            recordExpenseForm.reset();

            await updateDashboardStats();
            displayRecentTransactions();
            setupCharts();

        } catch (error) {
            console.error('Error recording expense:', error);
            showToast('Failed to record expense', 'error');
        } finally {
            setLoading(btn, false);
        }
    });
}

// View payments button
const viewPaymentsBtn = document.getElementById('viewPaymentsBtn');
if (viewPaymentsBtn) {
    viewPaymentsBtn.addEventListener('click', () => {
        displayAllPayments();
        const modal = document.getElementById('viewPaymentsModal');
        if (modal) modal.classList.add('active');
    });
}

// Display all payments
function displayAllPayments() {
    const tbody = document.getElementById('allPaymentsBody');
    if (!tbody) return;

    const currency = businessData?.currency || 'R';

    const allPayments = Object.entries(paymentRequests)
        .sort((a, b) => new Date(b[1].requestedAt) - new Date(a[1].requestedAt));

    if (allPayments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-list-alt" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No payment requests found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = allPayments.map(([requestId, request]) => {
        const statusClass = request.status === 'approved' ? 'approved' :
            request.status === 'rejected' ? 'rejected' : 'pending';
        const statusIcon = request.status === 'approved' ? 'fa-check-circle' :
            request.status === 'rejected' ? 'fa-times-circle' : 'fa-clock';

        return `
            <tr>
                <td>${formatDate(request.requestedAt)}</td>
                <td>${request.requestedByName}</td>
                <td><strong>${currency} ${request.amount.toFixed(2)}</strong></td>
                <td><span class="badge ${request.purpose}">${request.purpose.toUpperCase()}</span></td>
                <td>${request.description}</td>
                <td><span class="status-badge ${statusClass}"><i class="fas ${statusIcon}"></i> ${request.status.toUpperCase()}</span></td>
                <td>${request.authorizedByName || '-'}</td>
                <td>
                    ${request.status === 'pending' && hasPermission('authorize-payment') ? `
                        <div class="action-buttons">
                            <button class="btn-approve" onclick="approvePayment('${requestId}')">
                                <i class="fas fa-check"></i> Approve
                            </button>
                            <button class="btn-reject" onclick="rejectPayment('${requestId}')">
                                <i class="fas fa-times"></i> Reject
                            </button>
                        </div>
                    ` : `<span style="color: var(--gray-500);">-</span>`}
                </td>
            </tr>
        `;
    }).join('');
}

// Payment filters
const paymentStatusFilter = document.getElementById('paymentStatusFilter');
const paymentPeriodFilter = document.getElementById('paymentPeriodFilter');

[paymentStatusFilter, paymentPeriodFilter].forEach(filter => {
    if (filter) {
        filter.addEventListener('change', displayAllPayments);
    }
});

// View expenses button
const viewExpensesBtn = document.getElementById('viewExpensesBtn');
if (viewExpensesBtn) {
    viewExpensesBtn.addEventListener('click', () => {
        displayAllExpenses();
        updateExpenseSummary();
        const modal = document.getElementById('viewExpensesModal');
        if (modal) modal.classList.add('active');
    });
}

// Display all expenses
function displayAllExpenses() {
    const tbody = document.getElementById('allExpensesBody');
    if (!tbody) return;

    const currency = businessData?.currency || 'R';

    const allExpenses = Object.entries(expenses)
        .sort((a, b) => new Date(b[1].date) - new Date(a[1].date));

    if (allExpenses.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-file-invoice-dollar" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No expenses recorded
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = allExpenses.map(([expenseId, expense]) => `
        <tr>
            <td>${formatDate(expense.date)}</td>
            <td><span class="badge ${expense.type}">${expense.type === 'custom' ? expense.customName : expense.type.toUpperCase()}</span></td>
            <td><strong>${currency} ${expense.amount.toFixed(2)}</strong></td>
            <td>${expense.description}</td>
            <td>${expense.branchName}</td>
            <td>${expense.isRecurring ? `<span class="status-badge success"><i class="fas fa-sync"></i> ${expense.recurringFrequency}</span>` : '-'}</td>
            <td>${expense.recordedByName}</td>
            <td>-</td>
        </tr>
    `).join('');
}

// Update expense summary
function updateExpenseSummary() {
    const currency = businessData?.currency || 'R';

    let totalExpenses = 0;
    let recurringExpenses = 0;
    let oneTimeExpenses = 0;

    Object.values(expenses).forEach(expense => {
        totalExpenses += expense.amount;
        if (expense.isRecurring) {
            recurringExpenses += expense.amount;
        } else {
            oneTimeExpenses += expense.amount;
        }
    });

    const summaryTotalExpensesEl = document.getElementById('summaryTotalExpenses');
    const summaryRecurringExpensesEl = document.getElementById('summaryRecurringExpenses');
    const summaryOneTimeExpensesEl = document.getElementById('summaryOneTimeExpenses');

    if (summaryTotalExpensesEl) {
        summaryTotalExpensesEl.textContent = `${currency} ${totalExpenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    }
    if (summaryRecurringExpensesEl) {
        summaryRecurringExpensesEl.textContent = `${currency} ${recurringExpenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    }
    if (summaryOneTimeExpensesEl) {
        summaryOneTimeExpensesEl.textContent = `${currency} ${oneTimeExpenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    }
}

// Chart period filters
const chartPeriod = document.getElementById('chartPeriod');
if (chartPeriod) {
    chartPeriod.addEventListener('change', setupRevenueExpensesChart);
}

const expensePeriod = document.getElementById('expensePeriod');
if (expensePeriod) {
    expensePeriod.addEventListener('change', setupExpenseBreakdownChart);
}

// Close modals
const closeRequestPaymentModal = document.getElementById('closeRequestPaymentModal');
if (closeRequestPaymentModal) {
    closeRequestPaymentModal.addEventListener('click', () => {
        const modal = document.getElementById('requestPaymentModal');
        if (modal) modal.classList.remove('active');
    });
}

const cancelRequestPayment = document.getElementById('cancelRequestPayment');
if (cancelRequestPayment) {
    cancelRequestPayment.addEventListener('click', () => {
        const modal = document.getElementById('requestPaymentModal');
        if (modal) modal.classList.remove('active');
    });
}

const closeRecordExpenseModal = document.getElementById('closeRecordExpenseModal');
if (closeRecordExpenseModal) {
    closeRecordExpenseModal.addEventListener('click', () => {
        const modal = document.getElementById('recordExpenseModal');
        if (modal) modal.classList.remove('active');
    });
}

const cancelRecordExpense = document.getElementById('cancelRecordExpense');
if (cancelRecordExpense) {
    cancelRecordExpense.addEventListener('click', () => {
        const modal = document.getElementById('recordExpenseModal');
        if (modal) modal.classList.remove('active');
    });
}

const closeViewPaymentsModal = document.getElementById('closeViewPaymentsModal');
if (closeViewPaymentsModal) {
    closeViewPaymentsModal.addEventListener('click', () => {
        const modal = document.getElementById('viewPaymentsModal');
        if (modal) modal.classList.remove('active');
    });
}

const closeViewExpensesModal = document.getElementById('closeViewExpensesModal');
if (closeViewExpensesModal) {
    closeViewExpensesModal.addEventListener('click', () => {
        const modal = document.getElementById('viewExpensesModal');
        if (modal) modal.classList.remove('active');
    });
}

const closeFinancialReportModal = document.getElementById('closeFinancialReportModal');
if (closeFinancialReportModal) {
    closeFinancialReportModal.addEventListener('click', () => {
        const modal = document.getElementById('financialReportModal');
        if (modal) modal.classList.remove('active');
    });
}

console.log('BongoBoss POS - Finance Management with Real Sales Data Integration Initialized ✓');