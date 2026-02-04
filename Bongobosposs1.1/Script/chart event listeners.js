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
} from './ChangeManagement.js';
import {
    initSalesModule,
    loadAllSales,
    getTodaysSales,
    getSalesForDate,
    getSalesForDateRange,
    calculateSalesSummary,
    getSalesByBranch,
    getPeakSalesHours,
    formatCurrency as formatSalesCurrency,
    formatDateTime,
    generateSalesReport,
    getSaleById
} from './Sales.js';

console.log('=== Finance.js Script Loaded ===');

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

console.log('=== Firebase Initialized ===');

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

// Emergency timeout - force hide loading screen after 15 seconds
setTimeout(() => {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
        console.error('⚠️ TIMEOUT: Forcing loading screen to hide after 15 seconds');
        loadingScreen.classList.add('hidden');
        loadingScreen.style.display = 'none';
        showToast('Page loaded with potential errors. Check console for details.', 'error');
    }
}, 15000);

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
    console.log('=== Auth State Changed ===', user ? `User: ${user.email}` : 'No user');

    if (!user) {
        console.log('No user authenticated, redirecting to register page');
        window.location.href = '../Authentication Pages/Register.html';
        return;
    }

    currentUser = user;
    console.log('=== Starting loadUserData ===');

    try {
        await loadUserData();
        console.log('=== Finished loadUserData Successfully ===');
    } catch (error) {
        console.error('=== loadUserData Failed ===', error);
        document.getElementById('loadingScreen')?.classList.add('hidden');
    }
});

