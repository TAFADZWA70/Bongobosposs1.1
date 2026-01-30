import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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
 * SALES MANAGEMENT MODULE
 * Handles fetching, filtering, and analyzing sales data
 */

// Global variables
let currentUser = null;
let userData = null;
let businessId = null;
let businessData = null;
let allSales = {};
let allBranches = {};

// Initialize the sales module
export function initSalesModule(user, userDataObj, businessIdStr, businessDataObj, branches) {
    currentUser = user;
    userData = userDataObj;
    businessId = businessIdStr;
    businessData = businessDataObj;
    allBranches = branches;
}

// Load all sales from Firebase
export async function loadAllSales() {
    try {
        const salesRef = ref(db, `businesses/${businessId}/sales`);
        const snapshot = await get(salesRef);

        if (snapshot.exists()) {
            allSales = snapshot.val();
            console.log('Sales loaded:', Object.keys(allSales).length);
            return allSales;
        } else {
            allSales = {};
            return {};
        }
    } catch (error) {
        console.error('Error loading sales:', error);
        return {};
    }
}

// Get sales for a specific date
export function getSalesForDate(date, branchId = 'all') {
    const targetDate = typeof date === 'string' ? date : date.toISOString().split('T')[0];

    return Object.entries(allSales)
        .filter(([_, sale]) => {
            const saleDate = new Date(sale.soldAt || sale.date).toISOString().split('T')[0];
            const matchesDate = saleDate === targetDate;
            const matchesBranch = branchId === 'all' || sale.branchId === branchId;

            return matchesDate && matchesBranch;
        })
        .map(([saleId, sale]) => ({ saleId, ...sale }))
        .sort((a, b) => new Date(b.soldAt || b.date) - new Date(a.soldAt || a.date));
}

// Get sales for a date range
export function getSalesForDateRange(startDate, endDate, branchId = 'all') {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return Object.entries(allSales)
        .filter(([_, sale]) => {
            const saleDate = new Date(sale.soldAt || sale.date);
            const matchesDate = saleDate >= start && saleDate <= end;
            const matchesBranch = branchId === 'all' || sale.branchId === branchId;

            return matchesDate && matchesBranch;
        })
        .map(([saleId, sale]) => ({ saleId, ...sale }))
        .sort((a, b) => new Date(b.soldAt || b.date) - new Date(a.soldAt || a.date));
}

// Get today's sales
export function getTodaysSales(branchId = 'all') {
    const today = new Date().toISOString().split('T')[0];
    return getSalesForDate(today, branchId);
}

// Calculate sales summary for a period
export function calculateSalesSummary(sales) {
    const summary = {
        totalSales: sales.length,
        totalRevenue: 0,
        totalCash: 0,
        totalCard: 0,
        totalEWallet: 0,
        totalChangeGiven: 0,
        totalTax: 0,
        totalCost: 0,
        averageTransaction: 0,
        cashSales: 0,
        cardSales: 0,
        ewalletSales: 0,
        itemsSold: 0,
        uniqueProducts: new Set(),
        salesByHour: {},
        topProducts: {},
        grossProfit: 0
    };

    sales.forEach(sale => {
        // Revenue
        summary.totalRevenue += sale.total || 0;
        summary.totalTax += sale.tax || 0;

        // Payment methods
        if (sale.paymentMethod === 'cash') {
            summary.totalCash += sale.total || 0;
            summary.cashSales++;
            summary.totalChangeGiven += sale.change || 0;
        } else if (sale.paymentMethod === 'card') {
            summary.totalCard += sale.total || 0;
            summary.cardSales++;
        } else if (sale.paymentMethod === 'ewallet') {
            summary.totalEWallet += sale.total || 0;
            summary.ewalletSales++;
        }

        // Items analysis
        if (sale.items && Array.isArray(sale.items)) {
            sale.items.forEach(item => {
                summary.itemsSold += item.quantity || 0;
                summary.uniqueProducts.add(item.productId);

                // Cost calculation
                const itemCost = (item.costPrice || 0) * (item.quantity || 0);
                summary.totalCost += itemCost;

                // Top products
                if (!summary.topProducts[item.productId]) {
                    summary.topProducts[item.productId] = {
                        name: item.productName,
                        quantity: 0,
                        revenue: 0
                    };
                }
                summary.topProducts[item.productId].quantity += item.quantity || 0;
                summary.topProducts[item.productId].revenue += item.subtotal || 0;
            });
        }

        // Sales by hour
        const saleDate = new Date(sale.soldAt || sale.date);
        const hour = saleDate.getHours();
        summary.salesByHour[hour] = (summary.salesByHour[hour] || 0) + 1;
    });

    // Calculate averages and profits
    summary.averageTransaction = summary.totalSales > 0 ? summary.totalRevenue / summary.totalSales : 0;
    summary.grossProfit = summary.totalRevenue - summary.totalCost;
    summary.uniqueProductCount = summary.uniqueProducts.size;

    // Convert top products to array and sort
    summary.topProductsArray = Object.entries(summary.topProducts)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    return summary;
}

