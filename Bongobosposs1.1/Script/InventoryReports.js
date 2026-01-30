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
 * INVENTORY REPORTS & ANALYTICS MODULE
 * 
 * Tracks and analyzes:
 * - Stock movements (sales, losses, adjustments, restocks)
 * - Sales timing patterns (hourly, daily, peak hours)
 * - Product velocity (fast/medium/slow moving)
 * - Stock turnover ratios
 */

// Global variables (will be set from main inventory.js)
let currentUser = null;
let userData = null;
let businessId = null;
let businessData = null;
let allProducts = {};
let allBranches = {};
let allCategories = {};

// Initialize reports module
export function initInventoryReports(user, userDataObj, bizId, bizData, products, branches, categories) {
    currentUser = user;
    userData = userDataObj;
    businessId = bizId;
    businessData = bizData;
    allProducts = products;
    allBranches = branches;
    allCategories = categories;

    console.log('Inventory Reports Module Initialized ✓');
    setupReportsUI();
}

// Setup reports UI
function setupReportsUI() {
    // Open reports modal
    const inventoryReportsBtn = document.getElementById('inventoryReportsBtn');
    if (inventoryReportsBtn) {
        inventoryReportsBtn.addEventListener('click', () => {
            document.getElementById('inventoryReportsModal').classList.add('active');
            populateReportFilters();
        });
    }

    // Close reports modal
    const closeInventoryReportsModal = document.getElementById('closeInventoryReportsModal');
    if (closeInventoryReportsModal) {
        closeInventoryReportsModal.addEventListener('click', () => {
            document.getElementById('inventoryReportsModal').classList.remove('active');
        });
    }

    // Report tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const reportType = btn.dataset.report;
            switchReport(reportType);
        });
    });

    // Generate report buttons
    setupReportGenerators();
}

// Switch between report types
function switchReport(reportType) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.report === reportType) {
            btn.classList.add('active');
        }
    });

    // Update content sections
    document.querySelectorAll('.report-content').forEach(content => {
        content.classList.remove('active');
    });

    const reportMap = {
        'movement': 'movementReport',
        'timeAnalysis': 'timeAnalysisReport',
        'velocity': 'velocityReport',
        'turnover': 'turnoverReport'
    };

    const contentId = reportMap[reportType];
    if (contentId) {
        document.getElementById(contentId).classList.add('active');
    }
}

// Populate filter dropdowns
function populateReportFilters() {
    // Populate branch filters
    const branchFilters = [
        'movementBranchFilter',
        'timeAnalysisBranchFilter',
        'velocityBranchFilter',
        'turnoverBranchFilter'
    ];

    branchFilters.forEach(filterId => {
        const select = document.getElementById(filterId);
        if (select) {
            select.innerHTML = '<option value="">All Branches</option>';
            Object.entries(allBranches).forEach(([branchId, branch]) => {
                const option = new Option(branch.branchName, branchId);
                select.appendChild(option);
            });
        }
    });

    // Populate product filter for movement report
    const movementProductFilter = document.getElementById('movementProductFilter');
    if (movementProductFilter) {
        movementProductFilter.innerHTML = '<option value="">All Products</option>';
        Object.entries(allProducts).forEach(([productId, product]) => {
            const option = new Option(product.productName, productId);
            movementProductFilter.appendChild(option);
        });
    }

    // Populate product filter for time analysis
    const timeAnalysisProductFilter = document.getElementById('timeAnalysisProductFilter');
    if (timeAnalysisProductFilter) {
        timeAnalysisProductFilter.innerHTML = '<option value="">All Products</option>';
        Object.entries(allProducts).forEach(([productId, product]) => {
            const option = new Option(product.productName, productId);
            timeAnalysisProductFilter.appendChild(option);
        });
    }

    // Populate category filter for velocity
    const velocityCategoryFilter = document.getElementById('velocityCategoryFilter');
    if (velocityCategoryFilter) {
        velocityCategoryFilter.innerHTML = '<option value="">All Categories</option>';
        Object.entries(allCategories).forEach(([categoryId, category]) => {
            const option = new Option(category.categoryName, categoryId);
            velocityCategoryFilter.appendChild(option);
        });
    }

    // Set default dates (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const dateInputs = [
        'movementStartDate',
        'movementEndDate',
        'timeAnalysisStartDate',
        'timeAnalysisEndDate',
        'velocityStartDate',
        'velocityEndDate'
    ];

    dateInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            if (inputId.includes('Start')) {
                input.valueAsDate = thirtyDaysAgo;
            } else if (inputId.includes('End')) {
                input.valueAsDate = today;
            }
        }
    });
}

