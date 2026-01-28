import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, onValue, remove } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

// Import stock follow-up module
import {
    initStockFollowUp,
    reportStockLoss,
    approveStockLoss,
    rejectStockLoss,
    deleteStockLoss,
    generateWeeklyReport,
    getCurrentInventorySummary,
    getLossesSummary,
    getStockLossesData,
    getWeeklyReportsData
} from './stockfollowup.js';

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
 * INVENTORY MANAGEMENT SYSTEM WITH STOCK FOLLOW-UP
 * 
 * DATABASE STRUCTURE:
 * /businesses/{businessId}/inventory/
 *   ├── products/{productId}
 *   │   ├── productName
 *   │   ├── description
 *   │   ├── sku
 *   │   ├── barcode
 *   │   ├── category
 *   │   ├── costPrice
 *   │   ├── sellPrice
 *   │   ├── profitMargin
 *   │   ├── taxRate
 *   │   ├── currentStock
 *   │   ├── minStock
 *   │   ├── maxStock
 *   │   ├── unit
 *   │   ├── branchId
 *   │   ├── branchName
 *   │   ├── supplier
 *   │   ├── brand
 *   │   ├── location
 *   │   ├── trackStock
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
 *   ├── history/{historyId}
 *   │   ├── productId
 *   │   ├── productName
 *   │   ├── action (created, updated, stock-adjusted, deleted)
 *   │   ├── changedBy
 *   │   ├── changedByName
 *   │   ├── timestamp
 *   │   ├── oldValue
 *   │   ├── newValue
 *   │   ├── field (what was changed)
 *   │   └── notes
 *   │
 *   ├── stockLosses/{lossId} (NEW)
 *   │   └── (see stockfollowup.js for structure)
 *   │
 *   └── weeklyReports/{reportId} (NEW)
 *       └── (see stockfollowup.js for structure)
 * 
 * ROLE-BASED ACCESS CONTROL:
 * - Owner: Full access to all operations
 * - Partner: Full access to all operations
 * - Admin: Full access to all operations
 * - Manager: Can add, edit, and adjust stock (cannot delete)
 * - Employee: Read-only access (view inventory)
 */

// Global variables
let currentUser = null;
let userData = null;
let businessId = null;
let businessData = null;
let allProducts = {};
let allCategories = {};
let allBranches = {};
let allHistory = [];
let currentView = 'grid';
let isEditMode = false;
let editingProductId = null;
let currentFilters = {
    category: 'all',
    stock: 'all',
    branch: 'all',
    sort: 'name-asc'
};

// EAN-13 Barcode Validation
function validateEAN13(barcode) {
    // Remove any spaces or dashes
    barcode = barcode.replace(/[\s-]/g, '');

    // Check if it's exactly 13 digits
    if (!/^\d{13}$/.test(barcode)) {
        return false;
    }

    // Calculate checksum for EAN-13
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(barcode[i]);
        sum += (i % 2 === 0) ? digit : digit * 3;
    }

    const checksum = (10 - (sum % 10)) % 10;
    const providedChecksum = parseInt(barcode[12]);

    return checksum === providedChecksum;
}

// Format barcode display
function formatBarcode(barcode) {
    if (!barcode || barcode.length !== 13) return barcode;
    // Format as: 6-123456-123456-1
    return `${barcode.substring(0, 1)}-${barcode.substring(1, 7)}-${barcode.substring(7, 12)}-${barcode.substring(12)}`;
}

// Display barcode validation message
function showBarcodeValidation(inputId, isValid) {
    const input = document.getElementById(inputId);
    const existingMsg = input.parentElement.querySelector('.barcode-validation');

    if (existingMsg) {
        existingMsg.remove();
    }

    if (input.value.length === 0) return;

    const validationMsg = document.createElement('div');
    validationMsg.className = `barcode-validation ${isValid ? 'valid' : 'invalid'}`;
    validationMsg.innerHTML = isValid
        ? '<i class="fas fa-check-circle"></i> Valid EAN-13 barcode'
        : '<i class="fas fa-times-circle"></i> Invalid EAN-13 barcode (must be 13 digits with valid checksum)';

    input.parentElement.appendChild(validationMsg);
}

// Calculate package stock information
function updatePackageStockInfo() {
    const currentStock = parseInt(document.getElementById('currentStock').value) || 0;
    const unitsPerPackage = parseInt(document.getElementById('unitsPerPackage').value) || 0;

    if (unitsPerPackage > 0) {
        const fullPackages = Math.floor(currentStock / unitsPerPackage);
        const looseUnits = currentStock % unitsPerPackage;

        const infoElement = document.getElementById('packageStockInfo');
        infoElement.innerHTML = `
            <strong>${currentStock} units</strong> = 
            <strong>${fullPackages}</strong> full packages + 
            <strong>${looseUnits}</strong> loose units
        `;
    }
}

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
        'adjust': ['owner', 'partner', 'admin', 'manager'],
        'approve-losses': ['owner', 'partner', 'admin'] // NEW: for stock losses
    };

    return permissions[action]?.includes(role) || false;
}

