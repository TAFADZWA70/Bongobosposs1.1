import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, remove } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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
 * STOCK FOLLOW-UP SYSTEM
 * 
 * DATABASE STRUCTURE:
 * /businesses/{businessId}/inventory/
 *   ├── stockLosses/{lossId}
 *   │   ├── productId
 *   │   ├── productName
 *   │   ├── lossType (damaged, stolen, expired, other)
 *   │   ├── quantity
 *   │   ├── unit
 *   │   ├── costValue (quantity * costPrice at time of loss)
 *   │   ├── sellValue (quantity * sellPrice at time of loss)
 *   │   ├── reason
 *   │   ├── notes
 *   │   ├── branchId
 *   │   ├── branchName
 *   │   ├── reportedBy
 *   │   ├── reportedByName
 *   │   ├── reportedAt
 *   │   ├── approvedBy (optional)
 *   │   ├── approvedAt (optional)
 *   │   └── status (pending, approved, rejected)
 *   │
 *   └── weeklyReports/{reportId}
 *       ├── weekStartDate
 *       ├── weekEndDate
 *       ├── branchId (or "all" for consolidated)
 *       ├── branchName
 *       ├── totalProducts
 *       ├── totalUnits
 *       ├── totalCostValue
 *       ├── totalSellValue
 *       ├── potentialProfit
 *       ├── totalLosses
 *       ├── lossValue
 *       ├── lossesByType { damaged, stolen, expired, other }
 *       ├── lowStockItems
 *       ├── outOfStockItems
 *       ├── topValueProducts (top 10 by value)
 *       ├── categoryBreakdown
 *       ├── generatedBy
 *       ├── generatedByName
 *       └── generatedAt
 */

// Global variables
let currentUser = null;
let userData = null;
let businessId = null;
let businessData = null;
let allProducts = {};
let allBranches = {};
let allCategories = {};
let allStockLosses = {};
let weeklyReports = {};