// Setup report generators
function setupReportGenerators() {
    // Stock Movement Report
    const generateMovementReport = document.getElementById('generateMovementReport');
    if (generateMovementReport) {
        generateMovementReport.addEventListener('click', async () => {
            await generateStockMovementReport();
        });
    }

    // Export Movement CSV
    const exportMovementCSV = document.getElementById('exportMovementCSV');
    if (exportMovementCSV) {
        exportMovementCSV.addEventListener('click', () => {
            exportMovementToCSV();
        });
    }

    // Time Analysis Report
    const generateTimeAnalysis = document.getElementById('generateTimeAnalysis');
    if (generateTimeAnalysis) {
        generateTimeAnalysis.addEventListener('click', async () => {
            await generateSalesTimeAnalysis();
        });
    }

    // Velocity Report
    const generateVelocityReport = document.getElementById('generateVelocityReport');
    if (generateVelocityReport) {
        generateVelocityReport.addEventListener('click', async () => {
            await generateProductVelocityReport();
        });
    }

    // Export Velocity CSV
    const exportVelocityCSV = document.getElementById('exportVelocityCSV');
    if (exportVelocityCSV) {
        exportVelocityCSV.addEventListener('click', () => {
            exportVelocityToCSV();
        });
    }

    // Turnover Report
    const generateTurnoverReport = document.getElementById('generateTurnoverReport');
    if (generateTurnoverReport) {
        generateTurnoverReport.addEventListener('click', async () => {
            await generateStockTurnoverReport();
        });
    }
}

// =============================================================================
// STOCK MOVEMENT REPORT
// =============================================================================

let currentMovements = [];