// Check authentication and load inventory
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

        // Check if user has permission to view inventory
        if (!hasPermission('view')) {
            showToast('You do not have permission to access inventory management', 'error');
            setTimeout(() => {
                window.location.href = 'Dashboard.html';
            }, 2000);
            return;
        }

        await loadBusinessInfo();
        await loadBranches();
        await loadCategories();
        await loadInventory();
        await loadHistory();

        // NEW: Initialize stock follow-up module
        initStockFollowUp(
            currentUser,
            userData,
            businessId,
            businessData,
            allProducts,
            allBranches,
            allCategories
        );

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
    const addBtn = document.getElementById('addProductBtn');
    const bulkUploadBtn = document.getElementById('bulkUploadBtn');

    if (!hasPermission('add')) {
        if (addBtn) addBtn.style.display = 'none';
        if (bulkUploadBtn) bulkUploadBtn.style.display = 'none';
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
        const productBranch = document.getElementById('productBranch');

        if (snapshot.exists()) {
            allBranches = snapshot.val();

            if (branchFilter) branchFilter.innerHTML = '<option value="all">All Branches</option>';
            if (productBranch) productBranch.innerHTML = '<option value="">Select branch</option>';

            Object.entries(allBranches).forEach(([branchId, branch]) => {
                if (branchFilter) {
                    const filterOption = new Option(branch.branchName, branchId);
                    branchFilter.appendChild(filterOption);
                }

                if (productBranch) {
                    const formOption = new Option(branch.branchName, branchId);
                    productBranch.appendChild(formOption);
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
        const categoriesRef = ref(db, `businesses/${businessId}/inventory/categories`);
        const snapshot = await get(categoriesRef);

        const categoryFilter = document.getElementById('categoryFilter');
        const productCategory = document.getElementById('productCategory');

        if (categoryFilter) categoryFilter.innerHTML = '<option value="all">All Categories</option>';
        if (productCategory) productCategory.innerHTML = '<option value="">Select category</option>';

        if (snapshot.exists()) {
            allCategories = snapshot.val();

            Object.entries(allCategories).forEach(([categoryId, category]) => {
                if (categoryFilter) {
                    const filterOption = new Option(category.categoryName, categoryId);
                    categoryFilter.appendChild(filterOption);
                }

                if (productCategory) {
                    const formOption = new Option(category.categoryName, categoryId);
                    productCategory.appendChild(formOption);
                }
            });
        }

        // Add default categories if none exist
        if (Object.keys(allCategories).length === 0) {
            const defaultCategories = ['General', 'Food & Beverages', 'Electronics', 'Clothing', 'Home & Garden'];

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

// Load inventory
async function loadInventory() {
    try {
        const inventoryRef = ref(db, `businesses/${businessId}/inventory/products`);
        const snapshot = await get(inventoryRef);

        const productsGrid = document.getElementById('productsGrid');
        const productsTableBody = document.getElementById('productsTableBody');
        const loadingState = document.getElementById('productsLoading');

        if (loadingState) loadingState.style.display = 'flex';

        if (snapshot.exists()) {
            allProducts = snapshot.val();
            updateInventoryStats();
            displayProducts();
        } else {
            allProducts = {};
            updateInventoryStats();

            if (productsGrid) {
                productsGrid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1;">
                        <i class="fas fa-boxes"></i>
                        <h3>No Products Yet</h3>
                        <p>Add your first product to get started</p>
                    </div>
                `;
            }

            if (productsTableBody) {
                productsTableBody.innerHTML = `
                    <tr>
                        <td colspan="9" style="text-align: center; padding: 3rem;">
                            <i class="fas fa-boxes" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem; display: block;"></i>
                            <p style="color: #94a3b8;">No products yet. Add your first product to get started.</p>
                        </td>
                    </tr>
                `;
            }
        }

        if (loadingState) loadingState.style.display = 'none';

    } catch (error) {
        console.error('Error loading inventory:', error);
        showToast('Failed to load inventory', 'error');
    }
}

// Update inventory statistics
function updateInventoryStats() {
    const products = Object.values(allProducts);
    const currency = businessData?.currency || 'R';

    // Total products
    const totalProducts = products.length;
    const totalCategories = Object.keys(allCategories).length;
    const totalProductsEl = document.getElementById('totalProducts');
    const productsChangeEl = document.getElementById('productsChange');
    if (totalProductsEl) totalProductsEl.textContent = totalProducts;
    if (productsChangeEl) productsChangeEl.textContent = `${totalCategories} categories`;

    // Total value (based on cost price)
    const totalValue = products.reduce((sum, product) => {
        return sum + (product.costPrice * product.currentStock || 0);
    }, 0);
    const totalValueEl = document.getElementById('totalValue');
    if (totalValueEl) {
        totalValueEl.textContent = `${currency} ${totalValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Low stock items (current stock <= minimum stock)
    const lowStockItems = products.filter(p => p.currentStock <= p.minStock && p.currentStock > 0);
    const lowStockEl = document.getElementById('lowStock');
    if (lowStockEl) lowStockEl.textContent = lowStockItems.length;

    // Critical stock items (current stock <= 20% of minimum stock)
    const criticalStock = products.filter(p => p.currentStock <= (p.minStock * 0.2) && p.currentStock > 0);
    const criticalStockEl = document.getElementById('criticalStock');
    if (criticalStockEl) criticalStockEl.textContent = `${criticalStock.length} items critical`;

    // Out of stock
    const outOfStock = products.filter(p => p.currentStock === 0);
    const outOfStockEl = document.getElementById('outOfStock');
    if (outOfStockEl) outOfStockEl.textContent = outOfStock.length;
}

// Display products
function displayProducts() {
    let products = Object.entries(allProducts);

    // Apply filters
    if (currentFilters.category !== 'all') {
        products = products.filter(([_, p]) => p.category === currentFilters.category);
    }

    if (currentFilters.branch !== 'all') {
        products = products.filter(([_, p]) => p.branchId === currentFilters.branch);
    }

    if (currentFilters.stock !== 'all') {
        if (currentFilters.stock === 'in-stock') {
            products = products.filter(([_, p]) => p.currentStock > p.minStock);
        } else if (currentFilters.stock === 'low-stock') {
            products = products.filter(([_, p]) => p.currentStock <= p.minStock && p.currentStock > 0);
        } else if (currentFilters.stock === 'out-of-stock') {
            products = products.filter(([_, p]) => p.currentStock === 0);
        }
    }

    // Apply sorting
    products.sort((a, b) => {
        const [, productA] = a;
        const [, productB] = b;

        switch (currentFilters.sort) {
            case 'name-asc':
                return productA.productName.localeCompare(productB.productName);
            case 'name-desc':
                return productB.productName.localeCompare(productA.productName);
            case 'stock-low':
                return productA.currentStock - productB.currentStock;
            case 'stock-high':
                return productB.currentStock - productA.currentStock;
            case 'price-low':
                return productA.sellPrice - productB.sellPrice;
            case 'price-high':
                return productB.sellPrice - productA.sellPrice;
            default:
                return 0;
        }
    });

    // Display in current view
    if (currentView === 'grid') {
        displayGridView(products);
    } else {
        displayListView(products);
    }
}

// Display grid view
function displayGridView(products) {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;

    const currency = businessData?.currency || 'R';

    if (products.length === 0) {
        productsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fas fa-filter"></i>
                <h3>No Products Match Filter</h3>
                <p>Try adjusting your filter criteria</p>
            </div>
        `;
        return;
    }

    productsGrid.innerHTML = products.map(([productId, product]) => {
        const stockPercentage = (product.currentStock / product.maxStock) * 100;
        let stockStatus = 'in-stock';
        let stockFillClass = '';

        if (product.currentStock === 0) {
            stockStatus = 'out-of-stock';
            stockFillClass = 'critical';
        } else if (product.currentStock <= product.minStock) {
            stockStatus = 'low-stock';
            stockFillClass = 'low';
        }

        // Calculate package info if applicable
        let packageInfo = '';
        if (product.hasPackaging && product.unitsPerPackage) {
            const fullPackages = Math.floor(product.currentStock / product.unitsPerPackage);
            const looseUnits = product.currentStock % product.unitsPerPackage;
            packageInfo = `
                <div class="detail-row" style="background: var(--gray-100); padding: 0.5rem; border-radius: 6px; margin-top: 0.5rem;">
                    <span class="detail-label"><i class="fas fa-box"></i> ${product.packageType || 'Package'}:</span>
                    <span class="detail-value">${fullPackages} + ${looseUnits} loose</span>
                </div>
            `;
        }

        return `
            <div class="product-card">
                <div class="product-image">
                    <i class="fas fa-box"></i>
                    <span class="product-badge ${stockStatus}">
                        ${stockStatus === 'in-stock' ? 'In Stock' :
                stockStatus === 'low-stock' ? 'Low Stock' : 'Out of Stock'}
                    </span>
                </div>
                <div class="product-info">
                    <h3 class="product-name">${product.productName}</h3>
                    <p class="product-sku">SKU: ${product.sku || 'N/A'} | EAN: ${product.barcode ? formatBarcode(product.barcode) : 'N/A'}</p>
                    
                    <div class="product-details">
                        <div class="detail-row">
                            <span class="detail-label">Category:</span>
                            <span class="detail-value">${allCategories[product.category]?.categoryName || 'N/A'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Cost:</span>
                            <span class="detail-value">${currency} ${product.costPrice.toFixed(2)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Sell Price:</span>
                            <span class="detail-value price">${currency} ${product.sellPrice.toFixed(2)}</span>
                        </div>
                        ${product.hasPackaging && product.packageSellPrice ? `
                        <div class="detail-row">
                            <span class="detail-label">${product.packageType || 'Package'} Price:</span>
                            <span class="detail-value price">${currency} ${product.packageSellPrice.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        <div class="detail-row">
                            <span class="detail-label">Branch:</span>
                            <span class="detail-value">${product.branchName}</span>
                        </div>
                        ${packageInfo}
                    </div>

                    <div class="stock-indicator">
                        <div class="stock-bar">
                            <div class="stock-fill ${stockFillClass}" style="width: ${stockPercentage}%"></div>
                        </div>
                        <span class="stock-text">${product.currentStock} ${product.unit}</span>
                    </div>

                    <div class="product-actions">
                        ${hasPermission('edit') ? `
                            <button class="btn-edit" onclick="editProduct('${productId}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                        ` : ''}
                        ${hasPermission('adjust') ? `
                            <button class="btn-adjust" onclick="adjustStock('${productId}')">
                                <i class="fas fa-arrows-alt-v"></i> Adjust
                            </button>
                        ` : ''}
                        ${hasPermission('delete') ? `
                            <button class="btn-delete" onclick="deleteProduct('${productId}', '${product.productName}')">
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
function displayListView(products) {
    const productsTableBody = document.getElementById('productsTableBody');
    if (!productsTableBody) return;

    const currency = businessData?.currency || 'R';

    if (products.length === 0) {
        productsTableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 3rem;">
                    <i class="fas fa-filter" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem; display: block;"></i>
                    <p style="color: #94a3b8;">No products match your filter criteria</p>
                </td>
            </tr>
        `;
        return;
    }

    productsTableBody.innerHTML = products.map(([productId, product]) => {
        let stockStatus = 'in-stock';
        let stockIcon = 'fa-check-circle';

        if (product.currentStock === 0) {
            stockStatus = 'out-of-stock';
            stockIcon = 'fa-times-circle';
        } else if (product.currentStock <= product.minStock) {
            stockStatus = 'low-stock';
            stockIcon = 'fa-exclamation-triangle';
        }

        // Calculate package info
        let stockDisplay = `${product.currentStock} ${product.unit}`;
        if (product.hasPackaging && product.unitsPerPackage) {
            const fullPackages = Math.floor(product.currentStock / product.unitsPerPackage);
            const looseUnits = product.currentStock % product.unitsPerPackage;
            stockDisplay = `
                <strong>${product.currentStock} ${product.unit}</strong><br>
                <small style="color: var(--gray-600);">
                    (${fullPackages} ${product.packageType || 'pkg'} + ${looseUnits} loose)
                </small>
            `;
        }

        return `
            <tr>
                <td>
                    <div class="product-cell">
                        <div class="product-thumb">
                            <i class="fas fa-box"></i>
                        </div>
                        <div class="product-text">
                            <h4>${product.productName}</h4>
                            <p>${product.description || 'No description'}</p>
                        </div>
                    </div>
                </td>
                <td>
                    <div>${product.sku || 'N/A'}</div>
                    <small style="color: #64748b;">${product.barcode ? formatBarcode(product.barcode) : 'No barcode'}</small>
                    ${product.hasPackaging && product.packageBarcode ? `
                        <br><small style="color: #059669;">
                            <i class="fas fa-box"></i> ${formatBarcode(product.packageBarcode)}
                        </small>
                    ` : ''}
                </td>
                <td>${allCategories[product.category]?.categoryName || 'N/A'}</td>
                <td>${currency} ${product.costPrice.toFixed(2)}</td>
                <td>
                    <strong>${currency} ${product.sellPrice.toFixed(2)}</strong>
                    ${product.hasPackaging && product.packageSellPrice ? `
                        <br><small style="color: var(--secondary-color);">
                            ${product.packageType}: ${currency} ${product.packageSellPrice.toFixed(2)}
                        </small>
                    ` : ''}
                </td>
                <td>${stockDisplay}</td>
                <td>
                    <span class="stock-status ${stockStatus}">
                        <i class="fas ${stockIcon}"></i>
                        ${stockStatus === 'in-stock' ? 'In Stock' :
                stockStatus === 'low-stock' ? 'Low Stock' : 'Out of Stock'}
                    </span>
                </td>
                <td>${product.branchName}</td>
                <td>
                    <div class="table-actions">
                        ${hasPermission('edit') ? `
                            <button class="icon-btn" onclick="editProduct('${productId}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${hasPermission('adjust') ? `
                            <button class="icon-btn" onclick="adjustStock('${productId}')" title="Adjust Stock">
                                <i class="fas fa-arrows-alt-v"></i>
                            </button>
                        ` : ''}
                        ${hasPermission('delete') ? `
                            <button class="icon-btn danger" onclick="deleteProduct('${productId}', '${product.productName}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Load change history
async function loadHistory() {
    try {
        const historyRef = ref(db, `businesses/${businessId}/inventory/history`);
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
}

// Show product modal
window.showProductModal = function () {
    if (!hasPermission('add')) {
        showToast('You do not have permission to add products', 'error');
        return;
    }

    const productModal = document.getElementById('productModal');
    const modalTitle = document.getElementById('modalTitle');
    const saveBtn = document.getElementById('saveProductBtn');
    const productForm = document.getElementById('productForm');

    if (productModal) productModal.classList.add('active');
    if (modalTitle) modalTitle.textContent = 'Add New Product';
    if (saveBtn) {
        const btnText = saveBtn.querySelector('.btn-text');
        if (btnText) btnText.innerHTML = '<i class="fas fa-save"></i> Save Product';
    }

    isEditMode = false;
    editingProductId = null;
    if (productForm) productForm.reset();

    const trackStockEl = document.getElementById('trackStock');
    const isActiveEl = document.getElementById('isActive');
    const hasPackagingEl = document.getElementById('hasPackaging');
    const packagingDetailsEl = document.getElementById('packagingDetails');

    if (trackStockEl) trackStockEl.checked = true;
    if (isActiveEl) isActiveEl.checked = true;
    if (hasPackagingEl) hasPackagingEl.checked = false;
    if (packagingDetailsEl) packagingDetailsEl.style.display = 'none';

    // Clear barcode validations
    const validations = document.querySelectorAll('.barcode-validation');
    validations.forEach(v => v.remove());

    updateProfitCalculations();
};

// Edit product
window.editProduct = function (productId) {
    if (!hasPermission('edit')) {
        showToast('You do not have permission to edit products', 'error');
        return;
    }

    const product = allProducts[productId];
    if (!product) return;

    isEditMode = true;
    editingProductId = productId;

    // Populate form
    const setFieldValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    };

    const setFieldChecked = (id, checked) => {
        const el = document.getElementById(id);
        if (el) el.checked = checked;
    };

    setFieldValue('productName', product.productName);
    setFieldValue('productDescription', product.description);
    setFieldValue('productSKU', product.sku);
    setFieldValue('productBarcode', product.barcode);
    setFieldValue('productCategory', product.category);
    setFieldValue('costPrice', product.costPrice);
    setFieldValue('sellPrice', product.sellPrice);
    setFieldValue('taxRate', product.taxRate || 15);
    setFieldValue('productBranch', product.branchId);
    setFieldValue('currentStock', product.currentStock);
    setFieldValue('minStock', product.minStock);
    setFieldValue('maxStock', product.maxStock);
    setFieldValue('unit', product.unit);
    setFieldValue('supplier', product.supplier);
    setFieldValue('brand', product.brand);
    setFieldValue('location', product.location);
    setFieldChecked('trackStock', product.trackStock !== false);
    setFieldChecked('isActive', product.isActive !== false);

    // Populate packaging fields
    const hasPackaging = product.hasPackaging || false;
    setFieldChecked('hasPackaging', hasPackaging);

    const packagingDetailsEl = document.getElementById('packagingDetails');
    if (hasPackaging && packagingDetailsEl) {
        packagingDetailsEl.style.display = 'block';
        setFieldValue('packageType', product.packageType || 'box');
        setFieldValue('unitsPerPackage', product.unitsPerPackage);
        setFieldValue('packageBarcode', product.packageBarcode);
        setFieldValue('packageSellPrice', product.packageSellPrice);
        updatePackageStockInfo();
    }

    // Update modal
    const modalTitle = document.getElementById('modalTitle');
    const saveBtn = document.getElementById('saveProductBtn');
    const productModal = document.getElementById('productModal');

    if (modalTitle) modalTitle.textContent = 'Edit Product';
    if (saveBtn) {
        const btnText = saveBtn.querySelector('.btn-text');
        if (btnText) btnText.innerHTML = '<i class="fas fa-save"></i> Update Product';
    }
    if (productModal) productModal.classList.add('active');

    updateProfitCalculations();
};

// Adjust stock
window.adjustStock = async function (productId) {
    if (!hasPermission('adjust')) {
        showToast('You do not have permission to adjust stock', 'error');
        return;
    }

    const product = allProducts[productId];
    if (!product) return;

    const newStock = prompt(`Current stock: ${product.currentStock} ${product.unit}\n\nEnter new stock quantity:`, product.currentStock);

    if (newStock === null) return;

    const stockValue = parseInt(newStock);

    if (isNaN(stockValue) || stockValue < 0) {
        showToast('Please enter a valid stock quantity', 'error');
        return;
    }

    try {
        const productRef = ref(db, `businesses/${businessId}/inventory/products/${productId}`);
        const oldStock = product.currentStock;

        await update(productRef, {
            currentStock: stockValue,
            lastModifiedBy: userData.displayName,
            lastModifiedAt: new Date().toISOString()
        });

        // Log change history
        await logInventoryChange({
            productId: productId,
            productName: product.productName,
            action: 'stock-adjusted',
            field: 'currentStock',
            oldValue: `${oldStock} ${product.unit}`,
            newValue: `${stockValue} ${product.unit}`,
            notes: `Stock adjusted from ${oldStock} to ${stockValue}`
        });

        showToast('Stock updated successfully', 'success');
        await loadInventory();
        await loadHistory();

    } catch (error) {
        console.error('Error adjusting stock:', error);
        showToast('Failed to adjust stock', 'error');
    }
};

// Delete product
window.deleteProduct = async function (productId, productName) {
    if (!hasPermission('delete')) {
        showToast('You do not have permission to delete products', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete "${productName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const productRef = ref(db, `businesses/${businessId}/inventory/products/${productId}`);
        const product = allProducts[productId];

        // Log deletion
        await logInventoryChange({
            productId: productId,
            productName: productName,
            action: 'deleted',
            field: 'product',
            oldValue: JSON.stringify(product),
            newValue: 'null',
            notes: `Product deleted from inventory`
        });

        await remove(productRef);

        showToast('Product deleted successfully', 'success');
        await loadInventory();
        await loadHistory();

    } catch (error) {
        console.error('Error deleting product:', error);
        showToast('Failed to delete product', 'error');
    }
};

// Log inventory change
async function logInventoryChange(changeData) {
    try {
        const historyRef = ref(db, `businesses/${businessId}/inventory/history`);
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

// Update profit calculations
function updateProfitCalculations() {
    const costPriceEl = document.getElementById('costPrice');
    const sellPriceEl = document.getElementById('sellPrice');
    const profitMarginEl = document.getElementById('profitMargin');
    const profitPerUnitEl = document.getElementById('profitPerUnit');

    if (!costPriceEl || !sellPriceEl || !profitMarginEl || !profitPerUnitEl) return;

    const costPrice = parseFloat(costPriceEl.value) || 0;
    const sellPrice = parseFloat(sellPriceEl.value) || 0;
    const currency = businessData?.currency || 'R';

    const profit = sellPrice - costPrice;
    const profitMargin = costPrice > 0 ? ((profit / costPrice) * 100).toFixed(2) : 0;

    profitMarginEl.textContent = `${profitMargin}%`;
    profitPerUnitEl.textContent = `${currency} ${profit.toFixed(2)}`;
}

// Initialize barcode scanner
let scanner = null;

function initBarcodeScanner() {
    const scannerContainer = document.getElementById('scanner-container');

    if (!scannerContainer) {
        console.error('Scanner container not found');
        return;
    }

    if (typeof Quagga === 'undefined') {
        showToast('Barcode scanner library not loaded', 'error');
        return;
    }

    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector('#interactive'),
            constraints: {
                width: 640,
                height: 480,
                facingMode: "environment"
            },
        },
        decoder: {
            readers: [
                "code_128_reader",
                "ean_reader",
                "ean_8_reader",
                "code_39_reader",
                "upc_reader",
                "upc_e_reader"
            ]
        }
    }, function (err) {
        if (err) {
            console.error('Barcode scanner initialization error:', err);
            showToast('Failed to initialize camera', 'error');
            return;
        }
        console.log("Barcode scanner initialized");
        Quagga.start();
    });

    Quagga.onDetected(function (result) {
        const code = result.codeResult.code;
        console.log("Barcode detected:", code);

        const scannerResultEl = document.getElementById('scannerResult');
        if (!scannerResultEl) return;

        // Validate EAN-13 (must be exactly 13 digits)
        if (code.length !== 13 || !/^\d{13}$/.test(code)) {
            scannerResultEl.innerHTML = `
                <i class="fas fa-times-circle" style="color: var(--danger-color); font-size: 2rem;"></i>
                <p style="margin-top: 0.5rem; color: var(--danger-color);">
                    Invalid barcode: <strong>${code}</strong><br>
                    <small>South African retail requires 13-digit EAN-13 barcodes</small>
                </p>
            `;
            return; // Don't accept the barcode
        }

        // Validate EAN-13 checksum
        if (!validateEAN13(code)) {
            scannerResultEl.innerHTML = `
                <i class="fas fa-exclamation-circle" style="color: var(--accent-color); font-size: 2rem;"></i>
                <p style="margin-top: 0.5rem; color: var(--accent-color);">
                    Invalid EAN-13 checksum: <strong>${formatBarcode(code)}</strong><br>
                    <small>The barcode checksum is invalid</small>
                </p>
            `;
            return;
        }

        scannerResultEl.innerHTML = `
            <i class="fas fa-check-circle" style="color: var(--secondary-color); font-size: 2rem;"></i>
            <p style="margin-top: 0.5rem;">Valid EAN-13: <strong>${formatBarcode(code)}</strong></p>
        `;

        // If scanning for product form, populate barcode field
        const productModal = document.getElementById('productModal');
        if (productModal && productModal.classList.contains('active')) {
            // Check which barcode field to populate
            const productBarcodeField = document.getElementById('productBarcode');
            const packageBarcodeField = document.getElementById('packageBarcode');

            // Determine which scan button was clicked based on recent click
            if (window.lastScanButtonClicked === 'package' && packageBarcodeField) {
                packageBarcodeField.value = code;
                showBarcodeValidation('packageBarcode', true);
            } else if (productBarcodeField) {
                productBarcodeField.value = code;
                showBarcodeValidation('productBarcode', true);
            }

            setTimeout(() => {
                closeBarcodeScanner();
            }, 1500);
        } else {
            // Search for product with this barcode
            setTimeout(() => {
                searchProductByBarcode(code);
            }, 1500);
        }
    });

    scanner = Quagga;
}

function closeBarcodeScanner() {
    if (scanner) {
        Quagga.stop();
        scanner = null;
    }
    const scannerModal = document.getElementById('scannerModal');
    const scannerResult = document.getElementById('scannerResult');
    if (scannerModal) scannerModal.classList.remove('active');
    if (scannerResult) scannerResult.innerHTML = '';
}

// Search product by barcode
async function searchProductByBarcode(barcode) {
    const product = Object.entries(allProducts).find(([_, p]) => p.barcode === barcode);

    if (product) {
        const [productId, productData] = product;
        showToast(`Product found: ${productData.productName}`, 'success');

        closeBarcodeScanner();

        // Open edit modal for this product
        if (hasPermission('edit')) {
            editProduct(productId);
        }
    } else {
        showToast('No product found with this barcode', 'error');
    }
}

// Show history modal
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
                <td colspan="7" style="text-align: center; padding: 2rem; color: #94a3b8;">
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

        return `
            <tr>
                <td>${formattedDate}</td>
                <td><strong>${history.productName}</strong></td>
                <td><span class="action-badge ${history.action}">${history.action.replace('-', ' ').toUpperCase()}</span></td>
                <td>${history.changedByName}</td>
                <td>${history.oldValue || 'N/A'}</td>
                <td>${history.newValue || 'N/A'}</td>
                <td>${history.notes || '-'}</td>
            </tr>
        `;
    }).join('');
}

// =============================================================================
// NEW: STOCK FOLLOW-UP INTEGRATION
// =============================================================================

// Format date helper
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

// NEW: Report Loss Button Handler
const reportLossBtn = document.getElementById('reportLossBtn');
if (reportLossBtn) {
    reportLossBtn.addEventListener('click', async () => {
        // Populate product dropdown
        const lossProductSelect = document.getElementById('lossProduct');
        if (lossProductSelect) {
            lossProductSelect.innerHTML = '<option value="">Select product</option>';

            Object.entries(allProducts).forEach(([productId, product]) => {
                if (product.currentStock > 0) {
                    const option = new Option(
                        `${product.productName} (${product.currentStock} ${product.unit} available)`,
                        productId
                    );
                    lossProductSelect.appendChild(option);
                }
            });
        }

        const reportLossModal = document.getElementById('reportLossModal');
        if (reportLossModal) reportLossModal.classList.add('active');
    });
}

// NEW: Loss Product Selection Handler
const lossProduct = document.getElementById('lossProduct');
if (lossProduct) {
    lossProduct.addEventListener('change', (e) => {
        const productId = e.target.value;
        const availableStock = document.getElementById('availableStock');
        const lossValueDisplay = document.getElementById('lossValueDisplay');

        if (!productId) {
            if (availableStock) availableStock.textContent = '';
            if (lossValueDisplay) lossValueDisplay.style.display = 'none';
            return;
        }

        const product = allProducts[productId];
        if (availableStock) {
            availableStock.textContent = `Available: ${product.currentStock} ${product.unit}`;
        }

        updateLossValueDisplay();
    });
}

// NEW: Update loss value display
const lossQuantity = document.getElementById('lossQuantity');
if (lossQuantity) {
    lossQuantity.addEventListener('input', updateLossValueDisplay);
}

function updateLossValueDisplay() {
    const lossProductEl = document.getElementById('lossProduct');
    const lossQuantityEl = document.getElementById('lossQuantity');
    const lossValueDisplay = document.getElementById('lossValueDisplay');
    const lossCostValue = document.getElementById('lossCostValue');
    const lossSellValue = document.getElementById('lossSellValue');

    if (!lossProductEl || !lossQuantityEl || !lossValueDisplay) return;

    const productId = lossProductEl.value;
    const quantity = parseInt(lossQuantityEl.value) || 0;

    if (!productId || quantity === 0) {
        lossValueDisplay.style.display = 'none';
        return;
    }

    const product = allProducts[productId];
    const costValue = quantity * product.costPrice;
    const sellValue = quantity * product.sellPrice;
    const currency = businessData?.currency || 'R';

    if (lossCostValue) {
        lossCostValue.textContent = `${currency} ${costValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (lossSellValue) {
        lossSellValue.textContent = `${currency} ${sellValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    lossValueDisplay.style.display = 'block';
}

// NEW: Report Loss Form Submission
const reportLossForm = document.getElementById('reportLossForm');
if (reportLossForm) {
    reportLossForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const lossData = {
            productId: document.getElementById('lossProduct').value,
            lossType: document.getElementById('lossType').value,
            quantity: parseInt(document.getElementById('lossQuantity').value),
            reason: document.getElementById('lossReason').value.trim(),
            notes: document.getElementById('lossNotes').value.trim()
        };

        const product = allProducts[lossData.productId];
        if (lossData.quantity > product.currentStock) {
            showToast('Loss quantity cannot exceed available stock', 'error');
            return;
        }

        const btn = document.getElementById('submitReportLoss');
        setLoading(btn, true);

        try {
            await reportStockLoss(lossData);
            showToast('Stock loss reported successfully', 'success');
            const reportLossModal = document.getElementById('reportLossModal');
            if (reportLossModal) reportLossModal.classList.remove('active');
            reportLossForm.reset();
            await loadInventory();
        } catch (error) {
            console.error('Error reporting loss:', error);
            showToast('Failed to report stock loss', 'error');
        } finally {
            setLoading(btn, false);
        }
    });
}

// NEW: View Losses Button Handler
const viewLossesBtn = document.getElementById('viewLossesBtn');
if (viewLossesBtn) {
    viewLossesBtn.addEventListener('click', async () => {
        // Populate branch filter
        const lossBranchFilter = document.getElementById('lossBranchFilter');
        if (lossBranchFilter) {
            lossBranchFilter.innerHTML = '<option value="all">All Branches</option>';

            Object.entries(allBranches).forEach(([branchId, branch]) => {
                const option = new Option(branch.branchName, branchId);
                lossBranchFilter.appendChild(option);
            });
        }

        updateLossesSummary();
        displayStockLosses();
        const viewLossesModal = document.getElementById('viewLossesModal');
        if (viewLossesModal) viewLossesModal.classList.add('active');
    });
}

// NEW: Update losses summary
function updateLossesSummary() {
    const lossPeriodFilter = document.getElementById('lossPeriodFilter');
    const lossBranchFilter = document.getElementById('lossBranchFilter');
    const period = lossPeriodFilter ? lossPeriodFilter.value : 'week';
    const branchId = lossBranchFilter ? lossBranchFilter.value : 'all';

    const summary = getLossesSummary(period, branchId);
    const currency = businessData?.currency || 'R';

    const weekTotalLosses = document.getElementById('weekTotalLosses');
    const weekLossCost = document.getElementById('weekLossCost');
    const weekLossRevenue = document.getElementById('weekLossRevenue');

    if (weekTotalLosses) weekTotalLosses.textContent = summary.totalLosses;
    if (weekLossCost) {
        weekLossCost.textContent = `${currency} ${summary.totalCostValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (weekLossRevenue) {
        weekLossRevenue.textContent = `${currency} ${summary.totalSellValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

// NEW: Display stock losses
function displayStockLosses() {
    const allLosses = getStockLossesData();
    const lossPeriodFilter = document.getElementById('lossPeriodFilter');
    const lossTypeFilter = document.getElementById('lossTypeFilter');
    const lossStatusFilter = document.getElementById('lossStatusFilter');
    const lossBranchFilter = document.getElementById('lossBranchFilter');

    const periodFilter = lossPeriodFilter ? lossPeriodFilter.value : 'all';
    const typeFilter = lossTypeFilter ? lossTypeFilter.value : 'all';
    const statusFilter = lossStatusFilter ? lossStatusFilter.value : 'all';
    const branchFilter = lossBranchFilter ? lossBranchFilter.value : 'all';

    let filteredLosses = Object.entries(allLosses);

    // Apply filters
    const now = new Date();
    if (periodFilter !== 'all') {
        let startDate = new Date();
        if (periodFilter === 'week') startDate.setDate(now.getDate() - 7);
        else if (periodFilter === 'month') startDate.setMonth(now.getMonth() - 1);
        else if (periodFilter === 'year') startDate.setFullYear(now.getFullYear() - 1);

        filteredLosses = filteredLosses.filter(([_, loss]) =>
            new Date(loss.reportedAt) >= startDate
        );
    }

    if (typeFilter !== 'all') {
        filteredLosses = filteredLosses.filter(([_, loss]) => loss.lossType === typeFilter);
    }

    if (statusFilter !== 'all') {
        filteredLosses = filteredLosses.filter(([_, loss]) => loss.status === statusFilter);
    }

    if (branchFilter !== 'all') {
        filteredLosses = filteredLosses.filter(([_, loss]) => loss.branchId === branchFilter);
    }

    // Sort by date (newest first)
    filteredLosses.sort((a, b) => new Date(b[1].reportedAt) - new Date(a[1].reportedAt));

    const tbody = document.getElementById('lossesTableBody');
    if (!tbody) return;

    const currency = businessData?.currency || 'R';

    if (filteredLosses.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-clipboard-list" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No stock losses match your filters
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredLosses.map(([lossId, loss]) => {
        const statusClass = loss.status === 'approved' ? 'success' :
            loss.status === 'rejected' ? 'danger' : 'warning';
        const statusIcon = loss.status === 'approved' ? 'fa-check-circle' :
            loss.status === 'rejected' ? 'fa-times-circle' : 'fa-clock';

        return `
            <tr>
                <td>${formatDate(loss.reportedAt)}</td>
                <td><strong>${loss.productName}</strong></td>
                <td><span class="badge ${loss.lossType}">${loss.lossType.toUpperCase()}</span></td>
                <td>${loss.quantity} ${loss.unit}</td>
                <td>${currency} ${loss.costValue.toFixed(2)}</td>
                <td>${currency} ${loss.sellValue.toFixed(2)}</td>
                <td>${loss.reason}</td>
                <td>${loss.branchName}</td>
                <td>${loss.reportedByName}</td>
                <td><span class="status-badge ${statusClass}"><i class="fas ${statusIcon}"></i> ${loss.status}</span></td>
                <td>
                    <div class="table-actions">
                        ${hasPermission('approve-losses') && loss.status === 'pending' ? `
                            <button class="icon-btn success" onclick="approveLoss('${lossId}')" title="Approve">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="icon-btn danger" onclick="rejectLoss('${lossId}')" title="Reject">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                        ${hasPermission('delete') ? `
                            <button class="icon-btn danger" onclick="deleteLoss('${lossId}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// NEW: Approve loss
window.approveLoss = async function (lossId) {
    if (!confirm('Approve this stock loss?')) return;

    try {
        await approveStockLoss(lossId);
        showToast('Stock loss approved', 'success');
        displayStockLosses();
        updateLossesSummary();
    } catch (error) {
        console.error('Error approving loss:', error);
        showToast('Failed to approve stock loss', 'error');
    }
};

// NEW: Reject loss
window.rejectLoss = async function (lossId) {
    const reason = prompt('Enter reason for rejection:');
    if (!reason) return;

    try {
        await rejectStockLoss(lossId, reason);
        showToast('Stock loss rejected and stock restored', 'success');
        displayStockLosses();
        updateLossesSummary();
        await loadInventory();
    } catch (error) {
        console.error('Error rejecting loss:', error);
        showToast('Failed to reject stock loss', 'error');
    }
};

// NEW: Delete loss
window.deleteLoss = async function (lossId) {
    if (!confirm('Delete this loss record? This action cannot be undone.')) return;

    try {
        await deleteStockLoss(lossId);
        showToast('Loss record deleted', 'success');
        displayStockLosses();
        updateLossesSummary();
    } catch (error) {
        console.error('Error deleting loss:', error);
        showToast('Failed to delete loss record', 'error');
    }
};

// NEW: Loss filters change handlers
const lossPeriodFilter = document.getElementById('lossPeriodFilter');
if (lossPeriodFilter) {
    lossPeriodFilter.addEventListener('change', () => {
        updateLossesSummary();
        displayStockLosses();
    });
}

const lossTypeFilter = document.getElementById('lossTypeFilter');
if (lossTypeFilter) {
    lossTypeFilter.addEventListener('change', displayStockLosses);
}

const lossStatusFilter = document.getElementById('lossStatusFilter');
if (lossStatusFilter) {
    lossStatusFilter.addEventListener('change', displayStockLosses);
}

const lossBranchFilter = document.getElementById('lossBranchFilter');
if (lossBranchFilter) {
    lossBranchFilter.addEventListener('change', () => {
        updateLossesSummary();
        displayStockLosses();
    });
}

// NEW: Weekly Report Button Handler
const weeklyReportBtn = document.getElementById('weeklyReportBtn');
if (weeklyReportBtn) {
    weeklyReportBtn.addEventListener('click', async () => {
        // Populate branch filter
        const reportBranchSelect = document.getElementById('reportBranchSelect');
        if (reportBranchSelect) {
            reportBranchSelect.innerHTML = '<option value="all">All Branches (Consolidated)</option>';

            Object.entries(allBranches).forEach(([branchId, branch]) => {
                const option = new Option(branch.branchName, branchId);
                reportBranchSelect.appendChild(option);
            });
        }

        // Set default dates (current week)
        const now = new Date();
        const dayOfWeek = now.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() + diff);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const reportStartDate = document.getElementById('reportStartDate');
        const reportEndDate = document.getElementById('reportEndDate');
        if (reportStartDate) reportStartDate.valueAsDate = weekStart;
        if (reportEndDate) reportEndDate.valueAsDate = weekEnd;

        const weeklyReportModal = document.getElementById('weeklyReportModal');
        if (weeklyReportModal) weeklyReportModal.classList.add('active');
    });
}

// NEW: Generate Report Button
const generateReportBtn = document.getElementById('generateReportBtn');
if (generateReportBtn) {
    generateReportBtn.addEventListener('click', async () => {
        const reportBranchSelect = document.getElementById('reportBranchSelect');
        const reportStartDate = document.getElementById('reportStartDate');
        const reportEndDate = document.getElementById('reportEndDate');

        const branchId = reportBranchSelect ? reportBranchSelect.value : 'all';
        const startDate = reportStartDate ? reportStartDate.value : '';
        const endDate = reportEndDate ? reportEndDate.value : '';

        if (!startDate || !endDate) {
            showToast('Please select start and end dates', 'error');
            return;
        }

        setLoading(generateReportBtn, true);

        try {
            const customDateRange = {
                start: startDate,
                end: endDate
            };

            const result = await generateWeeklyReport(branchId, customDateRange);

            displayWeeklyReport(result.reportData);
            showToast('Weekly report generated successfully', 'success');

        } catch (error) {
            console.error('Error generating report:', error);
            showToast('Failed to generate report', 'error');
        } finally {
            setLoading(generateReportBtn, false);
        }
    });
}

// NEW: Display weekly report
function displayWeeklyReport(reportData) {
    const currency = businessData?.currency || 'R';

    // Format dates
    const startDate = new Date(reportData.weekStartDate).toLocaleDateString('en-ZA');
    const endDate = new Date(reportData.weekEndDate).toLocaleDateString('en-ZA');

    const reportDateRange = document.getElementById('reportDateRange');
    const reportBranchName = document.getElementById('reportBranchName');
    if (reportDateRange) reportDateRange.textContent = `${startDate} - ${endDate}`;
    if (reportBranchName) reportBranchName.textContent = reportData.branchName;

    // Summary
    const setReportValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setReportValue('reportTotalProducts', reportData.totalProducts);
    setReportValue('reportTotalUnits', reportData.totalUnits.toLocaleString());
    setReportValue('reportTotalValue', `${currency} ${reportData.totalCostValue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`);
    setReportValue('reportPotentialProfit', `${currency} ${reportData.potentialProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`);

    // Losses
    setReportValue('reportTotalLosses', reportData.totalLosses);
    setReportValue('reportLossValue', `${currency} ${reportData.lossValue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`);
    setReportValue('reportDamaged', reportData.lossesByType.damaged.count);
    setReportValue('reportStolen', reportData.lossesByType.stolen.count);
    setReportValue('reportExpired', reportData.lossesByType.expired.count);

    // Stock alerts
    setReportValue('reportLowStock', reportData.lowStockItems);
    setReportValue('reportOutOfStock', reportData.outOfStockItems);

    // Top products
    const topProductsBody = document.getElementById('reportTopProductsBody');
    if (topProductsBody) {
        topProductsBody.innerHTML = reportData.topValueProducts.map(product => `
            <tr>
                <td><strong>${product.productName}</strong></td>
                <td>${product.units.toLocaleString()}</td>
                <td>${currency} ${product.costValue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                <td>${currency} ${product.sellValue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                <td style="color: var(--success-color); font-weight: 600;">
                    ${currency} ${product.potentialProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                </td>
            </tr>
        `).join('');
    }

    const reportPreview = document.getElementById('reportPreview');
    if (reportPreview) reportPreview.style.display = 'block';
}

// NEW: Download Report Button (placeholder - can be extended to generate PDF/Excel)
const downloadReportBtn = document.getElementById('downloadReportBtn');
if (downloadReportBtn) {
    downloadReportBtn.addEventListener('click', () => {
        showToast('Report download functionality will be added soon', 'success');
        // Future: Generate PDF or Excel file
    });
}

// =============================================================================
// END OF STOCK FOLLOW-UP INTEGRATION
// =============================================================================

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

// Add product button
const addProductBtn = document.getElementById('addProductBtn');
if (addProductBtn) {
    addProductBtn.addEventListener('click', showProductModal);
}

// Scan barcode button (topbar)
const scanBtn = document.getElementById('scanBtn');
if (scanBtn) {
    scanBtn.addEventListener('click', () => {
        const scannerModal = document.getElementById('scannerModal');
        if (scannerModal) scannerModal.classList.add('active');
        initBarcodeScanner();
    });
}

// Scan barcode button (in form)
const scanBarcodeBtn = document.getElementById('scanBarcodeBtn');
if (scanBarcodeBtn) {
    scanBarcodeBtn.addEventListener('click', () => {
        window.lastScanButtonClicked = 'unit';
        const scannerModal = document.getElementById('scannerModal');
        if (scannerModal) scannerModal.classList.add('active');
        initBarcodeScanner();
    });
}

// Scan package barcode button
const scanPackageBarcodeBtn = document.getElementById('scanPackageBarcodeBtn');
if (scanPackageBarcodeBtn) {
    scanPackageBarcodeBtn.addEventListener('click', () => {
        window.lastScanButtonClicked = 'package';
        const scannerModal = document.getElementById('scannerModal');
        if (scannerModal) scannerModal.classList.add('active');
        initBarcodeScanner();
    });
}

// Has Packaging checkbox
const hasPackaging = document.getElementById('hasPackaging');
if (hasPackaging) {
    hasPackaging.addEventListener('change', (e) => {
        const packagingDetails = document.getElementById('packagingDetails');
        if (packagingDetails) {
            packagingDetails.style.display = e.target.checked ? 'block' : 'none';
        }
    });
}

// Units per package input - update stock calculation
const unitsPerPackage = document.getElementById('unitsPerPackage');
if (unitsPerPackage) {
    unitsPerPackage.addEventListener('input', updatePackageStockInfo);
}

const currentStockInput = document.getElementById('currentStock');
if (currentStockInput) {
    currentStockInput.addEventListener('input', updatePackageStockInfo);
}

// Barcode validation on input
const productBarcode = document.getElementById('productBarcode');
if (productBarcode) {
    productBarcode.addEventListener('input', (e) => {
        const barcode = e.target.value.trim();
        if (barcode.length === 13) {
            showBarcodeValidation('productBarcode', validateEAN13(barcode));
        } else if (barcode.length > 0) {
            showBarcodeValidation('productBarcode', false);
        }
    });

    productBarcode.addEventListener('keypress', (e) => {
        if (!/\d/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab') {
            e.preventDefault();
        }
    });
}

const packageBarcode = document.getElementById('packageBarcode');
if (packageBarcode) {
    packageBarcode.addEventListener('input', (e) => {
        const barcode = e.target.value.trim();
        if (barcode.length === 13) {
            showBarcodeValidation('packageBarcode', validateEAN13(barcode));
        } else if (barcode.length > 0) {
            showBarcodeValidation('packageBarcode', false);
        }
    });

    packageBarcode.addEventListener('keypress', (e) => {
        if (!/\d/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab') {
            e.preventDefault();
        }
    });
}

// History button
const historyBtn = document.getElementById('historyBtn');
if (historyBtn) {
    historyBtn.addEventListener('click', showHistoryModal);
}

// Export button
const exportBtn = document.getElementById('exportBtn');
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        showToast('Export functionality coming soon', 'success');
    });
}

// Bulk upload button
const bulkUploadBtn = document.getElementById('bulkUploadBtn');
if (bulkUploadBtn) {
    bulkUploadBtn.addEventListener('click', () => {
        showToast('Bulk upload functionality coming soon', 'success');
    });
}

// Close modals
const closeModal = document.getElementById('closeModal');
if (closeModal) {
    closeModal.addEventListener('click', () => {
        const productModal = document.getElementById('productModal');
        if (productModal) productModal.classList.remove('active');
    });
}

const cancelProductForm = document.getElementById('cancelProductForm');
if (cancelProductForm) {
    cancelProductForm.addEventListener('click', () => {
        const productModal = document.getElementById('productModal');
        if (productModal) productModal.classList.remove('active');
    });
}

const closeScannerModal = document.getElementById('closeScannerModal');
if (closeScannerModal) {
    closeScannerModal.addEventListener('click', closeBarcodeScanner);
}

const closeHistoryModal = document.getElementById('closeHistoryModal');
if (closeHistoryModal) {
    closeHistoryModal.addEventListener('click', () => {
        const historyModal = document.getElementById('historyModal');
        if (historyModal) historyModal.classList.remove('active');
    });
}

// NEW: Close loss modals
const closeReportLossModal = document.getElementById('closeReportLossModal');
if (closeReportLossModal) {
    closeReportLossModal.addEventListener('click', () => {
        const reportLossModal = document.getElementById('reportLossModal');
        if (reportLossModal) reportLossModal.classList.remove('active');
    });
}

const cancelReportLoss = document.getElementById('cancelReportLoss');
if (cancelReportLoss) {
    cancelReportLoss.addEventListener('click', () => {
        const reportLossModal = document.getElementById('reportLossModal');
        if (reportLossModal) reportLossModal.classList.remove('active');
    });
}

const closeViewLossesModal = document.getElementById('closeViewLossesModal');
if (closeViewLossesModal) {
    closeViewLossesModal.addEventListener('click', () => {
        const viewLossesModal = document.getElementById('viewLossesModal');
        if (viewLossesModal) viewLossesModal.classList.remove('active');
    });
}

const closeWeeklyReportModal = document.getElementById('closeWeeklyReportModal');
if (closeWeeklyReportModal) {
    closeWeeklyReportModal.addEventListener('click', () => {
        const weeklyReportModal = document.getElementById('weeklyReportModal');
        const reportPreview = document.getElementById('reportPreview');
        if (weeklyReportModal) weeklyReportModal.classList.remove('active');
        if (reportPreview) reportPreview.style.display = 'none';
    });
}

const closeReportPreview = document.getElementById('closeReportPreview');
if (closeReportPreview) {
    closeReportPreview.addEventListener('click', () => {
        const weeklyReportModal = document.getElementById('weeklyReportModal');
        const reportPreview = document.getElementById('reportPreview');
        if (weeklyReportModal) weeklyReportModal.classList.remove('active');
        if (reportPreview) reportPreview.style.display = 'none';
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

        const productsGrid = document.getElementById('productsGrid');
        const productsList = document.getElementById('productsList');
        if (productsGrid) productsGrid.style.display = 'grid';
        if (productsList) productsList.style.display = 'none';
        displayProducts();
    });
}

const listViewBtn = document.getElementById('listViewBtn');
if (listViewBtn) {
    listViewBtn.addEventListener('click', () => {
        currentView = 'list';
        listViewBtn.classList.add('active');
        const gridViewBtn = document.getElementById('gridViewBtn');
        if (gridViewBtn) gridViewBtn.classList.remove('active');

        const productsGrid = document.getElementById('productsGrid');
        const productsList = document.getElementById('productsList');
        if (productsGrid) productsGrid.style.display = 'none';
        if (productsList) productsList.style.display = 'block';
        displayProducts();
    });
}

// Filters
const categoryFilter = document.getElementById('categoryFilter');
if (categoryFilter) {
    categoryFilter.addEventListener('change', (e) => {
        currentFilters.category = e.target.value;
        displayProducts();
    });
}

const stockFilter = document.getElementById('stockFilter');
if (stockFilter) {
    stockFilter.addEventListener('change', (e) => {
        currentFilters.stock = e.target.value;
        displayProducts();
    });
}

const branchFilter = document.getElementById('branchFilter');
if (branchFilter) {
    branchFilter.addEventListener('change', (e) => {
        currentFilters.branch = e.target.value;
        displayProducts();
    });
}

const sortFilter = document.getElementById('sortFilter');
if (sortFilter) {
    sortFilter.addEventListener('change', (e) => {
        currentFilters.sort = e.target.value;
        displayProducts();
    });
}

// Search
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();

        if (searchTerm === '') {
            displayProducts();
            return;
        }

        const filteredProducts = Object.entries(allProducts).filter(([_, product]) => {
            return product.productName.toLowerCase().includes(searchTerm) ||
                product.sku?.toLowerCase().includes(searchTerm) ||
                product.barcode?.toLowerCase().includes(searchTerm) ||
                product.description?.toLowerCase().includes(searchTerm);
        });

        if (currentView === 'grid') {
            displayGridView(filteredProducts);
        } else {
            displayListView(filteredProducts);
        }
    });
}

// Profit calculation listeners
const costPriceEl = document.getElementById('costPrice');
if (costPriceEl) {
    costPriceEl.addEventListener('input', updateProfitCalculations);
}

const sellPriceEl = document.getElementById('sellPrice');
if (sellPriceEl) {
    sellPriceEl.addEventListener('input', updateProfitCalculations);
}

// Add category button
const addCategoryBtn = document.getElementById('addCategoryBtn');
if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', async () => {
        const categoryName = prompt('Enter new category name:');

        if (!categoryName || categoryName.trim() === '') return;

        try {
            const categoriesRef = ref(db, `businesses/${businessId}/inventory/categories`);
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
}

// Product form submission
const productForm = document.getElementById('productForm');
if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!hasPermission('add') && !isEditMode) {
            showToast('You do not have permission to add products', 'error');
            return;
        }

        if (!hasPermission('edit') && isEditMode) {
            showToast('You do not have permission to edit products', 'error');
            return;
        }

        // Get form values
        const productName = document.getElementById('productName').value.trim();
        const description = document.getElementById('productDescription').value.trim();
        const sku = document.getElementById('productSKU').value.trim();
        const barcode = document.getElementById('productBarcode').value.trim();
        const category = document.getElementById('productCategory').value;
        const costPrice = parseFloat(document.getElementById('costPrice').value);
        const sellPrice = parseFloat(document.getElementById('sellPrice').value);
        const taxRate = parseFloat(document.getElementById('taxRate').value) || 15;
        const branchId = document.getElementById('productBranch').value;
        const currentStock = parseInt(document.getElementById('currentStock').value);
        const minStock = parseInt(document.getElementById('minStock').value) || 10;
        const maxStock = parseInt(document.getElementById('maxStock').value) || 1000;
        const unit = document.getElementById('unit').value;
        const supplier = document.getElementById('supplier').value.trim();
        const brand = document.getElementById('brand').value.trim();
        const location = document.getElementById('location').value.trim();
        const trackStock = document.getElementById('trackStock').checked;
        const isActive = document.getElementById('isActive').checked;

        // Packaging fields
        const hasPackaging = document.getElementById('hasPackaging').checked;
        const packageType = document.getElementById('packageType').value;
        const unitsPerPackage = parseInt(document.getElementById('unitsPerPackage').value) || 0;
        const packageBarcode = document.getElementById('packageBarcode').value.trim();
        const packageSellPrice = parseFloat(document.getElementById('packageSellPrice').value) || 0;

        // Validation
        if (!branchId) {
            showToast('Please select a branch', 'error');
            return;
        }

        if (!category) {
            showToast('Please select a category', 'error');
            return;
        }

        // Validate unit barcode if provided
        if (barcode && barcode.length > 0) {
            if (barcode.length !== 13) {
                showToast('Unit barcode must be exactly 13 digits (EAN-13)', 'error');
                return;
            }
            if (!validateEAN13(barcode)) {
                showToast('Invalid EAN-13 barcode checksum', 'error');
                return;
            }
        }

        // Validate package barcode if provided
        if (hasPackaging && packageBarcode && packageBarcode.length > 0) {
            if (packageBarcode.length !== 13) {
                showToast('Package barcode must be exactly 13 digits (EAN-13)', 'error');
                return;
            }
            if (!validateEAN13(packageBarcode)) {
                showToast('Invalid package EAN-13 barcode checksum', 'error');
                return;
            }
        }

        // Validate packaging fields
        if (hasPackaging && unitsPerPackage < 1) {
            showToast('Please enter units per package', 'error');
            return;
        }

        if (sellPrice < costPrice) {
            const confirmContinue = window.confirm('Sell price is lower than cost price. Continue anyway?');
            if (!confirmContinue) return;
        }

        const btn = document.getElementById('saveProductBtn');
        setLoading(btn, true);

        try {
            const profitMargin = costPrice > 0 ? ((sellPrice - costPrice) / costPrice * 100).toFixed(2) : 0;
            const branchName = allBranches[branchId].branchName;

            const productData = {
                productName,
                description,
                sku,
                barcode,
                category,
                costPrice,
                sellPrice,
                profitMargin: parseFloat(profitMargin),
                taxRate,
                currentStock,
                minStock,
                maxStock,
                unit,
                branchId,
                branchName,
                supplier,
                brand,
                location,
                trackStock,
                isActive,
                hasPackaging,
                packageType: hasPackaging ? packageType : null,
                unitsPerPackage: hasPackaging ? unitsPerPackage : null,
                packageBarcode: hasPackaging ? packageBarcode : null,
                packageSellPrice: hasPackaging ? packageSellPrice : null,
                lastModifiedBy: userData.displayName,
                lastModifiedAt: new Date().toISOString()
            };

            if (isEditMode && editingProductId) {
                // Update existing product
                const productRef = ref(db, `businesses/${businessId}/inventory/products/${editingProductId}`);
                const oldProduct = allProducts[editingProductId];

                await update(productRef, productData);

                // Log changes
                await logInventoryChange({
                    productId: editingProductId,
                    productName: productName,
                    action: 'updated',
                    field: 'product',
                    oldValue: JSON.stringify(oldProduct),
                    newValue: JSON.stringify(productData),
                    notes: `Product updated`
                });

                showToast('Product updated successfully', 'success');

            } else {
                // Create new product
                const productsRef = ref(db, `businesses/${businessId}/inventory/products`);
                const newProductRef = push(productsRef);

                productData.createdBy = userData.displayName;
                productData.createdAt = new Date().toISOString();

                await set(newProductRef, productData);

                // Log creation
                await logInventoryChange({
                    productId: newProductRef.key,
                    productName: productName,
                    action: 'created',
                    field: 'product',
                    oldValue: 'null',
                    newValue: JSON.stringify(productData),
                    notes: `New product added to inventory`
                });

                showToast('Product added successfully', 'success');
            }

            const productModal = document.getElementById('productModal');
            if (productModal) productModal.classList.remove('active');
            await loadInventory();
            await loadHistory();

        } catch (error) {
            console.error('Error saving product:', error);
            showToast('Failed to save product', 'error');
        } finally {
            setLoading(btn, false);
        }
    });
}

// History filters
const applyHistoryFilter = document.getElementById('applyHistoryFilter');
if (applyHistoryFilter) {
    applyHistoryFilter.addEventListener('click', () => {
        const dateFrom = document.getElementById('historyDateFrom').value;
        const dateTo = document.getElementById('historyDateTo').value;
        const userFilter = document.getElementById('historyUserFilter').value;

        let filteredHistory = [...allHistory];

        if (dateFrom) {
            filteredHistory = filteredHistory.filter(h => new Date(h.timestamp) >= new Date(dateFrom));
        }

        if (dateTo) {
            const endDate = new Date(dateTo);
            endDate.setHours(23, 59, 59, 999);
            filteredHistory = filteredHistory.filter(h => new Date(h.timestamp) <= endDate);
        }

        if (userFilter !== 'all') {
            filteredHistory = filteredHistory.filter(h => h.changedBy === userFilter);
        }

        displayHistory(filteredHistory);
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

console.log('BongoBoss POS - Inventory Management with Stock Follow-Up Initialized ✓');