// Get sales by payment method
export function getSalesByPaymentMethod(sales) {
    return {
        cash: sales.filter(s => s.paymentMethod === 'cash'),
        card: sales.filter(s => s.paymentMethod === 'card'),
        ewallet: sales.filter(s => s.paymentMethod === 'ewallet')
    };
}

// Get sales by branch
export function getSalesByBranch(sales) {
    const byBranch = {};

    sales.forEach(sale => {
        const branchId = sale.branchId;
        if (!byBranch[branchId]) {
            byBranch[branchId] = {
                branchName: sale.branchName || allBranches[branchId]?.branchName || 'Unknown',
                sales: [],
                totalRevenue: 0,
                totalSales: 0
            };
        }

        byBranch[branchId].sales.push(sale);
        byBranch[branchId].totalRevenue += sale.total || 0;
        byBranch[branchId].totalSales++;
    });

    return byBranch;
}

// Get hourly sales distribution
export function getHourlySalesDistribution(sales) {
    const hourlyData = Array(24).fill(0).map((_, i) => ({
        hour: i,
        sales: 0,
        revenue: 0
    }));

    sales.forEach(sale => {
        const saleDate = new Date(sale.soldAt || sale.date);
        const hour = saleDate.getHours();

        if (hour >= 0 && hour < 24) {
            hourlyData[hour].sales++;
            hourlyData[hour].revenue += sale.total || 0;
        }
    });

    return hourlyData;
}

// Get peak sales hours
export function getPeakSalesHours(sales, topN = 3) {
    const hourlyData = getHourlySalesDistribution(sales);

    return hourlyData
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, topN)
        .map(data => ({
            hour: data.hour,
            timeRange: `${data.hour.toString().padStart(2, '0')}:00 - ${(data.hour + 1).toString().padStart(2, '0')}:00`,
            sales: data.sales,
            revenue: data.revenue
        }));
}

// Search sales by receipt number or customer
export function searchSales(searchTerm) {
    const term = searchTerm.toLowerCase().trim();

    return Object.entries(allSales)
        .filter(([_, sale]) => {
            const receiptNumber = (sale.receiptNumber || '').toLowerCase();
            const customerName = (sale.customerName || '').toLowerCase();

            return receiptNumber.includes(term) || customerName.includes(term);
        })
        .map(([saleId, sale]) => ({ saleId, ...sale }))
        .sort((a, b) => new Date(b.soldAt || b.date) - new Date(a.soldAt || a.date));
}

// Get sale details by ID
export function getSaleById(saleId) {
    return allSales[saleId] ? { saleId, ...allSales[saleId] } : null;
}

// Format currency
export function formatCurrency(amount) {
    const currency = businessData?.currency || 'R';
    return `${currency} ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format date
export function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format time
export function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-ZA', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

// Format full date and time
export function formatDateTime(dateString) {
    return `${formatDate(dateString)} ${formatTime(dateString)}`;
}

// Export data for external use
export function getAllSalesData() {
    return allSales;
}

// Get sales count for date
export function getSalesCount(date, branchId = 'all') {
    return getSalesForDate(date, branchId).length;
}

// Get revenue for date
export function getRevenue(date, branchId = 'all') {
    const sales = getSalesForDate(date, branchId);
    return sales.reduce((total, sale) => total + (sale.total || 0), 0);
}

// Get change given for date
export function getChangeGiven(date, branchId = 'all') {
    const sales = getSalesForDate(date, branchId);
    return sales
        .filter(sale => sale.paymentMethod === 'cash')
        .reduce((total, sale) => total + (sale.change || 0), 0);
}

// Generate sales report for display
export function generateSalesReport(startDate, endDate, branchId = 'all') {
    const sales = getSalesForDateRange(startDate, endDate, branchId);
    const summary = calculateSalesSummary(sales);
    const byBranch = getSalesByBranch(sales);
    const peakHours = getPeakSalesHours(sales);

    return {
        sales,
        summary,
        byBranch,
        peakHours,
        startDate,
        endDate,
        branchId
    };
}

console.log('BongoBoss POS - Sales Module Initialized ✓');