/**
 * SALES PERIOD FILTER - Add this to your finance.js file
 * This code handles the new period filter for the View Sales modal
 */

// Add this event listener in your finance.js initialization section
document.getElementById('salesPeriodFilter')?.addEventListener('change', function () {
    const period = this.value;
    const customDatePicker = document.getElementById('customDatePicker');
    const salesViewDate = document.getElementById('salesViewDate');

    if (period === 'custom') {
        // Show custom date picker
        customDatePicker.style.display = 'block';
    } else {
        // Hide custom date picker
        customDatePicker.style.display = 'none';

        // Calculate date range based on selected period
        const dateRange = calculateDateRange(period);

        // Load sales for the selected period
        loadSalesForPeriod(dateRange.startDate, dateRange.endDate);
    }
});

// Apply custom date button
document.getElementById('applyCustomDate')?.addEventListener('click', function () {
    const salesViewDate = document.getElementById('salesViewDate');
    const selectedDate = salesViewDate.value;

    if (selectedDate) {
        const dateRange = {
            startDate: selectedDate,
            endDate: selectedDate
        };
        loadSalesForPeriod(dateRange.startDate, dateRange.endDate);
    } else {
        showErrorToast('Please select a date');
    }
});

// Branch filter change
document.getElementById('salesBranchFilter')?.addEventListener('change', function () {
    // Re-load sales with current period and new branch filter
    const period = document.getElementById('salesPeriodFilter').value;

    if (period === 'custom') {
        const selectedDate = document.getElementById('salesViewDate').value;
        if (selectedDate) {
            loadSalesForPeriod(selectedDate, selectedDate);
        }
    } else {
        const dateRange = calculateDateRange(period);
        loadSalesForPeriod(dateRange.startDate, dateRange.endDate);
    }
});

/**
 * Calculate date range based on period selection
 */
function calculateDateRange(period) {
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
            // This week (Monday to Sunday)
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
            // Last 2 weeks (14 days)
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
            startDate = endDate = today.toISOString().split('T')[0];
    }

    return { startDate, endDate };
}

/**
 * Load and display sales for a date range
 */
async function loadSalesForPeriod(startDate, endDate) {
    try {
        // Show loading state
        const salesTableBody = document.getElementById('salesTableBody');
        salesTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    Loading sales...
                </td>
            </tr>
        `;

        // Get selected branch
        const branchId = document.getElementById('salesBranchFilter').value;

        // Import sales functions from Sales.js
        const { getSalesForDateRange, calculateSalesSummary, formatCurrency, formatDateTime, getPeakSalesHours } = await import('../Script/Sales.js');

        // Get sales data for the date range
        let sales;
        if (startDate === endDate) {
            // Single day - use getSalesForDate if you have it, or use range
            const { getSalesForDate } = await import('../Script/Sales.js');
            sales = getSalesForDate(startDate, branchId);
        } else {
            // Date range
            sales = getSalesForDateRange(startDate, endDate, branchId);
        }

        console.log(`Found ${sales.length} sales from ${startDate} to ${endDate}`);

        // Calculate summary
        const summary = calculateSalesSummary(sales);

        // Update summary cards
        document.getElementById('salesTotalSales').textContent = summary.totalSales;
        document.getElementById('salesTotalRevenue').textContent = formatCurrency(summary.totalRevenue);
        document.getElementById('salesChangeGiven').textContent = formatCurrency(summary.totalChangeGiven);
        document.getElementById('salesAvgTransaction').textContent = formatCurrency(summary.averageTransaction);

        // Update payment method breakdown
        document.getElementById('salesCashTotal').textContent = formatCurrency(summary.totalCash);
        document.getElementById('salesCashCount').textContent = `${summary.cashSales} sales`;
        document.getElementById('salesCardTotal').textContent = formatCurrency(summary.totalCard);
        document.getElementById('salesCardCount').textContent = `${summary.cardSales} sales`;
        document.getElementById('salesEwalletTotal').textContent = formatCurrency(summary.totalEWallet);
        document.getElementById('salesEwalletCount').textContent = `${summary.ewalletSales} sales`;

        // Update peak hours
        const peakHours = getPeakSalesHours(sales, 3);
        const peakHoursList = document.getElementById('peakHoursList');

        if (peakHours.length > 0) {
            peakHoursList.innerHTML = peakHours.map((peak, index) => `
                <div style="background: white; padding: 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${index === 0 ? 'var(--success-color)' : index === 1 ? 'var(--primary-color)' : 'var(--accent-color)'};">
                    <div>
                        <div style="font-weight: 600; color: var(--dark-text);">${peak.timeRange}</div>
                        <div style="font-size: 0.875rem; color: var(--gray-600);">${peak.sales} sales</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700; font-size: 1.25rem; color: var(--primary-color);">${formatCurrency(peak.revenue)}</div>
                    </div>
                </div>
            `).join('');
        } else {
            peakHoursList.innerHTML = '<p style="color: #94a3b8;">No peak hours data</p>';
        }

        // Update sales table
        if (sales.length > 0) {
            salesTableBody.innerHTML = sales.map(sale => `
                <tr>
                    <td><strong>${sale.receiptNumber || 'N/A'}</strong></td>
                    <td>${formatDateTime(sale.soldAt || sale.date)}</td>
                    <td>${sale.branchName || 'Unknown'}</td>
                    <td>${sale.items?.length || 0} items</td>
                    <td><strong>${formatCurrency(sale.total || 0)}</strong></td>
                    <td>
                        <span class="badge ${sale.paymentMethod === 'cash' ? 'success' : sale.paymentMethod === 'card' ? 'primary' : 'accent'}">
                            ${sale.paymentMethod || 'N/A'}
                        </span>
                    </td>
                    <td>${sale.paymentMethod === 'cash' ? formatCurrency(sale.change || 0) : '-'}</td>
                    <td>
                        <button class="btn-sm btn-primary" onclick="viewSaleDetails('${sale.saleId}')">
                            <i class="fas fa-eye"></i> View
                        </button>
                    </td>
                </tr>
            `).join('');
        } else {
            salesTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">
                        <i class="fas fa-receipt" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                        No sales found for this period
                    </td>
                </tr>
            `;
        }

    } catch (error) {
        console.error('Error loading sales:', error);
        showErrorToast('Failed to load sales data');
    }
}

// Update the View Sales button click handler to load this month by default
document.getElementById('viewSalesBtn')?.addEventListener('click', function () {
    const modal = document.getElementById('viewSalesModal');
    modal.classList.add('active');

    // Set default to "This Month"
    document.getElementById('salesPeriodFilter').value = 'month';

    // Load sales for this month
    const dateRange = calculateDateRange('month');
    loadSalesForPeriod(dateRange.startDate, dateRange.endDate);
});

console.log('Sales period filter initialized ✓');