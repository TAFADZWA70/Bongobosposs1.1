/**
 * SALES CHARTS MODULE FOR FINANCE.JS
 * Add this code to your finance.js file or create a separate salescharts.js module
 * Handles period filtering and sales data visualization
 */

// =============================================================================
// SALES PERIOD FILTER EVENT LISTENERS
// =============================================================================

// Period filter dropdown change handler
const salesPeriodFilter = document.getElementById('salesPeriodFilter');
if (salesPeriodFilter) {
    salesPeriodFilter.addEventListener('change', function () {
        const period = this.value;
        const customDatePicker = document.getElementById('customDatePicker');

        if (period === 'custom') {
            // Show custom date picker
            customDatePicker.style.display = 'block';
        } else {
            // Hide custom date picker and load sales for selected period
            customDatePicker.style.display = 'none';

            // Calculate date range based on selected period
            const dateRange = calculateSalesDateRange(period);

            // Load sales for the selected period
            loadSalesForPeriod(dateRange.startDate, dateRange.endDate);
        }
    });
    console.log('✓ Sales period filter attached');
}

// Apply custom date button
const applyCustomDate = document.getElementById('applyCustomDate');
if (applyCustomDate) {
    applyCustomDate.addEventListener('click', function () {
        const salesViewDate = document.getElementById('salesViewDate');
        const selectedDate = salesViewDate?.value;

        if (selectedDate) {
            // Load sales for the selected custom date
            loadSalesForPeriod(selectedDate, selectedDate);
        } else {
            showToast('Please select a date', 'error');
        }
    });
    console.log('✓ Apply custom date button attached');
}

// Branch filter change handler
const salesBranchFilterElement = document.getElementById('salesBranchFilter');
if (salesBranchFilterElement) {
    salesBranchFilterElement.addEventListener('change', function () {
        // Re-load sales with current period and new branch filter
        const period = document.getElementById('salesPeriodFilter')?.value || 'month';

        if (period === 'custom') {
            const selectedDate = document.getElementById('salesViewDate')?.value;
            if (selectedDate) {
                loadSalesForPeriod(selectedDate, selectedDate);
            }
        } else {
            const dateRange = calculateSalesDateRange(period);
            loadSalesForPeriod(dateRange.startDate, dateRange.endDate);
        }
    });
    console.log('✓ Sales branch filter attached');
}

// =============================================================================
// DATE RANGE CALCULATION
// =============================================================================

/**
 * Calculate start and end dates based on period selection
 * @param {string} period - The selected period (today, yesterday, week, etc.)
 * @returns {object} Object with startDate and endDate as ISO strings
 */
function calculateSalesDateRange(period) {
    const today = new Date();
    let startDate, endDate;

    switch (period) {
        case 'today':
            startDate = endDate = today.toISOString().split('T')[0];
            break;

        case 'yesterday':
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            startDate = endDate = yesterday.toISOString().split('T')[0];
            break;

        case 'week':
            // This week (Monday to today)
            const dayOfWeek = today.getDay();
            const monday = new Date(today);
            monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
            startDate = monday.toISOString().split('T')[0];
            endDate = today.toISOString().split('T')[0];
            break;

        case 'last-week':
            // Last week (Monday to Sunday)
            const lastWeekEnd = new Date(today);
            lastWeekEnd.setDate(today.getDate() - today.getDay() - (today.getDay() === 0 ? 0 : 1));
            const lastWeekStart = new Date(lastWeekEnd);
            lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
            startDate = lastWeekStart.toISOString().split('T')[0];
            endDate = lastWeekEnd.toISOString().split('T')[0];
            break;

        case '2-weeks':
            // Last 2 weeks (14 days from today)
            const twoWeeksAgo = new Date(today);
            twoWeeksAgo.setDate(today.getDate() - 14);
            startDate = twoWeeksAgo.toISOString().split('T')[0];
            endDate = today.toISOString().split('T')[0];
            break;

        case 'month':
            // This month (1st to today)
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            startDate = firstDayOfMonth.toISOString().split('T')[0];
            endDate = today.toISOString().split('T')[0];
            break;

        case 'last-month':
            // Last month (1st to last day)
            const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
            startDate = lastMonthStart.toISOString().split('T')[0];
            endDate = lastMonthEnd.toISOString().split('T')[0];
            break;

        default:
            // Default to today
            startDate = endDate = today.toISOString().split('T')[0];
    }

    return { startDate, endDate };
}

// =============================================================================
// LOAD AND DISPLAY SALES DATA
// =============================================================================