// Load user data - WITH COMPREHENSIVE ERROR HANDLING
async function loadUserData() {
    try {
        console.log('Step 1: Getting user data from Firebase');
        const userId = generateCleanId(currentUser.email);
        console.log('Step 1a: User ID generated:', userId);

        const userRef = ref(db, `users/${userId}`);
        const userSnap = await get(userRef);
        console.log('Step 1b: User snapshot exists?', userSnap.exists());

        if (!userSnap.exists()) {
            console.error('❌ User data not found in database');
            document.getElementById('loadingScreen')?.classList.add('hidden');
            showToast('User data not found. Please register.', 'error');
            setTimeout(() => {
                window.location.href = '../Authentication Pages/Register.html';
            }, 2000);
            return;
        }

        userData = userSnap.val();
        businessId = userData.businessId;
        console.log('Step 2: User data loaded, businessId:', businessId);
        console.log('Step 2a: User role:', userData.role);

        if (!businessId) {
            console.error('❌ No business ID found for user');
            showToast('No business found. Please complete business setup first.', 'error');
            document.getElementById('loadingScreen')?.classList.add('hidden');
            setTimeout(() => {
                window.location.href = '../Authentication Pages/BusinessSetupWizard.html';
            }, 2000);
            return;
        }

        console.log('Step 3: Checking permissions');
        if (!hasPermission('view')) {
            console.error('❌ User does not have permission to view finance management');
            showToast('You do not have permission to access finance management', 'error');
            document.getElementById('loadingScreen')?.classList.add('hidden');
            setTimeout(() => {
                window.location.href = 'Dashboard.html';
            }, 2000);
            return;
        }
        console.log('✓ Permission check passed');

        console.log('Step 4: Loading business info');
        await loadBusinessInfo();
        console.log('✓ Business info loaded');

        console.log('Step 5: Loading branches');
        await loadBranches();
        console.log('✓ Branches loaded');

        // Initialize sales module with try-catch
        console.log('Step 6: Initializing sales module');
        try {
            initSalesModule(
                currentUser,
                userData,
                businessId,
                businessData,
                allBranches
            );
            await loadAllSales();
            console.log('✓ Sales module initialized successfully');
        } catch (error) {
            console.warn('⚠️ Sales module initialization failed (non-critical):', error);
            // Continue anyway - don't block the page
        }

        // Initialize change management with try-catch
        console.log('Step 7: Initializing change management');
        try {
            initChangeManagement(
                currentUser,
                userData,
                businessId,
                businessData,
                allBranches
            );
            console.log('✓ Change management initialized successfully');
        } catch (error) {
            console.warn('⚠️ Change management initialization failed (non-critical):', error);
            // Continue anyway
        }

        console.log('Step 8: Loading finance data');
        await loadFinanceData();
        console.log('✓ Finance data loaded');

        console.log('Step 9: Updating dashboard stats');
        await updateDashboardStats();
        console.log('✓ Dashboard stats updated');

        console.log('Step 10: Displaying pending requests and transactions');
        displayPendingRequests();
        displayRecentTransactions();
        console.log('✓ Data displayed');

        // Setup charts with delay to ensure DOM is ready
        console.log('Step 11: Setting up charts');
        setTimeout(() => {
            if (typeof Chart !== 'undefined') {
                try {
                    setupCharts();
                    console.log('✓ Charts setup complete');
                } catch (error) {
                    console.error('⚠️ Chart setup failed:', error);
                }
            } else {
                console.warn('⚠️ Chart.js not loaded, charts will not be displayed');
            }
        }, 500);

        setupUIPermissions();
        console.log('✓ UI permissions configured');

        // CRITICAL: Hide loading screen
        console.log('Step 12: HIDING LOADING SCREEN');
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            loadingScreen.style.display = 'none'; // Extra safety
        }
        console.log('=== ✓✓✓ PAGE LOAD COMPLETE ✓✓✓ ===');

    } catch (error) {
        console.error('!!! CRITICAL ERROR IN loadUserData !!!', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        showToast('Failed to load finance data: ' + error.message, 'error');

        // CRITICAL: Always hide loading screen even on error
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            loadingScreen.style.display = 'none';
        }
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

            const businessNameEl = document.getElementById('businessName');
            const businessTypeEl = document.getElementById('businessType');

            if (businessNameEl) {
                businessNameEl.textContent = businessData.businessName || 'Business Name';
            }
            if (businessTypeEl) {
                businessTypeEl.textContent = businessData.businessType || 'Business Type';
            }

            if (businessData.logo) {
                const logoContainer = document.getElementById('businessLogoContainer');
                if (logoContainer) {
                    logoContainer.innerHTML = `<img src="${businessData.logo}" alt="Business Logo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                }
            }
        } else {
            console.warn('No business data found for businessId:', businessId);
        }
    } catch (error) {
        console.error('Error loading business info:', error);
        // Don't throw - allow page to continue loading
    }
}

// Load branches
async function loadBranches() {
    try {
        const branchesRef = ref(db, `businesses/${businessId}/branches`);
        const snapshot = await get(branchesRef);

        const expenseBranch = document.getElementById('expenseBranch');
        const expenseBranchFilter = document.getElementById('expenseBranchFilter');
        const salesBranchFilter = document.getElementById('salesBranchFilter');
        const reportBranchFilter = document.getElementById('reportBranchFilter');

        if (snapshot.exists()) {
            allBranches = snapshot.val();
            console.log('Branches loaded:', Object.keys(allBranches).length);

            [expenseBranch, expenseBranchFilter, salesBranchFilter, reportBranchFilter].forEach(element => {
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
        } else {
            console.warn('No branches found for business');
            allBranches = {};
        }
    } catch (error) {
        console.error('Error loading branches:', error);
        allBranches = {};
        // Don't throw - allow page to continue
    }
}

// Load all finance data - WITH INDIVIDUAL TRY-CATCH FOR EACH DATA SOURCE
async function loadFinanceData() {
    console.log('Loading finance data...');

    // Load payment requests
    try {
        const requestsRef = ref(db, `businesses/${businessId}/finances/paymentRequests`);
        const requestsSnap = await get(requestsRef);
        paymentRequests = requestsSnap.exists() ? requestsSnap.val() : {};
        console.log('Payment requests loaded:', Object.keys(paymentRequests).length);
    } catch (error) {
        console.error('Error loading payment requests:', error);
        paymentRequests = {};
    }

    // Load expenses
    try {
        const expensesRef = ref(db, `businesses/${businessId}/finances/expenses`);
        const expensesSnap = await get(expensesRef);
        expenses = expensesSnap.exists() ? expensesSnap.val() : {};
        console.log('Expenses loaded:', Object.keys(expenses).length);
    } catch (error) {
        console.error('Error loading expenses:', error);
        expenses = {};
    }

    // Load transactions
    try {
        const transactionsRef = ref(db, `businesses/${businessId}/finances/transactions`);
        const transactionsSnap = await get(transactionsRef);
        if (transactionsSnap.exists()) {
            transactions = Object.entries(transactionsSnap.val())
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } else {
            transactions = [];
        }
        console.log('Transactions loaded:', transactions.length);
    } catch (error) {
        console.error('Error loading transactions:', error);
        transactions = [];
    }

    console.log('✓ All finance data loaded successfully');
}

// Update dashboard statistics - WITH ENHANCED ERROR HANDLING
async function updateDashboardStats() {
    try {
        console.log('Updating dashboard stats...');
        const currency = businessData?.currency || 'R';

        // Calculate cash on hand from change management
        const today = new Date().toISOString().split('T')[0];
        let changeRecords = {};

        try {
            changeRecords = getDailyRecordsData();
        } catch (error) {
            console.warn('Change management not available:', error);
            changeRecords = {};
        }

        let initialCashOnHand = 0;
        let coinsAmount = 0;
        let notesAmount = 0;

        // Sum up today's starting change
        if (changeRecords && typeof changeRecords === 'object') {
            Object.values(changeRecords).forEach(record => {
                if (record.date === today && record.status === 'active') {
                    initialCashOnHand += record.totalChange || 0;
                    coinsAmount += record.totalCoins || 0;
                    notesAmount += record.totalNotes || 0;
                }
            });
        }

        // Fetch today's sales for cash flow calculation
        let salesSnap = null;
        try {
            const salesRef = ref(db, `businesses/${businessId}/sales`);
            salesSnap = await get(salesRef);
        } catch (error) {
            console.warn('Could not fetch sales data:', error);
        }

        let totalChangeGivenOut = 0;
        let totalCashReceived = 0;

        if (salesSnap && salesSnap.exists()) {
            const allSales = salesSnap.val();
            Object.values(allSales).forEach(sale => {
                const saleDate = new Date(sale.soldAt || sale.date).toISOString().split('T')[0];

                if (saleDate === today && sale.paymentMethod === 'cash') {
                    totalCashReceived += sale.amountPaid || sale.total || 0;
                    totalChangeGivenOut += sale.change || 0;
                }
            });
        }

        // Calculate expenses paid today
        let expensesPaidOut = 0;

        if (expenses && typeof expenses === 'object') {
            Object.values(expenses).forEach(expense => {
                if (new Date(expense.date).toISOString().split('T')[0] === today) {
                    expensesPaidOut += expense.amount || 0;
                }
            });
        }

        if (paymentRequests && typeof paymentRequests === 'object') {
            Object.values(paymentRequests).forEach(request => {
                if (request.status === 'approved' && request.authorizedAt) {
                    if (new Date(request.authorizedAt).toISOString().split('T')[0] === today) {
                        expensesPaidOut += request.amount || 0;
                    }
                }
            });
        }

        // DYNAMIC CASH ON HAND = Starting + Received - Change - Expenses
        const actualCashOnHand = initialCashOnHand + totalCashReceived - totalChangeGivenOut - expensesPaidOut;

        const cashOnHandEl = document.getElementById('cashOnHand');
        const cashChangeEl = document.getElementById('cashChange');

        if (cashOnHandEl) {
            cashOnHandEl.textContent = `${currency} ${actualCashOnHand.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
        }

        if (cashChangeEl) {
            cashChangeEl.innerHTML = `
                <div style="font-size: 0.85rem;">
                    Start: ${currency} ${initialCashOnHand.toFixed(2)} | 
                    In: +${currency} ${totalCashReceived.toFixed(2)} | 
                    Out: -${currency} ${(totalChangeGivenOut + expensesPaidOut).toFixed(2)}
                </div>
            `;
        }

        // Calculate monthly revenue from POS sales
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let monthlyRevenue = 0;

        if (salesSnap && salesSnap.exists()) {
            const allSales = salesSnap.val();
            Object.values(allSales).forEach(sale => {
                const saleDate = new Date(sale.soldAt || sale.date);
                if (saleDate >= startOfMonth) {
                    monthlyRevenue += sale.total || 0;
                }
            });
        }

        // Add manual revenue transactions
        if (transactions && Array.isArray(transactions)) {
            transactions.forEach(transaction => {
                if (transaction.type === 'revenue' && new Date(transaction.timestamp) >= startOfMonth) {
                    monthlyRevenue += transaction.amount || 0;
                }
            });
        }

        const totalRevenueEl = document.getElementById('totalRevenue');
        const revenueChangeEl = document.getElementById('revenueChange');

        if (totalRevenueEl) {
            totalRevenueEl.textContent = `${currency} ${monthlyRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
        }

        if (revenueChangeEl) {
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            let lastMonthRevenue = 0;

            if (salesSnap && salesSnap.exists()) {
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

        if (expenses && typeof expenses === 'object') {
            Object.values(expenses).forEach(expense => {
                if (new Date(expense.date) >= startOfMonth) {
                    monthlyExpenses += expense.amount || 0;
                }
            });
        }

        if (paymentRequests && typeof paymentRequests === 'object') {
            Object.values(paymentRequests).forEach(request => {
                if (request.status === 'approved' && new Date(request.authorizedAt) >= startOfMonth) {
                    monthlyExpenses += request.amount || 0;
                }
            });
        }

        const totalExpensesEl = document.getElementById('totalExpenses');
        const expensesChangeEl = document.getElementById('expensesChange');

        if (totalExpensesEl) {
            totalExpensesEl.textContent = `${currency} ${monthlyExpenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
        }

        if (expensesChangeEl) {
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            let lastMonthExpenses = 0;

            if (expenses && typeof expenses === 'object') {
                Object.values(expenses).forEach(expense => {
                    const expenseDate = new Date(expense.date);
                    if (expenseDate >= lastMonthStart && expenseDate <= lastMonthEnd) {
                        lastMonthExpenses += expense.amount || 0;
                    }
                });
            }

            if (paymentRequests && typeof paymentRequests === 'object') {
                Object.values(paymentRequests).forEach(request => {
                    if (request.status === 'approved') {
                        const approvalDate = new Date(request.authorizedAt);
                        if (approvalDate >= lastMonthStart && approvalDate <= lastMonthEnd) {
                            lastMonthExpenses += request.amount || 0;
                        }
                    }
                });
            }

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

        console.log('✓ Dashboard stats updated:', {
            actualCashOnHand,
            monthlyRevenue,
            monthlyExpenses,
            netProfit
        });

    } catch (error) {
        console.error('Error updating dashboard stats:', error);
        // Don't throw - allow page to continue
    }
}// PART 2 - Display Functions, Charts, and Event Handlers

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
    try {
        setupRevenueExpensesChart();
        setupExpenseBreakdownChart();
    } catch (error) {
        console.error('Error in setupCharts:', error);
    }
}

// Setup revenue vs expenses chart
function setupRevenueExpensesChart() {
    const canvas = document.getElementById('revenueExpensesChart');
    if (!canvas) {
        console.warn('Revenue chart canvas not found');
        return;
    }

    try {
        const ctx = canvas.getContext('2d');
        const period = document.getElementById('chartPeriod')?.value || 'month';
        const { labels, revenueData, expenseData } = getChartData(period);

        if (revenueExpensesChart) {
            revenueExpensesChart.destroy();
        }

        if (typeof Chart === 'undefined') {
            console.error('Chart.js not loaded');
            return;
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
    } catch (error) {
        console.error('Error setting up revenue chart:', error);
    }
}

// Setup expense breakdown chart
function setupExpenseBreakdownChart() {
    const canvas = document.getElementById('expenseBreakdownChart');
    if (!canvas) {
        console.warn('Expense chart canvas not found');
        return;
    }

    try {
        const ctx = canvas.getContext('2d');
        const period = document.getElementById('expensePeriod')?.value || 'month';
        const { labels, data, colors } = getExpenseBreakdownData(period);

        if (expenseBreakdownChart) {
            expenseBreakdownChart.destroy();
        }

        if (typeof Chart === 'undefined') {
            console.error('Chart.js not loaded');
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
    } catch (error) {
        console.error('Error setting up expense chart:', error);
    }
}

// Get chart data based on period
function getChartData(period) {
    const now = new Date();
    let labels = [];
    let revenueData = [];
    let expenseData = [];

    if (period === 'week') {
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
        const weeksInMonth = 4;
        for (let i = 0; i < weeksInMonth; i++) {
            labels.push(`Week ${i + 1}`);

            const weekStart = new Date(now.getFullYear(), now.getMonth(), 1 + (i * 7));
            const weekEnd = new Date(now.getFullYear(), now.getMonth(), 1 + ((i + 1) * 7) - 1);

            revenueData.push(calculateRevenueForPeriod(weekStart, weekEnd));
            expenseData.push(calculateExpensesForPeriod(weekStart, weekEnd));
        }
    } else if (period === 'quarter') {
        for (let i = 2; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(date.toLocaleDateString('en-ZA', { month: 'short' }));

            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

            revenueData.push(calculateRevenueForPeriod(monthStart, monthEnd));
            expenseData.push(calculateExpensesForPeriod(monthStart, monthEnd));
        }
    } else if (period === 'year') {
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
    if (transactions && Array.isArray(transactions)) {
        transactions.forEach(transaction => {
            const transactionDate = new Date(transaction.timestamp);
            if (transaction.type === 'revenue' && transactionDate >= start && transactionDate <= end) {
                total += transaction.amount || 0;
            }
        });
    }
    return total;
}

// Calculate expenses for period
function calculateExpensesForPeriod(start, end) {
    let total = 0;

    if (expenses && typeof expenses === 'object') {
        Object.values(expenses).forEach(expense => {
            const expenseDate = new Date(expense.date);
            if (expenseDate >= start && expenseDate <= end) {
                total += expense.amount || 0;
            }
        });
    }

    if (paymentRequests && typeof paymentRequests === 'object') {
        Object.values(paymentRequests).forEach(request => {
            if (request.status === 'approved') {
                const approvalDate = new Date(request.authorizedAt);
                if (approvalDate >= start && approvalDate <= end) {
                    total += request.amount || 0;
                }
            }
        });
    }

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

    if (expenses && typeof expenses === 'object') {
        Object.values(expenses).forEach(expense => {
            const expenseDate = new Date(expense.date);
            if (expenseDate >= start && expenseDate <= end) {
                const type = expense.type === 'custom' ? expense.customName : expense.type;
                breakdown[type] = (breakdown[type] || 0) + (expense.amount || 0);
            }
        });
    }

    if (paymentRequests && typeof paymentRequests === 'object') {
        Object.values(paymentRequests).forEach(request => {
            if (request.status === 'approved') {
                const approvalDate = new Date(request.authorizedAt);
                if (approvalDate >= start && approvalDate <= end) {
                    breakdown[request.purpose] = (breakdown[request.purpose] || 0) + (request.amount || 0);
                }
            }
        });
    }

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
    } else {
        // Fallback to console if toast elements don't exist
        console.log(`[${type.toUpperCase()}]: ${message}`);
    }
}

console.log('=== Finance.js - All functions loaded ===');
console.log('Ready to attach event listeners');
// PART 3 - EVENT LISTENERS AND REMAINING FUNCTIONS
// This part should be ADDED AFTER Part 2, not replace it

// NOTE: Due to length, the full event listeners section from your original file 
// continues here. I'll include the essential ones and the pattern.

// Event Listeners
console.log('=== Attaching Event Listeners ===');

const menuToggle = document.getElementById('menuToggle');
if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('active');
    });
    console.log('✓ Menu toggle attached');
}

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
    console.log('✓ Logout button attached');
}

