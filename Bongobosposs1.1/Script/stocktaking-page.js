import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

import {
    initStockTaking,
    createStockTakingSession,
    recordPhysicalCount,
    completeStockTakingSession,
    cancelStockTakingSession,
    setStockTakingSchedule,
    getActiveStockTakingSessions,
    getStockTakingSessionDetails,
    getStockTakingHistory,
    getStockTakingSchedule,
    isStockTakingDue,
    generateVarianceReport,
    updateVarianceReason
} from './stocktaking.js';

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
let userData = null;
let businessId = null;
let businessData = null;
let allProducts = {};
let allBranches = {};
let currentSession = null;
let currentCounts = [];
let currentFilter = 'all';
let currentVarianceProductId = null;

// Generate clean ID from email
function generateCleanId(email) {
    const username = email.split('@')[0];
    return username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

// Check authentication
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

        await loadBusinessInfo();
        await loadBranches();
        await loadProducts();

        // Initialize stock taking module
        initStockTaking(currentUser, userData, businessId, businessData, allProducts, allBranches);

        await loadDashboardData();
        await checkForActiveSessions();

        document.getElementById('loadingScreen').classList.add('hidden');

    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Failed to load user data', 'error');
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

        if (snapshot.exists()) {
            allBranches = snapshot.val();
        }
    } catch (error) {
        console.error('Error loading branches:', error);
    }
}

