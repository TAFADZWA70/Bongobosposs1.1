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
        welcomeMessage.textContent = `Welcome back to ${businessData.businessName}!`;
    }
}

// Load dashboard statistics
async function loadDashboardStats() {
    try {
        // In a real app, you would fetch actual data from Firebase
        // For now, we'll use sample data

        // You can implement these functions to fetch real data:
        // - getTodaysSales()
        // - getTotalTransactions()
        // - getLowStockItems()
        // - getPendingOrders()
        // - getRecentTransactions()

        // Example with sample data:
        updateStats({
            todaysSales: 24580.50,
            salesChange: 12.5,
            totalTransactions: 156,
            transactionsChange: 8.2,
            lowStockItems: 23,
            criticalItems: 5,
            pendingOrders: 12,
            ordersChange: 3
        });

        // Load sample transactions
        loadRecentTransactions();

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Update statistics on dashboard
function updateStats(stats) {
    const currency = businessData?.currency || 'R';

    // Today's Sales
    document.getElementById('todaysSales').textContent =
        `${currency} ${stats.todaysSales.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('salesChange').textContent =
        `${stats.salesChange}% vs yesterday`;

    // Total Transactions
    document.getElementById('totalTransactions').textContent = stats.totalTransactions;
    document.getElementById('transactionsChange').textContent =
        `${stats.transactionsChange}% vs yesterday`;

    // Low Stock Items
    document.getElementById('lowStockItems').textContent = stats.lowStockItems;
    document.getElementById('criticalItems').textContent =
        `${stats.criticalItems} items critical`;

    // Pending Orders
    document.getElementById('pendingOrders').textContent = stats.pendingOrders;
    document.getElementById('ordersChange').textContent =
        `${stats.ordersChange} less than yesterday`;

    // Update notification badge
    const totalNotifications = stats.lowStockItems + stats.pendingOrders;
    document.getElementById('notificationBadge').textContent = totalNotifications;
}

// Load recent transactions
function loadRecentTransactions() {
    const tableBody = document.getElementById('transactionsTableBody');
    const currency = businessData?.currency || 'R';

    // Sample transactions - replace with real data from Firebase
    const sampleTransactions = [
        {
            id: '#TXN-0156',
            customer: 'John Doe',
            date: 'Jan 26, 2026 14:32',
            items: 5,
            amount: 458.50,
            payment: 'Card',
            status: 'completed'
        },
        {
            id: '#TXN-0155',
            customer: 'Jane Smith',
            date: 'Jan 26, 2026 14:15',
            items: 3,
            amount: 289.00,
            payment: 'Cash',
            status: 'completed'
        },
        {
            id: '#TXN-0154',
            customer: 'Mike Johnson',
            date: 'Jan 26, 2026 13:45',
            items: 8,
            amount: 1245.00,
            payment: 'Card',
            status: 'pending'
        },
        {
            id: '#TXN-0153',
            customer: 'Sarah Williams',
            date: 'Jan 26, 2026 13:20',
            items: 2,
            amount: 156.50,
            payment: 'Cash',
            status: 'completed'
        },
        {
            id: '#TXN-0152',
            customer: 'David Brown',
            date: 'Jan 26, 2026 12:58',
            items: 4,
            amount: 378.00,
            payment: 'Card',
            status: 'refunded'
        }
    ];

    if (sampleTransactions.length === 0) {
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

    tableBody.innerHTML = sampleTransactions.map(transaction => `
        <tr>
            <td class="transaction-id">${transaction.id}</td>
            <td>${transaction.customer}</td>
            <td>${transaction.date}</td>
            <td>${transaction.items} items</td>
            <td>${currency} ${transaction.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
            <td>${transaction.payment}</td>
            <td><span class="status-badge ${transaction.status}">${transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}</span></td>
        </tr>
    `).join('');
}

// Mobile menu toggle
document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('active');
});

// Filter buttons
const filterBtns = document.querySelectorAll('.filter-btn');
filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const period = btn.dataset.period;
        console.log('Filter changed to:', period);
        // Here you would reload chart data based on the selected period
    });
});

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', async (e) => {
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

// Search functionality
document.getElementById('searchInput').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    console.log('Searching for:', searchTerm);
    // Implement search logic here
});

// Real-time updates listener (optional)
function setupRealtimeListeners() {
    if (!currentUser || !businessData) return;

    // Listen for sales updates
    const salesRef = ref(db, `sales/${businessData.businessId}`);
    onValue(salesRef, (snapshot) => {
        if (snapshot.exists()) {
            // Update dashboard with new sales data
            console.log('Sales data updated');
            loadDashboardStats();
        }
    });

    // Listen for inventory updates
    const inventoryRef = ref(db, `inventory/${businessData.businessId}`);
    onValue(inventoryRef, (snapshot) => {
        if (snapshot.exists()) {
            // Update low stock alerts
            console.log('Inventory data updated');
        }
    });
}

// Initialize real-time listeners after dashboard loads
setTimeout(() => {
    setupRealtimeListeners();
}, 2000);