const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
        try {
            await loadFinanceData();
            await updateDashboardStats();
            displayPendingRequests();
            displayRecentTransactions();
            setupCharts();
            showToast('Data refreshed', 'success');
        } catch (error) {
            console.error('Refresh error:', error);
            showToast('Failed to refresh data', 'error');
        }
    });
    console.log('✓ Refresh button attached');
}

const requestPaymentBtn = document.getElementById('requestPaymentBtn');
if (requestPaymentBtn) {
    requestPaymentBtn.addEventListener('click', () => {
        const modal = document.getElementById('requestPaymentModal');
        if (modal) modal.classList.add('active');
    });
    console.log('✓ Request payment button attached');
}

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
    console.log('✓ Request payment form attached');
}

const recordExpenseBtn = document.getElementById('recordExpenseBtn');
if (recordExpenseBtn) {
    recordExpenseBtn.addEventListener('click', () => {
        const modal = document.getElementById('recordExpenseModal');
        const dateInput = document.getElementById('expenseDate');
        if (modal) modal.classList.add('active');
        if (dateInput) dateInput.valueAsDate = new Date();
    });
    console.log('✓ Record expense button attached');
}

const expenseType = document.getElementById('expenseType');
if (expenseType) {
    expenseType.addEventListener('change', (e) => {
        const customGroup = document.getElementById('customExpenseGroup');
        if (customGroup) {
            customGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
        }
    });
}

const expenseRecurring = document.getElementById('expenseRecurring');
if (expenseRecurring) {
    expenseRecurring.addEventListener('change', (e) => {
        const recurringOptions = document.getElementById('recurringOptions');
        if (recurringOptions) {
            recurringOptions.style.display = e.target.checked ? 'block' : 'none';
        }
    });
}

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
    console.log('✓ Record expense form attached');
}

const viewPaymentsBtn = document.getElementById('viewPaymentsBtn');
if (viewPaymentsBtn) {
    viewPaymentsBtn.addEventListener('click', () => {
        displayAllPayments();
        const modal = document.getElementById('viewPaymentsModal');
        if (modal) modal.classList.add('active');
    });
}

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

const viewExpensesBtn = document.getElementById('viewExpensesBtn');
if (viewExpensesBtn) {
    viewExpensesBtn.addEventListener('click', () => {
        displayAllExpenses();
        updateExpenseSummary();
        const modal = document.getElementById('viewExpensesModal');
        if (modal) modal.classList.add('active');
    });
}

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