// Load products
async function loadProducts() {
    try {
        const productsRef = ref(db, `businesses/${businessId}/inventory/products`);
        const snapshot = await get(productsRef);

        if (snapshot.exists()) {
            allProducts = snapshot.val();
        }
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

// Load dashboard data
async function loadDashboardData() {
    try {
        // Load schedule
        const schedule = await getStockTakingSchedule();
        if (schedule) {
            displayScheduleInfo(schedule);
        }

        // Load active sessions
        const activeSessions = await getActiveStockTakingSessions();
        document.getElementById('activeSessions').textContent = activeSessions.length;
        if (activeSessions.length > 0) {
            document.getElementById('sessionsText').textContent = `${activeSessions.length} in progress`;
        }

        // Load history
        const history = await getStockTakingHistory(50);
        document.getElementById('totalSessions').textContent = history.length;

        if (history.length > 0) {
            const lastSession = history[0];
            const date = new Date(lastSession.completedAt);
            document.getElementById('lastCompleted').textContent = date.toLocaleDateString();
            document.getElementById('lastCompletedBranch').textContent = lastSession.branchName;
        }

        displayRecentHistory(history.slice(0, 5));

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

// Display schedule info
function displayScheduleInfo(schedule) {
    const scheduleBanner = document.getElementById('scheduleBanner');
    const scheduleText = document.getElementById('scheduleText');
    const nextDue = document.getElementById('nextDue');
    const dueStatus = document.getElementById('dueStatus');

    if (schedule && schedule.isActive) {
        scheduleBanner.style.display = 'flex';

        const frequency = schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1);
        const nextDate = new Date(schedule.nextDueDate);
        const now = new Date();
        const isDue = now >= nextDate;

        scheduleText.innerHTML = `
            <strong>${frequency}</strong> schedule active. 
            Next due: <strong>${nextDate.toLocaleDateString()}</strong>
        `;

        nextDue.textContent = nextDate.toLocaleDateString();

        if (isDue) {
            nextDue.style.color = 'var(--danger-color)';
            dueStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> Overdue!';
            dueStatus.style.color = 'var(--danger-color)';

            // Show notification
            showDueNotification();
        } else {
            const daysUntil = Math.ceil((nextDate - now) / (1000 * 60 * 60 * 24));
            dueStatus.textContent = `In ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
        }
    }
}

// Show due notification
function showDueNotification() {
    const notification = document.createElement('div');
    notification.className = 'stock-taking-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-clipboard-check"></i>
            <div>
                <strong>Stock Taking Due!</strong>
                <p>It's time to perform your scheduled stock taking</p>
            </div>
            <button class="btn-primary" onclick="document.getElementById('newSessionBtn').click(); this.closest('.stock-taking-notification').remove();">
                <i class="fas fa-play"></i> Start Now
            </button>
            <button class="notification-close" onclick="this.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    document.body.appendChild(notification);
}

// Check for active sessions
async function checkForActiveSessions() {
    const activeSessions = await getActiveStockTakingSessions();

    if (activeSessions.length > 0) {
        const activeSessionsSection = document.getElementById('activeSessionsSection');
        const activeSessionsList = document.getElementById('activeSessionsList');

        activeSessionsSection.style.display = 'block';

        activeSessionsList.innerHTML = activeSessions.map(session => `
            <div class="session-card" onclick="continueSession('${session.id}')">
                <div class="session-info">
                    <h3>${session.sessionName}</h3>
                    <p><i class="fas fa-code-branch"></i> ${session.branchName}</p>
                    <p><i class="fas fa-calendar"></i> Started: ${formatDate(session.startedAt)}</p>
                    <p><i class="fas fa-user"></i> By: ${session.startedByName}</p>
                    <div class="session-progress">
                        <span>Progress: ${session.countedProducts}/${session.totalProducts} products</span>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${(session.countedProducts / session.totalProducts) * 100}%"></div>
                        </div>
                    </div>
                </div>
                <button class="btn-primary">
                    <i class="fas fa-play"></i> Continue
                </button>
            </div>
        `).join('');
    }
}

// Continue session
window.continueSession = async function (sessionId) {
    try {
        const details = await getStockTakingSessionDetails(sessionId);
        currentSession = details.session;
        currentCounts = details.counts;

        showCountingInterface();

    } catch (error) {
        console.error('Error continuing session:', error);
        showToast('Failed to load session', 'error');
    }
};

// Display recent history
function displayRecentHistory(history) {
    const tbody = document.getElementById('recentHistoryBody');
    if (!tbody) return;

    const currency = businessData?.currency || 'R';

    if (history.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-clipboard-list" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No stock taking sessions yet. Start your first session!
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = history.map(session => {
        const statusClass = session.status === 'completed' ? 'success' : 'danger';
        const statusIcon = session.status === 'completed' ? 'fa-check-circle' : 'fa-ban';

        return `
            <tr>
                <td><strong>${session.sessionName}</strong></td>
                <td>${session.branchName}</td>
                <td>${formatDate(session.startedAt)}</td>
                <td>${session.countedProducts}/${session.totalProducts}</td>
                <td>${session.totalVariance || 0}</td>
                <td>${currency} ${(session.varianceValue || 0).toFixed(2)}</td>
                <td>
                    <span class="status-badge ${statusClass}">
                        <i class="fas ${statusIcon}"></i> ${session.status}
                    </span>
                </td>
                <td>
                    <button class="icon-btn" onclick="viewSessionDetails('${session.sessionId}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
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

// Show counting interface
function showCountingInterface() {
    const sessionInProgress = document.getElementById('sessionInProgress');
    const sessionHeaderInfo = document.getElementById('sessionHeaderInfo');

    sessionInProgress.style.display = 'block';

    const progress = (currentSession.countedProducts / currentSession.totalProducts) * 100;

    sessionHeaderInfo.innerHTML = `
        <div class="session-details">
            <h3>${currentSession.sessionName}</h3>
            <div class="session-meta">
                <span><i class="fas fa-code-branch"></i> ${currentSession.branchName}</span>
                <span><i class="fas fa-user"></i> Started by ${currentSession.startedByName}</span>
                <span><i class="fas fa-calendar"></i> ${formatDate(currentSession.startedAt)}</span>
            </div>
            <div class="session-progress">
                <span>Progress: <strong>${currentSession.countedProducts}/${currentSession.totalProducts}</strong> products counted</span>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
            </div>
        </div>
    `;

    updateCountingFilters();
    displayProductsToCount();

    // Scroll to session
    sessionInProgress.scrollIntoView({ behavior: 'smooth' });
}

// Update counting filters
function updateCountingFilters() {
    const all = currentCounts.length;
    const counted = currentCounts.filter(c => c.isCounted).length;
    const pending = all - counted;
    const variance = currentCounts.filter(c => c.isCounted && c.variance !== 0).length;

    document.getElementById('countAll').textContent = all;
    document.getElementById('countCounted').textContent = counted;
    document.getElementById('countPending').textContent = pending;
    document.getElementById('countVariance').textContent = variance;
}

// Display products to count
function displayProductsToCount() {
    const tbody = document.getElementById('productsToCountBody');
    if (!tbody) return;

    const currency = businessData?.currency || 'R';
    let filteredCounts = [...currentCounts];

    // Apply filter
    if (currentFilter === 'pending') {
        filteredCounts = filteredCounts.filter(c => !c.isCounted);
    } else if (currentFilter === 'counted') {
        filteredCounts = filteredCounts.filter(c => c.isCounted);
    } else if (currentFilter === 'variance') {
        filteredCounts = filteredCounts.filter(c => c.isCounted && c.variance !== 0);
    }

    // Apply search
    const search = document.getElementById('countingSearch')?.value.toLowerCase() || '';
    if (search) {
        filteredCounts = filteredCounts.filter(c =>
            c.productName.toLowerCase().includes(search) ||
            c.sku.toLowerCase().includes(search) ||
            (c.barcode && c.barcode.includes(search))
        );
    }

    // Sort: uncounted first, then by name
    filteredCounts.sort((a, b) => {
        if (a.isCounted === b.isCounted) {
            return a.productName.localeCompare(b.productName);
        }
        return a.isCounted ? 1 : -1;
    });

    tbody.innerHTML = filteredCounts.map(count => {
        const statusClass = count.isCounted ? 'counted' : 'pending';
        const statusIcon = count.isCounted ? 'fa-check-circle' : 'fa-clock';
        const statusText = count.isCounted ? 'Counted' : 'Pending';

        let varianceDisplay = '-';
        let varianceClass = '';

        if (count.isCounted) {
            const variance = count.variance;
            varianceClass = variance > 0 ? 'overage' : variance < 0 ? 'shortage' : 'match';
            varianceDisplay = variance > 0 ? `+${variance}` : variance;
        }

        return `
            <tr class="${statusClass}">
                <td>
                    <div class="product-cell">
                        <strong>${count.productName}</strong>
                        <small>SKU: ${count.sku}</small>
                    </div>
                </td>
                <td>${count.barcode || 'N/A'}</td>
                <td><strong>${count.systemCount} ${count.unit}</strong></td>
                <td>
                    ${count.isCounted ?
                `<strong>${count.physicalCount} ${count.unit}</strong>` :
                `<input type="number" class="count-input" id="physical_${count.productId}" min="0" placeholder="0" value="">`
            }
                </td>
                <td class="${varianceClass}">
                    <strong>${varianceDisplay}</strong>
                    ${count.isCounted && count.variance !== 0 ?
                `<br><small>${currency} ${count.varianceValue.toFixed(2)}</small>` :
                ''
            }
                </td>
                <td>
                    <span class="status-badge ${statusClass}">
                        <i class="fas ${statusIcon}"></i> ${statusText}
                    </span>
                </td>
                <td>
                    ${!count.isCounted ? `
                        <button class="btn-primary btn-sm" onclick="recordCount('${count.productId}')">
                            <i class="fas fa-save"></i> Record
                        </button>
                    ` : `
                        <button class="icon-btn" onclick="editCount('${count.productId}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

// Record count
window.recordCount = async function (productId) {
    try {
        const input = document.getElementById(`physical_${productId}`);
        if (!input) return;

        const physicalCount = parseInt(input.value);
        if (isNaN(physicalCount) || physicalCount < 0) {
            showToast('Please enter a valid count (0 or more)', 'error');
            return;
        }

        const result = await recordPhysicalCount(
            currentSession.sessionId,
            productId,
            physicalCount
        );

        // Update local data
        const countIndex = currentCounts.findIndex(c => c.productId === productId);
        if (countIndex !== -1) {
            currentCounts[countIndex].physicalCount = physicalCount;
            currentCounts[countIndex].variance = result.variance;
            currentCounts[countIndex].variancePercentage = result.variancePercentage;
            currentCounts[countIndex].varianceValue = result.varianceValue;
            currentCounts[countIndex].isCounted = true;
        }

        currentSession.countedProducts++;

        if (Math.abs(result.variance) > 0) {
            // Show variance reason modal
            showVarianceReasonModal(productId, result.variance);
        }

        showToast('Count recorded successfully', 'success');
        updateCountingFilters();
        displayProductsToCount();

        // Update session header
        showCountingInterface();

    } catch (error) {
        console.error('Error recording count:', error);
        showToast('Failed to record count', 'error');
    }
};

// Edit count
window.editCount = function (productId) {
    const count = currentCounts.find(c => c.productId === productId);
    if (!count) return;

    const newCount = prompt(
        `Edit physical count for ${count.productName}\nCurrent: ${count.physicalCount} ${count.unit}`,
        count.physicalCount
    );

    if (newCount === null) return;

    const physicalCount = parseInt(newCount);
    if (isNaN(physicalCount) || physicalCount < 0) {
        showToast('Please enter a valid count', 'error');
        return;
    }

    // Re-record with new count
    recordCount(productId);
};

// Show variance reason modal
function showVarianceReasonModal(productId, variance) {
    const count = currentCounts.find(c => c.productId === productId);
    if (!count) return;

    const varianceModal = document.getElementById('varianceReasonModal');
    const varianceAlertBox = document.getElementById('varianceAlertBox');
    const varianceAlertContent = document.getElementById('varianceAlertContent');

    const isOverage = variance > 0;
    varianceAlertBox.className = `variance-alert ${isOverage ? 'overage' : 'shortage'}`;

    const currency = businessData?.currency || 'R';
    varianceAlertContent.innerHTML = `
        <h3>${count.productName}</h3>
        <p>Variance: <strong>${variance > 0 ? '+' : ''}${variance} ${count.unit}</strong></p>
        <p>Value Impact: <strong>${currency} ${count.varianceValue.toFixed(2)}</strong></p>
    `;

    currentVarianceProductId = productId;
    varianceModal.classList.add('active');
}

// New Session
const newSessionBtn = document.getElementById('newSessionBtn');
if (newSessionBtn) {
    newSessionBtn.addEventListener('click', () => {
        const modal = document.getElementById('newSessionModal');
        const branchSelect = document.getElementById('sessionBranch');

        // Populate branches
        branchSelect.innerHTML = '<option value="">Select branch to count</option>';
        Object.entries(allBranches).forEach(([id, branch]) => {
            branchSelect.add(new Option(branch.branchName, id));
        });

        modal.classList.add('active');
    });
}

// New session form
const newSessionForm = document.getElementById('newSessionForm');
if (newSessionForm) {
    newSessionForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const branchId = document.getElementById('sessionBranch').value;
        const sessionName = document.getElementById('sessionName').value.trim();
        const notes = document.getElementById('sessionNotes').value.trim();

        if (!branchId) {
            showToast('Please select a branch', 'error');
            return;
        }

        const btn = document.getElementById('startSessionBtn');
        setLoading(btn, true);

        try {
            const result = await createStockTakingSession(branchId, sessionName, notes);

            currentSession = result.sessionData;
            const details = await getStockTakingSessionDetails(result.sessionId);
            currentCounts = details.counts;

            showToast('Stock taking session started!', 'success');

            const modal = document.getElementById('newSessionModal');
            modal.classList.remove('active');
            newSessionForm.reset();

            // Refresh dashboard
            await loadDashboardData();

            // Show counting interface
            showCountingInterface();

        } catch (error) {
            console.error('Error starting session:', error);
            showToast(error.message || 'Failed to start session', 'error');
        } finally {
            setLoading(btn, false);
        }
    });
}

// Set schedule
const setScheduleBtn = document.getElementById('setScheduleBtn');
const editScheduleBtn = document.getElementById('editScheduleBtn');

[setScheduleBtn, editScheduleBtn].forEach(btn => {
    if (btn) {
        btn.addEventListener('click', () => {
            document.getElementById('scheduleModal').classList.add('active');
        });
    }
});

const saveScheduleBtn = document.getElementById('saveScheduleBtn');
if (saveScheduleBtn) {
    saveScheduleBtn.addEventListener('click', async () => {
        const frequency = document.getElementById('scheduleFrequency').value;

        if (!frequency) {
            showToast('Please select a frequency', 'error');
            return;
        }

        try {
            const result = await setStockTakingSchedule(frequency);
            showToast(`Stock taking scheduled ${frequency}. Next due: ${result.nextDueDate}`, 'success');

            document.getElementById('scheduleModal').classList.remove('active');
            await loadDashboardData();

        } catch (error) {
            console.error('Error setting schedule:', error);
            showToast('Failed to set schedule', 'error');
        }
    });
}

// Variance reason form
const varianceReasonForm = document.getElementById('varianceReasonForm');
if (varianceReasonForm) {
    varianceReasonForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const reason = document.getElementById('varianceReason').value;
        const notes = document.getElementById('varianceNotes').value;

        try {
            await updateVarianceReason(
                currentSession.sessionId,
                currentVarianceProductId,
                reason,
                notes
            );

            // Update local data
            const countIndex = currentCounts.findIndex(c => c.productId === currentVarianceProductId);
            if (countIndex !== -1) {
                currentCounts[countIndex].varianceReason = reason;
                currentCounts[countIndex].notes = notes;
            }

            showToast('Variance reason saved', 'success');
            document.getElementById('varianceReasonModal').classList.remove('active');
            varianceReasonForm.reset();

        } catch (error) {
            console.error('Error saving variance reason:', error);
            showToast('Failed to save variance reason', 'error');
        }
    });
}

// Skip variance
const skipVarianceBtn = document.getElementById('skipVarianceBtn');
if (skipVarianceBtn) {
    skipVarianceBtn.addEventListener('click', () => {
        document.getElementById('varianceReasonModal').classList.remove('active');
        document.getElementById('varianceReasonForm').reset();
    });
}

// Complete session
const completeSessionBtn = document.getElementById('completeSessionBtn');
if (completeSessionBtn) {
    completeSessionBtn.addEventListener('click', () => {
        showCompletionSummary();
    });
}

// Show completion summary
function showCompletionSummary() {
    const report = generateVarianceReport(currentCounts);
    const currency = businessData?.currency || 'R';

    const summaryContent = document.getElementById('summaryContent');
    summaryContent.innerHTML = `
        <div class="summary-grid">
            <div class="summary-card">
                <i class="fas fa-check-circle" style="color: var(--secondary-color);"></i>
                <div>
                    <h3>${report.totalCounted}</h3>
                    <p>Products Counted</p>
                </div>
            </div>
            <div class="summary-card">
                <i class="fas fa-equals" style="color: var(--primary-color);"></i>
                <div>
                    <h3>${report.matches.length}</h3>
                    <p>Perfect Matches</p>
                </div>
            </div>
            <div class="summary-card">
                <i class="fas fa-arrow-up" style="color: var(--accent-color);"></i>
                <div>
                    <h3>${report.overages.length}</h3>
                    <p>Overages</p>
                </div>
            </div>
            <div class="summary-card">
                <i class="fas fa-arrow-down" style="color: var(--danger-color);"></i>
                <div>
                    <h3>${report.shortages.length}</h3>
                    <p>Shortages</p>
                </div>
            </div>
        </div>

        <div class="variance-summary">
            <h3>Total Variance Impact</h3>
            <div class="variance-value">${currency} ${report.totalVarianceValue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
        </div>

        <div class="variance-breakdown">
            <h4>Variance by Reason</h4>
            <table class="inventory-table">
                <thead>
                    <tr>
                        <th>Reason</th>
                        <th>Count</th>
                        <th>Value Impact</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(report.byVarianceReason).map(([reason, data]) =>
        data.count > 0 ? `
                            <tr>
                                <td>${reason.replace('-', ' ').toUpperCase()}</td>
                                <td>${data.count}</td>
                                <td>${currency} ${data.value.toFixed(2)}</td>
                            </tr>
                        ` : ''
    ).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('completionModal').classList.add('active');
}

// Finalize session
const finalizeBtn = document.getElementById('finalizeBtn');
if (finalizeBtn) {
    finalizeBtn.addEventListener('click', async () => {
        const applyAdjustments = document.getElementById('applyAdjustments').checked;

        setLoading(finalizeBtn, true);

        try {
            await completeStockTakingSession(currentSession.sessionId, applyAdjustments);

            showToast('Stock taking completed successfully!', 'success');

            document.getElementById('completionModal').classList.remove('active');
            document.getElementById('sessionInProgress').style.display = 'none';

            currentSession = null;
            currentCounts = [];

            // Reload dashboard
            await loadDashboardData();
            await checkForActiveSessions();

        } catch (error) {
            console.error('Error finalizing session:', error);
            showToast('Failed to complete session', 'error');
        } finally {
            setLoading(finalizeBtn, false);
        }
    });
}

// Cancel session
const cancelSessionBtn = document.getElementById('cancelSessionBtn');
if (cancelSessionBtn) {
    cancelSessionBtn.addEventListener('click', async () => {
        if (!confirm('Cancel this stock taking session? Progress will be saved but not applied.')) {
            return;
        }

        const reason = prompt('Reason for cancellation (optional):');

        try {
            await cancelStockTakingSession(currentSession.sessionId, reason || '');
            showToast('Session cancelled', 'success');

            document.getElementById('sessionInProgress').style.display = 'none';
            currentSession = null;
            currentCounts = [];

            await loadDashboardData();
            await checkForActiveSessions();

        } catch (error) {
            console.error('Error cancelling session:', error);
            showToast('Failed to cancel session', 'error');
        }
    });
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        displayProductsToCount();
    });
});

// Search
const countingSearch = document.getElementById('countingSearch');
if (countingSearch) {
    countingSearch.addEventListener('input', displayProductsToCount);
}

// View history
const viewHistoryBtn = document.getElementById('viewHistoryBtn');
if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener('click', async () => {
        const historyModal = document.getElementById('historyModal');
        const branchFilter = document.getElementById('historyBranchFilter');

        // Populate branch filter
        branchFilter.innerHTML = '<option value="all">All Branches</option>';
        Object.entries(allBranches).forEach(([id, branch]) => {
            branchFilter.add(new Option(branch.branchName, id));
        });

        const history = await getStockTakingHistory(100);
        displayHistoryTable(history);

        historyModal.classList.add('active');
    });
}

// Display history table
function displayHistoryTable(history) {
    const tbody = document.getElementById('historyTableBody');
    const currency = businessData?.currency || 'R';

    tbody.innerHTML = history.map(session => {
        const statusClass = session.status === 'completed' ? 'success' : 'danger';
        const statusIcon = session.status === 'completed' ? 'fa-check-circle' : 'fa-ban';

        return `
            <tr>
                <td><strong>${session.sessionName}</strong></td>
                <td>${session.branchName}</td>
                <td>${formatDate(session.startedAt)}</td>
                <td>${session.completedAt ? formatDate(session.completedAt) : '-'}</td>
                <td>${session.countedProducts}/${session.totalProducts}</td>
                <td>${session.totalVariance || 0}</td>
                <td>${currency} ${(session.varianceValue || 0).toFixed(2)}</td>
                <td>
                    <span class="status-badge ${statusClass}">
                        <i class="fas ${statusIcon}"></i> ${session.status}
                    </span>
                </td>
                <td>
                    <button class="icon-btn" onclick="viewSessionDetails('${session.sessionId}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Close modals
document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.closest('.modal').classList.remove('active');
    });
});

// Mobile menu toggle
const menuToggle = document.getElementById('menuToggle');
if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
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

console.log('Stock Taking Page Initialized ✓');