import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get, onValue } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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

// Global variables
let currentUser = null;
let businessData = null;

// Generate clean ID from email
function generateCleanId(email) {
    const username = email.split('@')[0];
    const cleanId = username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return cleanId;
}

// Check authentication and load dashboard
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../Authentication Pages/Register.html';
        return;
    }

    currentUser = user;
    await loadDashboard();
});

// Load dashboard data
async function loadDashboard() {
    try {
        // Get user data using email-based ID
        const userId = generateCleanId(currentUser.email);
        const userRef = ref(db, `users/${userId}`);
        const userSnap = await get(userRef);

        if (!userSnap.exists()) {
            console.error('User data not found');
            window.location.href = '../Authentication Pages/Register.html';
            return;
        }

        const userData = userSnap.val();

        // Check if business setup is complete
        if (!userData.businessSetupComplete) {
            window.location.href = '../Authentication Pages/BusinessSetupWizard.html';
            return;
        }

        // Get business data
        const businessRef = ref(db, `businesses/${userData.businessId}`);
        const businessSnap = await get(businessRef);

        if (!businessSnap.exists()) {
            console.error('Business data not found');
            window.location.href = '../Authentication Pages/BusinessSetupWizard.html';
            return;
        }

        businessData = businessSnap.val();
        businessData.businessId = userData.businessId; // Store businessId for later use

        // Update UI with business info
        updateBusinessInfo();

        // Load dashboard stats
        await loadDashboardStats();

        // Hide loading screen
        document.getElementById('loadingScreen').classList.add('hidden');

    } catch (error) {
        console.error('Error loading dashboard:', error);
        alert('Failed to load dashboard. Please try again.');
    }
}

// Update business information in sidebar
function updateBusinessInfo() {
    const businessNameEl = document.getElementById('businessName');
    const businessTypeEl = document.getElementById('businessType');
    const businessLogoContainer = document.getElementById('businessLogoContainer');
    const welcomeMessage = document.getElementById('welcomeMessage');

    if (businessData) {
        businessNameEl.textContent = businessData.businessName || 'Business Name';
        businessTypeEl.textContent = businessData.businessType || 'Business Type';

        // Display logo if available
        if (businessData.logo) {
            businessLogoContainer.innerHTML = `<img src="${businessData.logo}" alt="Business Logo">`;
        }

        // Update welcome message
        if (welcomeMessage) {
            welcomeMessage.textContent = `Welcome back to ${businessData.businessName}!`;
        }
    }
}

// Load dashboard statistics with real Firebase data
async function loadDashboardStats() {
    try {
        const businessId = businessData.businessId;
        const today = new Date().toISOString().split('T')[0];

        // Fetch real sales data
        const salesRef = ref(db, `businesses/${businessId}/sales`);
        const salesSnap = await get(salesRef);

        let todaysSales = 0;
        let yesterdaysSales = 0;
        let totalTransactionsToday = 0;
        let totalTransactionsYesterday = 0;

        if (salesSnap.exists()) {
            const allSales = salesSnap.val();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayDate = yesterday.toISOString().split('T')[0];

            Object.values(allSales).forEach(sale => {
                if (sale.date === today) {
                    todaysSales += sale.total || 0;
                    totalTransactionsToday++;
                } else if (sale.date === yesterdayDate) {
                    yesterdaysSales += sale.total || 0;
                    totalTransactionsYesterday++;
                }
            });
        }

        // Calculate percentage changes
        const salesChange = yesterdaysSales > 0
            ? ((todaysSales - yesterdaysSales) / yesterdaysSales * 100).toFixed(1)
            : 0;

        const transactionsChange = totalTransactionsYesterday > 0
            ? ((totalTransactionsToday - totalTransactionsYesterday) / totalTransactionsYesterday * 100).toFixed(1)
            : 0;

        // Fetch inventory data for low stock items
        const inventoryRef = ref(db, `businesses/${businessId}/inventory/products`);
        const inventorySnap = await get(inventoryRef);

        let lowStockItems = 0;
        let criticalItems = 0;

        if (inventorySnap.exists()) {
            const products = inventorySnap.val();
            Object.values(products).forEach(product => {
                if (product.isActive !== false) {
                    if (product.currentStock === 0) {
                        criticalItems++;
                        lowStockItems++;
                    } else if (product.currentStock <= product.minStock) {
                        lowStockItems++;
                    }
                }
            });
        }

        // Fetch pending payment requests
        const requestsRef = ref(db, `businesses/${businessId}/finances/paymentRequests`);
        const requestsSnap = await get(requestsRef);

        let pendingOrders = 0;
        let previousPendingOrders = 0;

        if (requestsSnap.exists()) {
            const requests = requestsSnap.val();
            Object.values(requests).forEach(request => {
                if (request.status === 'pending') {
                    pendingOrders++;
                }
            });
        }

        const ordersChange = previousPendingOrders - pendingOrders;

        // Update stats with real data
        updateStats({
            todaysSales: todaysSales,
            salesChange: parseFloat(salesChange),
            totalTransactions: totalTransactionsToday,
            transactionsChange: parseFloat(transactionsChange),
            lowStockItems: lowStockItems,
            criticalItems: criticalItems,
            pendingOrders: pendingOrders,
            ordersChange: ordersChange
        });

        // Load real transactions
        await loadRecentTransactions();

    } catch (error) {
        console.error('Error loading stats:', error);
        // Still show some data even if there's an error
        updateStats({
            todaysSales: 0,
            salesChange: 0,
            totalTransactions: 0,
            transactionsChange: 0,
            lowStockItems: 0,
            criticalItems: 0,
            pendingOrders: 0,
            ordersChange: 0
        });
    }
}