async function generateStockMovementReport() {
    try {
        const startDate = document.getElementById('movementStartDate').value;
        const endDate = document.getElementById('movementEndDate').value;
        const movementType = document.getElementById('movementTypeFilter').value;
        const branchId = document.getElementById('movementBranchFilter').value;
        const productId = document.getElementById('movementProductFilter').value;

        if (!startDate || !endDate) {
            showToast('Please select date range', 'error');
            return;
        }

        showLoadingState('movementTableBody', 8);

        // Collect all movements from different sources
        const movements = [];

        // 1. Get sales data
        const salesRef = ref(db, `businesses/${businessId}/sales`);
        const salesSnap = await get(salesRef);

        if (salesSnap.exists()) {
            const sales = salesSnap.val();
            Object.entries(sales).forEach(([saleId, sale]) => {
                const saleDate = sale.date;
                if (saleDate >= startDate && saleDate <= endDate) {
                    // Apply filters
                    if (branchId && sale.branchId !== branchId) return;

                    // For each item in the sale
                    sale.items.forEach(item => {
                        if (productId && item.productId !== productId) return;

                        movements.push({
                            timestamp: sale.soldAt,
                            type: 'sale',
                            productId: item.productId,
                            productName: item.productName,
                            quantity: -item.quantity, // Negative for stock reduction
                            value: item.subtotal + item.tax,
                            branchId: sale.branchId,
                            branchName: sale.branchName,
                            performedBy: sale.soldByName,
                            reference: `Receipt #${sale.receiptNumber}`,
                            notes: `Sold ${item.quantity} ${item.unit || 'units'}`
                        });
                    });
                }
            });
        }

        // 2. Get stock losses
        const lossesRef = ref(db, `businesses/${businessId}/inventory/stockLosses`);
        const lossesSnap = await get(lossesRef);

        if (lossesSnap.exists()) {
            const losses = lossesSnap.val();
            Object.entries(losses).forEach(([lossId, loss]) => {
                const lossDate = loss.reportedAt.split('T')[0];
                if (lossDate >= startDate && lossDate <= endDate) {
                    if (branchId && loss.branchId !== branchId) return;
                    if (productId && loss.productId !== productId) return;

                    movements.push({
                        timestamp: loss.reportedAt,
                        type: loss.lossType, // damaged, stolen, expired, other
                        productId: loss.productId,
                        productName: loss.productName,
                        quantity: -loss.quantity, // Negative for stock reduction
                        value: loss.sellValue,
                        branchId: loss.branchId,
                        branchName: loss.branchName,
                        performedBy: loss.reportedByName,
                        reference: `Loss Report`,
                        notes: `${loss.lossType}: ${loss.reason}`
                    });
                }
            });
        }

        // 3. Get inventory adjustments from history
        const historyRef = ref(db, `businesses/${businessId}/inventory/history`);
        const historySnap = await get(historyRef);

        if (historySnap.exists()) {
            const history = historySnap.val();
            Object.entries(history).forEach(([historyId, record]) => {
                const recordDate = record.timestamp.split('T')[0];
                if (recordDate >= startDate && recordDate <= endDate) {
                    // Only include stock adjustments and created products
                    if (record.action === 'stock-adjusted' || record.action === 'created') {
                        const product = allProducts[record.productId];
                        if (!product) return;
                        if (branchId && product.branchId !== branchId) return;
                        if (productId && record.productId !== productId) return;

                        // Parse old and new values to determine quantity change
                        let quantityChange = 0;
                        if (record.action === 'created') {
                            // New product added
                            const match = record.newValue.match(/"currentStock":(\d+)/);
                            if (match) {
                                quantityChange = parseInt(match[1]);
                            }
                        } else if (record.action === 'stock-adjusted') {
                            const oldMatch = record.oldValue.match(/(\d+)/);
                            const newMatch = record.newValue.match(/(\d+)/);
                            if (oldMatch && newMatch) {
                                const oldQty = parseInt(oldMatch[1]);
                                const newQty = parseInt(newMatch[1]);
                                quantityChange = newQty - oldQty;
                            }
                        }

                        if (quantityChange !== 0) {
                            movements.push({
                                timestamp: record.timestamp,
                                type: quantityChange > 0 ? 'restock' : 'adjustment',
                                productId: record.productId,
                                productName: record.productName,
                                quantity: quantityChange,
                                value: Math.abs(quantityChange) * (product.costPrice || 0),
                                branchId: product.branchId,
                                branchName: product.branchName,
                                performedBy: record.changedByName,
                                reference: record.action === 'created' ? 'New Product' : 'Stock Adjustment',
                                notes: record.notes || ''
                            });
                        }
                    }
                }
            });
        }

        // Filter by movement type
        if (movementType !== 'all') {
            if (movementType === 'sales') {
                currentMovements = movements.filter(m => m.type === 'sale');
            } else if (movementType === 'adjustments') {
                currentMovements = movements.filter(m => m.type === 'adjustment' || m.type === 'restock');
            } else if (movementType === 'losses') {
                currentMovements = movements.filter(m => ['damaged', 'stolen', 'expired', 'other'].includes(m.type));
            }
        } else {
            currentMovements = movements;
        }

        // Sort by timestamp (newest first)
        currentMovements.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Update summary cards
        updateMovementSummary(currentMovements);

        // Display movements
        displayStockMovements(currentMovements);

        showToast('Movement report generated', 'success');

    } catch (error) {
        console.error('Error generating movement report:', error);
        showToast('Failed to generate report', 'error');
    }
}

function updateMovementSummary(movements) {
    const totalCount = movements.length;
    const salesCount = movements.filter(m => m.type === 'sale').length;
    const lossesCount = movements.filter(m => ['damaged', 'stolen', 'expired', 'other'].includes(m.type)).length;
    const netChange = movements.reduce((sum, m) => sum + m.quantity, 0);

    document.getElementById('movementTotalCount').textContent = totalCount;
    document.getElementById('movementSalesCount').textContent = salesCount;
    document.getElementById('movementLossesCount').textContent = lossesCount;
    document.getElementById('movementNetChange').textContent = netChange;
}