// Generate clean ID from email
function generateCleanId(email) {
    const username = email.split('@')[0];
    return username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

// Initialize the module
export function initStockFollowUp(user, userDataObj, businessIdStr, businessDataObj, products, branches, categories) {
    currentUser = user;
    userData = userDataObj;
    businessId = businessIdStr;
    businessData = businessDataObj;
    allProducts = products;
    allBranches = branches;
    allCategories = categories;

    loadStockLosses();
    loadWeeklyReports();
}

// Load all stock losses
async function loadStockLosses() {
    try {
        const lossesRef = ref(db, `businesses/${businessId}/inventory/stockLosses`);
        const snapshot = await get(lossesRef);

        if (snapshot.exists()) {
            allStockLosses = snapshot.val();
        } else {
            allStockLosses = {};
        }

        updateLossesDisplay();
    } catch (error) {
        console.error('Error loading stock losses:', error);
    }
}

// Load weekly reports
async function loadWeeklyReports() {
    try {
        const reportsRef = ref(db, `businesses/${businessId}/inventory/weeklyReports`);
        const snapshot = await get(reportsRef);

        if (snapshot.exists()) {
            weeklyReports = snapshot.val();
        } else {
            weeklyReports = {};
        }

        updateReportsDisplay();
    } catch (error) {
        console.error('Error loading weekly reports:', error);
    }
}

// Report stock loss
export async function reportStockLoss(lossData) {
    try {
        const product = allProducts[lossData.productId];
        if (!product) {
            throw new Error('Product not found');
        }

        const costValue = lossData.quantity * product.costPrice;
        const sellValue = lossData.quantity * product.sellPrice;

        const lossRecord = {
            productId: lossData.productId,
            productName: product.productName,
            lossType: lossData.lossType,
            quantity: lossData.quantity,
            unit: product.unit,
            costValue: costValue,
            sellValue: sellValue,
            reason: lossData.reason,
            notes: lossData.notes || '',
            branchId: product.branchId,
            branchName: product.branchName,
            reportedBy: generateCleanId(currentUser.email),
            reportedByName: userData.displayName,
            reportedAt: new Date().toISOString(),
            status: 'pending'
        };

        const lossesRef = ref(db, `businesses/${businessId}/inventory/stockLosses`);
        const newLossRef = push(lossesRef);

        await set(newLossRef, lossRecord);

        // Update product stock (deduct loss)
        const productRef = ref(db, `businesses/${businessId}/inventory/products/${lossData.productId}`);
        const newStock = Math.max(0, product.currentStock - lossData.quantity);

        await update(productRef, {
            currentStock: newStock,
            lastModifiedBy: userData.displayName,
            lastModifiedAt: new Date().toISOString()
        });

        // Log in inventory history
        const historyRef = ref(db, `businesses/${businessId}/inventory/history`);
        const newHistoryRef = push(historyRef);

        await set(newHistoryRef, {
            productId: lossData.productId,
            productName: product.productName,
            action: 'stock-loss',
            field: 'currentStock',
            oldValue: `${product.currentStock} ${product.unit}`,
            newValue: `${newStock} ${product.unit}`,
            notes: `${lossData.lossType}: ${lossData.reason} (${lossData.quantity} ${product.unit} lost)`,
            changedBy: generateCleanId(currentUser.email),
            changedByName: userData.displayName,
            timestamp: new Date().toISOString()
        });

        await loadStockLosses();

        return { success: true, lossId: newLossRef.key };

    } catch (error) {
        console.error('Error reporting stock loss:', error);
        throw error;
    }
}

// Approve stock loss (owner/admin only)
export async function approveStockLoss(lossId) {
    try {
        const lossRef = ref(db, `businesses/${businessId}/inventory/stockLosses/${lossId}`);

        await update(lossRef, {
            status: 'approved',
            approvedBy: generateCleanId(currentUser.email),
            approvedAt: new Date().toISOString()
        });

        await loadStockLosses();

        return { success: true };

    } catch (error) {
        console.error('Error approving stock loss:', error);
        throw error;
    }
}

// Reject stock loss (owner/admin only)
export async function rejectStockLoss(lossId, reason) {
    try {
        const loss = allStockLosses[lossId];
        if (!loss) throw new Error('Loss record not found');

        const lossRef = ref(db, `businesses/${businessId}/inventory/stockLosses/${lossId}`);

        await update(lossRef, {
            status: 'rejected',
            rejectedBy: generateCleanId(currentUser.email),
            rejectedAt: new Date().toISOString(),
            rejectionReason: reason
        });

        // Restore stock if rejected
        const product = allProducts[loss.productId];
        if (product) {
            const productRef = ref(db, `businesses/${businessId}/inventory/products/${loss.productId}`);
            const restoredStock = product.currentStock + loss.quantity;

            await update(productRef, {
                currentStock: restoredStock,
                lastModifiedBy: userData.displayName,
                lastModifiedAt: new Date().toISOString()
            });

            // Log restoration
            const historyRef = ref(db, `businesses/${businessId}/inventory/history`);
            const newHistoryRef = push(historyRef);

            await set(newHistoryRef, {
                productId: loss.productId,
                productName: loss.productName,
                action: 'stock-restored',
                field: 'currentStock',
                oldValue: `${product.currentStock} ${product.unit}`,
                newValue: `${restoredStock} ${product.unit}`,
                notes: `Stock loss rejected and restored: ${reason}`,
                changedBy: generateCleanId(currentUser.email),
                changedByName: userData.displayName,
                timestamp: new Date().toISOString()
            });
        }

        await loadStockLosses();

        return { success: true };

    } catch (error) {
        console.error('Error rejecting stock loss:', error);
        throw error;
    }
}

// Delete stock loss record
export async function deleteStockLoss(lossId) {
    try {
        const lossRef = ref(db, `businesses/${businessId}/inventory/stockLosses/${lossId}`);
        await remove(lossRef);

        await loadStockLosses();

        return { success: true };

    } catch (error) {
        console.error('Error deleting stock loss:', error);
        throw error;
    }
}

// Generate weekly inventory report
export async function generateWeeklyReport(branchId = 'all', customDateRange = null) {
    try {
        let weekStart, weekEnd;

        if (customDateRange) {
            weekStart = new Date(customDateRange.start);
            weekEnd = new Date(customDateRange.end);
        } else {
            // Default: current week (Monday to Sunday)
            const now = new Date();
            const dayOfWeek = now.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust to Monday

            weekStart = new Date(now);
            weekStart.setDate(now.getDate() + diff);
            weekStart.setHours(0, 0, 0, 0);

            weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);
        }

        // Filter products by branch if specified
        let productsToAnalyze = Object.entries(allProducts);
        if (branchId !== 'all') {
            productsToAnalyze = productsToAnalyze.filter(([_, p]) => p.branchId === branchId);
        }

        // Calculate totals
        let totalProducts = productsToAnalyze.length;
        let totalUnits = 0;
        let totalCostValue = 0;
        let totalSellValue = 0;
        let lowStockItems = 0;
        let outOfStockItems = 0;

        const categoryBreakdown = {};
        const topValueProducts = [];

        productsToAnalyze.forEach(([productId, product]) => {
            const units = product.currentStock || 0;
            const costValue = units * product.costPrice;
            const sellValue = units * product.sellPrice;

            totalUnits += units;
            totalCostValue += costValue;
            totalSellValue += sellValue;

            if (units === 0) outOfStockItems++;
            else if (units <= product.minStock) lowStockItems++;

            // Category breakdown
            const categoryName = allCategories[product.category]?.categoryName || 'Uncategorized';
            if (!categoryBreakdown[categoryName]) {
                categoryBreakdown[categoryName] = {
                    products: 0,
                    units: 0,
                    costValue: 0,
                    sellValue: 0
                };
            }
            categoryBreakdown[categoryName].products++;
            categoryBreakdown[categoryName].units += units;
            categoryBreakdown[categoryName].costValue += costValue;
            categoryBreakdown[categoryName].sellValue += sellValue;

            // Track for top products
            topValueProducts.push({
                productId,
                productName: product.productName,
                units,
                costValue,
                sellValue,
                potentialProfit: sellValue - costValue
            });
        });

        // Sort and get top 10 by value
        topValueProducts.sort((a, b) => b.sellValue - a.sellValue);
        const top10Products = topValueProducts.slice(0, 10);

        // Calculate losses for the week
        const lossesInWeek = Object.entries(allStockLosses).filter(([_, loss]) => {
            const lossDate = new Date(loss.reportedAt);
            return lossDate >= weekStart && lossDate <= weekEnd &&
                (branchId === 'all' || loss.branchId === branchId);
        });

        let totalLosses = 0;
        let lossValue = 0;
        const lossesByType = {
            damaged: { count: 0, value: 0 },
            stolen: { count: 0, value: 0 },
            expired: { count: 0, value: 0 },
            other: { count: 0, value: 0 }
        };

        lossesInWeek.forEach(([_, loss]) => {
            totalLosses += loss.quantity;
            lossValue += loss.costValue;

            if (lossesByType[loss.lossType]) {
                lossesByType[loss.lossType].count += loss.quantity;
                lossesByType[loss.lossType].value += loss.costValue;
            }
        });

        const potentialProfit = totalSellValue - totalCostValue;

        // Create report object
        const reportData = {
            weekStartDate: weekStart.toISOString(),
            weekEndDate: weekEnd.toISOString(),
            branchId: branchId,
            branchName: branchId === 'all' ? 'All Branches' : allBranches[branchId]?.branchName || 'Unknown',
            totalProducts,
            totalUnits,
            totalCostValue,
            totalSellValue,
            potentialProfit,
            totalLosses,
            lossValue,
            lossesByType,
            lowStockItems,
            outOfStockItems,
            topValueProducts: top10Products,
            categoryBreakdown,
            generatedBy: generateCleanId(currentUser.email),
            generatedByName: userData.displayName,
            generatedAt: new Date().toISOString()
        };

        // Save report to database
        const reportsRef = ref(db, `businesses/${businessId}/inventory/weeklyReports`);
        const newReportRef = push(reportsRef);

        await set(newReportRef, reportData);

        await loadWeeklyReports();

        return { success: true, reportId: newReportRef.key, reportData };

    } catch (error) {
        console.error('Error generating weekly report:', error);
        throw error;
    }
}

