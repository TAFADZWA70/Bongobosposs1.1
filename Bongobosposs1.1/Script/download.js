// ============================================================================
// DOWNLOAD MODULE - CSV & PDF Export Functionality
// ============================================================================
// Handles downloading financial reports, sales data, expenses, and more
// Supports: CSV, PDF formats
// ============================================================================

console.log('=== Download Module Loading ===');

// ============================================================================
// PDF GENERATION USING jsPDF
// ============================================================================

/**
 * Download Financial Report as PDF
 * @param {Object} reportData - The report data object
 * @param {Date} startDate - Report start date
 * @param {Date} endDate - Report end date
 * @param {string} branchFilter - Branch filter ('all' or branch ID)
 * @param {Object} businessData - Business information
 * @param {Object} allBranches - All branches data
 */
export async function downloadFinancialReportPDF(reportData, startDate, endDate, branchFilter, businessData, allBranches) {
    try {
        // Check if jsPDF is loaded
        if (typeof window.jspdf === 'undefined') {
            console.error('jsPDF library not loaded');
            alert('PDF library not loaded. Please refresh the page and try again.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        const currency = businessData?.currency || 'R';
        const { summary } = reportData;

        const startDateStr = startDate.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
        const endDateStr = endDate.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
        const branchName = branchFilter === 'all' ? 'All Branches' : (allBranches[branchFilter]?.branchName || 'Unknown Branch');

        let yPos = 20;

        // ===== HEADER =====
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(59, 130, 246); // Primary color
        doc.text('COMPREHENSIVE FINANCIAL REPORT', 105, yPos, { align: 'center' });

        yPos += 10;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(businessData.businessName, 105, yPos, { align: 'center' });

        yPos += 6;
        doc.text(branchName, 105, yPos, { align: 'center' });

        yPos += 6;
        doc.text(`${startDateStr} - ${endDateStr}`, 105, yPos, { align: 'center' });

        yPos += 10;
        doc.setDrawColor(59, 130, 246);
        doc.setLineWidth(0.5);
        doc.line(20, yPos, 190, yPos);
        yPos += 10;

        // ===== EXECUTIVE SUMMARY =====
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Executive Summary', 20, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        const summaryData = [
            ['Total Revenue', `${currency} ${summary.totalRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`],
            ['Total Expenses', `${currency} ${summary.totalExpenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`],
            ['Net Profit', `${currency} ${summary.netProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`],
            ['Profit Margin', `${summary.netProfitMargin.toFixed(2)}%`]
        ];

        summaryData.forEach(([label, value]) => {
            doc.setFont('helvetica', 'bold');
            doc.text(label + ':', 25, yPos);
            doc.setFont('helvetica', 'normal');
            doc.text(value, 100, yPos);
            yPos += 6;
        });

        yPos += 5;

        // ===== FINANCIAL PERFORMANCE =====
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Financial Performance', 20, yPos);
        yPos += 8;

        doc.setFontSize(10);
        const performanceData = [
            ['Total Revenue', `${currency} ${summary.totalRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`],
            ['Cost of Goods Sold (COGS)', `-${currency} ${summary.totalCOGS.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`],
            ['Gross Profit', `${currency} ${summary.grossProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`],
            ['Gross Profit Margin', `${summary.grossProfitMargin.toFixed(2)}%`],
            ['Operating Expenses', `-${currency} ${summary.totalExpenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`],
            ['Net Profit/Loss', `${currency} ${summary.netProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`],
            ['Net Profit Margin', `${summary.netProfitMargin.toFixed(2)}%`]
        ];

        performanceData.forEach(([label, value]) => {
            doc.setFont('helvetica', 'normal');
            doc.text(label, 25, yPos);
            doc.setFont('helvetica', 'bold');
            doc.text(value, 140, yPos, { align: 'right' });
            yPos += 6;
        });

        // Check if we need a new page
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }

        yPos += 5;

        // ===== SALES ANALYSIS =====
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Sales Analysis', 20, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Transactions: ${summary.totalSales}`, 25, yPos);
        yPos += 6;
        doc.text(`Average Transaction: ${currency} ${summary.avgTransactionValue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, 25, yPos);
        yPos += 6;
        doc.text(`Tax Collected: ${currency} ${summary.totalTax.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, 25, yPos);
        yPos += 10;

        // Sales by Payment Method
        doc.setFont('helvetica', 'bold');
        doc.text('Sales by Payment Method:', 25, yPos);
        yPos += 6;

        doc.setFont('helvetica', 'normal');
        Object.entries(reportData.salesByPaymentMethod).forEach(([method, amount]) => {
            const percentage = summary.totalRevenue > 0 ? (amount / summary.totalRevenue * 100).toFixed(1) : 0;
            doc.text(`${method.toUpperCase()}: ${currency} ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })} (${percentage}%)`, 30, yPos);
            yPos += 6;
        });

        // Check if we need a new page
        if (yPos > 240) {
            doc.addPage();
            yPos = 20;
        }

        yPos += 5;

        // ===== TOP PRODUCTS =====
        if (reportData.topProducts.length > 0) {
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Top 10 Products by Revenue', 20, yPos);
            yPos += 8;

            doc.setFontSize(9);
            reportData.topProducts.slice(0, 10).forEach((product, index) => {
                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.setFont('helvetica', 'bold');
                doc.text(`${index + 1}.`, 25, yPos);
                doc.setFont('helvetica', 'normal');
                doc.text(product.name, 32, yPos);
                doc.text(`Qty: ${product.quantity}`, 110, yPos);
                doc.text(`${currency} ${product.revenue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, 190, yPos, { align: 'right' });
                yPos += 5;
            });
        }

        yPos += 5;

        // ===== EXPENSE BREAKDOWN =====
        if (Object.keys(reportData.expensesByCategory).length > 0) {
            if (yPos > 240) {
                doc.addPage();
                yPos = 20;
            }

            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Expense Breakdown', 20, yPos);
            yPos += 8;

            doc.setFontSize(10);
            Object.entries(reportData.expensesByCategory)
                .sort((a, b) => b[1] - a[1])
                .forEach(([category, amount]) => {
                    if (yPos > 275) {
                        doc.addPage();
                        yPos = 20;
                    }

                    const percentage = (amount / summary.totalExpenses * 100).toFixed(1);
                    doc.setFont('helvetica', 'normal');
                    doc.text(category.toUpperCase(), 25, yPos);
                    doc.text(`${currency} ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })} (${percentage}%)`, 190, yPos, { align: 'right' });
                    yPos += 6;
                });
        }

        // ===== FOOTER =====
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Report generated on ${new Date().toLocaleString('en-ZA')}`, 105, 285, { align: 'center' });
            doc.text(`BongoBoss Enterprise POS System - Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
        }

        // Save the PDF
        const filename = `Financial_Report_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.pdf`;
        doc.save(filename);

        console.log('✓ Financial report PDF downloaded successfully');
        return true;

    } catch (error) {
        console.error('Error generating financial report PDF:', error);
        alert('Failed to generate PDF. Error: ' + error.message);
        return false;
    }
}

// ============================================================================
// CSV EXPORT FUNCTIONS
// ============================================================================

/**
 * Download Financial Report as CSV
 * @param {Object} reportData - The report data object
 * @param {Date} startDate - Report start date
 * @param {Date} endDate - Report end date
 * @param {string} branchFilter - Branch filter
 * @param {Object} businessData - Business information
 */
export function downloadFinancialReportCSV(reportData, startDate, endDate, branchFilter, businessData, allBranches) {
    try {
        const currency = businessData?.currency || 'R';
        const { summary } = reportData;

        const startDateStr = startDate.toLocaleDateString('en-ZA');
        const endDateStr = endDate.toLocaleDateString('en-ZA');
        const branchName = branchFilter === 'all' ? 'All Branches' : (allBranches[branchFilter]?.branchName || 'Unknown Branch');

        let csvContent = '';

        // Header
        csvContent += `COMPREHENSIVE FINANCIAL REPORT\n`;
        csvContent += `${businessData.businessName}\n`;
        csvContent += `${branchName}\n`;
        csvContent += `Period: ${startDateStr} - ${endDateStr}\n`;
        csvContent += `Generated: ${new Date().toLocaleString('en-ZA')}\n\n`;

        // Executive Summary
        csvContent += `EXECUTIVE SUMMARY\n`;
        csvContent += `Metric,Amount\n`;
        csvContent += `Total Revenue,${currency} ${summary.totalRevenue.toFixed(2)}\n`;
        csvContent += `Total Expenses,${currency} ${summary.totalExpenses.toFixed(2)}\n`;
        csvContent += `Net Profit,${currency} ${summary.netProfit.toFixed(2)}\n`;
        csvContent += `Profit Margin,${summary.netProfitMargin.toFixed(2)}%\n\n`;

        // Financial Performance
        csvContent += `FINANCIAL PERFORMANCE\n`;
        csvContent += `Metric,Amount\n`;
        csvContent += `Total Revenue,${currency} ${summary.totalRevenue.toFixed(2)}\n`;
        csvContent += `Cost of Goods Sold (COGS),${currency} ${summary.totalCOGS.toFixed(2)}\n`;
        csvContent += `Gross Profit,${currency} ${summary.grossProfit.toFixed(2)}\n`;
        csvContent += `Gross Profit Margin,${summary.grossProfitMargin.toFixed(2)}%\n`;
        csvContent += `Operating Expenses,${currency} ${summary.totalExpenses.toFixed(2)}\n`;
        csvContent += `Net Profit/Loss,${currency} ${summary.netProfit.toFixed(2)}\n`;
        csvContent += `Net Profit Margin,${summary.netProfitMargin.toFixed(2)}%\n\n`;

        // Sales Analysis
        csvContent += `SALES ANALYSIS\n`;
        csvContent += `Metric,Value\n`;
        csvContent += `Total Transactions,${summary.totalSales}\n`;
        csvContent += `Average Transaction,${currency} ${summary.avgTransactionValue.toFixed(2)}\n`;
        csvContent += `Tax Collected,${currency} ${summary.totalTax.toFixed(2)}\n\n`;

        // Sales by Payment Method
        csvContent += `SALES BY PAYMENT METHOD\n`;
        csvContent += `Method,Amount,Percentage\n`;
        Object.entries(reportData.salesByPaymentMethod).forEach(([method, amount]) => {
            const percentage = summary.totalRevenue > 0 ? (amount / summary.totalRevenue * 100).toFixed(1) : 0;
            csvContent += `${method.toUpperCase()},${currency} ${amount.toFixed(2)},${percentage}%\n`;
        });
        csvContent += `\n`;

        // Top Products
        if (reportData.topProducts.length > 0) {
            csvContent += `TOP PRODUCTS BY REVENUE\n`;
            csvContent += `Rank,Product Name,Quantity,Revenue,Cost,Profit\n`;
            reportData.topProducts.forEach((product, index) => {
                csvContent += `${index + 1},"${product.name}",${product.quantity},${currency} ${product.revenue.toFixed(2)},${currency} ${product.cost.toFixed(2)},${currency} ${product.profit.toFixed(2)}\n`;
            });
            csvContent += `\n`;
        }

        // Expense Breakdown
        if (Object.keys(reportData.expensesByCategory).length > 0) {
            csvContent += `EXPENSE BREAKDOWN\n`;
            csvContent += `Category,Amount,Percentage\n`;
            Object.entries(reportData.expensesByCategory)
                .sort((a, b) => b[1] - a[1])
                .forEach(([category, amount]) => {
                    const percentage = (amount / summary.totalExpenses * 100).toFixed(1);
                    csvContent += `"${category.toUpperCase()}",${currency} ${amount.toFixed(2)},${percentage}%\n`;
                });
        }

        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const filename = `Financial_Report_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('✓ Financial report CSV downloaded successfully');
        return true;

    } catch (error) {
        console.error('Error generating financial report CSV:', error);
        alert('Failed to generate CSV. Error: ' + error.message);
        return false;
    }
}

/**
 * Download Sales Data as CSV
 * @param {Array} sales - Array of sales transactions
 * @param {string} date - Date filter
 * @param {Object} businessData - Business information
 */
export function downloadSalesCSV(sales, date, businessData) {
    try {
        const currency = businessData?.currency || 'R';

        let csvContent = '';

        // Header
        csvContent += `DAILY SALES REPORT\n`;
        csvContent += `${businessData.businessName}\n`;
        csvContent += `Date: ${date}\n`;
        csvContent += `Generated: ${new Date().toLocaleString('en-ZA')}\n\n`;

        // Sales Data
        csvContent += `Receipt Number,Date & Time,Branch,Items,Total,Payment Method,Change Given\n`;

        sales.forEach(sale => {
            const itemCount = sale.items ? sale.items.length : 0;
            const dateTime = new Date(sale.soldAt || sale.date).toLocaleString('en-ZA');
            const change = sale.paymentMethod === 'cash' ? sale.change || 0 : 0;

            csvContent += `"${sale.receiptNumber}","${dateTime}","${sale.branchName || 'N/A'}",${itemCount},${currency} ${(sale.total || 0).toFixed(2)},"${sale.paymentMethod || 'unknown'}",${currency} ${change.toFixed(2)}\n`;
        });

        csvContent += `\n`;

        // Summary
        const totalSales = sales.length;
        const totalRevenue = sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
        const totalChange = sales.filter(s => s.paymentMethod === 'cash').reduce((sum, sale) => sum + (sale.change || 0), 0);

        csvContent += `SUMMARY\n`;
        csvContent += `Total Transactions,${totalSales}\n`;
        csvContent += `Total Revenue,${currency} ${totalRevenue.toFixed(2)}\n`;
        csvContent += `Total Change Given,${currency} ${totalChange.toFixed(2)}\n`;

        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const filename = `Sales_Report_${date}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('✓ Sales CSV downloaded successfully');
        return true;

    } catch (error) {
        console.error('Error generating sales CSV:', error);
        alert('Failed to generate CSV. Error: ' + error.message);
        return false;
    }
}

/**
 * Download Expenses Data as CSV
 * @param {Object} expenses - Expenses object
 * @param {Object} businessData - Business information
 */
export function downloadExpensesCSV(expenses, businessData) {
    try {
        const currency = businessData?.currency || 'R';

        let csvContent = '';

        // Header
        csvContent += `EXPENSES REPORT\n`;
        csvContent += `${businessData.businessName}\n`;
        csvContent += `Generated: ${new Date().toLocaleString('en-ZA')}\n\n`;

        // Expenses Data
        csvContent += `Date,Type,Amount,Description,Branch,Recurring,Frequency,Recorded By\n`;

        Object.values(expenses)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .forEach(expense => {
                const date = new Date(expense.date).toLocaleDateString('en-ZA');
                const type = expense.type === 'custom' ? expense.customName : expense.type;
                const recurring = expense.isRecurring ? 'Yes' : 'No';
                const frequency = expense.isRecurring ? expense.recurringFrequency : 'N/A';

                csvContent += `"${date}","${type}",${currency} ${expense.amount.toFixed(2)},"${expense.description}","${expense.branchName}","${recurring}","${frequency}","${expense.recordedByName}"\n`;
            });

        csvContent += `\n`;

        // Summary
        const totalExpenses = Object.values(expenses).reduce((sum, expense) => sum + (expense.amount || 0), 0);
        const recurringExpenses = Object.values(expenses).filter(e => e.isRecurring).reduce((sum, expense) => sum + (expense.amount || 0), 0);
        const oneTimeExpenses = totalExpenses - recurringExpenses;

        csvContent += `SUMMARY\n`;
        csvContent += `Total Expenses,${currency} ${totalExpenses.toFixed(2)}\n`;
        csvContent += `Recurring Expenses,${currency} ${recurringExpenses.toFixed(2)}\n`;
        csvContent += `One-Time Expenses,${currency} ${oneTimeExpenses.toFixed(2)}\n`;

        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const filename = `Expenses_Report_${new Date().toISOString().split('T')[0]}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('✓ Expenses CSV downloaded successfully');
        return true;

    } catch (error) {
        console.error('Error generating expenses CSV:', error);
        alert('Failed to generate CSV. Error: ' + error.message);
        return false;
    }
}

/**
 * Download Payment Requests as CSV
 * @param {Object} paymentRequests - Payment requests object
 * @param {Object} businessData - Business information
 */
export function downloadPaymentRequestsCSV(paymentRequests, businessData) {
    try {
        const currency = businessData?.currency || 'R';

        let csvContent = '';

        // Header
        csvContent += `PAYMENT REQUESTS REPORT\n`;
        csvContent += `${businessData.businessName}\n`;
        csvContent += `Generated: ${new Date().toLocaleString('en-ZA')}\n\n`;

        // Payment Requests Data
        csvContent += `Date Requested,Requested By,Amount,Purpose,Description,Status,Authorized By,Date Authorized\n`;

        Object.values(paymentRequests)
            .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
            .forEach(request => {
                const dateRequested = new Date(request.requestedAt).toLocaleString('en-ZA');
                const dateAuthorized = request.authorizedAt ? new Date(request.authorizedAt).toLocaleString('en-ZA') : 'N/A';

                csvContent += `"${dateRequested}","${request.requestedByName}",${currency} ${request.amount.toFixed(2)},"${request.purpose}","${request.description}","${request.status.toUpperCase()}","${request.authorizedByName || 'N/A'}","${dateAuthorized}"\n`;
            });

        csvContent += `\n`;

        // Summary
        const totalRequests = Object.values(paymentRequests).length;
        const approvedRequests = Object.values(paymentRequests).filter(r => r.status === 'approved');
        const approvedAmount = approvedRequests.reduce((sum, request) => sum + (request.amount || 0), 0);
        const pendingRequests = Object.values(paymentRequests).filter(r => r.status === 'pending').length;

        csvContent += `SUMMARY\n`;
        csvContent += `Total Requests,${totalRequests}\n`;
        csvContent += `Approved Requests,${approvedRequests.length}\n`;
        csvContent += `Pending Requests,${pendingRequests}\n`;
        csvContent += `Total Approved Amount,${currency} ${approvedAmount.toFixed(2)}\n`;

        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const filename = `Payment_Requests_${new Date().toISOString().split('T')[0]}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('✓ Payment requests CSV downloaded successfully');
        return true;

    } catch (error) {
        console.error('Error generating payment requests CSV:', error);
        alert('Failed to generate CSV. Error: ' + error.message);
        return false;
    }
}

console.log('=== ✓ Download Module Loaded Successfully ===');