function updateExpenseSummary() {
    const currency = businessData?.currency || 'R';

    let totalExpenses = 0;
    let recurringExpenses = 0;
    let oneTimeExpenses = 0;

    Object.values(expenses).forEach(expense => {
        totalExpenses += expense.amount || 0;
        if (expense.isRecurring) {
            recurringExpenses += expense.amount || 0;
        } else {
            oneTimeExpenses += expense.amount || 0;
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

const chartPeriod = document.getElementById('chartPeriod');
if (chartPeriod) {
    chartPeriod.addEventListener('change', setupRevenueExpensesChart);
}

const expensePeriod = document.getElementById('expensePeriod');
if (expensePeriod) {
    expensePeriod.addEventListener('change', setupExpenseBreakdownChart);
}

// Close modals
document.querySelectorAll('[id^="close"], [id^="cancel"]').forEach(btn => {
    btn.addEventListener('click', () => {
        const modal = btn.closest('.modal');
        if (modal) modal.classList.remove('active');
    });
});

console.log('=== ✓ All Event Listeners Attached ===');
console.log('BongoBoss POS - Finance Management Script Fully Loaded ✓');
// PART 4 - SALES VIEWING, FINANCIAL REPORTS, AND REMAINING FUNCTIONALITY
// This part should be ADDED AFTER Part 3

const viewSalesBtn = document.getElementById('viewSalesBtn');
if (viewSalesBtn) {
    viewSalesBtn.addEventListener('click', () => {
        // Set today's date as default
        const salesViewDate = document.getElementById('salesViewDate');
        if (salesViewDate) {
            salesViewDate.valueAsDate = new Date();
        }
        displayDailySales();
        const modal = document.getElementById('viewSalesModal');
        if (modal) modal.classList.add('active');
    });
    console.log('✓ View sales button attached');
}

// Daily sales display
function displayDailySales() {
    try {
        const dateInput = document.getElementById('salesViewDate');
        const branchFilter = document.getElementById('salesBranchFilter');

        const date = dateInput?.value || new Date().toISOString().split('T')[0];
        const branchId = branchFilter?.value || 'all';

        const sales = getSalesForDate(date, branchId);
        const summary = calculateSalesSummary(sales);

        // Update summary cards
        updateSalesSummaryCards(summary);

        // Display sales table
        displaySalesTable(sales);

        // Display peak hours
        displayPeakHours(sales);
    } catch (error) {
        console.error('Error displaying daily sales:', error);
        showToast('Failed to display sales data', 'error');
    }
}

// Update sales summary cards
function updateSalesSummaryCards(summary) {
    const currency = businessData?.currency || 'R';

    const elements = {
        salesTotalSales: summary.totalSales,
        salesTotalRevenue: `${currency} ${summary.totalRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
        salesChangeGiven: `${currency} ${summary.totalChangeGiven.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
        salesAvgTransaction: `${currency} ${summary.averageTransaction.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
        salesCashTotal: `${currency} ${summary.totalCash.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
        salesCardTotal: `${currency} ${summary.totalCard.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
        salesEwalletTotal: `${currency} ${summary.totalEWallet.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
        salesCashCount: `${summary.cashSales} sales`,
        salesCardCount: `${summary.cardSales} sales`,
        salesEwalletCount: `${summary.ewalletSales} sales`
    };

    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });
}

// Display sales table
function displaySalesTable(sales) {
    const tbody = document.getElementById('salesTableBody');
    if (!tbody) return;

    const currency = businessData?.currency || 'R';

    if (sales.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-receipt" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No sales found for the selected date
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = sales.map(sale => {
        const itemCount = sale.items ? sale.items.length : 0;
        const paymentBadge = sale.paymentMethod === 'cash' ? 'success' :
            sale.paymentMethod === 'card' ? 'primary' : 'accent';

        return `
            <tr>
                <td><strong>${sale.receiptNumber}</strong></td>
                <td>${formatDateTime(sale.soldAt || sale.date)}</td>
                <td>${sale.branchName || 'N/A'}</td>
                <td>${itemCount} item(s)</td>
                <td><strong>${currency} ${(sale.total || 0).toFixed(2)}</strong></td>
                <td><span class="badge ${paymentBadge}">${(sale.paymentMethod || 'unknown').toUpperCase()}</span></td>
                <td>${sale.paymentMethod === 'cash' ? `${currency} ${(sale.change || 0).toFixed(2)}` : '-'}</td>
                <td>
                    <button class="icon-btn" onclick="viewSaleDetails('${sale.saleId}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Display peak hours
function displayPeakHours(sales) {
    const peakHours = getPeakSalesHours(sales, 3);
    const container = document.getElementById('peakHoursList');
    if (!container) return;

    const currency = businessData?.currency || 'R';

    if (peakHours.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8;">No peak hours data</p>';
        return;
    }

    container.innerHTML = peakHours.map((peak, index) => `
        <div style="background: var(--gray-100); padding: 1rem; border-radius: 8px; border-left: 4px solid var(--${index === 0 ? 'primary' : index === 1 ? 'secondary' : 'accent'}-color);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 600; color: var(--dark-text);">${peak.timeRange}</div>
                    <div style="font-size: 0.875rem; color: var(--gray-600);">${peak.sales} sales</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 700; color: var(--primary-color);">${currency} ${peak.revenue.toFixed(2)}</div>
                </div>
            </div>
        </div>
    `).join('');
}

// View sale details
window.viewSaleDetails = function (saleId) {
    try {
        const sale = getSaleById(saleId);
        if (!sale) {
            showToast('Sale not found', 'error');
            return;
        }

        const currency = businessData?.currency || 'R';

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Sale Details - ${sale.receiptNumber}</h2>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                        <div>
                            <strong>Date & Time:</strong><br>
                            ${formatDateTime(sale.soldAt || sale.date)}
                        </div>
                        <div>
                            <strong>Branch:</strong><br>
                            ${sale.branchName || 'N/A'}
                        </div>
                        <div>
                            <strong>Cashier:</strong><br>
                            ${sale.cashierName || 'N/A'}
                        </div>
                        <div>
                            <strong>Payment Method:</strong><br>
                            <span class="badge ${sale.paymentMethod === 'cash' ? 'success' : 'primary'}">${(sale.paymentMethod || 'unknown').toUpperCase()}</span>
                        </div>
                    </div>

                    <h3 style="margin: 1.5rem 0 1rem 0;">Items Sold</h3>
                    <table class="finance-table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Quantity</th>
                                <th>Unit Price</th>
                                <th>Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(sale.items || []).map(item => `
                                <tr>
                                    <td>${item.productName}</td>
                                    <td>${item.quantity}</td>
                                    <td>${currency} ${(item.price || 0).toFixed(2)}</td>
                                    <td><strong>${currency} ${(item.subtotal || 0).toFixed(2)}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div style="margin-top: 1.5rem; padding: 1rem; background: var(--gray-100); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span>Subtotal:</span>
                            <strong>${currency} ${((sale.total || 0) - (sale.tax || 0)).toFixed(2)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span>Tax (15%):</span>
                            <strong>${currency} ${(sale.tax || 0).toFixed(2)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; padding-top: 0.5rem; border-top: 2px solid var(--gray-300); font-size: 1.25rem;">
                            <span>Total:</span>
                            <strong style="color: var(--primary-color);">${currency} ${(sale.total || 0).toFixed(2)}</strong>
                        </div>
                        ${sale.paymentMethod === 'cash' ? `
                            <div style="display: flex; justify-content: space-between; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--gray-300);">
                                <div>
                                    <div style="color: var(--gray-600); font-size: 0.875rem;">Amount Paid</div>
                                    <strong>${currency} ${(sale.amountPaid || 0).toFixed(2)}</strong>
                                </div>
                                <div>
                                    <div style="color: var(--gray-600); font-size: 0.875rem;">Change Given</div>
                                    <strong style="color: var(--danger-color);">${currency} ${(sale.change || 0).toFixed(2)}</strong>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    } catch (error) {
        console.error('Error viewing sale details:', error);
        showToast('Failed to load sale details', 'error');
    }
};

// Sales date change
const salesViewDate = document.getElementById('salesViewDate');
if (salesViewDate) {
    salesViewDate.addEventListener('change', displayDailySales);
}

// Sales branch filter change
const salesBranchFilter = document.getElementById('salesBranchFilter');
if (salesBranchFilter) {
    salesBranchFilter.addEventListener('change', displayDailySales);
}

// Close sales modal
const closeViewSalesModal = document.getElementById('closeViewSalesModal');
if (closeViewSalesModal) {
    closeViewSalesModal.addEventListener('click', () => {
        const modal = document.getElementById('viewSalesModal');
        if (modal) modal.classList.remove('active');
    });
}

// =============================================================================
// COMPREHENSIVE FINANCIAL REPORT
// =============================================================================

const financialReportBtn = document.getElementById('financialReportBtn');
if (financialReportBtn) {
    financialReportBtn.addEventListener('click', () => {
        // Set defaults
        const reportPeriod = document.getElementById('reportPeriod');
        const reportBranchFilter = document.getElementById('reportBranchFilter');
        const reportStartDate = document.getElementById('reportStartDate');
        const reportEndDate = document.getElementById('reportEndDate');

        if (reportPeriod) reportPeriod.value = 'month';
        if (reportBranchFilter) reportBranchFilter.value = 'all';
        if (reportStartDate) reportStartDate.valueAsDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        if (reportEndDate) reportEndDate.valueAsDate = new Date();

        const modal = document.getElementById('financialReportModal');
        if (modal) modal.classList.add('active');
    });
    console.log('✓ Financial report button attached');
}

// Report period change handler
const reportPeriod = document.getElementById('reportPeriod');
if (reportPeriod) {
    reportPeriod.addEventListener('change', (e) => {
        const customRange = document.getElementById('customDateRange');
        if (customRange) {
            customRange.style.display = e.target.value === 'custom' ? 'block' : 'none';
        }
    });
}

// Generate comprehensive financial report
const generateReportBtn = document.getElementById('generateReportBtn');
if (generateReportBtn) {
    generateReportBtn.addEventListener('click', async () => {
        const period = document.getElementById('reportPeriod')?.value || 'month';
        const branchFilter = document.getElementById('reportBranchFilter')?.value || 'all';
        let startDate, endDate;
        const now = new Date();

        if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        } else if (period === 'quarter') {
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
        } else if (period === 'year') {
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        } else if (period === 'custom') {
            const startInput = document.getElementById('reportStartDate')?.value;
            const endInput = document.getElementById('reportEndDate')?.value;

            if (!startInput || !endInput) {
                showToast('Please select start and end dates', 'error');
                return;
            }

            startDate = new Date(startInput);
            endDate = new Date(endInput);
            endDate.setHours(23, 59, 59, 999);
        }

        setLoading(generateReportBtn, true);

        try {
            const reportData = await generateComprehensiveReport(startDate, endDate, branchFilter);
            displayFinancialReport(reportData, startDate, endDate, branchFilter);
            showToast('Financial report generated successfully', 'success');
        } catch (error) {
            console.error('Error generating report:', error);
            showToast('Failed to generate financial report: ' + error.message, 'error');
        } finally {
            setLoading(generateReportBtn, false);
        }
    });
    console.log('✓ Generate report button attached');
}

// Generate comprehensive financial report data - WITH BRANCH FILTER
async function generateComprehensiveReport(startDate, endDate, branchFilter = 'all') {
    try {
        console.log('Generating comprehensive report...');
        const currency = businessData?.currency || 'R';

        // Use the sales module with branch filter
        const salesData = generateSalesReport(startDate, endDate, branchFilter);
        const { sales, summary } = salesData;

        // Fetch expenses data
        const expensesRef = ref(db, `businesses/${businessId}/finances/expenses`);
        const expensesSnap = await get(expensesRef);

        const paymentRequestsRef = ref(db, `businesses/${businessId}/finances/paymentRequests`);
        const paymentRequestsSnap = await get(paymentRequestsRef);

        // Initialize report data with sales summary
        let totalRevenue = summary.totalRevenue;
        let totalTax = summary.totalTax;
        let totalCost = summary.totalCost;
        let totalSales = summary.totalSales;
        let totalChangeGiven = summary.totalChangeGiven;
        let salesByBranch = {};

        // Fix salesByBranch structure
        Object.entries(salesData.byBranch).forEach(([branchId, branchData]) => {
            salesByBranch[branchId] = {
                name: branchData.branchName,
                sales: branchData.totalSales,
                revenue: branchData.totalRevenue
            };
        });

        let salesByPaymentMethod = {
            cash: summary.totalCash,
            card: summary.totalCard,
            ewallet: summary.totalEWallet
        };
        let topProducts = summary.topProductsArray;
        let peakHours = salesData.peakHours;

        // Monthly breakdown
        let monthlySales = {};
        let monthlyExpenses = {};

        // Process monthly sales
        sales.forEach(sale => {
            const saleDate = new Date(sale.soldAt || sale.date);
            const monthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlySales[monthKey]) {
                monthlySales[monthKey] = 0;
            }
            monthlySales[monthKey] += sale.total;
        });

        // Process expenses with branch filter
        let totalExpenses = 0;
        let expensesByCategory = {};

        if (expensesSnap.exists()) {
            const allExpenses = expensesSnap.val();

            Object.values(allExpenses).forEach(expense => {
                const expenseDate = new Date(expense.date);
                const matchesBranch = branchFilter === 'all' || expense.branchId === branchFilter;

                if (expenseDate >= startDate && expenseDate <= endDate && matchesBranch) {
                    totalExpenses += expense.amount;

                    const category = expense.type === 'custom' ? expense.customName : expense.type;
                    if (!expensesByCategory[category]) {
                        expensesByCategory[category] = 0;
                    }
                    expensesByCategory[category] += expense.amount;

                    // Monthly breakdown
                    const monthKey = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`;
                    if (!monthlyExpenses[monthKey]) {
                        monthlyExpenses[monthKey] = 0;
                    }
                    monthlyExpenses[monthKey] += expense.amount;
                }
            });
        }

        // Process payment requests with branch filter
        if (paymentRequestsSnap.exists()) {
            const allRequests = paymentRequestsSnap.val();

            Object.values(allRequests).forEach(request => {
                if (request.status === 'approved') {
                    const approvalDate = new Date(request.authorizedAt);
                    const matchesBranch = branchFilter === 'all' || request.branchId === branchFilter;

                    if (approvalDate >= startDate && approvalDate <= endDate && matchesBranch) {
                        totalExpenses += request.amount;

                        const category = request.purpose;
                        if (!expensesByCategory[category]) {
                            expensesByCategory[category] = 0;
                        }
                        expensesByCategory[category] += request.amount;

                        // Monthly breakdown
                        const monthKey = `${approvalDate.getFullYear()}-${String(approvalDate.getMonth() + 1).padStart(2, '0')}`;
                        if (!monthlyExpenses[monthKey]) {
                            monthlyExpenses[monthKey] = 0;
                        }
                        monthlyExpenses[monthKey] += request.amount;
                    }
                }
            });
        }

        // Calculate profit/loss
        const grossProfit = totalRevenue - totalCost;
        const netProfit = totalRevenue - totalExpenses;
        const grossProfitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
        const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        console.log('Report generated successfully');

        return {
            summary: {
                totalRevenue,
                totalTax,
                totalCost,
                totalExpenses,
                grossProfit,
                netProfit,
                grossProfitMargin,
                netProfitMargin,
                totalSales,
                totalChangeGiven,
                avgTransactionValue: totalSales > 0 ? totalRevenue / totalSales : 0
            },
            salesByBranch,
            salesByPaymentMethod,
            expensesByCategory,
            topProducts,
            monthlySales,
            monthlyExpenses,
            peakHours,
            branchFilter
        };
    } catch (error) {
        console.error('Error in generateComprehensiveReport:', error);
        throw error;
    }
}

// Display financial report - WITH BRANCH INFO
function displayFinancialReport(reportData, startDate, endDate, branchFilter = 'all') {
    const currency = businessData?.currency || 'R';
    const { summary } = reportData;

    const startDateStr = startDate.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
    const endDateStr = endDate.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });

    // Get branch name for display
    const branchName = branchFilter === 'all' ? 'All Branches' :
        (allBranches[branchFilter]?.branchName || 'Unknown Branch');

    const reportPreview = document.getElementById('reportPreview');
    if (!reportPreview) {
        console.error('Report preview element not found');
        return;
    }

    reportPreview.innerHTML = `
        <div style="padding: 2rem; background: white; border-radius: 8px;">
            <div style="text-align: center; border-bottom: 3px solid var(--primary-color); padding-bottom: 1rem; margin-bottom: 2rem;">
                <h2 style="margin: 0; color: var(--primary-color);">COMPREHENSIVE FINANCIAL REPORT</h2>
                <p style="margin: 0.5rem 0 0 0; color: var(--gray-600);">${businessData.businessName}</p>
                <p style="margin: 0.25rem 0 0 0; color: var(--gray-600);">${branchName}</p>
                <p style="margin: 0.25rem 0 0 0; color: var(--gray-600);">${startDateStr} - ${endDateStr}</p>
            </div>
            
            <!-- Executive Summary -->
            <div style="background: linear-gradient(135deg, var(--primary-color), var(--secondary-color)); color: white; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                <h3 style="margin: 0 0 1rem 0; font-size: 1.5rem;">Executive Summary</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <div>
                        <div style="font-size: 0.875rem; opacity: 0.9;">Total Revenue</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${currency} ${summary.totalRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.875rem; opacity: 0.9;">Total Expenses</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${currency} ${summary.totalExpenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.875rem; opacity: 0.9;">Net Profit</div>
                        <div style="font-size: 1.5rem; font-weight: 700; color: ${summary.netProfit >= 0 ? '#10b981' : '#ef4444'};">
                            ${currency} ${summary.netProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 0.875rem; opacity: 0.9;">Profit Margin</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${summary.netProfitMargin.toFixed(2)}%</div>
                    </div>
                </div>
            </div>

            <!-- Financial Performance -->
            <div style="margin-bottom: 2rem;">
                <h3 style="margin: 0 0 1rem 0; color: var(--primary-color); border-bottom: 2px solid var(--primary-color); padding-bottom: 0.5rem;">Financial Performance</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="background: var(--gray-100);">
                        <td style="padding: 0.75rem; font-weight: 600;">Metric</td>
                        <td style="padding: 0.75rem; text-align: right; font-weight: 600;">Amount</td>
                    </tr>
                    <tr style="border-bottom: 1px solid var(--gray-200);">
                        <td style="padding: 0.75rem;">Total Revenue</td>
                        <td style="padding: 0.75rem; text-align: right;">${currency} ${summary.totalRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid var(--gray-200);">
                        <td style="padding: 0.75rem;">Cost of Goods Sold (COGS)</td>
                        <td style="padding: 0.75rem; text-align: right; color: var(--danger-color);">-${currency} ${summary.totalCost.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid var(--gray-200); background: var(--gray-50);">
                        <td style="padding: 0.75rem; font-weight: 600;">Gross Profit</td>
                        <td style="padding: 0.75rem; text-align: right; font-weight: 600; color: var(--secondary-color);">${currency} ${summary.grossProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid var(--gray-200);">
                        <td style="padding: 0.75rem;">Operating Expenses</td>
                        <td style="padding: 0.75rem; text-align: right; color: var(--danger-color);">-${currency} ${summary.totalExpenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr style="background: ${summary.netProfit >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)'};">
                        <td style="padding: 0.75rem; font-weight: 700; font-size: 1.1rem;">Net Profit/Loss</td>
                        <td style="padding: 0.75rem; text-align: right; font-weight: 700; font-size: 1.1rem; color: ${summary.netProfit >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">
                            ${currency} ${summary.netProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                        </td>
                    </tr>
                </table>
            </div>

            <!-- Sales Analysis -->
            <div style="margin-bottom: 2rem;">
                <h3 style="margin: 0 0 1rem 0; color: var(--primary-color); border-bottom: 2px solid var(--primary-color); padding-bottom: 0.5rem;">Sales Analysis</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                    <div style="background: var(--gray-100); padding: 1rem; border-radius: 8px;">
                        <div style="font-size: 0.875rem; color: var(--gray-600); margin-bottom: 0.25rem;">Total Transactions</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${summary.totalSales}</div>
                    </div>
                    <div style="background: var(--gray-100); padding: 1rem; border-radius: 8px;">
                        <div style="font-size: 0.875rem; color: var(--gray-600); margin-bottom: 0.25rem;">Average Transaction</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${currency} ${summary.avgTransactionValue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div style="background: var(--gray-100); padding: 1rem; border-radius: 8px;">
                        <div style="font-size: 0.875rem; color: var(--gray-600); margin-bottom: 0.25rem;">Tax Collected</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${currency} ${summary.totalTax.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                    </div>
                </div>

                <!-- Change Management -->
                <div style="margin-bottom: 1rem;">
                    <h4 style="margin: 1.5rem 0 0.5rem 0;">Cash Flow & Change Management</h4>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                        <div style="background: white; border: 2px solid var(--gray-200); padding: 1rem; border-radius: 8px;">
                            <div style="font-size: 0.875rem; color: var(--gray-600); margin-bottom: 0.5rem;">Cash Sales</div>
                            <div style="font-size: 1.25rem; color: var(--success-color); font-weight: 700;">${currency} ${reportData.salesByPaymentMethod.cash.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div style="background: white; border: 2px solid var(--danger-color); padding: 1rem; border-radius: 8px;">
                            <div style="font-size: 0.875rem; color: var(--gray-600); margin-bottom: 0.5rem;">Change Given</div>
                            <div style="font-size: 1.25rem; color: var(--danger-color); font-weight: 700;">-${currency} ${summary.totalChangeGiven.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div style="background: white; border: 2px solid var(--primary-color); padding: 1rem; border-radius: 8px;">
                            <div style="font-size: 0.875rem; color: var(--gray-600); margin-bottom: 0.5rem;">Net Cash</div>
                            <div style="font-size: 1.25rem; color: var(--primary-color); font-weight: 700;">${currency} ${(reportData.salesByPaymentMethod.cash - summary.totalChangeGiven).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                        </div>
                    </div>
                </div>

                <!-- Peak Sales Hours -->
                ${reportData.peakHours && reportData.peakHours.length > 0 ? `
                    <div style="margin-bottom: 1rem;">
                        <h4 style="margin: 1.5rem 0 0.5rem 0;">Peak Sales Hours</h4>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                            ${reportData.peakHours.map((peak, index) => `
                                <div style="background: linear-gradient(135deg, ${index === 0 ? 'var(--primary-color)' : index === 1 ? 'var(--secondary-color)' : 'var(--accent-color)'}, ${index === 0 ? 'var(--secondary-color)' : index === 1 ? 'var(--accent-color)' : 'var(--primary-color)'}); color: white; padding: 1rem; border-radius: 8px;">
                                    <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.5rem;">#${index + 1} Peak Hour</div>
                                    <div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.25rem;">${peak.timeRange}</div>
                                    <div style="font-size: 0.875rem;">${peak.sales} sales • ${currency} ${peak.revenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Sales by Payment Method -->
                <h4 style="margin: 1.5rem 0 0.5rem 0;">Sales by Payment Method</h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                    ${Object.entries(reportData.salesByPaymentMethod).map(([method, amount]) => {
        const percentage = summary.totalRevenue > 0 ? (amount / summary.totalRevenue * 100).toFixed(1) : 0;
        return `
                            <div style="background: white; border: 2px solid var(--gray-200); padding: 1rem; border-radius: 8px; text-align: center;">
                                <div style="font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem;">${method}</div>
                                <div style="font-size: 1.25rem; color: var(--primary-color); font-weight: 700;">${currency} ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                                <div style="font-size: 0.875rem; color: var(--gray-600);">${percentage}%</div>
                            </div>
                        `;
    }).join('')}
                </div>
            </div>

            <!-- Sales by Branch -->
            ${Object.keys(reportData.salesByBranch).length > 0 ? `
                <div style="margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: var(--primary-color); border-bottom: 2px solid var(--primary-color); padding-bottom: 0.5rem;">Sales by Branch</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--gray-100);">
                                <th style="padding: 0.75rem; text-align: left;">Branch</th>
                                <th style="padding: 0.75rem; text-align: center;">Transactions</th>
                                <th style="padding: 0.75rem; text-align: right;">Revenue</th>
                                <th style="padding: 0.75rem; text-align: right;">% of Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(reportData.salesByBranch)
                .sort((a, b) => b[1].revenue - a[1].revenue)
                .map(([branchId, data]) => {
                    const percentage = (data.revenue / summary.totalRevenue * 100).toFixed(1);
                    return `
                                        <tr style="border-bottom: 1px solid var(--gray-200);">
                                            <td style="padding: 0.75rem;"><strong>${data.name}</strong></td>
                                            <td style="padding: 0.75rem; text-align: center;">${data.sales}</td>
                                            <td style="padding: 0.75rem; text-align: right;">${currency} ${data.revenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                                            <td style="padding: 0.75rem; text-align: right;">${percentage}%</td>
                                        </tr>
                                    `;
                }).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            <!-- Top Products -->
            ${reportData.topProducts.length > 0 ? `
                <div style="margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: var(--primary-color); border-bottom: 2px solid var(--primary-color); padding-bottom: 0.5rem;">Top 10 Products by Revenue</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--gray-100);">
                                <th style="padding: 0.75rem; text-align: left;">Product</th>
                                <th style="padding: 0.75rem; text-align: center;">Quantity Sold</th>
                                <th style="padding: 0.75rem; text-align: right;">Revenue</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${reportData.topProducts.map((product, index) => `
                                <tr style="border-bottom: 1px solid var(--gray-200);">
                                    <td style="padding: 0.75rem;">
                                        <span style="display: inline-block; width: 24px; height: 24px; background: var(--primary-color); color: white; border-radius: 50%; text-align: center; line-height: 24px; margin-right: 0.5rem; font-size: 0.75rem; font-weight: 700;">
                                            ${index + 1}
                                        </span>
                                        <strong>${product.name}</strong>
                                    </td>
                                    <td style="padding: 0.75rem; text-align: center;">${product.quantity}</td>
                                    <td style="padding: 0.75rem; text-align: right; font-weight: 600;">${currency} ${product.revenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            <!-- Expense Breakdown -->
            ${Object.keys(reportData.expensesByCategory).length > 0 ? `
                <div style="margin-bottom: 2rem;">
                    <h3 style="margin: 0 0 1rem 0; color: var(--primary-color); border-bottom: 2px solid var(--primary-color); padding-bottom: 0.5rem;">Expense Breakdown</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--gray-100);">
                                <th style="padding: 0.75rem; text-align: left;">Category</th>
                                <th style="padding: 0.75rem; text-align: right;">Amount</th>
                                <th style="padding: 0.75rem; text-align: right;">% of Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(reportData.expensesByCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([category, amount]) => {
                    const percentage = (amount / summary.totalExpenses * 100).toFixed(1);
                    return `
                                        <tr style="border-bottom: 1px solid var(--gray-200);">
                                            <td style="padding: 0.75rem;"><strong>${category.toUpperCase()}</strong></td>
                                            <td style="padding: 0.75rem; text-align: right;">${currency} ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                                            <td style="padding: 0.75rem; text-align: right;">${percentage}%</td>
                                        </tr>
                                    `;
                }).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            <!-- Conclusion -->
            <div style="background: ${summary.netProfit >= 0 ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)'}; color: white; padding: 1.5rem; border-radius: 8px; margin-top: 2rem;">
                <h3 style="margin: 0 0 1rem 0; font-size: 1.5rem;">Financial Status</h3>
                <p style="margin: 0; font-size: 1.125rem; line-height: 1.6;">
                    ${summary.netProfit >= 0
            ? `Your business generated a <strong>net profit of ${currency} ${Math.abs(summary.netProfit).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong> during this period, with a profit margin of <strong>${summary.netProfitMargin.toFixed(2)}%</strong>. This represents healthy financial performance.`
            : `Your business incurred a <strong>net loss of ${currency} ${Math.abs(summary.netProfit).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong> during this period. Consider reviewing your expenses and exploring strategies to increase revenue or reduce costs.`
        }
                </p>
            </div>

            <!-- Report Footer -->
            <div style="margin-top: 2rem; padding-top: 1rem; border-top: 2px solid var(--gray-200); text-align: center; color: var(--gray-600);">
                <p style="margin: 0; font-size: 0.875rem;">Report generated on ${new Date().toLocaleString('en-ZA')}</p>
                <p style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">BongoBoss Enterprise POS System</p>
            </div>

            <!-- Action Buttons -->
            <div style="margin-top: 2rem; display: flex; gap: 1rem; justify-content: center;">
                <button class="btn-primary" onclick="window.print()">
                    <i class="fas fa-print"></i> Print Report
                </button>
                <button class="btn-secondary" onclick="downloadFinancialReportPDF()">
                    <i class="fas fa-file-pdf"></i> Download PDF
                </button>
            </div>
        </div>
    `;

    reportPreview.style.display = 'block';
}

// Download financial report as PDF (placeholder)
window.downloadFinancialReportPDF = function () {
    showToast('PDF download functionality will be added soon. Please use Print to save as PDF.', 'success');
};

// Close financial report modal
const closeFinancialReportModal = document.getElementById('closeFinancialReportModal');
if (closeFinancialReportModal) {
    closeFinancialReportModal.addEventListener('click', () => {
        const modal = document.getElementById('financialReportModal');
        if (modal) modal.classList.remove('active');
        const reportPreview = document.getElementById('reportPreview');
        if (reportPreview) reportPreview.style.display = 'none';
    });
}
// PART 2 - Dashboard Stats and Display Functions

// Update dashboard statistics - WITH ENHANCED ERROR HANDLING
async function updateDashboardStats() {
    try {
        console.log('Updating dashboard stats...');
        const currency = businessData?.currency || 'R';

        // Calculate cash on hand from change management
        const today = new Date().toISOString().split('T')[0];
        let changeRecords = {};

        try {
            changeRecords = getDailyRecordsData();
        } catch (error) {
            console.warn('Change management not available:', error);
            changeRecords = {};
        }

        let initialCashOnHand = 0;
        let coinsAmount = 0;
        let notesAmount = 0;

        // Sum up today's starting change
        if (changeRecords && typeof changeRecords === 'object') {
            Object.values(changeRecords).forEach(record => {
                if (record.date === today && record.status === 'active') {
                    initialCashOnHand += record.totalChange || 0;
                    coinsAmount += record.totalCoins || 0;
                    notesAmount += record.totalNotes || 0;
                }
            });
        }

        // Fetch today's sales for cash flow calculation
        let salesSnap = null;
        try {
            const salesRef = ref(db, `businesses/${businessId}/sales`);
            salesSnap = await get(salesRef);
        } catch (error) {
            console.warn('Could not fetch sales data:', error);
        }

        let totalChangeGivenOut = 0;
        let totalCashReceived = 0;

        if (salesSnap && salesSnap.exists()) {
            const allSales = salesSnap.val();
            Object.values(allSales).forEach(sale => {
                const saleDate = new Date(sale.soldAt || sale.date).toISOString().split('T')[0];

                if (saleDate === today && sale.paymentMethod === 'cash') {
                    totalCashReceived += sale.amountPaid || sale.total || 0;
                    totalChangeGivenOut += sale.change || 0;
                }
            });
        }

        // Calculate expenses paid today
        let expensesPaidOut = 0;

        if (expenses && typeof expenses === 'object') {
            Object.values(expenses).forEach(expense => {
                if (new Date(expense.date).toISOString().split('T')[0] === today) {
                    expensesPaidOut += expense.amount || 0;
                }
            });
        }

        if (paymentRequests && typeof paymentRequests === 'object') {
            Object.values(paymentRequests).forEach(request => {
                if (request.status === 'approved' && request.authorizedAt) {
                    if (new Date(request.authorizedAt).toISOString().split('T')[0] === today) {
                        expensesPaidOut += request.amount || 0;
                    }
                }
            });
        }

        // DYNAMIC CASH ON HAND = Starting + Received - Change - Expenses
        const actualCashOnHand = initialCashOnHand + totalCashReceived - totalChangeGivenOut - expensesPaidOut;

        const cashOnHandEl = document.getElementById('cashOnHand');
        const cashChangeEl = document.getElementById('cashChange');

        if (cashOnHandEl) {
            cashOnHandEl.textContent = `${currency} ${actualCashOnHand.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
        }

        if (cashChangeEl) {
            cashChangeEl.innerHTML = `
                <div style="font-size: 0.85rem;">
                    Start: ${currency} ${initialCashOnHand.toFixed(2)} | 
                    In: +${currency} ${totalCashReceived.toFixed(2)} | 
                    Out: -${currency} ${(totalChangeGivenOut + expensesPaidOut).toFixed(2)}
                </div>
            `;
        }

        // Calculate monthly revenue from POS sales
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let monthlyRevenue = 0;

        if (salesSnap && salesSnap.exists()) {
            const allSales = salesSnap.val();
            Object.values(allSales).forEach(sale => {
                const saleDate = new Date(sale.soldAt || sale.date);
                if (saleDate >= startOfMonth) {
                    monthlyRevenue += sale.total || 0;
                }
            });
        }

        // Add manual revenue transactions
        if (transactions && Array.isArray(transactions)) {
            transactions.forEach(transaction => {
                if (transaction.type === 'revenue' && new Date(transaction.timestamp) >= startOfMonth) {
                    monthlyRevenue += transaction.amount || 0;
                }
            });
        }

        const totalRevenueEl = document.getElementById('totalRevenue');
        const revenueChangeEl = document.getElementById('revenueChange');

        if (totalRevenueEl) {
            totalRevenueEl.textContent = `${currency} ${monthlyRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
        }

        if (revenueChangeEl) {
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            let lastMonthRevenue = 0;

            if (salesSnap && salesSnap.exists()) {
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

        if (expenses && typeof expenses === 'object') {
            Object.values(expenses).forEach(expense => {
                if (new Date(expense.date) >= startOfMonth) {
                    monthlyExpenses += expense.amount || 0;
                }
            });
        }

        if (paymentRequests && typeof paymentRequests === 'object') {
            Object.values(paymentRequests).forEach(request => {
                if (request.status === 'approved' && new Date(request.authorizedAt) >= startOfMonth) {
                    monthlyExpenses += request.amount || 0;
                }
            });
        }

        const totalExpensesEl = document.getElementById('totalExpenses');
        const expensesChangeEl = document.getElementById('expensesChange');

        if (totalExpensesEl) {
            totalExpensesEl.textContent = `${currency} ${monthlyExpenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
        }

        if (expensesChangeEl) {
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            let lastMonthExpenses = 0;

            if (expenses && typeof expenses === 'object') {
                Object.values(expenses).forEach(expense => {
                    const expenseDate = new Date(expense.date);
                    if (expenseDate >= lastMonthStart && expenseDate <= lastMonthEnd) {
                        lastMonthExpenses += expense.amount || 0;
                    }
                });
            }

            if (paymentRequests && typeof paymentRequests === 'object') {
                Object.values(paymentRequests).forEach(request => {
                    if (request.status === 'approved') {
                        const approvalDate = new Date(request.authorizedAt);
                        if (approvalDate >= lastMonthStart && approvalDate <= lastMonthEnd) {
                            lastMonthExpenses += request.amount || 0;
                        }
                    }
                });
            }

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

        console.log('✓ Dashboard stats updated:', {
            actualCashOnHand,
            monthlyRevenue,
            monthlyExpenses,
            netProfit
        });

    } catch (error) {
        console.error('Error updating dashboard stats:', error);
        // Don't throw - allow page to continue
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
}// PART 3 - CHART FUNCTIONS (FIXED TO USE REAL SALES DATA)

// Setup charts wrapper - UPDATED WITH ASYNC
async function setupCharts() {
    try {
        await setupRevenueExpensesChart();
        await setupExpenseBreakdownChart();
        console.log('✓ All charts initialized with real data');
    } catch (error) {
        console.error('Error in setupCharts:', error);
    }
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

// Calculate expenses for period (KEPT FROM ORIGINAL)
function calculateExpensesForPeriod(start, end) {
    let total = 0;

    if (expenses && typeof expenses === 'object') {
        Object.values(expenses).forEach(expense => {
            const expenseDate = new Date(expense.date);
            if (expenseDate >= start && expenseDate <= end) {
                total += expense.amount || 0;
            }
        });
    }

    if (paymentRequests && typeof paymentRequests === 'object') {
        Object.values(paymentRequests).forEach(request => {
            if (request.status === 'approved') {
                const approvalDate = new Date(request.authorizedAt);
                if (approvalDate >= start && approvalDate <= end) {
                    total += request.amount || 0;
                }
            }
        });
    }

    return total;
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
}// PART 4 - Payment Requests, Expenses, and Helper Functions

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
    } else {
        // Fallback to console if toast elements don't exist
        console.log(`[${type.toUpperCase()}]: ${message}`);
    }
}
// PART 5 - EVENT LISTENERS (WITH UPDATED CHART HANDLERS)

console.log('=== Attaching Event Listeners ===');

const menuToggle = document.getElementById('menuToggle');
if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('active');
    });
    console.log('✓ Menu toggle attached');
}

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
    console.log('✓ Logout button attached');
}

// UPDATED: Refresh button to reload charts with async
const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
        console.log('Refreshing all data and charts...');
        try {
            // Show loading state
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';

            // Reload all data
            await loadFinanceData();
            await updateDashboardStats();
            displayPendingRequests();
            displayRecentTransactions();

            // Reload charts with real data
            await setupCharts();

            showToast('Data refreshed successfully', 'success');
        } catch (error) {
            console.error('Refresh error:', error);
            showToast('Failed to refresh data', 'error');
        } finally {
            // Restore button
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        }
    });
    console.log('✓ Refresh button attached (with chart reload)');
}

const requestPaymentBtn = document.getElementById('requestPaymentBtn');
if (requestPaymentBtn) {
    requestPaymentBtn.addEventListener('click', () => {
        const modal = document.getElementById('requestPaymentModal');
        if (modal) modal.classList.add('active');
    });
    console.log('✓ Request payment button attached');
}

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
    console.log('✓ Request payment form attached');
}

const recordExpenseBtn = document.getElementById('recordExpenseBtn');
if (recordExpenseBtn) {
    recordExpenseBtn.addEventListener('click', () => {
        const modal = document.getElementById('recordExpenseModal');
        const dateInput = document.getElementById('expenseDate');
        if (modal) modal.classList.add('active');
        if (dateInput) dateInput.valueAsDate = new Date();
    });
    console.log('✓ Record expense button attached');
}

const expenseType = document.getElementById('expenseType');
if (expenseType) {
    expenseType.addEventListener('change', (e) => {
        const customGroup = document.getElementById('customExpenseGroup');
        if (customGroup) {
            customGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
        }
    });
}

const expenseRecurring = document.getElementById('expenseRecurring');
if (expenseRecurring) {
    expenseRecurring.addEventListener('change', (e) => {
        const recurringOptions = document.getElementById('recurringOptions');
        if (recurringOptions) {
            recurringOptions.style.display = e.target.checked ? 'block' : 'none';
        }
    });
}

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
            await setupCharts(); // Reload charts after expense recorded

        } catch (error) {
            console.error('Error recording expense:', error);
            showToast('Failed to record expense', 'error');
        } finally {
            setLoading(btn, false);
        }
    });
    console.log('✓ Record expense form attached');
}

const viewPaymentsBtn = document.getElementById('viewPaymentsBtn');
if (viewPaymentsBtn) {
    viewPaymentsBtn.addEventListener('click', () => {
        displayAllPayments();
        const modal = document.getElementById('viewPaymentsModal');
        if (modal) modal.classList.add('active');
    });
}

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

const viewExpensesBtn = document.getElementById('viewExpensesBtn');
if (viewExpensesBtn) {
    viewExpensesBtn.addEventListener('click', () => {
        displayAllExpenses();
        updateExpenseSummary();
        const modal = document.getElementById('viewExpensesModal');
        if (modal) modal.classList.add('active');
    });
}

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

function updateExpenseSummary() {
    const currency = businessData?.currency || 'R';

    let totalExpenses = 0;
    let recurringExpenses = 0;
    let oneTimeExpenses = 0;

    Object.values(expenses).forEach(expense => {
        totalExpenses += expense.amount || 0;
        if (expense.isRecurring) {
            recurringExpenses += expense.amount || 0;
        } else {
            oneTimeExpenses += expense.amount || 0;
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

// UPDATED: Chart period change with async support
const chartPeriod = document.getElementById('chartPeriod');
if (chartPeriod) {
    chartPeriod.addEventListener('change', async () => {
        console.log('Chart period changed to:', chartPeriod.value);
        try {
            await setupRevenueExpensesChart();
            showToast('Chart updated', 'success');
        } catch (error) {
            console.error('Error updating chart:', error);
            showToast('Failed to update chart', 'error');
        }
    });
    console.log('✓ Chart period selector attached (async)');
}

// UPDATED: Expense period change with async support
const expensePeriod = document.getElementById('expensePeriod');
if (expensePeriod) {
    expensePeriod.addEventListener('change', async () => {
        console.log('Expense period changed to:', expensePeriod.value);
        try {
            await setupExpenseBreakdownChart();
            showToast('Expense chart updated', 'success');
        } catch (error) {
            console.error('Error updating expense chart:', error);
            showToast('Failed to update expense chart', 'error');
        }
    });
    console.log('✓ Expense period selector attached (async)');
}

// Close modals
document.querySelectorAll('[id^="close"], [id^="cancel"]').forEach(btn => {
    btn.addEventListener('click', () => {
        const modal = btn.closest('.modal');
        if (modal) modal.classList.remove('active');
    });
});

console.log('=== ✓ All Event Listeners Attached ===');
console.log('BongoBoss POS - Finance Management Script Fully Loaded ✓');