// Get summary of current inventory value
export function getCurrentInventorySummary(branchId = 'all') {
    let productsToAnalyze = Object.entries(allProducts);
    if (branchId !== 'all') {
        productsToAnalyze = productsToAnalyze.filter(([_, p]) => p.branchId === branchId);
    }

    let totalProducts = productsToAnalyze.length;
    let totalUnits = 0;
    let totalCostValue = 0;
    let totalSellValue = 0;

    productsToAnalyze.forEach(([_, product]) => {
        const units = product.currentStock || 0;
        totalUnits += units;
        totalCostValue += units * product.costPrice;
        totalSellValue += units * product.sellPrice;
    });

    const potentialProfit = totalSellValue - totalCostValue;

    return {
        totalProducts,
        totalUnits,
        totalCostValue,
        totalSellValue,
        potentialProfit,
        branchName: branchId === 'all' ? 'All Branches' : allBranches[branchId]?.branchName || 'Unknown'
    };
}

// Get losses summary
export function getLossesSummary(period = 'week', branchId = 'all') {
    const now = new Date();
    let startDate;

    if (period === 'week') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
    } else if (period === 'year') {
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
    } else {
        startDate = new Date(0); // All time
    }

    const relevantLosses = Object.entries(allStockLosses).filter(([_, loss]) => {
        const lossDate = new Date(loss.reportedAt);
        return lossDate >= startDate &&
            (branchId === 'all' || loss.branchId === branchId);
    });

    let totalLosses = 0;
    let totalCostValue = 0;
    let totalSellValue = 0;
    const lossesByType = {
        damaged: { count: 0, costValue: 0, sellValue: 0 },
        stolen: { count: 0, costValue: 0, sellValue: 0 },
        expired: { count: 0, costValue: 0, sellValue: 0 },
        other: { count: 0, costValue: 0, sellValue: 0 }
    };

    relevantLosses.forEach(([_, loss]) => {
        totalLosses += loss.quantity;
        totalCostValue += loss.costValue;
        totalSellValue += loss.sellValue;

        if (lossesByType[loss.lossType]) {
            lossesByType[loss.lossType].count += loss.quantity;
            lossesByType[loss.lossType].costValue += loss.costValue;
            lossesByType[loss.lossType].sellValue += loss.sellValue;
        }
    });

    return {
        period,
        totalLosses,
        totalCostValue,
        totalSellValue,
        lostProfit: totalSellValue - totalCostValue,
        lossesByType,
        recordCount: relevantLosses.length
    };
}

// Format currency
function formatCurrency(amount) {
    const currency = businessData?.currency || 'R';
    return `${currency} ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Update losses display (to be called from main inventory.js)
function updateLossesDisplay() {
    // This will be implemented in the HTML/UI integration
    console.log('Stock losses loaded:', Object.keys(allStockLosses).length);
}

// Update reports display (to be called from main inventory.js)
function updateReportsDisplay() {
    // This will be implemented in the HTML/UI integration
    console.log('Weekly reports loaded:', Object.keys(weeklyReports).length);
}

// Export data for external use
export function getStockLossesData() {
    return allStockLosses;
}

export function getWeeklyReportsData() {
    return weeklyReports;
}

// Automatic weekly report generation (can be scheduled)
export async function autoGenerateWeeklyReports() {
    try {
        // Generate report for each branch
        const branchIds = Object.keys(allBranches);

        for (const branchId of branchIds) {
            await generateWeeklyReport(branchId);
        }

        // Generate consolidated report for all branches
        await generateWeeklyReport('all');

        console.log('Automatic weekly reports generated successfully');

        return { success: true };

    } catch (error) {
        console.error('Error generating automatic reports:', error);
        throw error;
    }
}

console.log('BongoBoss POS - Stock Follow-Up Module Initialized ✓');