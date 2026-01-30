import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

// Import change management module - FIXED: Changed from './changemanagement.js' to './ChangeManagement.js'
import {
    initChangeManagement,
    recordDailyChange,
    updateDailyChange,
    deleteDailyChange,
    archiveOldRecords,
    getDailyChange,
    getChangeSummary,
    getDenominationBreakdown,
    getDailyRecordsData,
    getChangeHistoryData,
    getTodaysChange,
    hasChangeForToday
} from './ChangeManagement.js';

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
let allBranches = {};
let isEditMode = false;
let editingRecordId = null;

// Generate clean ID from email
function generateCleanId(email) {
    const username = email.split('@')[0];
    return username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

// Check user role and permissions
function hasPermission(action) {
    if (!userData || !userData.role) return false;

    const role = userData.role.toLowerCase();

    // Only Owner, Partner, and Admin can access change management
    const permissions = {
        'view': ['owner', 'partner', 'admin'],
        'add': ['owner', 'partner', 'admin'],
        'edit': ['owner', 'partner', 'admin'],
        'delete': ['owner', 'partner', 'admin'],
        'archive': ['owner', 'partner', 'admin']
    };

    return permissions[action]?.includes(role) || false;
}

// Check authentication and load data
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

        // Check permissions
        if (!hasPermission('view')) {
            showToast('You do not have permission to access change management', 'error');
            setTimeout(() => {
                window.location.href = 'Dashboard.html';
            }, 2000);
            return;
        }

        await loadBusinessInfo();
        await loadBranches();

        // Initialize change management module - IMPORTANT: Must be called before updating UI
        await initChangeManagement(
            currentUser,
            userData,
            businessId,
            businessData,
            allBranches
        );

        // Wait a bit for data to load, then setup UI
        setTimeout(() => {
            setupUI();
            updateDashboardStats();
            displayTodaysChange();
            displayRecentRecords();

            // Hide loading screen
            document.getElementById('loadingScreen').classList.add('hidden');
        }, 500);

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

        const changeBranch = document.getElementById('changeBranch');
        const historyBranchFilter = document.getElementById('historyBranchFilter');
        const reportBranchFilter = document.getElementById('reportBranchFilter');

        if (snapshot.exists()) {
            allBranches = snapshot.val();

            // Populate dropdowns
            [changeBranch, historyBranchFilter, reportBranchFilter].forEach(element => {
                if (element) {
                    if (element.id !== 'changeBranch') {
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
        }
    } catch (error) {
        console.error('Error loading branches:', error);
    }
}

// Setup UI
function setupUI() {
    // Set today's date as default
    const changeDateInput = document.getElementById('changeDate');
    if (changeDateInput) {
        changeDateInput.valueAsDate = new Date();
    }

    // Setup denomination input listeners
    setupDenominationListeners();
}

// Setup denomination input listeners for real-time calculation
function setupDenominationListeners() {
    const denominations = [
        'notes', 'fiveCents', 'tenCents', 'twentyCents', 'fiftyCents',
        'oneRand', 'twoRand', 'fiveRand', 'tenRand', 'twentyRand',
        'fiftyRand', 'hundredRand', 'twoHundredRand'
    ];

    denominations.forEach(denom => {
        const input = document.getElementById(denom);
        if (input) {
            input.addEventListener('input', calculateFormTotals);
        }
    });
}

// Calculate form totals in real-time
function calculateFormTotals() {
    const values = {
        notes: 0.01,
        fiveCents: 0.05,
        tenCents: 0.10,
        twentyCents: 0.20,
        fiftyCents: 0.50,
        oneRand: 1.00,
        twoRand: 2.00,
        fiveRand: 5.00,
        tenRand: 10.00,
        twentyRand: 20.00,
        fiftyRand: 50.00,
        hundredRand: 100.00,
        twoHundredRand: 200.00
    };

    let totalCoins = 0;
    let totalNotes = 0;

    // Calculate and display individual denomination values
    Object.keys(values).forEach(denom => {
        const input = document.getElementById(denom);
        const valueSpan = document.getElementById(`${denom}Value`);

        if (input && valueSpan) {
            const count = parseInt(input.value) || 0;
            const value = count * values[denom];
            valueSpan.textContent = value.toFixed(2);

            // Add to totals
            if (['notes', 'fiveCents', 'tenCents', 'twentyCents', 'fiftyCents', 'oneRand', 'twoRand', 'fiveRand'].includes(denom)) {
                totalCoins += value;
            } else {
                totalNotes += value;
            }
        }
    });

    // Update totals
    const totalCoinsCalc = document.getElementById('totalCoinsCalc');
    const totalNotesCalc = document.getElementById('totalNotesCalc');
    const grandTotalCalc = document.getElementById('grandTotalCalc');

    if (totalCoinsCalc) totalCoinsCalc.textContent = totalCoins.toFixed(2);
    if (totalNotesCalc) totalNotesCalc.textContent = totalNotes.toFixed(2);
    if (grandTotalCalc) grandTotalCalc.textContent = (totalCoins + totalNotes).toFixed(2);
}

// Update dashboard statistics
function updateDashboardStats() {
    const currency = businessData?.currency || 'R';
    const records = getDailyRecordsData();

    console.log('Updating dashboard stats. Total records:', Object.keys(records).length);

    // Get today's change for all branches
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = Object.values(records).filter(r => r.date === today && r.status === 'active');

    console.log('Today\'s records found:', todayRecords.length);

    let todaysTotal = 0;
    todayRecords.forEach(record => {
        todaysTotal += record.totalChange;
    });

    const todaysChangeEl = document.getElementById('todaysChange');
    const todaysStatusEl = document.getElementById('todaysStatus');
    if (todaysChangeEl) {
        todaysChangeEl.textContent = `${currency} ${todaysTotal.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    }
    if (todaysStatusEl) {
        todaysStatusEl.textContent = todayRecords.length > 0 ? `${todayRecords.length} branch(es) recorded` : 'Not recorded';
    }

    // Calculate 30-day average
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];
    const endDate = today;

    const summary = getChangeSummary(startDate, endDate);

    const avgChangeEl = document.getElementById('avgChange');
    if (avgChangeEl) {
        avgChangeEl.textContent = `${currency} ${summary.averageChange.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    }

    const totalCoinsEl = document.getElementById('totalCoins');
    const totalNotesEl = document.getElementById('totalNotes');
    if (totalCoinsEl) {
        totalCoinsEl.textContent = `${currency} ${summary.totalCoins.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    }
    if (totalNotesEl) {
        totalNotesEl.textContent = `${currency} ${summary.totalNotes.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    }

    // Get denomination breakdown for counts
    const breakdown = getDenominationBreakdown(startDate, endDate);
    const coinsCount = Object.values(breakdown.coins).reduce((sum, count) => sum + count, 0);
    const notesCount = Object.values(breakdown.notes).reduce((sum, count) => sum + count, 0);

    const coinsCountEl = document.getElementById('coinsCount');
    const notesCountEl = document.getElementById('notesCount');
    if (coinsCountEl) coinsCountEl.textContent = `${coinsCount.toLocaleString()} pieces`;
    if (notesCountEl) notesCountEl.textContent = `${notesCount.toLocaleString()} pieces`;
}

// Display today's change by branch
function displayTodaysChange() {
    const tbody = document.getElementById('todaysChangeBody');
    if (!tbody) return;

    const currency = businessData?.currency || 'R';
    const today = new Date().toISOString().split('T')[0];
    const records = getDailyRecordsData();

    const todayRecords = Object.entries(records).filter(([_, r]) =>
        r.date === today && r.status === 'active'
    );

    const branchCountBadge = document.getElementById('branchCount');
    if (branchCountBadge) {
        branchCountBadge.textContent = todayRecords.length;
    }

    if (todayRecords.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-coins" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No change recorded for today
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = todayRecords.map(([recordId, record]) => `
        <tr>
            <td><strong>${record.branchName}</strong></td>
            <td>${formatDate(record.date)}</td>
            <td>${currency} ${record.totalCoins.toFixed(2)}</td>
            <td>${currency} ${record.totalNotes.toFixed(2)}</td>
            <td><strong>${currency} ${record.totalChange.toFixed(2)}</strong></td>
            <td>${record.recordedByName}</td>
            <td>
                <div class="table-actions">
                    ${hasPermission('edit') ? `
                        <button class="icon-btn" onclick="editRecord('${recordId}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                    ` : ''}
                    ${hasPermission('delete') ? `
                        <button class="icon-btn danger" onclick="deleteRecord('${recordId}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

// Display recent records
function displayRecentRecords() {
    const tbody = document.getElementById('recentRecordsBody');
    if (!tbody) return;

    const periodFilter = document.getElementById('recentPeriodFilter');
    const days = periodFilter ? parseInt(periodFilter.value) : 30;

    const currency = businessData?.currency || 'R';
    const records = getDailyRecordsData();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentRecords = Object.entries(records)
        .filter(([_, r]) => new Date(r.date) >= cutoffDate && r.status === 'active')
        .sort((a, b) => new Date(b[1].date) - new Date(a[1].date));

    if (recentRecords.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-history" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No records found for the selected period
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = recentRecords.map(([recordId, record]) => `
        <tr>
            <td>${formatDate(record.date)}</td>
            <td>${record.branchName}</td>
            <td>${currency} ${record.totalCoins.toFixed(2)}</td>
            <td>${currency} ${record.totalNotes.toFixed(2)}</td>
            <td><strong>${currency} ${record.totalChange.toFixed(2)}</strong></td>
            <td>${record.recordedByName}</td>
            <td>
                <div class="table-actions">
                    ${hasPermission('edit') ? `
                        <button class="icon-btn" onclick="editRecord('${recordId}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                    ` : ''}
                    ${hasPermission('delete') ? `
                        <button class="icon-btn danger" onclick="deleteRecord('${recordId}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

// Show record change modal
window.showRecordChangeModal = function () {
    const modal = document.getElementById('recordChangeModal');
    const modalTitle = document.getElementById('changeModalTitle');
    const form = document.getElementById('recordChangeForm');

    if (modal) modal.classList.add('active');
    if (modalTitle) modalTitle.textContent = 'Record Daily Change';
    if (form) form.reset();

    isEditMode = false;
    editingRecordId = null;

    // Set today's date
    const changeDateInput = document.getElementById('changeDate');
    if (changeDateInput) {
        changeDateInput.valueAsDate = new Date();
    }

    calculateFormTotals();
};

// Edit record
window.editRecord = function (recordId) {
    const records = getDailyRecordsData();
    const record = records[recordId];

    if (!record) return;

    isEditMode = true;
    editingRecordId = recordId;

    // Populate form
    document.getElementById('changeDate').value = record.date;
    document.getElementById('changeBranch').value = record.branchId;
    document.getElementById('notes').value = record.notes || 0;
    document.getElementById('fiveCents').value = record.fiveCents || 0;
    document.getElementById('tenCents').value = record.tenCents || 0;
    document.getElementById('twentyCents').value = record.twentyCents || 0;
    document.getElementById('fiftyCents').value = record.fiftyCents || 0;
    document.getElementById('oneRand').value = record.oneRand || 0;
    document.getElementById('twoRand').value = record.twoRand || 0;
    document.getElementById('fiveRand').value = record.fiveRand || 0;
    document.getElementById('tenRand').value = record.tenRand || 0;
    document.getElementById('twentyRand').value = record.twentyRand || 0;
    document.getElementById('fiftyRand').value = record.fiftyRand || 0;
    document.getElementById('hundredRand').value = record.hundredRand || 0;
    document.getElementById('twoHundredRand').value = record.twoHundredRand || 0;

    calculateFormTotals();

    const modal = document.getElementById('recordChangeModal');
    const modalTitle = document.getElementById('changeModalTitle');

    if (modal) modal.classList.add('active');
    if (modalTitle) modalTitle.textContent = 'Edit Change Record';
};

// Delete record
window.deleteRecord = async function (recordId) {
    if (!confirm('Are you sure you want to delete this change record? This action cannot be undone.')) {
        return;
    }

    try {
        await deleteDailyChange(recordId);
        showToast('Change record deleted successfully', 'success');
        updateDashboardStats();
        displayTodaysChange();
        displayRecentRecords();
    } catch (error) {
        console.error('Error deleting record:', error);
        showToast('Failed to delete change record', 'error');
    }
};

// Format date helper
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format timestamp helper
function formatTimestamp(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
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

// Event Listeners

// Mobile menu toggle
const menuToggle = document.getElementById('menuToggle');
if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('active');
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

// Refresh button
const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        location.reload();
    });
}

// Record change button
const recordChangeBtn = document.getElementById('recordChangeBtn');
if (recordChangeBtn) {
    recordChangeBtn.addEventListener('click', showRecordChangeModal);
}

// Record change form submission
const recordChangeForm = document.getElementById('recordChangeForm');
if (recordChangeForm) {
    recordChangeForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const changeData = {
            date: document.getElementById('changeDate').value,
            branchId: document.getElementById('changeBranch').value,
            denominations: {
                notes: document.getElementById('notes').value,
                fiveCents: document.getElementById('fiveCents').value,
                tenCents: document.getElementById('tenCents').value,
                twentyCents: document.getElementById('twentyCents').value,
                fiftyCents: document.getElementById('fiftyCents').value,
                oneRand: document.getElementById('oneRand').value,
                twoRand: document.getElementById('twoRand').value,
                fiveRand: document.getElementById('fiveRand').value,
                tenRand: document.getElementById('tenRand').value,
                twentyRand: document.getElementById('twentyRand').value,
                fiftyRand: document.getElementById('fiftyRand').value,
                hundredRand: document.getElementById('hundredRand').value,
                twoHundredRand: document.getElementById('twoHundredRand').value
            }
        };

        const btn = document.getElementById('submitRecordChange');
        setLoading(btn, true);

        try {
            if (isEditMode && editingRecordId) {
                await updateDailyChange(editingRecordId, changeData);
                showToast('Change record updated successfully', 'success');
            } else {
                await recordDailyChange(changeData);
                showToast('Change record saved successfully', 'success');
            }

            const modal = document.getElementById('recordChangeModal');
            if (modal) modal.classList.remove('active');

            // Refresh displays
            updateDashboardStats();
            displayTodaysChange();
            displayRecentRecords();

        } catch (error) {
            console.error('Error saving change record:', error);
            showToast('Failed to save change record', 'error');
        } finally {
            setLoading(btn, false);
        }
    });
}

// Recent period filter
const recentPeriodFilter = document.getElementById('recentPeriodFilter');
if (recentPeriodFilter) {
    recentPeriodFilter.addEventListener('change', displayRecentRecords);
}

// View history button
const viewHistoryBtn = document.getElementById('viewHistoryBtn');
if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener('click', () => {
        displayHistory();
        const modal = document.getElementById('viewHistoryModal');
        if (modal) modal.classList.add('active');
    });
}

// Display history
function displayHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    const currency = businessData?.currency || 'R';
    const records = getDailyRecordsData();
    const allRecords = Object.entries(records)
        .filter(([_, r]) => r.status === 'active')
        .sort((a, b) => new Date(b[1].date) - new Date(a[1].date));

    if (allRecords.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-history" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No change records found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = allRecords.map(([recordId, record]) => `
        <tr>
            <td>${formatDate(record.date)}</td>
            <td>${record.branchName}</td>
            <td>${currency} ${record.totalCoins.toFixed(2)}</td>
            <td>${currency} ${record.totalNotes.toFixed(2)}</td>
            <td><strong>${currency} ${record.totalChange.toFixed(2)}</strong></td>
            <td>${record.recordedByName}</td>
            <td>${formatTimestamp(record.recordedAt)}</td>
            <td>
                <div class="table-actions">
                    ${hasPermission('edit') ? `
                        <button class="icon-btn" onclick="editRecord('${recordId}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                    ` : ''}
                    ${hasPermission('delete') ? `
                        <button class="icon-btn danger" onclick="deleteRecord('${recordId}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

// Apply history filter
const applyHistoryFilter = document.getElementById('applyHistoryFilter');
if (applyHistoryFilter) {
    applyHistoryFilter.addEventListener('click', () => {
        const startDate = document.getElementById('historyStartDate').value;
        const endDate = document.getElementById('historyEndDate').value;
        const branchId = document.getElementById('historyBranchFilter').value;

        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;

        const currency = businessData?.currency || 'R';
        const records = getDailyRecordsData();

        let filteredRecords = Object.entries(records).filter(([_, r]) => r.status === 'active');

        if (startDate) {
            filteredRecords = filteredRecords.filter(([_, r]) => r.date >= startDate);
        }

        if (endDate) {
            filteredRecords = filteredRecords.filter(([_, r]) => r.date <= endDate);
        }

        if (branchId && branchId !== 'all') {
            filteredRecords = filteredRecords.filter(([_, r]) => r.branchId === branchId);
        }

        filteredRecords.sort((a, b) => new Date(b[1].date) - new Date(a[1].date));

        if (filteredRecords.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">
                        <i class="fas fa-filter" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                        No records match your filter criteria
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filteredRecords.map(([recordId, record]) => `
            <tr>
                <td>${formatDate(record.date)}</td>
                <td>${record.branchName}</td>
                <td>${currency} ${record.totalCoins.toFixed(2)}</td>
                <td>${currency} ${record.totalNotes.toFixed(2)}</td>
                <td><strong>${currency} ${record.totalChange.toFixed(2)}</strong></td>
                <td>${record.recordedByName}</td>
                <td>${formatTimestamp(record.recordedAt)}</td>
                <td>
                    <div class="table-actions">
                        ${hasPermission('edit') ? `
                            <button class="icon-btn" onclick="editRecord('${recordId}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${hasPermission('delete') ? `
                            <button class="icon-btn danger" onclick="deleteRecord('${recordId}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    });
}

// View reports button
const viewReportsBtn = document.getElementById('viewReportsBtn');
if (viewReportsBtn) {
    viewReportsBtn.addEventListener('click', () => {
        // Set default dates (last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        document.getElementById('reportStartDate').valueAsDate = startDate;
        document.getElementById('reportEndDate').valueAsDate = endDate;

        const modal = document.getElementById('viewReportsModal');
        if (modal) modal.classList.add('active');
    });
}

// Generate change report
const generateChangeReport = document.getElementById('generateChangeReport');
if (generateChangeReport) {
    generateChangeReport.addEventListener('click', () => {
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        const branchId = document.getElementById('reportBranchFilter').value;

        if (!startDate || !endDate) {
            showToast('Please select start and end dates', 'error');
            return;
        }

        const currency = businessData?.currency || 'R';
        const summary = getChangeSummary(startDate, endDate, branchId);
        const breakdown = getDenominationBreakdown(startDate, endDate, branchId);

        // Update summary
        document.getElementById('reportTotalRecords').textContent = summary.totalRecords;
        document.getElementById('reportAvgChange').textContent = `${currency} ${summary.averageChange.toFixed(2)}`;
        document.getElementById('reportHighest').textContent = `${currency} ${summary.highestChange.toFixed(2)}`;
        document.getElementById('reportLowest').textContent = `${currency} ${summary.lowestChange.toFixed(2)}`;

        // Update breakdown
        document.getElementById('breakdown1c').textContent = breakdown.coins.notes.toLocaleString();
        document.getElementById('breakdown5c').textContent = breakdown.coins.fiveCents.toLocaleString();
        document.getElementById('breakdown10c').textContent = breakdown.coins.tenCents.toLocaleString();
        document.getElementById('breakdown20c').textContent = breakdown.coins.twentyCents.toLocaleString();
        document.getElementById('breakdown50c').textContent = breakdown.coins.fiftyCents.toLocaleString();
        document.getElementById('breakdownR1').textContent = breakdown.coins.oneRand.toLocaleString();
        document.getElementById('breakdownR2').textContent = breakdown.coins.twoRand.toLocaleString();
        document.getElementById('breakdownR5').textContent = breakdown.coins.fiveRand.toLocaleString();
        document.getElementById('breakdownR10').textContent = breakdown.notes.tenRand.toLocaleString();
        document.getElementById('breakdownR20').textContent = breakdown.notes.twentyRand.toLocaleString();
        document.getElementById('breakdownR50').textContent = breakdown.notes.fiftyRand.toLocaleString();
        document.getElementById('breakdownR100').textContent = breakdown.notes.hundredRand.toLocaleString();
        document.getElementById('breakdownR200').textContent = breakdown.notes.twoHundredRand.toLocaleString();

        document.getElementById('reportPreview').style.display = 'block';
        showToast('Report generated successfully', 'success');
    });
}

// Archive old records button
const archiveOldBtn = document.getElementById('archiveOldBtn');
if (archiveOldBtn) {
    archiveOldBtn.addEventListener('click', async () => {
        if (!confirm('Archive all records older than 90 days? This action cannot be undone.')) {
            return;
        }

        try {
            const result = await archiveOldRecords();
            showToast(`${result.archivedCount} records archived successfully`, 'success');
            updateDashboardStats();
            displayTodaysChange();
            displayRecentRecords();
        } catch (error) {
            console.error('Error archiving records:', error);
            showToast('Failed to archive records', 'error');
        }
    });
}

// Close modals
const closeRecordChangeModal = document.getElementById('closeRecordChangeModal');
if (closeRecordChangeModal) {
    closeRecordChangeModal.addEventListener('click', () => {
        const modal = document.getElementById('recordChangeModal');
        if (modal) modal.classList.remove('active');
    });
}

const cancelRecordChange = document.getElementById('cancelRecordChange');
if (cancelRecordChange) {
    cancelRecordChange.addEventListener('click', () => {
        const modal = document.getElementById('recordChangeModal');
        if (modal) modal.classList.remove('active');
    });
}

const closeViewHistoryModal = document.getElementById('closeViewHistoryModal');
if (closeViewHistoryModal) {
    closeViewHistoryModal.addEventListener('click', () => {
        const modal = document.getElementById('viewHistoryModal');
        if (modal) modal.classList.remove('active');
    });
}

const closeViewReportsModal = document.getElementById('closeViewReportsModal');
if (closeViewReportsModal) {
    closeViewReportsModal.addEventListener('click', () => {
        const modal = document.getElementById('viewReportsModal');
        const reportPreview = document.getElementById('reportPreview');
        if (modal) modal.classList.remove('active');
        if (reportPreview) reportPreview.style.display = 'none';
    });
}

console.log('BongoBoss POS - Change Management UI Initialized ✓');