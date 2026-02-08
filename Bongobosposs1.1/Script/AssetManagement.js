import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, onValue, remove } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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
 * ASSET MANAGEMENT SYSTEM
 * 
 * DATABASE STRUCTURE:
 * /businesses/{businessId}/assets/
 *   ├── items/{assetId}
 *   │   ├── assetName
 *   │   ├── description
 *   │   ├── assetId (custom ID)
 *   │   ├── serialNumber
 *   │   ├── category
 *   │   ├── purchaseValue
 *   │   ├── currentValue
 *   │   ├── purchaseDate
 *   │   ├── depreciationRate
 *   │   ├── supplier
 *   │   ├── quantity
 *   │   ├── unit
 *   │   ├── condition (excellent, good, fair, poor, damaged)
 *   │   ├── branchId
 *   │   ├── branchName
 *   │   ├── location
 *   │   ├── requiresMaintenance
 *   │   ├── maintenanceInterval
 *   │   ├── lastMaintenance
 *   │   ├── nextMaintenance
 *   │   ├── warranty
 *   │   ├── notes
 *   │   ├── isActive
 *   │   ├── createdBy
 *   │   ├── createdAt
 *   │   ├── lastModifiedBy
 *   │   └── lastModifiedAt
 *   │
 *   ├── categories/{categoryId}
 *   │   ├── categoryName
 *   │   ├── createdBy
 *   │   └── createdAt
 *   │
 *   ├── damage/{damageId}
 *   │   ├── assetId
 *   │   ├── assetName
 *   │   ├── severity (minor, moderate, severe, total)
 *   │   ├── quantity
 *   │   ├── description
 *   │   ├── cause
 *   │   ├── damageDate
 *   │   ├── reportedBy
 *   │   ├── reportedByName
 *   │   ├── reportedAt
 *   │   └── notes
 *   │
 *   ├── usage/{usageId}
 *   │   ├── assetId
 *   │   ├── assetName
 *   │   ├── quantity
 *   │   ├── usageDate
 *   │   ├── purpose
 *   │   ├── recordedBy
 *   │   ├── recordedByName
 *   │   ├── recordedAt
 *   │   └── notes
 *   │
 *   ├── maintenance/{maintenanceId}
 *   │   ├── assetId
 *   │   ├── assetName
 *   │   ├── maintenanceType
 *   │   ├── scheduledDate
 *   │   ├── completedDate
 *   │   ├── estimatedCost
 *   │   ├── actualCost
 *   │   ├── description
 *   │   ├── assignedTo
 *   │   ├── status (scheduled, completed, cancelled)
 *   │   ├── scheduledBy
 *   │   ├── scheduledByName
 *   │   ├── scheduledAt
 *   │   └── notes
 *   │
 *   └── history/{historyId}
 *       ├── assetId
 *       ├── assetName
 *       ├── action (created, updated, damaged, usage-recorded, maintenance-scheduled, deleted)
 *       ├── changedBy
 *       ├── changedByName
 *       ├── timestamp
 *       ├── oldValue
 *       ├── newValue
 *       ├── field
 *       └── notes
 * 
 * ROLE-BASED ACCESS CONTROL:
 * - Owner: Full access to all operations
 * - Partner: Full access to all operations
 * - Admin: Full access to all operations
 * - Manager: Can add, edit, report damage, record usage, schedule maintenance (cannot delete)
 * - Employee: Read-only access (view assets)
 */

// Global variables
let currentUser = null;
let userData = null;
let businessId = null;
let businessData = null;
let allAssets = {};
let allCategories = {};
let allBranches = {};
let allDamage = {};
let allUsage = {};
let allMaintenance = {};
let allHistory = [];
let currentView = 'grid';
let isEditMode = false;
let editingAssetId = null;
let currentFilters = {
    category: 'all',
    condition: 'all',
    branch: 'all',
    sort: 'name-asc'
};

// Generate clean ID from email
function generateCleanId(email) {
    const username = email.split('@')[0];
    const cleanId = username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return cleanId;
}

// Check user role and permissions
function hasPermission(action) {
    if (!userData || !userData.role) return false;

    const role = userData.role.toLowerCase();

    const permissions = {
        'view': ['owner', 'partner', 'admin', 'manager', 'employee'],
        'add': ['owner', 'partner', 'admin', 'manager'],
        'edit': ['owner', 'partner', 'admin', 'manager'],
        'delete': ['owner', 'partner', 'admin'],
        'report-damage': ['owner', 'partner', 'admin', 'manager'],
        'record-usage': ['owner', 'partner', 'admin', 'manager'],
        'schedule-maintenance': ['owner', 'partner', 'admin', 'manager']
    };

    return permissions[action]?.includes(role) || false;
}

// Check authentication and load assets
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

        // Check if user has permission to view assets
        if (!hasPermission('view')) {
            showToast('You do not have permission to access asset management', 'error');
            setTimeout(() => {
                window.location.href = 'Dashboard.html';
            }, 2000);
            return;
        }

        await loadBusinessInfo();
        await loadBranches();
        await loadCategories();
        await loadAssets();
        await loadDamageReports();
        await loadUsageRecords();
        await loadMaintenanceSchedule();
        await loadHistory();

        // Hide loading screen
        document.getElementById('loadingScreen').classList.add('hidden');

        // Setup UI based on permissions
        setupUIPermissions();

    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Failed to load user data', 'error');
    }
}