// Update statistics on dashboard
function updateStats(stats) {
    const currency = businessData?.currency || 'R';

    // Today's Sales
    const todaysSalesEl = document.getElementById('todaysSales');
    if (todaysSalesEl) {
        todaysSalesEl.textContent =
            `${currency} ${stats.todaysSales.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    const salesChangeEl = document.getElementById('salesChange');
    if (salesChangeEl) {
        const changeText = stats.salesChange >= 0 ? `+${stats.salesChange}%` : `${stats.salesChange}%`;
        salesChangeEl.textContent = `${changeText} vs yesterday`;
        salesChangeEl.className = stats.salesChange >= 0 ? 'stat-change positive' : 'stat-change negative';
    }

    // Total Transactions
    const totalTransactionsEl = document.getElementById('totalTransactions');
    if (totalTransactionsEl) {
        totalTransactionsEl.textContent = stats.totalTransactions;
    }

    const transactionsChangeEl = document.getElementById('transactionsChange');
    if (transactionsChangeEl) {
        const changeText = stats.transactionsChange >= 0 ? `+${stats.transactionsChange}%` : `${stats.transactionsChange}%`;
        transactionsChangeEl.textContent = `${changeText} vs yesterday`;
        transactionsChangeEl.className = stats.transactionsChange >= 0 ? 'stat-change positive' : 'stat-change negative';
    }

    // Low Stock Items
    const lowStockItemsEl = document.getElementById('lowStockItems');
    if (lowStockItemsEl) {
        lowStockItemsEl.textContent = stats.lowStockItems;
    }

    const criticalItemsEl = document.getElementById('criticalItems');
    if (criticalItemsEl) {
        criticalItemsEl.textContent = `${stats.criticalItems} items critical`;
    }

    // Pending Orders
    const pendingOrdersEl = document.getElementById('pendingOrders');
    if (pendingOrdersEl) {
        pendingOrdersEl.textContent = stats.pendingOrders;
    }

    const ordersChangeEl = document.getElementById('ordersChange');
    if (ordersChangeEl) {
        const changeText = stats.ordersChange >= 0
            ? `${stats.ordersChange} less than yesterday`
            : `${Math.abs(stats.ordersChange)} more than yesterday`;
        ordersChangeEl.textContent = changeText;
    }

    // Update notification badge
    const notificationBadgeEl = document.getElementById('notificationBadge');
    if (notificationBadgeEl) {
        const totalNotifications = stats.lowStockItems + stats.pendingOrders;
        notificationBadgeEl.textContent = totalNotifications;
        notificationBadgeEl.style.display = totalNotifications > 0 ? 'flex' : 'none';
    }
}

// Load recent transactions with real data
async function loadRecentTransactions() {
    const tableBody = document.getElementById('transactionsTableBody');
    if (!tableBody) return;

    const currency = businessData?.currency || 'R';

    try {
        const businessId = businessData.businessId;
        const salesRef = ref(db, `businesses/${businessId}/sales`);
        const salesSnap = await get(salesRef);

        if (!salesSnap.exists()) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem; color: #94a3b8;">
                        <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                        No transactions yet
                    </td>
                </tr>
            `;
            return;
        }

        const allSales = salesSnap.val();

        // Convert to array and sort by date (most recent first)
        const salesArray = Object.entries(allSales).map(([id, sale]) => ({
            id: id,
            ...sale
        })).sort((a, b) => new Date(b.soldAt) - new Date(a.soldAt));

        // Get last 10 transactions
        const recentTransactions = salesArray.slice(0, 10);

        if (recentTransactions.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem; color: #94a3b8;">
                        <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                        No transactions yet
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = recentTransactions.map(transaction => {
            const date = new Date(transaction.soldAt);
            const formattedDate = date.toLocaleDateString('en-ZA', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const itemCount = transaction.items ? transaction.items.length : 0;
            const status = 'completed'; // You can add status field in your sale records if needed

            return `
                <tr>
                    <td class="transaction-id">#${transaction.receiptNumber || transaction.id.substring(0, 8)}</td>
                    <td>${transaction.soldByName || transaction.branchName || 'N/A'}</td>
                    <td>${formattedDate}</td>
                    <td>${itemCount} item${itemCount !== 1 ? 's' : ''}</td>
                    <td>${currency} ${transaction.total.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                    <td>${transaction.paymentMethod ? transaction.paymentMethod.charAt(0).toUpperCase() + transaction.paymentMethod.slice(1) : 'N/A'}</td>
                    <td><span class="status-badge ${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading transactions:', error);
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    Failed to load transactions
                </td>
            </tr>
        `;
    }
}

// ===== MOBILE MENU TOGGLE (HAMBURGER STYLE) =====
const hamburger = document.getElementById('menuToggle');
const navMenu = document.getElementById('sidebar');

if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');

        // Animate hamburger icon
        hamburger.classList.toggle('active');
    });

    // Close menu when clicking on a link
    document.querySelectorAll('.sidebar .menu-link').forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            hamburger.classList.remove('active');
        });
    });
}