/**
 * Load and display sales for a specific date range
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 */
async function loadSalesForPeriod(startDate, endDate) {
    try {
        console.log(`Loading sales from ${startDate} to ${endDate}`);

        // Show loading state
        const salesTableBody = document.getElementById('salesTableBody');
        if (salesTableBody) {
            salesTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 2rem;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; color: var(--primary-color);"></i>
                        <span style="color: var(--gray-600);">Loading sales data...</span>
                    </td>
                </tr>
            `;
        }

        // Get selected branch
        const branchId = document.getElementById('salesBranchFilter')?.value || 'all';

        // Get sales data for the date range
        let sales;
        if (startDate === endDate) {
            // Single day - more efficient
            sales = getSalesForDate(startDate, branchId);
        } else {
            // Date range
            sales = getSalesForDateRange(startDate, endDate, branchId);
        }

        console.log(`Found ${sales.length} sales from ${startDate} to ${endDate} for branch: ${branchId}`);

        // Calculate summary statistics
        const summary = calculateSalesSummary(sales);

        // Update all UI elements
        updateSalesSummaryCards(summary);
        updatePaymentMethodBreakdown(summary);
        updatePeakHoursDisplay(sales);
        updateSalesTable(sales);

        console.log('✓ Sales data loaded and displayed successfully');

    } catch (error) {
        console.error('Error loading sales for period:', error);
        showToast('Failed to load sales data: ' + error.message, 'error');

        // Show error state in table
        const salesTableBody = document.getElementById('salesTableBody');
        if (salesTableBody) {
            salesTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 2rem; color: var(--danger-color);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                        Failed to load sales data
                    </td>
                </tr>
            `;
        }
    }
}

// =============================================================================
// UPDATE UI COMPONENTS
// =============================================================================

/**
 * Update sales summary cards with calculated data
 * @param {object} summary - Sales summary object from calculateSalesSummary
 */