function displayStockMovements(movements) {
    const tbody = document.getElementById('movementTableBody');
    const currency = businessData?.currency || 'R';

    if (movements.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-exchange-alt" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No stock movements found for selected criteria
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = movements.map(movement => {
        const date = new Date(movement.timestamp);
        const formattedDate = date.toLocaleString('en-ZA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Determine type badge and icon
        let typeBadge = '';
        let typeClass = '';
        let quantityDisplay = '';

        if (movement.type === 'sale') {
            typeBadge = '<i class="fas fa-shopping-cart"></i> Sale';
            typeClass = 'movement-type-sale';
            quantityDisplay = `<span style="color: var(--danger-color);">${movement.quantity}</span>`;
        } else if (movement.type === 'restock') {
            typeBadge = '<i class="fas fa-truck"></i> Restock';
            typeClass = 'movement-type-restock';
            quantityDisplay = `<span style="color: var(--success-color);">+${movement.quantity}</span>`;
        } else if (movement.type === 'adjustment') {
            typeBadge = '<i class="fas fa-edit"></i> Adjustment';
            typeClass = 'movement-type-adjustment';
            quantityDisplay = movement.quantity > 0 ?
                `<span style="color: var(--success-color);">+${movement.quantity}</span>` :
                `<span style="color: var(--danger-color);">${movement.quantity}</span>`;
        } else {
            // Loss types
            typeBadge = `<i class="fas fa-exclamation-triangle"></i> ${movement.type}`;
            typeClass = 'movement-type-loss';
            quantityDisplay = `<span style="color: var(--danger-color);">${movement.quantity}</span>`;
        }

        return `
            <tr>
                <td>${formattedDate}</td>
                <td><span class="${typeClass}">${typeBadge}</span></td>
                <td><strong>${movement.productName}</strong></td>
                <td>${quantityDisplay}</td>
                <td>${movement.branchName}</td>
                <td>${movement.performedBy}</td>
                <td>${movement.reference}</td>
                <td>${currency} ${Math.abs(movement.value).toFixed(2)}</td>
            </tr>
        `;
    }).join('');
}

function exportMovementToCSV() {
    if (currentMovements.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    const currency = businessData?.currency || 'R';
    const headers = ['Date & Time', 'Type', 'Product', 'Quantity', 'Branch', 'Performed By', 'Reference', 'Value'];

    const csvContent = [
        headers.join(','),
        ...currentMovements.map(m => {
            const date = new Date(m.timestamp).toLocaleString('en-ZA');
            return [
                `"${date}"`,
                `"${m.type}"`,
                `"${m.productName}"`,
                m.quantity,
                `"${m.branchName}"`,
                `"${m.performedBy}"`,
                `"${m.reference}"`,
                `"${currency} ${Math.abs(m.value).toFixed(2)}"`
            ].join(',');
        })
    ].join('\n');

    downloadCSV(csvContent, 'stock-movements.csv');
    showToast('Movement report exported', 'success');
}

// =============================================================================
// SALES TIME ANALYSIS REPORT
// =============================================================================

async function generateSalesTimeAnalysis() {
    try {
        const startDate = document.getElementById('timeAnalysisStartDate').value;
        const endDate = document.getElementById('timeAnalysisEndDate').value;
        const branchId = document.getElementById('timeAnalysisBranchFilter').value;
        const productId = document.getElementById('timeAnalysisProductFilter').value;

        if (!startDate || !endDate) {
            showToast('Please select date range', 'error');
            return;
        }

        // Get all sales in date range
        const salesRef = ref(db, `businesses/${businessId}/sales`);
        const salesSnap = await get(salesRef);

        if (!salesSnap.exists()) {
            showToast('No sales data available', 'error');
            return;
        }

        const sales = salesSnap.val();
        let filteredSales = [];

        Object.entries(sales).forEach(([saleId, sale]) => {
            const saleDate = sale.date;
            if (saleDate >= startDate && saleDate <= endDate) {
                if (branchId && sale.branchId !== branchId) return;

                // If product filter is applied, only include sales with that product
                if (productId) {
                    const hasProduct = sale.items.some(item => item.productId === productId);
                    if (!hasProduct) return;
                }

                filteredSales.push({ id: saleId, ...sale });
            }
        });

        if (filteredSales.length === 0) {
            showToast('No sales found for selected criteria', 'error');
            return;
        }

        // Calculate summary stats
        const totalSales = filteredSales.reduce((sum, sale) => {
            if (productId) {
                // Only count the specific product's contribution
                const productItems = sale.items.filter(item => item.productId === productId);
                return sum + productItems.reduce((s, item) => s + item.quantity, 0);
            }
            return sum + sale.items.reduce((s, item) => s + item.quantity, 0);
        }, 0);

        const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
        const totalTransactions = filteredSales.length;
        const avgTransaction = totalRevenue / totalTransactions;

        const currency = businessData?.currency || 'R';

        document.getElementById('timeAnalysisTotalSales').textContent = totalSales;
        document.getElementById('timeAnalysisTotalRevenue').textContent = `${currency} ${totalRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
        document.getElementById('timeAnalysisTotalTransactions').textContent = totalTransactions;
        document.getElementById('timeAnalysisAvgTransaction').textContent = `${currency} ${avgTransaction.toFixed(2)}`;

        // Analyze hourly patterns
        analyzeHourlyPatterns(filteredSales, productId);

        // Analyze daily patterns
        analyzeDailyPatterns(filteredSales, productId);

        // Find peak hours
        findPeakHours(filteredSales, productId);

        showToast('Time analysis completed', 'success');

    } catch (error) {
        console.error('Error generating time analysis:', error);
        showToast('Failed to generate analysis', 'error');
    }
}

function analyzeHourlyPatterns(sales, productId) {
    const hourlyData = Array(24).fill(0);

    sales.forEach(sale => {
        const hour = new Date(sale.soldAt).getHours();

        if (productId) {
            const productItems = sale.items.filter(item => item.productId === productId);
            hourlyData[hour] += productItems.reduce((sum, item) => sum + item.quantity, 0);
        } else {
            hourlyData[hour] += sale.items.reduce((sum, item) => sum + item.quantity, 0);
        }
    });

    displayHourlyChart(hourlyData);
}

function displayHourlyChart(hourlyData) {
    const container = document.getElementById('hourlySalesChart');
    const maxValue = Math.max(...hourlyData);

    if (maxValue === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-600); padding: 2rem;">No sales data available</p>';
        return;
    }

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(24, 1fr); gap: 0.5rem; align-items: end; height: 250px;">
            ${hourlyData.map((value, hour) => {
        const height = (value / maxValue) * 100;
        return `
                    <div style="display: flex; flex-direction: column; align-items: center; height: 100%;">
                        <div style="flex: 1; display: flex; align-items: flex-end;">
                            <div class="time-chart-bar" style="width: 100%; height: ${height}%; min-height: ${value > 0 ? '4px' : '0'}; position: relative;" title="${hour}:00 - ${value} units">
                            </div>
                        </div>
                        <div style="font-size: 0.7rem; color: var(--gray-600); margin-top: 0.25rem; writing-mode: ${window.innerWidth < 768 ? 'vertical-rl' : 'horizontal-tb'};">
                            ${hour}h
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
        <div style="text-align: center; margin-top: 1rem; font-size: 0.9rem; color: var(--gray-600);">
            Hours of the day (0-23)
        </div>
    `;
}

function analyzeDailyPatterns(sales, productId) {
    const dailyData = Array(7).fill(0); // Sun-Sat

    sales.forEach(sale => {
        const day = new Date(sale.soldAt).getDay();

        if (productId) {
            const productItems = sale.items.filter(item => item.productId === productId);
            dailyData[day] += productItems.reduce((sum, item) => sum + item.quantity, 0);
        } else {
            dailyData[day] += sale.items.reduce((sum, item) => sum + item.quantity, 0);
        }
    });

    displayDailyChart(dailyData);
}

function displayDailyChart(dailyData) {
    const container = document.getElementById('dailySalesChart');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const maxValue = Math.max(...dailyData);

    if (maxValue === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-600); padding: 2rem;">No sales data available</p>';
        return;
    }

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 1rem; align-items: end; height: 200px;">
            ${dailyData.map((value, index) => {
        const height = (value / maxValue) * 100;
        return `
                    <div style="display: flex; flex-direction: column; align-items: center; height: 100%;">
                        <div style="flex: 1; display: flex; align-items: flex-end; width: 100%;">
                            <div class="time-chart-bar" style="width: 100%; height: ${height}%; min-height: ${value > 0 ? '8px' : '0'};" title="${days[index]}: ${value} units">
                            </div>
                        </div>
                        <div style="font-size: 0.85rem; font-weight: 500; color: var(--gray-700); margin-top: 0.5rem; text-align: center;">
                            ${days[index].substring(0, 3)}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--gray-600);">
                            ${value}
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;
}

function findPeakHours(sales, productId) {
    const hourlyData = Array(24).fill(0);

    sales.forEach(sale => {
        const hour = new Date(sale.soldAt).getHours();

        if (productId) {
            const productItems = sale.items.filter(item => item.productId === productId);
            hourlyData[hour] += productItems.reduce((sum, item) => sum + item.quantity, 0);
        } else {
            hourlyData[hour] += sale.items.reduce((sum, item) => sum + item.quantity, 0);
        }
    });

    // Find top 3 peak hours
    const hoursWithData = hourlyData.map((value, hour) => ({ hour, value }));
    hoursWithData.sort((a, b) => b.value - a.value);
    const top3 = hoursWithData.slice(0, 3);

    displayPeakHours(top3);
}

function displayPeakHours(peakHours) {
    const container = document.getElementById('peakHoursChart');

    if (peakHours.every(h => h.value === 0)) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-600); padding: 2rem;">No sales data available</p>';
        return;
    }

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
            ${peakHours.map((peak, index) => {
        const medals = ['🥇', '🥈', '🥉'];
        return `
                    <div style="background: white; padding: 1.5rem; border-radius: 8px; text-align: center; border: 2px solid var(--gray-200);">
                        <div style="font-size: 2rem; margin-bottom: 0.5rem;">${medals[index]}</div>
                        <div style="font-size: 1.2rem; font-weight: 600; color: var(--primary-color);">
                            ${peak.hour}:00 - ${peak.hour + 1}:00
                        </div>
                        <div style="font-size: 0.9rem; color: var(--gray-600); margin-top: 0.25rem;">
                            ${peak.value} units sold
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;
}

// =============================================================================
// PRODUCT VELOCITY REPORT
// =============================================================================

let currentVelocityData = [];

async function generateProductVelocityReport() {
    try {
        const startDate = document.getElementById('velocityStartDate').value;
        const endDate = document.getElementById('velocityEndDate').value;
        const branchId = document.getElementById('velocityBranchFilter').value;
        const categoryId = document.getElementById('velocityCategoryFilter').value;

        if (!startDate || !endDate) {
            showToast('Please select date range', 'error');
            return;
        }

        showLoadingState('velocityTableBody', 9);

        // Calculate days in range
        const start = new Date(startDate);
        const end = new Date(endDate);
        const daysInRange = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        // Get all sales in date range
        const salesRef = ref(db, `businesses/${businessId}/sales`);
        const salesSnap = await get(salesRef);

        // Aggregate sales by product
        const productSales = {};

        if (salesSnap.exists()) {
            const sales = salesSnap.val();

            Object.values(sales).forEach(sale => {
                const saleDate = sale.date;
                if (saleDate >= startDate && saleDate <= endDate) {
                    if (branchId && sale.branchId !== branchId) return;

                    sale.items.forEach(item => {
                        if (!productSales[item.productId]) {
                            productSales[item.productId] = {
                                totalSold: 0,
                                totalRevenue: 0
                            };
                        }
                        productSales[item.productId].totalSold += item.quantity;
                        productSales[item.productId].totalRevenue += (item.subtotal + item.tax);
                    });
                }
            });
        }

        // Calculate velocity for each product
        currentVelocityData = [];

        Object.entries(allProducts).forEach(([productId, product]) => {
            // Apply filters
            if (branchId && product.branchId !== branchId) return;
            if (categoryId && product.category !== categoryId) return;

            const sales = productSales[productId] || { totalSold: 0, totalRevenue: 0 };
            const avgDailySales = sales.totalSold / daysInRange;
            const daysOfStock = product.currentStock > 0 && avgDailySales > 0 ?
                product.currentStock / avgDailySales :
                (product.currentStock > 0 ? 999 : 0);

            const turnoverRate = product.currentStock > 0 ?
                (sales.totalSold / ((product.currentStock + sales.totalSold) / 2)) * 100 :
                0;

            // Determine velocity category
            let velocity = 'none';
            let shouldReorder = false;

            if (avgDailySales === 0) {
                velocity = 'none';
            } else if (avgDailySales >= 5) {
                velocity = 'fast';
                shouldReorder = daysOfStock < 7;
            } else if (avgDailySales >= 2) {
                velocity = 'medium';
                shouldReorder = daysOfStock < 14;
            } else {
                velocity = 'slow';
                shouldReorder = daysOfStock < 30 && product.currentStock < product.minStock;
            }

            currentVelocityData.push({
                productId,
                productName: product.productName,
                category: allCategories[product.category]?.categoryName || 'N/A',
                currentStock: product.currentStock,
                unit: product.unit,
                totalSold: sales.totalSold,
                avgDailySales: avgDailySales,
                daysOfStock: daysOfStock,
                turnoverRate: turnoverRate,
                velocity: velocity,
                shouldReorder: shouldReorder
            });
        });

        // Sort by total sold (highest first)
        currentVelocityData.sort((a, b) => b.totalSold - a.totalSold);

        // Update summary
        updateVelocitySummary(currentVelocityData);

        // Display table
        displayVelocityTable(currentVelocityData);

        showToast('Velocity report generated', 'success');

    } catch (error) {
        console.error('Error generating velocity report:', error);
        showToast('Failed to generate report', 'error');
    }
}

function updateVelocitySummary(velocityData) {
    const total = velocityData.length;
    const fast = velocityData.filter(p => p.velocity === 'fast').length;
    const medium = velocityData.filter(p => p.velocity === 'medium').length;
    const slow = velocityData.filter(p => p.velocity === 'slow').length;
    const none = velocityData.filter(p => p.velocity === 'none').length;

    document.getElementById('velocityTotalProducts').textContent = total;
    document.getElementById('velocityFastMoving').textContent = fast;
    document.getElementById('velocityMediumMoving').textContent = medium;
    document.getElementById('velocitySlowMoving').textContent = slow;
    document.getElementById('velocityNoSales').textContent = none;
}

function displayVelocityTable(velocityData) {
    const tbody = document.getElementById('velocityTableBody');

    if (velocityData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-tachometer-alt" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No products found for selected criteria
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = velocityData.map(item => {
        const velocityBadge = `<span class="velocity-badge velocity-${item.velocity}">
            ${item.velocity.toUpperCase()}
        </span>`;

        const reorderBadge = item.shouldReorder ?
            '<span style="color: var(--danger-color); font-weight: 600;"><i class="fas fa-exclamation-triangle"></i> Yes</span>' :
            '<span style="color: var(--success-color);">No</span>';

        return `
            <tr>
                <td><strong>${item.productName}</strong></td>
                <td>${item.category}</td>
                <td>${item.currentStock} ${item.unit}</td>
                <td>${item.totalSold}</td>
                <td>${item.avgDailySales.toFixed(2)}</td>
                <td>${item.daysOfStock === 999 ? '∞' : Math.round(item.daysOfStock)}</td>
                <td>${item.turnoverRate.toFixed(1)}%</td>
                <td>${velocityBadge}</td>
                <td>${reorderBadge}</td>
            </tr>
        `;
    }).join('');
}

function exportVelocityToCSV() {
    if (currentVelocityData.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    const headers = ['Product', 'Category', 'Current Stock', 'Total Sold', 'Avg Daily Sales', 'Days of Stock', 'Turnover Rate', 'Velocity', 'Reorder?'];

    const csvContent = [
        headers.join(','),
        ...currentVelocityData.map(item => [
            `"${item.productName}"`,
            `"${item.category}"`,
            `${item.currentStock} ${item.unit}`,
            item.totalSold,
            item.avgDailySales.toFixed(2),
            item.daysOfStock === 999 ? 'Infinite' : Math.round(item.daysOfStock),
            `${item.turnoverRate.toFixed(1)}%`,
            item.velocity,
            item.shouldReorder ? 'Yes' : 'No'
        ].join(','))
    ].join('\n');

    downloadCSV(csvContent, 'product-velocity.csv');
    showToast('Velocity report exported', 'success');
}

// =============================================================================
// STOCK TURNOVER REPORT
// =============================================================================

async function generateStockTurnoverReport() {
    try {
        const period = parseInt(document.getElementById('turnoverPeriod').value);
        const branchId = document.getElementById('turnoverBranchFilter').value;

        showLoadingState('turnoverTableBody', 8);

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - period);

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // Get all sales in period
        const salesRef = ref(db, `businesses/${businessId}/sales`);
        const salesSnap = await get(salesRef);

        // Aggregate sales by product
        const productSales = {};

        if (salesSnap.exists()) {
            const sales = salesSnap.val();

            Object.values(sales).forEach(sale => {
                const saleDate = sale.date;
                if (saleDate >= startDateStr && saleDate <= endDateStr) {
                    if (branchId && sale.branchId !== branchId) return;

                    sale.items.forEach(item => {
                        if (!productSales[item.productId]) {
                            productSales[item.productId] = {
                                quantitySold: 0,
                                cogs: 0
                            };
                        }
                        productSales[item.productId].quantitySold += item.quantity;
                        // COGS = Cost of Goods Sold
                        const product = allProducts[item.productId];
                        if (product) {
                            productSales[item.productId].cogs += item.quantity * product.costPrice;
                        }
                    });
                }
            });
        }

        // Calculate turnover for each product
        const turnoverData = [];
        let totalTurnoverRatio = 0;
        let totalTurnoverDays = 0;
        let count = 0;

        Object.entries(allProducts).forEach(([productId, product]) => {
            if (branchId && product.branchId !== branchId) return;

            const sales = productSales[productId] || { quantitySold: 0, cogs: 0 };
            const currentInventoryValue = product.currentStock * product.costPrice;
            const avgInventoryValue = (currentInventoryValue + sales.cogs) / 2;

            // Turnover Ratio = COGS / Average Inventory Value
            const turnoverRatio = avgInventoryValue > 0 ? sales.cogs / avgInventoryValue : 0;

            // Turnover Days = Period / Turnover Ratio
            const turnoverDays = turnoverRatio > 0 ? period / turnoverRatio : 0;

            if (turnoverRatio > 0) {
                totalTurnoverRatio += turnoverRatio;
                totalTurnoverDays += turnoverDays;
                count++;
            }

            turnoverData.push({
                productId,
                productName: product.productName,
                currentStock: product.currentStock,
                unit: product.unit,
                inventoryValue: currentInventoryValue,
                soldQuantity: sales.quantitySold,
                cogs: sales.cogs,
                turnoverRatio: turnoverRatio,
                turnoverDays: turnoverDays,
                branchId: product.branchId,
                branchName: product.branchName
            });
        });

        // Sort by turnover ratio (highest first)
        turnoverData.sort((a, b) => b.turnoverRatio - a.turnoverRatio);

        // Update summary
        const avgRatio = count > 0 ? totalTurnoverRatio / count : 0;
        const avgDays = count > 0 ? totalTurnoverDays / count : 0;

        document.getElementById('avgTurnoverRatio').textContent = avgRatio.toFixed(2);
        document.getElementById('avgTurnoverDays').textContent = Math.round(avgDays);

        // Display table
        displayTurnoverTable(turnoverData);

        showToast('Turnover analysis completed', 'success');

    } catch (error) {
        console.error('Error generating turnover report:', error);
        showToast('Failed to generate report', 'error');
    }
}

function displayTurnoverTable(turnoverData) {
    const tbody = document.getElementById('turnoverTableBody');
    const currency = businessData?.currency || 'R';

    if (turnoverData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-sync-alt" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No products found for selected criteria
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = turnoverData.map(item => {
        let ratioColor = 'var(--gray-600)';
        if (item.turnoverRatio >= 4) ratioColor = 'var(--success-color)';
        else if (item.turnoverRatio >= 2) ratioColor = 'var(--warning-color)';
        else if (item.turnoverRatio > 0) ratioColor = 'var(--danger-color)';

        return `
            <tr>
                <td><strong>${item.productName}</strong></td>
                <td>${item.currentStock} ${item.unit}</td>
                <td>${currency} ${item.inventoryValue.toFixed(2)}</td>
                <td>${item.soldQuantity}</td>
                <td>${currency} ${item.cogs.toFixed(2)}</td>
                <td style="color: ${ratioColor}; font-weight: 600;">${item.turnoverRatio.toFixed(2)}</td>
                <td>${item.turnoverDays > 0 ? Math.round(item.turnoverDays) : 'N/A'}</td>
                <td>${item.branchName}</td>
            </tr>
        `;
    }).join('');
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function showLoadingState(tableBodyId, colspan) {
    const tbody = document.getElementById(tableBodyId);
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${colspan}" style="text-align: center; padding: 2rem;">
                    <div class="spinner" style="margin: 0 auto 1rem;"></div>
                    <p style="color: var(--gray-600);">Generating report...</p>
                </td>
            </tr>
        `;
    }
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

console.log('Inventory Reports & Analytics Module Loaded ✓');