// Add hamburger animation styles
const style = document.createElement('style');
style.textContent = `
    /* Hamburger icon animation */
    .menu-toggle {
        transition: transform 0.3s ease;
    }
    
    .menu-toggle.active {
        transform: rotate(90deg);
    }
    
    .menu-toggle i {
        transition: all 0.3s ease;
    }
    
    /* Optional: Add hamburger bars animation if you want to convert icon to X */
    .menu-toggle.active i::before {
        transform: rotate(45deg) translate(5px, 5px);
    }
    
    .menu-toggle.active i::after {
        transform: rotate(-45deg) translate(7px, -6px);
    }
`;
document.head.appendChild(style);
// ===== END MOBILE MENU TOGGLE =====

// Filter buttons
const filterBtns = document.querySelectorAll('.filter-btn');
filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const period = btn.dataset.period;
        console.log('Filter changed to:', period);
        // Here you would reload chart data based on the selected period
        // You can implement this to filter sales by week, month, or year
    });
});

// Logout functionality
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        if (confirm('Are you sure you want to logout?')) {
            try {
                await signOut(auth);
                window.location.href = '../Index.html';
            } catch (error) {
                console.error('Logout error:', error);
                alert('Failed to logout. Please try again.');
            }
        }
    });
}

// Search functionality
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        console.log('Searching for:', searchTerm);
        // Implement search logic here - you can search through transactions
        // or other data displayed on the dashboard
    });
}

// Real-time updates listener
function setupRealtimeListeners() {
    if (!currentUser || !businessData) return;

    const businessId = businessData.businessId;

    // Listen for sales updates
    const salesRef = ref(db, `businesses/${businessId}/sales`);
    onValue(salesRef, (snapshot) => {
        if (snapshot.exists()) {
            console.log('Sales data updated - refreshing dashboard...');
            loadDashboardStats();
        }
    });

    // Listen for inventory updates
    const inventoryRef = ref(db, `businesses/${businessId}/inventory/products`);
    onValue(inventoryRef, (snapshot) => {
        if (snapshot.exists()) {
            console.log('Inventory data updated - refreshing stats...');
            loadDashboardStats();
        }
    });

    // Listen for payment request updates
    const requestsRef = ref(db, `businesses/${businessId}/finances/paymentRequests`);
    onValue(requestsRef, (snapshot) => {
        console.log('Payment requests updated - refreshing stats...');
        loadDashboardStats();
    });
}

// Initialize real-time listeners after dashboard loads
setTimeout(() => {
    setupRealtimeListeners();
}, 2000);

console.log('BongoBoss POS - Owner Dashboard with Real Data Initialized ✓');