function updateSalesSummaryCards(summary) {
    const currency = businessData?.currency || 'R';

    // Total sales count
    const salesTotalSales = document.getElementById('salesTotalSales');
    if (salesTotalSales) {
        salesTotalSales.textContent = summary.totalSales;
    }

    // Total revenue
    const salesTotalRevenue = document.getElementById('salesTotalRevenue');
    if (salesTotalRevenue) {
        salesTotalRevenue.textContent = `${currency} ${summary.totalRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Change given
    const salesChangeGiven = document.getElementById('salesChangeGiven');
    if (salesChangeGiven) {
        salesChangeGiven.textContent = `${currency} ${summary.totalChangeGiven.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Average transaction
    const salesAvgTransaction = document.getElementById('salesAvgTransaction');
    if (salesAvgTransaction) {
        salesAvgTransaction.textContent = `${currency} ${summary.averageTransaction.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    console.log('✓ Summary cards updated');
}

/**
 * Update payment method breakdown section
 * @param {object} summary - Sales summary object
 */
function updatePaymentMethodBreakdown(summary) {
    const currency = businessData?.currency || 'R';

    // Cash
    const salesCashTotal = document.getElementById('salesCashTotal');
    const salesCashCount = document.getElementById('salesCashCount');
    if (salesCashTotal) {
        salesCashTotal.textContent = `${currency} ${summary.totalCash.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (salesCashCount) {
        salesCashCount.textContent = `${summary.cashSales} sales`;
    }

    // Card
    const salesCardTotal = document.getElementById('salesCardTotal');
    const salesCardCount = document.getElementById('salesCardCount');
    if (salesCardTotal) {
        salesCardTotal.textContent = `${currency} ${summary.totalCard.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (salesCardCount) {
        salesCardCount.textContent = `${summary.cardSales} sales`;
    }

    // E-Wallet
    const salesEwalletTotal = document.getElementById('salesEwalletTotal');
    const salesEwalletCount = document.getElementById('salesEwalletCount');
    if (salesEwalletTotal) {
        salesEwalletTotal.textContent = `${currency} ${summary.totalEWallet.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (salesEwalletCount) {
        salesEwalletCount.textContent = `${summary.ewalletSales} sales`;
    }

    console.log('✓ Payment method breakdown updated');
}

/**
 * Update peak sales hours display
 * @param {array} sales - Array of sale objects
 */
function updatePeakHoursDisplay(sales) {
    const peakHours = getPeakSalesHours(sales, 3);
    const peakHoursList = document.getElementById('peakHoursList');

    if (!peakHoursList) return;

    const currency = businessData?.currency || 'R';

    if (peakHours.length === 0 || sales.length === 0) {
        peakHoursList.innerHTML = '<p style="color: #94a3b8;">No peak hours data available for this period</p>';
        return;
    }

    peakHoursList.innerHTML = peakHours.map((peak, index) => {
        const colors = ['var(--success-color)', 'var(--primary-color)', 'var(--accent-color)'];
        const medals = ['🥇', '🥈', '🥉'];

        return `
            <div style="background: white; padding: 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${colors[index]}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                        <span style="font-size: 1.25rem;">${medals[index]}</span>
                        <div style="font-weight: 600; color: var(--dark-text);">${peak.timeRange}</div>
                    </div>
                    <div style="font-size: 0.875rem; color: var(--gray-600);">${peak.sales} transaction${peak.sales !== 1 ? 's' : ''}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 700; font-size: 1.25rem; color: ${colors[index]};">
                        ${currency} ${peak.revenue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    console.log('✓ Peak hours updated');
}

/**
 * Update sales transaction table
 * @param {array} sales - Array of sale objects
 */
function updateSalesTable(sales) {
    const salesTableBody = document.getElementById('salesTableBody');
    if (!salesTableBody) return;

    const currency = businessData?.currency || 'R';

    if (sales.length === 0) {
        salesTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-receipt" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No sales found for the selected period
                </td>
            </tr>
        `;
        return;
    }

    salesTableBody.innerHTML = sales.map(sale => {
        const itemCount = sale.items ? sale.items.length : 0;
        const paymentBadgeClass =
            sale.paymentMethod === 'cash' ? 'success' :
                sale.paymentMethod === 'card' ? 'primary' : 'accent';

        return `
            <tr>
                <td><strong>${sale.receiptNumber || 'N/A'}</strong></td>
                <td>${formatDateTime(sale.soldAt || sale.date)}</td>
                <td>${sale.branchName || 'Unknown'}</td>
                <td>${itemCount} item${itemCount !== 1 ? 's' : ''}</td>
                <td><strong>${currency} ${(sale.total || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                <td>
                    <span class="badge ${paymentBadgeClass}">
                        ${(sale.paymentMethod || 'unknown').toUpperCase()}
                    </span>
                </td>
                <td>${sale.paymentMethod === 'cash' ? `${currency} ${(sale.change || 0).toFixed(2)}` : '-'}</td>
                <td>
                    <button class="icon-btn" onclick="viewSaleDetails('${sale.saleId}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    console.log(`✓ Sales table updated with ${sales.length} transactions`);
}

// =============================================================================
// INITIALIZE SALES MODAL
// =============================================================================

/**
 * Initialize sales modal when View Sales button is clicked
 * Sets default period to "This Month" and loads data
 */
function initializeSalesModal() {
    const modal = document.getElementById('viewSalesModal');
    const salesPeriodFilter = document.getElementById('salesPeriodFilter');
    const customDatePicker = document.getElementById('customDatePicker');

    if (modal) {
        modal.classList.add('active');
    }

    // Hide custom date picker by default
    if (customDatePicker) {
        customDatePicker.style.display = 'none';
    }

    // Set default to "This Month"
    if (salesPeriodFilter) {
        salesPeriodFilter.value = 'month';
    }

    // Load sales for this month
    const dateRange = calculateSalesDateRange('month');
    loadSalesForPeriod(dateRange.startDate, dateRange.endDate);

    console.log('✓ Sales modal initialized');
}

// Update the View Sales button event listener
const viewSalesBtnElement = document.getElementById('viewSalesBtn');
if (viewSalesBtnElement) {
    // Remove any existing listeners
    const newViewSalesBtn = viewSalesBtnElement.cloneNode(true);
    viewSalesBtnElement.parentNode.replaceChild(newViewSalesBtn, viewSalesBtnElement);

    // Add new listener
    newViewSalesBtn.addEventListener('click', initializeSalesModal);
    console.log('✓ View sales button initialized with period filter support');
}

// =============================================================================
// ADDITIONAL HELPER FUNCTIONS
// =============================================================================

/**
 * Get period name for display purposes
 * @param {string} period - Period code
 * @returns {string} Human-readable period name
 */
function getPeriodDisplayName(period) {
    const names = {
        'today': 'Today',
        'yesterday': 'Yesterday',
        'week': 'This Week',
        'last-week': 'Last Week',
        '2-weeks': 'Last 2 Weeks',
        'month': 'This Month',
        'last-month': 'Last Month',
        'custom': 'Custom Date'
    };
    return names[period] || 'Unknown Period';
}

/**
 * Export sales data to CSV (future enhancement)
 */
function exportSalesToCSV() {
    showToast('CSV export functionality coming soon!', 'success');
}

console.log('=== ✓✓✓ Sales Charts Module Loaded ✓✓✓ ===');
console.log('Sales period filtering and visualization ready');