// Setup UI based on user permissions
function setupUIPermissions() {
    const addAssetBtn = document.getElementById('addAssetBtn');
    const reportDamageBtn = document.getElementById('reportDamageBtn');
    const recordUsageBtn = document.getElementById('recordUsageBtn');
    const scheduleMaintenance = document.getElementById('scheduleMaintenance');

    if (!hasPermission('add')) {
        if (addAssetBtn) addAssetBtn.style.display = 'none';
    }

    if (!hasPermission('report-damage')) {
        if (reportDamageBtn) reportDamageBtn.style.display = 'none';
    }

    if (!hasPermission('record-usage')) {
        if (recordUsageBtn) recordUsageBtn.style.display = 'none';
    }

    if (!hasPermission('schedule-maintenance')) {
        if (scheduleMaintenance) scheduleMaintenance.style.display = 'none';
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

        const branchFilter = document.getElementById('branchFilter');
        const assetBranch = document.getElementById('assetBranch');

        if (snapshot.exists()) {
            allBranches = snapshot.val();

            if (branchFilter) branchFilter.innerHTML = '<option value="all">All Branches</option>';
            if (assetBranch) assetBranch.innerHTML = '<option value="">Select branch</option>';

            Object.entries(allBranches).forEach(([branchId, branch]) => {
                if (branchFilter) {
                    const filterOption = new Option(branch.branchName, branchId);
                    branchFilter.appendChild(filterOption);
                }

                if (assetBranch) {
                    const formOption = new Option(branch.branchName, branchId);
                    assetBranch.appendChild(formOption);
                }
            });
        }
    } catch (error) {
        console.error('Error loading branches:', error);
    }
}
// Load categories
async function loadCategories() {
    try {
        const categoriesRef = ref(db, `businesses/${businessId}/assets/categories`);
        const snapshot = await get(categoriesRef);

        const categoryFilter = document.getElementById('categoryFilter');
        const assetCategory = document.getElementById('assetCategory');

        if (categoryFilter) categoryFilter.innerHTML = '<option value="all">All Categories</option>';
        if (assetCategory) assetCategory.innerHTML = '<option value="">Select category</option>';

        if (snapshot.exists()) {
            allCategories = snapshot.val();

            Object.entries(allCategories).forEach(([categoryId, category]) => {
                if (categoryFilter) {
                    const filterOption = new Option(category.categoryName, categoryId);
                    categoryFilter.appendChild(filterOption);
                }

                if (assetCategory) {
                    const formOption = new Option(category.categoryName, categoryId);
                    assetCategory.appendChild(formOption);
                }
            });
        }

        // Add default categories if none exist
        if (Object.keys(allCategories).length === 0) {
            const defaultCategories = [
                'Equipment',
                'Furniture',
                'Vehicles',
                'Electronics',
                'Tools',
                'Containers & Storage',
                'Cleaning Equipment'
            ];

            for (const catName of defaultCategories) {
                const catRef = push(categoriesRef);
                await set(catRef, {
                    categoryName: catName,
                    createdBy: userData.displayName,
                    createdAt: new Date().toISOString()
                });
            }

            await loadCategories(); // Reload to populate dropdowns
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Load assets
async function loadAssets() {
    try {
        const assetsRef = ref(db, `businesses/${businessId}/assets/items`);
        const snapshot = await get(assetsRef);

        const assetsGrid = document.getElementById('assetsGrid');
        const assetsTableBody = document.getElementById('assetsTableBody');
        const loadingState = document.getElementById('assetsLoading');

        if (loadingState) loadingState.style.display = 'flex';

        if (snapshot.exists()) {
            allAssets = snapshot.val();

            // Calculate current values with depreciation
            Object.entries(allAssets).forEach(([assetId, asset]) => {
                if (!asset.currentValue && asset.purchaseValue && asset.purchaseDate && asset.depreciationRate) {
                    asset.currentValue = calculateDepreciatedValue(
                        asset.purchaseValue,
                        asset.purchaseDate,
                        asset.depreciationRate
                    );
                }
            });

            updateAssetStats();
            displayAssets();
        } else {
            allAssets = {};
            updateAssetStats();

            if (assetsGrid) {
                assetsGrid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1;">
                        <i class="fas fa-tools"></i>
                        <h3>No Assets Yet</h3>
                        <p>Add your first asset to get started</p>
                    </div>
                `;
            }

            if (assetsTableBody) {
                assetsTableBody.innerHTML = `
                    <tr>
                        <td colspan="9" style="text-align: center; padding: 3rem;">
                            <i class="fas fa-tools" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem; display: block;"></i>
                            <p style="color: #94a3b8;">No assets yet. Add your first asset to get started.</p>
                        </td>
                    </tr>
                `;
            }
        }

        if (loadingState) loadingState.style.display = 'none';

    } catch (error) {
        console.error('Error loading assets:', error);
        showToast('Failed to load assets', 'error');
    }
}

// Calculate depreciated value
function calculateDepreciatedValue(purchaseValue, purchaseDate, depreciationRate) {
    const yearsOld = (new Date() - new Date(purchaseDate)) / (365.25 * 24 * 60 * 60 * 1000);
    const depreciationFactor = Math.pow(1 - (depreciationRate / 100), yearsOld);
    const currentValue = purchaseValue * depreciationFactor;
    return Math.max(0, currentValue); // Don't go below 0
}

// Update asset statistics
function updateAssetStats() {
    const assets = Object.values(allAssets);
    const currency = businessData?.currency || 'R';

    // Total assets
    const totalAssets = assets.length;
    const totalCategories = Object.keys(allCategories).length;
    const totalAssetsEl = document.getElementById('totalAssets');
    const assetsChangeEl = document.getElementById('assetsChange');
    if (totalAssetsEl) totalAssetsEl.textContent = totalAssets;
    if (assetsChangeEl) assetsChangeEl.textContent = `${totalCategories} categories`;

    // Total value (current value)
    const totalValue = assets.reduce((sum, asset) => {
        const assetValue = asset.currentValue || asset.purchaseValue || 0;
        return sum + (assetValue * (asset.quantity || 1));
    }, 0);
    const totalValueEl = document.getElementById('totalValue');
    if (totalValueEl) {
        totalValueEl.textContent = `${currency} ${totalValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Maintenance due
    const now = new Date();
    const maintenanceDue = assets.filter(asset => {
        if (!asset.requiresMaintenance || !asset.nextMaintenance) return false;
        return new Date(asset.nextMaintenance) <= now;
    }).length;

    const maintenanceDueEl = document.getElementById('maintenanceDue');
    if (maintenanceDueEl) maintenanceDueEl.textContent = maintenanceDue;

    // Overdue maintenance
    const maintenanceOverdue = assets.filter(asset => {
        if (!asset.requiresMaintenance || !asset.nextMaintenance) return false;
        const daysOverdue = (now - new Date(asset.nextMaintenance)) / (24 * 60 * 60 * 1000);
        return daysOverdue > 7; // More than 7 days overdue
    }).length;

    const maintenanceOverdueEl = document.getElementById('maintenanceOverdue');
    if (maintenanceOverdueEl) maintenanceOverdueEl.textContent = `${maintenanceOverdue} overdue`;

    // Damaged assets
    const damagedAssets = assets.filter(a => a.condition === 'damaged').length;
    const damagedAssetsEl = document.getElementById('damagedAssets');
    if (damagedAssetsEl) damagedAssetsEl.textContent = damagedAssets;
}

// Display assets
function displayAssets() {
    let assets = Object.entries(allAssets);

    // Apply filters
    if (currentFilters.category !== 'all') {
        assets = assets.filter(([_, a]) => a.category === currentFilters.category);
    }

    if (currentFilters.condition !== 'all') {
        assets = assets.filter(([_, a]) => a.condition === currentFilters.condition);
    }

    if (currentFilters.branch !== 'all') {
        assets = assets.filter(([_, a]) => a.branchId === currentFilters.branch);
    }

    // Apply sorting
    assets.sort((a, b) => {
        const [, assetA] = a;
        const [, assetB] = b;

        switch (currentFilters.sort) {
            case 'name-asc':
                return assetA.assetName.localeCompare(assetB.assetName);
            case 'name-desc':
                return assetB.assetName.localeCompare(assetA.assetName);
            case 'value-high':
                const valueA = (assetA.currentValue || assetA.purchaseValue || 0) * (assetA.quantity || 1);
                const valueB = (assetB.currentValue || assetB.purchaseValue || 0) * (assetB.quantity || 1);
                return valueB - valueA;
            case 'value-low':
                const valA = (assetA.currentValue || assetA.purchaseValue || 0) * (assetA.quantity || 1);
                const valB = (assetB.currentValue || assetB.purchaseValue || 0) * (assetB.quantity || 1);
                return valA - valB;
            case 'date-new':
                return new Date(assetB.createdAt) - new Date(assetA.createdAt);
            case 'date-old':
                return new Date(assetA.createdAt) - new Date(assetB.createdAt);
            default:
                return 0;
        }
    });

    // Display in current view
    if (currentView === 'grid') {
        displayGridView(assets);
    } else {
        displayListView(assets);
    }
}

// Display grid view
function displayGridView(assets) {
    const assetsGrid = document.getElementById('assetsGrid');
    if (!assetsGrid) return;

    const currency = businessData?.currency || 'R';

    if (assets.length === 0) {
        assetsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fas fa-filter"></i>
                <h3>No Assets Match Filter</h3>
                <p>Try adjusting your filter criteria</p>
            </div>
        `;
        return;
    }

    assetsGrid.innerHTML = assets.map(([assetId, asset]) => {
        const currentValue = asset.currentValue || asset.purchaseValue || 0;
        const totalValue = currentValue * (asset.quantity || 1);
        const conditionClass = `asset-status-${asset.condition}`;

        // Check maintenance status
        let maintenanceStatus = '';
        if (asset.requiresMaintenance && asset.nextMaintenance) {
            const daysUntil = Math.ceil((new Date(asset.nextMaintenance) - new Date()) / (24 * 60 * 60 * 1000));
            if (daysUntil < 0) {
                maintenanceStatus = `<div class="maintenance-due" style="color: var(--danger-color); font-size: 0.85rem; margin-top: 0.5rem;">
                    <i class="fas fa-exclamation-circle"></i> Maintenance overdue by ${Math.abs(daysUntil)} days
                </div>`;
            } else if (daysUntil <= 7) {
                maintenanceStatus = `<div style="color: var(--warning-color); font-size: 0.85rem; margin-top: 0.5rem;">
                    <i class="fas fa-wrench"></i> Maintenance due in ${daysUntil} days
                </div>`;
            }
        }

        return `
            <div class="product-card">
                <div class="product-image">
                    <i class="fas fa-tools"></i>
                    <span class="product-badge ${conditionClass}">
                        ${asset.condition.charAt(0).toUpperCase() + asset.condition.slice(1)}
                    </span>
                </div>
                <div class="product-info">
                    <h3 class="product-name">${asset.assetName}</h3>
                    <p class="product-sku">ID: ${asset.assetId || 'N/A'} | Serial: ${asset.serialNumber || 'N/A'}</p>
                    
                    <div class="product-details">
                        <div class="detail-row">
                            <span class="detail-label">Category:</span>
                            <span class="detail-value">${allCategories[asset.category]?.categoryName || 'N/A'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Purchase Value:</span>
                            <span class="detail-value">${currency} ${asset.purchaseValue.toFixed(2)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Current Value:</span>
                            <span class="detail-value price">${currency} ${currentValue.toFixed(2)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Quantity:</span>
                            <span class="detail-value">${asset.quantity} ${asset.unit}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Total Value:</span>
                            <span class="detail-value price" style="font-weight: 600;">${currency} ${totalValue.toFixed(2)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Branch:</span>
                            <span class="detail-value">${asset.branchName}</span>
                        </div>
                        ${asset.location ? `
                        <div class="detail-row">
                            <span class="detail-label">Location:</span>
                            <span class="detail-value">${asset.location}</span>
                        </div>
                        ` : ''}
                    </div>

                    ${maintenanceStatus}

                    <div class="product-actions" style="margin-top: 1rem;">
                        ${hasPermission('edit') ? `
                            <button class="btn-edit" onclick="editAsset('${assetId}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                        ` : ''}
                        ${hasPermission('delete') ? `
                            <button class="btn-delete" onclick="deleteAsset('${assetId}', '${asset.assetName}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
// Display list view
function displayListView(assets) {
    const assetsTableBody = document.getElementById('assetsTableBody');
    if (!assetsTableBody) return;

    const currency = businessData?.currency || 'R';

    if (assets.length === 0) {
        assetsTableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 3rem;">
                    <i class="fas fa-filter" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem; display: block;"></i>
                    <p style="color: #94a3b8;">No assets match your filter criteria</p>
                </td>
            </tr>
        `;
        return;
    }

    assetsTableBody.innerHTML = assets.map(([assetId, asset]) => {
        const currentValue = asset.currentValue || asset.purchaseValue || 0;
        const totalValue = currentValue * (asset.quantity || 1);
        const conditionClass = `asset-status-${asset.condition}`;

        return `
            <tr>
                <td>
                    <div class="product-cell">
                        <div class="product-thumb">
                            <i class="fas fa-tools"></i>
                        </div>
                        <div class="product-text">
                            <h4>${asset.assetName}</h4>
                            <p>${asset.description || 'No description'}</p>
                        </div>
                    </div>
                </td>
                <td>
                    <div>${asset.assetId || 'N/A'}</div>
                    <small style="color: #64748b;">${asset.serialNumber || 'No serial'}</small>
                </td>
                <td>${allCategories[asset.category]?.categoryName || 'N/A'}</td>
                <td>${currency} ${asset.purchaseValue.toFixed(2)}</td>
                <td>
                    <strong>${currency} ${currentValue.toFixed(2)}</strong>
                    <br><small style="color: var(--gray-600);">Total: ${currency} ${totalValue.toFixed(2)}</small>
                </td>
                <td>${asset.quantity} ${asset.unit}</td>
                <td>
                    <span class="usage-badge ${conditionClass}" style="text-transform: capitalize;">
                        ${asset.condition}
                    </span>
                </td>
                <td>${asset.branchName}</td>
                <td>
                    <div class="table-actions">
                        ${hasPermission('edit') ? `
                            <button class="icon-btn" onclick="editAsset('${assetId}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${hasPermission('delete') ? `
                            <button class="icon-btn danger" onclick="deleteAsset('${assetId}', '${asset.assetName}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Show asset modal
window.showAssetModal = function () {
    if (!hasPermission('add')) {
        showToast('You do not have permission to add assets', 'error');
        return;
    }

    const assetModal = document.getElementById('assetModal');
    const modalTitle = document.getElementById('modalTitle');
    const saveBtn = document.getElementById('saveAssetBtn');
    const assetForm = document.getElementById('assetForm');

    if (assetModal) assetModal.classList.add('active');
    if (modalTitle) modalTitle.textContent = 'Add New Asset';
    if (saveBtn) {
        const btnText = saveBtn.querySelector('.btn-text');
        if (btnText) btnText.innerHTML = '<i class="fas fa-save"></i> Save Asset';
    }

    isEditMode = false;
    editingAssetId = null;
    if (assetForm) assetForm.reset();

    const requiresMaintenanceEl = document.getElementById('requiresMaintenance');
    const isActiveEl = document.getElementById('isActive');
    const maintenanceDetailsEl = document.getElementById('maintenanceDetails');

    if (requiresMaintenanceEl) requiresMaintenanceEl.checked = false;
    if (isActiveEl) isActiveEl.checked = true;
    if (maintenanceDetailsEl) maintenanceDetailsEl.style.display = 'none';

    // Set default values
    const purchaseDateEl = document.getElementById('purchaseDate');
    const depreciationRateEl = document.getElementById('depreciationRate');
    const quantityEl = document.getElementById('quantity');
    const conditionEl = document.getElementById('condition');

    if (purchaseDateEl) purchaseDateEl.valueAsDate = new Date();
    if (depreciationRateEl) depreciationRateEl.value = 20;
    if (quantityEl) quantityEl.value = 1;
    if (conditionEl) conditionEl.value = 'excellent';
};

// Edit asset
window.editAsset = function (assetId) {
    if (!hasPermission('edit')) {
        showToast('You do not have permission to edit assets', 'error');
        return;
    }

    const asset = allAssets[assetId];
    if (!asset) return;

    isEditMode = true;
    editingAssetId = assetId;

    // Populate form
    const setFieldValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    };

    const setFieldChecked = (id, checked) => {
        const el = document.getElementById(id);
        if (el) el.checked = checked;
    };

    setFieldValue('assetName', asset.assetName);
    setFieldValue('assetDescription', asset.description);
    setFieldValue('assetId', asset.assetId);
    setFieldValue('serialNumber', asset.serialNumber);
    setFieldValue('assetCategory', asset.category);
    setFieldValue('purchaseValue', asset.purchaseValue);
    setFieldValue('currentValue', asset.currentValue);
    setFieldValue('purchaseDate', asset.purchaseDate);
    setFieldValue('depreciationRate', asset.depreciationRate !== undefined ? asset.depreciationRate : 20);
    setFieldValue('supplier', asset.supplier);
    setFieldValue('assetBranch', asset.branchId);
    setFieldValue('quantity', asset.quantity || 1);
    setFieldValue('unit', asset.unit);
    setFieldValue('condition', asset.condition);
    setFieldValue('location', asset.location);
    setFieldValue('warranty', asset.warranty);
    setFieldValue('notes', asset.notes);
    setFieldChecked('requiresMaintenance', asset.requiresMaintenance || false);
    setFieldChecked('isActive', asset.isActive !== false);

    // Populate maintenance fields
    const requiresMaintenance = asset.requiresMaintenance || false;
    setFieldChecked('requiresMaintenance', requiresMaintenance);

    const maintenanceDetailsEl = document.getElementById('maintenanceDetails');
    if (requiresMaintenance && maintenanceDetailsEl) {
        maintenanceDetailsEl.style.display = 'block';
        setFieldValue('maintenanceInterval', asset.maintenanceInterval);
        setFieldValue('lastMaintenance', asset.lastMaintenance);
    }

    // Update modal
    const modalTitle = document.getElementById('modalTitle');
    const saveBtn = document.getElementById('saveAssetBtn');
    const assetModal = document.getElementById('assetModal');

    if (modalTitle) modalTitle.textContent = 'Edit Asset';
    if (saveBtn) {
        const btnText = saveBtn.querySelector('.btn-text');
        if (btnText) btnText.innerHTML = '<i class="fas fa-save"></i> Update Asset';
    }
    if (assetModal) assetModal.classList.add('active');
};

// Delete asset
window.deleteAsset = async function (assetId, assetName) {
    if (!hasPermission('delete')) {
        showToast('You do not have permission to delete assets', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete "${assetName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const assetRef = ref(db, `businesses/${businessId}/assets/items/${assetId}`);
        const asset = allAssets[assetId];

        // Log deletion
        await logAssetChange({
            assetId: assetId,
            assetName: assetName,
            action: 'deleted',
            field: 'asset',
            oldValue: JSON.stringify(asset),
            newValue: 'null',
            notes: `Asset deleted from system`
        });

        await remove(assetRef);

        showToast('Asset deleted successfully', 'success');
        await loadAssets();
        await loadHistory();

    } catch (error) {
        console.error('Error deleting asset:', error);
        showToast('Failed to delete asset', 'error');
    }
};

// Log asset change
async function logAssetChange(changeData) {
    try {
        const historyRef = ref(db, `businesses/${businessId}/assets/history`);
        const newHistoryRef = push(historyRef);

        await set(newHistoryRef, {
            ...changeData,
            changedBy: generateCleanId(currentUser.email),
            changedByName: userData.displayName,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error logging change:', error);
    }
}

// Load damage reports
async function loadDamageReports() {
    try {
        const damageRef = ref(db, `businesses/${businessId}/assets/damage`);
        const snapshot = await get(damageRef);

        if (snapshot.exists()) {
            allDamage = snapshot.val();
        } else {
            allDamage = {};
        }
    } catch (error) {
        console.error('Error loading damage reports:', error);
    }
}

// Load usage records
async function loadUsageRecords() {
    try {
        const usageRef = ref(db, `businesses/${businessId}/assets/usage`);
        const snapshot = await get(usageRef);

        if (snapshot.exists()) {
            allUsage = snapshot.val();
        } else {
            allUsage = {};
        }
    } catch (error) {
        console.error('Error loading usage records:', error);
    }
}

// Load maintenance schedule
async function loadMaintenanceSchedule() {
    try {
        const maintenanceRef = ref(db, `businesses/${businessId}/assets/maintenance`);
        const snapshot = await get(maintenanceRef);

        if (snapshot.exists()) {
            allMaintenance = snapshot.val();
        } else {
            allMaintenance = {};
        }
    } catch (error) {
        console.error('Error loading maintenance schedule:', error);
    }
}

// Load change history
async function loadHistory() {
    try {
        const historyRef = ref(db, `businesses/${businessId}/assets/history`);
        const snapshot = await get(historyRef);

        if (snapshot.exists()) {
            const historyData = snapshot.val();
            allHistory = Object.entries(historyData)
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } else {
            allHistory = [];
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}// Report Damage Modal
window.showReportDamageModal = function () {
    if (!hasPermission('report-damage')) {
        showToast('You do not have permission to report damage', 'error');
        return;
    }

    // Populate asset dropdown
    const damageAssetSelect = document.getElementById('damageAsset');
    if (damageAssetSelect) {
        damageAssetSelect.innerHTML = '<option value="">Select asset</option>';

        Object.entries(allAssets).forEach(([assetId, asset]) => {
            if (asset.quantity > 0 && asset.condition !== 'damaged') {
                const option = new Option(
                    `${asset.assetName} (${asset.quantity} ${asset.unit} available)`,
                    assetId
                );
                damageAssetSelect.appendChild(option);
            }
        });
    }

    const reportDamageModal = document.getElementById('reportDamageModal');
    if (reportDamageModal) reportDamageModal.classList.add('active');
};

// Damage Asset Selection Handler
const damageAsset = document.getElementById('damageAsset');
if (damageAsset) {
    damageAsset.addEventListener('change', (e) => {
        const assetId = e.target.value;
        const availableQuantity = document.getElementById('availableQuantity');

        if (!assetId) {
            if (availableQuantity) availableQuantity.textContent = '';
            return;
        }

        const asset = allAssets[assetId];
        if (availableQuantity) {
            availableQuantity.textContent = `Available: ${asset.quantity} ${asset.unit}`;
        }
    });
}

// Report Damage Form Submission
const reportDamageForm = document.getElementById('reportDamageForm');
if (reportDamageForm) {
    reportDamageForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const damageData = {
            assetId: document.getElementById('damageAsset').value,
            severity: document.getElementById('damageSeverity').value,
            quantity: parseInt(document.getElementById('damageQuantity').value),
            description: document.getElementById('damageDescription').value.trim(),
            cause: document.getElementById('damageCause').value,
            damageDate: document.getElementById('damageDate').value || new Date().toISOString().split('T')[0],
            notes: document.getElementById('damageNotes').value.trim()
        };

        const asset = allAssets[damageData.assetId];
        if (damageData.quantity > asset.quantity) {
            showToast('Damage quantity cannot exceed available quantity', 'error');
            return;
        }

        const btn = document.getElementById('submitReportDamage');
        setLoading(btn, true);

        try {
            const damageRef = ref(db, `businesses/${businessId}/assets/damage`);
            const newDamageRef = push(damageRef);

            const damageRecord = {
                ...damageData,
                assetName: asset.assetName,
                branchId: asset.branchId,
                branchName: asset.branchName,
                unit: asset.unit,
                reportedBy: generateCleanId(currentUser.email),
                reportedByName: userData.displayName,
                reportedAt: new Date().toISOString()
            };

            await set(newDamageRef, damageRecord);

            // Update asset condition and quantity
            const assetRef = ref(db, `businesses/${businessId}/assets/items/${damageData.assetId}`);
            const newQuantity = asset.quantity - damageData.quantity;

            let updateData = {
                quantity: newQuantity,
                lastModifiedBy: userData.displayName,
                lastModifiedAt: new Date().toISOString()
            };

            // If severe or total damage, mark asset as damaged
            if (damageData.severity === 'severe' || damageData.severity === 'total') {
                updateData.condition = 'damaged';
            } else if (damageData.severity === 'moderate' && asset.condition === 'excellent') {
                updateData.condition = 'good';
            }

            await update(assetRef, updateData);

            // Log the damage report
            await logAssetChange({
                assetId: damageData.assetId,
                assetName: asset.assetName,
                action: 'damaged',
                field: 'damage-report',
                oldValue: `Quantity: ${asset.quantity}`,
                newValue: `Quantity: ${newQuantity}, Severity: ${damageData.severity}`,
                notes: `Damage reported: ${damageData.description}`
            });

            showToast('Damage reported successfully', 'success');
            const reportDamageModal = document.getElementById('reportDamageModal');
            if (reportDamageModal) reportDamageModal.classList.remove('active');
            reportDamageForm.reset();
            await loadAssets();
            await loadDamageReports();
            await loadHistory();

        } catch (error) {
            console.error('Error reporting damage:', error);
            showToast('Failed to report damage', 'error');
        } finally {
            setLoading(btn, false);
        }
    });
}

// Record Usage Modal
window.showRecordUsageModal = function () {
    if (!hasPermission('record-usage')) {
        showToast('You do not have permission to record usage', 'error');
        return;
    }

    // Populate asset dropdown
    const usageAssetSelect = document.getElementById('usageAsset');
    if (usageAssetSelect) {
        usageAssetSelect.innerHTML = '<option value="">Select asset</option>';

        Object.entries(allAssets).forEach(([assetId, asset]) => {
            if (asset.quantity > 0) {
                const option = new Option(
                    `${asset.assetName} (${asset.quantity} ${asset.unit} available)`,
                    assetId
                );
                usageAssetSelect.appendChild(option);
            }
        });
    }

    const recordUsageModal = document.getElementById('recordUsageModal');
    if (recordUsageModal) recordUsageModal.classList.add('active');
};

// Usage Asset Selection Handler
const usageAsset = document.getElementById('usageAsset');
if (usageAsset) {
    usageAsset.addEventListener('change', (e) => {
        const assetId = e.target.value;
        const usageAvailableQuantity = document.getElementById('usageAvailableQuantity');

        if (!assetId) {
            if (usageAvailableQuantity) usageAvailableQuantity.textContent = '';
            return;
        }

        const asset = allAssets[assetId];
        if (usageAvailableQuantity) {
            usageAvailableQuantity.textContent = `Available: ${asset.quantity} ${asset.unit}`;
        }
    });
}

// Record Usage Form Submission
const recordUsageForm = document.getElementById('recordUsageForm');
if (recordUsageForm) {
    recordUsageForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const usageData = {
            assetId: document.getElementById('usageAsset').value,
            quantity: parseInt(document.getElementById('usageQuantity').value),
            usageDate: document.getElementById('usageDate').value,
            purpose: document.getElementById('usagePurpose').value,
            notes: document.getElementById('usageNotes').value.trim()
        };

        const asset = allAssets[usageData.assetId];
        if (usageData.quantity > asset.quantity) {
            showToast('Usage quantity cannot exceed available quantity', 'error');
            return;
        }

        const btn = document.getElementById('submitRecordUsage');
        setLoading(btn, true);

        try {
            const usageRef = ref(db, `businesses/${businessId}/assets/usage`);
            const newUsageRef = push(usageRef);

            const usageRecord = {
                ...usageData,
                assetName: asset.assetName,
                branchId: asset.branchId,
                branchName: asset.branchName,
                unit: asset.unit,
                recordedBy: generateCleanId(currentUser.email),
                recordedByName: userData.displayName,
                recordedAt: new Date().toISOString()
            };

            await set(newUsageRef, usageRecord);

            // Update asset quantity
            const assetRef = ref(db, `businesses/${businessId}/assets/items/${usageData.assetId}`);
            const newQuantity = asset.quantity - usageData.quantity;

            await update(assetRef, {
                quantity: newQuantity,
                lastModifiedBy: userData.displayName,
                lastModifiedAt: new Date().toISOString()
            });

            // Log the usage
            await logAssetChange({
                assetId: usageData.assetId,
                assetName: asset.assetName,
                action: 'usage-recorded',
                field: 'quantity',
                oldValue: `${asset.quantity} ${asset.unit}`,
                newValue: `${newQuantity} ${asset.unit}`,
                notes: `Usage recorded: ${usageData.quantity} ${asset.unit} for ${usageData.purpose}`
            });

            showToast('Usage recorded successfully', 'success');
            const recordUsageModal = document.getElementById('recordUsageModal');
            if (recordUsageModal) recordUsageModal.classList.remove('active');
            recordUsageForm.reset();
            await loadAssets();
            await loadUsageRecords();
            await loadHistory();

        } catch (error) {
            console.error('Error recording usage:', error);
            showToast('Failed to record usage', 'error');
        } finally {
            setLoading(btn, false);
        }
    });
}// Schedule Maintenance Modal
window.showMaintenanceModal = function () {
    if (!hasPermission('schedule-maintenance')) {
        showToast('You do not have permission to schedule maintenance', 'error');
        return;
    }

    // Populate asset dropdown with assets requiring maintenance
    const maintenanceAssetSelect = document.getElementById('maintenanceAsset');
    if (maintenanceAssetSelect) {
        maintenanceAssetSelect.innerHTML = '<option value="">Select asset</option>';

        Object.entries(allAssets).forEach(([assetId, asset]) => {
            const option = new Option(
                `${asset.assetName} - ${asset.branchName}`,
                assetId
            );
            maintenanceAssetSelect.appendChild(option);
        });
    }

    const maintenanceModal = document.getElementById('maintenanceModal');
    if (maintenanceModal) maintenanceModal.classList.add('active');
};

// Schedule Maintenance Form Submission
const maintenanceForm = document.getElementById('maintenanceForm');
if (maintenanceForm) {
    maintenanceForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const maintenanceData = {
            assetId: document.getElementById('maintenanceAsset').value,
            maintenanceType: document.getElementById('maintenanceType').value,
            scheduledDate: document.getElementById('scheduledDate').value,
            estimatedCost: parseFloat(document.getElementById('estimatedCost').value) || 0,
            description: document.getElementById('maintenanceDescription').value.trim(),
            assignedTo: document.getElementById('assignedTo').value.trim()
        };

        const asset = allAssets[maintenanceData.assetId];

        const btn = document.getElementById('submitMaintenance');
        setLoading(btn, true);

        try {
            const maintenanceRef = ref(db, `businesses/${businessId}/assets/maintenance`);
            const newMaintenanceRef = push(maintenanceRef);

            const maintenanceRecord = {
                ...maintenanceData,
                assetName: asset.assetName,
                branchId: asset.branchId,
                branchName: asset.branchName,
                status: 'scheduled',
                scheduledBy: generateCleanId(currentUser.email),
                scheduledByName: userData.displayName,
                scheduledAt: new Date().toISOString()
            };

            await set(newMaintenanceRef, maintenanceRecord);

            // Update asset next maintenance date
            const assetRef = ref(db, `businesses/${businessId}/assets/items/${maintenanceData.assetId}`);
            await update(assetRef, {
                nextMaintenance: maintenanceData.scheduledDate,
                lastModifiedBy: userData.displayName,
                lastModifiedAt: new Date().toISOString()
            });

            // Log the maintenance scheduling
            await logAssetChange({
                assetId: maintenanceData.assetId,
                assetName: asset.assetName,
                action: 'maintenance-scheduled',
                field: 'maintenance',
                oldValue: asset.nextMaintenance || 'null',
                newValue: maintenanceData.scheduledDate,
                notes: `${maintenanceData.maintenanceType} scheduled for ${maintenanceData.scheduledDate}`
            });

            showToast('Maintenance scheduled successfully', 'success');
            const maintenanceModal = document.getElementById('maintenanceModal');
            if (maintenanceModal) maintenanceModal.classList.remove('active');
            maintenanceForm.reset();
            await loadAssets();
            await loadMaintenanceSchedule();
            await loadHistory();

        } catch (error) {
            console.error('Error scheduling maintenance:', error);
            showToast('Failed to schedule maintenance', 'error');
        } finally {
            setLoading(btn, false);
        }
    });
}

// View Maintenance Modal
window.showViewMaintenanceModal = function () {
    updateMaintenanceSummary();
    displayMaintenanceSchedule();
    const viewMaintenanceModal = document.getElementById('viewMaintenanceModal');
    if (viewMaintenanceModal) viewMaintenanceModal.classList.add('active');
};

// Update maintenance summary
function updateMaintenanceSummary() {
    const maintenanceItems = Object.values(allMaintenance);
    const now = new Date();

    const upcoming = maintenanceItems.filter(m =>
        m.status === 'scheduled' && new Date(m.scheduledDate) > now
    ).length;

    const overdue = maintenanceItems.filter(m =>
        m.status === 'scheduled' && new Date(m.scheduledDate) <= now
    ).length;

    const completed = maintenanceItems.filter(m =>
        m.status === 'completed'
    ).length;

    const upcomingMaintenanceEl = document.getElementById('upcomingMaintenance');
    const overdueMaintenanceEl = document.getElementById('overdueMaintenance');
    const completedMaintenanceEl = document.getElementById('completedMaintenance');

    if (upcomingMaintenanceEl) upcomingMaintenanceEl.textContent = upcoming;
    if (overdueMaintenanceEl) overdueMaintenanceEl.textContent = overdue;
    if (completedMaintenanceEl) completedMaintenanceEl.textContent = completed;
}

// Display maintenance schedule
function displayMaintenanceSchedule() {
    const maintenanceTableBody = document.getElementById('maintenanceTableBody');
    if (!maintenanceTableBody) return;

    const maintenanceItems = Object.entries(allMaintenance)
        .sort((a, b) => new Date(a[1].scheduledDate) - new Date(b[1].scheduledDate));

    const currency = businessData?.currency || 'R';

    if (maintenanceItems.length === 0) {
        maintenanceTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-wrench" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No maintenance scheduled
                </td>
            </tr>
        `;
        return;
    }

    const now = new Date();

    maintenanceTableBody.innerHTML = maintenanceItems.map(([maintenanceId, maintenance]) => {
        const scheduledDate = new Date(maintenance.scheduledDate);
        const isOverdue = maintenance.status === 'scheduled' && scheduledDate < now;

        let statusClass = 'warning';
        let statusIcon = 'fa-clock';
        let statusText = 'Scheduled';

        if (maintenance.status === 'completed') {
            statusClass = 'success';
            statusIcon = 'fa-check-circle';
            statusText = 'Completed';
        } else if (isOverdue) {
            statusClass = 'danger';
            statusIcon = 'fa-exclamation-circle';
            statusText = 'Overdue';
        }

        return `
            <tr>
                <td><strong>${maintenance.assetName}</strong></td>
                <td><span class="badge" style="background: var(--primary-light); color: var(--primary-color);">${maintenance.maintenanceType}</span></td>
                <td>${new Date(maintenance.scheduledDate).toLocaleDateString('en-ZA')}</td>
                <td>${currency} ${maintenance.estimatedCost.toFixed(2)}</td>
                <td>${maintenance.assignedTo || 'Unassigned'}</td>
                <td>
                    <span class="status-badge ${statusClass}">
                        <i class="fas ${statusIcon}"></i> ${statusText}
                    </span>
                </td>
                <td>
                    <div class="table-actions">
                        ${maintenance.status === 'scheduled' ? `
                            <button class="icon-btn success" onclick="completeMaintenance('${maintenanceId}')" title="Mark Complete">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="icon-btn danger" onclick="cancelMaintenance('${maintenanceId}')" title="Cancel">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                        ${hasPermission('delete') ? `
                            <button class="icon-btn danger" onclick="deleteMaintenance('${maintenanceId}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Complete maintenance
window.completeMaintenance = async function (maintenanceId) {
    const actualCost = prompt('Enter actual cost of maintenance (optional):');

    try {
        const maintenanceRef = ref(db, `businesses/${businessId}/assets/maintenance/${maintenanceId}`);
        const maintenance = allMaintenance[maintenanceId];

        const updateData = {
            status: 'completed',
            completedDate: new Date().toISOString(),
            actualCost: actualCost ? parseFloat(actualCost) : maintenance.estimatedCost
        };

        await update(maintenanceRef, updateData);

        // Update asset last maintenance and calculate next maintenance
        const asset = allAssets[maintenance.assetId];
        const assetRef = ref(db, `businesses/${businessId}/assets/items/${maintenance.assetId}`);

        let assetUpdateData = {
            lastMaintenance: new Date().toISOString().split('T')[0],
            lastModifiedBy: userData.displayName,
            lastModifiedAt: new Date().toISOString()
        };

        // Calculate next maintenance if interval exists
        if (asset.maintenanceInterval) {
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + asset.maintenanceInterval);
            assetUpdateData.nextMaintenance = nextDate.toISOString().split('T')[0];
        }

        await update(assetRef, assetUpdateData);

        showToast('Maintenance marked as complete', 'success');
        await loadMaintenanceSchedule();
        await loadAssets();
        displayMaintenanceSchedule();
        updateMaintenanceSummary();

    } catch (error) {
        console.error('Error completing maintenance:', error);
        showToast('Failed to complete maintenance', 'error');
    }
};

// Cancel maintenance
window.cancelMaintenance = async function (maintenanceId) {
    if (!confirm('Cancel this maintenance schedule?')) return;

    try {
        const maintenanceRef = ref(db, `businesses/${businessId}/assets/maintenance/${maintenanceId}`);

        await update(maintenanceRef, {
            status: 'cancelled'
        });

        showToast('Maintenance cancelled', 'success');
        await loadMaintenanceSchedule();
        displayMaintenanceSchedule();
        updateMaintenanceSummary();

    } catch (error) {
        console.error('Error cancelling maintenance:', error);
        showToast('Failed to cancel maintenance', 'error');
    }
};

// Delete maintenance
window.deleteMaintenance = async function (maintenanceId) {
    if (!confirm('Delete this maintenance record?')) return;

    try {
        const maintenanceRef = ref(db, `businesses/${businessId}/assets/maintenance/${maintenanceId}`);
        await remove(maintenanceRef);

        showToast('Maintenance record deleted', 'success');
        await loadMaintenanceSchedule();
        displayMaintenanceSchedule();
        updateMaintenanceSummary();

    } catch (error) {
        console.error('Error deleting maintenance:', error);
        showToast('Failed to delete maintenance record', 'error');
    }
};// Show history modal
window.showHistoryModal = function () {
    const historyModal = document.getElementById('historyModal');
    if (historyModal) historyModal.classList.add('active');
    displayHistory(allHistory);
};

// Display history
function displayHistory(historyData) {
    const historyTableBody = document.getElementById('historyTableBody');
    if (!historyTableBody) return;

    if (historyData.length === 0) {
        historyTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-history" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No change history available
                </td>
            </tr>
        `;
        return;
    }

    historyTableBody.innerHTML = historyData.map(history => {
        const date = new Date(history.timestamp);
        const formattedDate = date.toLocaleString('en-ZA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        let actionBadge = '';
        switch (history.action) {
            case 'created':
                actionBadge = '<span class="badge" style="background: var(--success-light); color: var(--success-color);">CREATED</span>';
                break;
            case 'updated':
                actionBadge = '<span class="badge" style="background: var(--primary-light); color: var(--primary-color);">UPDATED</span>';
                break;
            case 'damaged':
                actionBadge = '<span class="badge" style="background: var(--danger-light); color: var(--danger-color);">DAMAGED</span>';
                break;
            case 'usage-recorded':
                actionBadge = '<span class="badge" style="background: var(--warning-light); color: var(--warning-color);">USAGE</span>';
                break;
            case 'maintenance-scheduled':
                actionBadge = '<span class="badge" style="background: var(--accent-light); color: var(--accent-color);">MAINTENANCE</span>';
                break;
            case 'deleted':
                actionBadge = '<span class="badge" style="background: var(--gray-200); color: var(--gray-700);">DELETED</span>';
                break;
            default:
                actionBadge = `<span class="badge">${history.action.toUpperCase()}</span>`;
        }

        return `
            <tr>
                <td>${formattedDate}</td>
                <td><strong>${history.assetName}</strong></td>
                <td>${actionBadge}</td>
                <td>${history.changedByName}</td>
                <td>${history.notes || '-'}</td>
            </tr>
        `;
    }).join('');
}

// Asset Reports
window.showAssetReports = function () {
    showToast('Asset reports functionality coming soon', 'success');
    // Future: Generate comprehensive asset reports
};

// Export Assets
window.exportAssets = function () {
    showToast('Asset export functionality coming soon', 'success');
    // Future: Export assets to Excel/CSV
};

// Asset Form Submission
const assetForm = document.getElementById('assetForm');
if (assetForm) {
    assetForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!hasPermission('add') && !isEditMode) {
            showToast('You do not have permission to add assets', 'error');
            return;
        }

        if (!hasPermission('edit') && isEditMode) {
            showToast('You do not have permission to edit assets', 'error');
            return;
        }

        // Get form values
        const assetName = document.getElementById('assetName').value.trim();
        const description = document.getElementById('assetDescription').value.trim();
        const assetId = document.getElementById('assetId').value.trim();
        const serialNumber = document.getElementById('serialNumber').value.trim();
        const category = document.getElementById('assetCategory').value;
        const purchaseValue = parseFloat(document.getElementById('purchaseValue').value);
        const currentValue = parseFloat(document.getElementById('currentValue').value) || null;
        const purchaseDate = document.getElementById('purchaseDate').value;
        const depreciationRate = parseFloat(document.getElementById('depreciationRate').value) || 20;
        const supplier = document.getElementById('supplier').value.trim();
        const branchId = document.getElementById('assetBranch').value;
        const quantity = parseInt(document.getElementById('quantity').value) || 1;
        const unit = document.getElementById('unit').value;
        const condition = document.getElementById('condition').value;
        const location = document.getElementById('location').value.trim();
        const requiresMaintenance = document.getElementById('requiresMaintenance').checked;
        const maintenanceInterval = parseInt(document.getElementById('maintenanceInterval').value) || null;
        const lastMaintenance = document.getElementById('lastMaintenance').value || null;
        const warranty = document.getElementById('warranty').value || null;
        const notes = document.getElementById('notes').value.trim();
        const isActive = document.getElementById('isActive').checked;

        // Validation
        if (!branchId) {
            showToast('Please select a branch', 'error');
            return;
        }

        if (!category) {
            showToast('Please select a category', 'error');
            return;
        }

        if (!purchaseDate) {
            showToast('Please select purchase date', 'error');
            return;
        }

        const btn = document.getElementById('saveAssetBtn');
        setLoading(btn, true);

        try {
            const branchName = allBranches[branchId].branchName;

            // Calculate current value if not provided
            let finalCurrentValue = currentValue;
            if (!finalCurrentValue && purchaseValue && purchaseDate && depreciationRate) {
                finalCurrentValue = calculateDepreciatedValue(purchaseValue, purchaseDate, depreciationRate);
            }

            // Calculate next maintenance if applicable
            let nextMaintenance = null;
            if (requiresMaintenance && maintenanceInterval) {
                const baseDate = lastMaintenance ? new Date(lastMaintenance) : new Date(purchaseDate);
                const nextDate = new Date(baseDate);
                nextDate.setDate(nextDate.getDate() + maintenanceInterval);
                nextMaintenance = nextDate.toISOString().split('T')[0];
            }

            const assetData = {
                assetName,
                description,
                assetId,
                serialNumber,
                category,
                purchaseValue,
                currentValue: finalCurrentValue,
                purchaseDate,
                depreciationRate,
                supplier,
                branchId,
                branchName,
                quantity,
                unit,
                condition,
                location,
                requiresMaintenance,
                maintenanceInterval,
                lastMaintenance,
                nextMaintenance,
                warranty,
                notes,
                isActive,
                lastModifiedBy: userData.displayName,
                lastModifiedAt: new Date().toISOString()
            };

            if (isEditMode && editingAssetId) {
                // Update existing asset
                const assetRef = ref(db, `businesses/${businessId}/assets/items/${editingAssetId}`);
                const oldAsset = allAssets[editingAssetId];

                await update(assetRef, assetData);

                // Log changes
                await logAssetChange({
                    assetId: editingAssetId,
                    assetName: assetName,
                    action: 'updated',
                    field: 'asset',
                    oldValue: JSON.stringify(oldAsset),
                    newValue: JSON.stringify(assetData),
                    notes: `Asset updated`
                });

                showToast('Asset updated successfully', 'success');

            } else {
                // Create new asset
                const assetsRef = ref(db, `businesses/${businessId}/assets/items`);
                const newAssetRef = push(assetsRef);

                assetData.createdBy = userData.displayName;
                assetData.createdAt = new Date().toISOString();

                await set(newAssetRef, assetData);

                // Log creation
                await logAssetChange({
                    assetId: newAssetRef.key,
                    assetName: assetName,
                    action: 'created',
                    field: 'asset',
                    oldValue: 'null',
                    newValue: JSON.stringify(assetData),
                    notes: `New asset added to system`
                });

                showToast('Asset added successfully', 'success');
            }

            const assetModal = document.getElementById('assetModal');
            if (assetModal) assetModal.classList.remove('active');
            await loadAssets();
            await loadHistory();

        } catch (error) {
            console.error('Error saving asset:', error);
            showToast('Failed to save asset', 'error');
        } finally {
            setLoading(btn, false);
        }
    });
}// Event Listeners

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

// Add asset button
const addAssetBtn = document.getElementById('addAssetBtn');
if (addAssetBtn) {
    addAssetBtn.addEventListener('click', showAssetModal);
}

// Report damage button
const reportDamageBtn = document.getElementById('reportDamageBtn');
if (reportDamageBtn) {
    reportDamageBtn.addEventListener('click', showReportDamageModal);
}

// Record usage button
const recordUsageBtn = document.getElementById('recordUsageBtn');
if (recordUsageBtn) {
    recordUsageBtn.addEventListener('click', showRecordUsageModal);
}

// Schedule maintenance button
const scheduleMaintenance = document.getElementById('scheduleMaintenance');
if (scheduleMaintenance) {
    scheduleMaintenance.addEventListener('click', showMaintenanceModal);
}

// View maintenance button
const viewMaintenanceBtn = document.getElementById('viewMaintenanceBtn');
if (viewMaintenanceBtn) {
    viewMaintenanceBtn.addEventListener('click', showViewMaintenanceModal);
}

// Asset reports button
const assetReportsBtn = document.getElementById('assetReportsBtn');
if (assetReportsBtn) {
    assetReportsBtn.addEventListener('click', showAssetReports);
}

// Export assets button
const exportAssetsBtn = document.getElementById('exportAssetsBtn');
if (exportAssetsBtn) {
    exportAssetsBtn.addEventListener('click', exportAssets);
}

// History button
const assetHistoryBtn = document.getElementById('assetHistoryBtn');
if (assetHistoryBtn) {
    assetHistoryBtn.addEventListener('click', showHistoryModal);
}

// Close modals
const closeModal = document.getElementById('closeModal');
if (closeModal) {
    closeModal.addEventListener('click', () => {
        const assetModal = document.getElementById('assetModal');
        if (assetModal) assetModal.classList.remove('active');
    });
}

const cancelAssetForm = document.getElementById('cancelAssetForm');
if (cancelAssetForm) {
    cancelAssetForm.addEventListener('click', () => {
        const assetModal = document.getElementById('assetModal');
        if (assetModal) assetModal.classList.remove('active');
    });
}

const closeReportDamageModal = document.getElementById('closeReportDamageModal');
if (closeReportDamageModal) {
    closeReportDamageModal.addEventListener('click', () => {
        const reportDamageModal = document.getElementById('reportDamageModal');
        if (reportDamageModal) reportDamageModal.classList.remove('active');
    });
}

const cancelReportDamage = document.getElementById('cancelReportDamage');
if (cancelReportDamage) {
    cancelReportDamage.addEventListener('click', () => {
        const reportDamageModal = document.getElementById('reportDamageModal');
        if (reportDamageModal) reportDamageModal.classList.remove('active');
    });
}

const closeRecordUsageModal = document.getElementById('closeRecordUsageModal');
if (closeRecordUsageModal) {
    closeRecordUsageModal.addEventListener('click', () => {
        const recordUsageModal = document.getElementById('recordUsageModal');
        if (recordUsageModal) recordUsageModal.classList.remove('active');
    });
}

const cancelRecordUsage = document.getElementById('cancelRecordUsage');
if (cancelRecordUsage) {
    cancelRecordUsage.addEventListener('click', () => {
        const recordUsageModal = document.getElementById('recordUsageModal');
        if (recordUsageModal) recordUsageModal.classList.remove('active');
    });
}

const closeMaintenanceModal = document.getElementById('closeMaintenanceModal');
if (closeMaintenanceModal) {
    closeMaintenanceModal.addEventListener('click', () => {
        const maintenanceModal = document.getElementById('maintenanceModal');
        if (maintenanceModal) maintenanceModal.classList.remove('active');
    });
}

const cancelMaintenance = document.getElementById('cancelMaintenance');
if (cancelMaintenance) {
    cancelMaintenance.addEventListener('click', () => {
        const maintenanceModal = document.getElementById('maintenanceModal');
        if (maintenanceModal) maintenanceModal.classList.remove('active');
    });
}

const closeViewMaintenanceModal = document.getElementById('closeViewMaintenanceModal');
if (closeViewMaintenanceModal) {
    closeViewMaintenanceModal.addEventListener('click', () => {
        const viewMaintenanceModal = document.getElementById('viewMaintenanceModal');
        if (viewMaintenanceModal) viewMaintenanceModal.classList.remove('active');
    });
}

const closeHistoryModal = document.getElementById('closeHistoryModal');
if (closeHistoryModal) {
    closeHistoryModal.addEventListener('click', () => {
        const historyModal = document.getElementById('historyModal');
        if (historyModal) historyModal.classList.remove('active');
    });
}

// View toggle
const gridViewBtn = document.getElementById('gridViewBtn');
if (gridViewBtn) {
    gridViewBtn.addEventListener('click', () => {
        currentView = 'grid';
        gridViewBtn.classList.add('active');
        const listViewBtn = document.getElementById('listViewBtn');
        if (listViewBtn) listViewBtn.classList.remove('active');

        const assetsGrid = document.getElementById('assetsGrid');
        const assetsList = document.getElementById('assetsList');
        if (assetsGrid) assetsGrid.style.display = 'grid';
        if (assetsList) assetsList.style.display = 'none';
        displayAssets();
    });
}

const listViewBtn = document.getElementById('listViewBtn');
if (listViewBtn) {
    listViewBtn.addEventListener('click', () => {
        currentView = 'list';
        listViewBtn.classList.add('active');
        const gridViewBtn = document.getElementById('gridViewBtn');
        if (gridViewBtn) gridViewBtn.classList.remove('active');

        const assetsGrid = document.getElementById('assetsGrid');
        const assetsList = document.getElementById('assetsList');
        if (assetsGrid) assetsGrid.style.display = 'none';
        if (assetsList) assetsList.style.display = 'block';
        displayAssets();
    });
}

// Filters
const categoryFilter = document.getElementById('categoryFilter');
if (categoryFilter) {
    categoryFilter.addEventListener('change', (e) => {
        currentFilters.category = e.target.value;
        displayAssets();
    });
}

const conditionFilter = document.getElementById('conditionFilter');
if (conditionFilter) {
    conditionFilter.addEventListener('change', (e) => {
        currentFilters.condition = e.target.value;
        displayAssets();
    });
}

const branchFilter = document.getElementById('branchFilter');
if (branchFilter) {
    branchFilter.addEventListener('change', (e) => {
        currentFilters.branch = e.target.value;
        displayAssets();
    });
}

const sortFilter = document.getElementById('sortFilter');
if (sortFilter) {
    sortFilter.addEventListener('change', (e) => {
        currentFilters.sort = e.target.value;
        displayAssets();
    });
}

// Search
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();

        if (searchTerm === '') {
            displayAssets();
            return;
        }

        const filteredAssets = Object.entries(allAssets).filter(([_, asset]) => {
            return asset.assetName.toLowerCase().includes(searchTerm) ||
                asset.assetId?.toLowerCase().includes(searchTerm) ||
                asset.serialNumber?.toLowerCase().includes(searchTerm) ||
                asset.description?.toLowerCase().includes(searchTerm) ||
                (allCategories[asset.category]?.categoryName || '').toLowerCase().includes(searchTerm);
        });

        if (currentView === 'grid') {
            displayGridView(filteredAssets);
        } else {
            displayListView(filteredAssets);
        }
    });
}

// Requires Maintenance checkbox
const requiresMaintenanceEl = document.getElementById('requiresMaintenance');
if (requiresMaintenanceEl) {
    requiresMaintenanceEl.addEventListener('change', (e) => {
        const maintenanceDetailsEl = document.getElementById('maintenanceDetails');
        if (maintenanceDetailsEl) {
            maintenanceDetailsEl.style.display = e.target.checked ? 'block' : 'none';
        }
    });
}

// Add category button
const addCategoryBtn = document.getElementById('addCategoryBtn');
if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', async () => {
        const categoryName = prompt('Enter new category name:');

        if (!categoryName || categoryName.trim() === '') return;

        try {
            const categoriesRef = ref(db, `businesses/${businessId}/assets/categories`);
            const newCategoryRef = push(categoriesRef);

            await set(newCategoryRef, {
                categoryName: categoryName.trim(),
                createdBy: userData.displayName,
                createdAt: new Date().toISOString()
            });

            showToast('Category added successfully', 'success');
            await loadCategories();

        } catch (error) {
            console.error('Error adding category:', error);
            showToast('Failed to add category', 'error');
        }
    });
}// Helper Functions

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

// Format date helper
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format currency helper
function formatCurrency(amount) {
    const currency = businessData?.currency || 'R';
    return `${currency} ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Calculate asset age in years
function calculateAssetAge(purchaseDate) {
    if (!purchaseDate) return 0;
    const years = (new Date() - new Date(purchaseDate)) / (365.25 * 24 * 60 * 60 * 1000);
    return Math.max(0, years);
}

// Calculate depreciation percentage
function calculateDepreciationPercentage(purchaseValue, currentValue) {
    if (!purchaseValue || purchaseValue === 0) return 0;
    const depreciation = ((purchaseValue - currentValue) / purchaseValue) * 100;
    return Math.max(0, Math.min(100, depreciation));
}

// Get condition color
function getConditionColor(condition) {
    const colors = {
        'excellent': 'var(--success-color)',
        'good': 'var(--primary-color)',
        'fair': 'var(--warning-color)',
        'poor': 'var(--danger-color)',
        'damaged': 'var(--danger-color)'
    };
    return colors[condition] || 'var(--gray-600)';
}

// Get severity badge
function getSeverityBadge(severity) {
    const badges = {
        'minor': '<span class="badge" style="background: var(--warning-light); color: var(--warning-color);">Minor</span>',
        'moderate': '<span class="badge" style="background: var(--accent-light); color: var(--accent-color);">Moderate</span>',
        'severe': '<span class="badge" style="background: var(--danger-light); color: var(--danger-color);">Severe</span>',
        'total': '<span class="badge" style="background: var(--danger-color); color: white;">Total Loss</span>'
    };
    return badges[severity] || severity;
}

// Calculate total asset value
function calculateTotalAssetValue() {
    return Object.values(allAssets).reduce((total, asset) => {
        const value = asset.currentValue || asset.purchaseValue || 0;
        return total + (value * (asset.quantity || 1));
    }, 0);
}

// Get assets by condition
function getAssetsByCondition(condition) {
    return Object.values(allAssets).filter(a => a.condition === condition);
}

// Get assets requiring maintenance
function getAssetsRequiringMaintenance() {
    const now = new Date();
    return Object.values(allAssets).filter(asset => {
        if (!asset.requiresMaintenance || !asset.nextMaintenance) return false;
        return new Date(asset.nextMaintenance) <= now;
    });
}

// Get overdue maintenance count
function getOverdueMaintenanceCount() {
    const now = new Date();
    return Object.values(allAssets).filter(asset => {
        if (!asset.requiresMaintenance || !asset.nextMaintenance) return false;
        const daysOverdue = (now - new Date(asset.nextMaintenance)) / (24 * 60 * 60 * 1000);
        return daysOverdue > 7;
    }).length;
}

// Export functions for debugging (optional)
window.debugAssets = {
    getAllAssets: () => allAssets,
    getAllCategories: () => allCategories,
    getAllBranches: () => allBranches,
    getAllDamage: () => allDamage,
    getAllUsage: () => allUsage,
    getAllMaintenance: () => allMaintenance,
    getAllHistory: () => allHistory,
    calculateTotalValue: calculateTotalAssetValue,
    getByCondition: getAssetsByCondition,
    getMaintenanceDue: getAssetsRequiringMaintenance
};

// Initialize depreciation calculation on page load
function initializeDepreciation() {
    Object.entries(allAssets).forEach(([assetId, asset]) => {
        if (!asset.currentValue && asset.purchaseValue && asset.purchaseDate && asset.depreciationRate) {
            const calculatedValue = calculateDepreciatedValue(
                asset.purchaseValue,
                asset.purchaseDate,
                asset.depreciationRate
            );

            // Update in memory (will be saved on next edit)
            allAssets[assetId].currentValue = calculatedValue;
        }
    });
}

// Auto-update maintenance status
function checkMaintenanceStatus() {
    const now = new Date();
    let needsUpdate = false;

    Object.entries(allAssets).forEach(([assetId, asset]) => {
        if (asset.requiresMaintenance && asset.lastMaintenance && asset.maintenanceInterval) {
            const lastDate = new Date(asset.lastMaintenance);
            const nextDate = new Date(lastDate);
            nextDate.setDate(nextDate.getDate() + asset.maintenanceInterval);

            const calculatedNext = nextDate.toISOString().split('T')[0];

            if (asset.nextMaintenance !== calculatedNext) {
                // Update next maintenance date
                const assetRef = ref(db, `businesses/${businessId}/assets/items/${assetId}`);
                update(assetRef, {
                    nextMaintenance: calculatedNext,
                    lastModifiedBy: 'System',
                    lastModifiedAt: new Date().toISOString()
                }).catch(err => console.error('Error updating maintenance:', err));

                needsUpdate = true;
            }
        }
    });

    if (needsUpdate) {
        loadAssets();
    }
}

// Run maintenance check every hour
setInterval(checkMaintenanceStatus, 3600000);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K = Search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.focus();
    }

    // Ctrl/Cmd + N = New Asset
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        if (hasPermission('add')) {
            showAssetModal();
        }
    }

    // Escape = Close modals
    if (e.key === 'Escape') {
        const modals = [
            'assetModal',
            'reportDamageModal',
            'recordUsageModal',
            'maintenanceModal',
            'viewMaintenanceModal',
            'historyModal'
        ];

        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal && modal.classList.contains('active')) {
                modal.classList.remove('active');
            }
        });
    }
});

// Print functionality
window.printAssetList = function () {
    window.print();
};

// Refresh data
window.refreshAssetData = async function () {
    const refreshBtn = document.querySelector('[data-refresh]');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        await loadAssets();
        await loadDamageReports();
        await loadUsageRecords();
        await loadMaintenanceSchedule();
        await loadHistory();
        showToast('Data refreshed successfully', 'success');
    } catch (error) {
        console.error('Error refreshing data:', error);
        showToast('Failed to refresh data', 'error');
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        }
    }
};

// Console log for successful initialization
console.log('BongoBoss POS - Asset Management System Initialized ✓');
console.log('Available debug commands: window.debugAssets');
console.log('Keyboard shortcuts:');
console.log('  Ctrl/Cmd + K: Focus search');
console.log('  Ctrl/Cmd + N: New asset');
console.log('  Escape: Close modals');