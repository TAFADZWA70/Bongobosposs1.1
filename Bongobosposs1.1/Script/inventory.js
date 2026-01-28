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
 * INVENTORY MANAGEMENT SYSTEM
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
 *   └── history/{historyId}
 *       ├── productId
 *       ├── productName
 *       ├── action (created, updated, stock-adjusted, deleted)
 *       ├── changedBy
 *       ├── changedByName
 *       ├── timestamp
 *       ├── oldValue
 *       ├── newValue
 *       ├── field (what was changed)
 *       └── notes
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
        'adjust': ['owner', 'partner', 'admin', 'manager']
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
        addBtn.style.display = 'none';
        bulkUploadBtn.style.display = 'none';
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

            branchFilter.innerHTML = '<option value="all">All Branches</option>';
            productBranch.innerHTML = '<option value="">Select branch</option>';

            Object.entries(allBranches).forEach(([branchId, branch]) => {
                const filterOption = new Option(branch.branchName, branchId);
                branchFilter.appendChild(filterOption);

                const formOption = new Option(branch.branchName, branchId);
                productBranch.appendChild(formOption);
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

        categoryFilter.innerHTML = '<option value="all">All Categories</option>';
        productCategory.innerHTML = '<option value="">Select category</option>';

        if (snapshot.exists()) {
            allCategories = snapshot.val();

            Object.entries(allCategories).forEach(([categoryId, category]) => {
                const filterOption = new Option(category.categoryName, categoryId);
                categoryFilter.appendChild(filterOption);

                const formOption = new Option(category.categoryName, categoryId);
                productCategory.appendChild(formOption);
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

        loadingState.style.display = 'flex';

        if (snapshot.exists()) {
            allProducts = snapshot.val();
            updateInventoryStats();
            displayProducts();
        } else {
            allProducts = {};
            updateInventoryStats();

            productsGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-boxes"></i>
                    <h3>No Products Yet</h3>
                    <p>Add your first product to get started</p>
                </div>
            `;

            productsTableBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 3rem;">
                        <i class="fas fa-boxes" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem; display: block;"></i>
                        <p style="color: #94a3b8;">No products yet. Add your first product to get started.</p>
                    </td>
                </tr>
            `;
        }

        loadingState.style.display = 'none';

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
    document.getElementById('totalProducts').textContent = totalProducts;
    document.getElementById('productsChange').textContent = `${totalCategories} categories`;

    // Total value (based on cost price)
    const totalValue = products.reduce((sum, product) => {
        return sum + (product.costPrice * product.currentStock || 0);
    }, 0);
    document.getElementById('totalValue').textContent =
        `${currency} ${totalValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Low stock items (current stock <= minimum stock)
    const lowStockItems = products.filter(p => p.currentStock <= p.minStock && p.currentStock > 0);
    document.getElementById('lowStock').textContent = lowStockItems.length;

    // Critical stock items (current stock <= 20% of minimum stock)
    const criticalStock = products.filter(p => p.currentStock <= (p.minStock * 0.2) && p.currentStock > 0);
    document.getElementById('criticalStock').textContent = `${criticalStock.length} items critical`;

    // Out of stock
    const outOfStock = products.filter(p => p.currentStock === 0);
    document.getElementById('outOfStock').textContent = outOfStock.length;
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

    document.getElementById('productModal').classList.add('active');
    document.getElementById('modalTitle').textContent = 'Add New Product';
    document.getElementById('saveProductBtn').querySelector('.btn-text').innerHTML = '<i class="fas fa-save"></i> Save Product';
    isEditMode = false;
    editingProductId = null;
    document.getElementById('productForm').reset();
    document.getElementById('trackStock').checked = true;
    document.getElementById('isActive').checked = true;
    document.getElementById('hasPackaging').checked = false;
    document.getElementById('packagingDetails').style.display = 'none';

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
    document.getElementById('productName').value = product.productName;
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productSKU').value = product.sku || '';
    document.getElementById('productBarcode').value = product.barcode || '';
    document.getElementById('productCategory').value = product.category;
    document.getElementById('costPrice').value = product.costPrice;
    document.getElementById('sellPrice').value = product.sellPrice;
    document.getElementById('taxRate').value = product.taxRate || 15;
    document.getElementById('productBranch').value = product.branchId;
    document.getElementById('currentStock').value = product.currentStock;
    document.getElementById('minStock').value = product.minStock;
    document.getElementById('maxStock').value = product.maxStock;
    document.getElementById('unit').value = product.unit;
    document.getElementById('supplier').value = product.supplier || '';
    document.getElementById('brand').value = product.brand || '';
    document.getElementById('location').value = product.location || '';
    document.getElementById('trackStock').checked = product.trackStock !== false;
    document.getElementById('isActive').checked = product.isActive !== false;

    // Populate packaging fields
    const hasPackaging = product.hasPackaging || false;
    document.getElementById('hasPackaging').checked = hasPackaging;

    if (hasPackaging) {
        document.getElementById('packagingDetails').style.display = 'block';
        document.getElementById('packageType').value = product.packageType || 'box';
        document.getElementById('unitsPerPackage').value = product.unitsPerPackage || '';
        document.getElementById('packageBarcode').value = product.packageBarcode || '';
        document.getElementById('packageSellPrice').value = product.packageSellPrice || '';
        updatePackageStockInfo();
    }

    // Update modal
    document.getElementById('modalTitle').textContent = 'Edit Product';
    document.getElementById('saveProductBtn').querySelector('.btn-text').innerHTML = '<i class="fas fa-save"></i> Update Product';
    document.getElementById('productModal').classList.add('active');

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
    const costPrice = parseFloat(document.getElementById('costPrice').value) || 0;
    const sellPrice = parseFloat(document.getElementById('sellPrice').value) || 0;
    const currency = businessData?.currency || 'R';

    const profit = sellPrice - costPrice;
    const profitMargin = costPrice > 0 ? ((profit / costPrice) * 100).toFixed(2) : 0;

    document.getElementById('profitMargin').textContent = `${profitMargin}%`;
    document.getElementById('profitPerUnit').textContent = `${currency} ${profit.toFixed(2)}`;
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

        // Validate EAN-13 (must be exactly 13 digits)
        if (code.length !== 13 || !/^\d{13}$/.test(code)) {
            document.getElementById('scannerResult').innerHTML = `
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
            document.getElementById('scannerResult').innerHTML = `
                <i class="fas fa-exclamation-circle" style="color: var(--accent-color); font-size: 2rem;"></i>
                <p style="margin-top: 0.5rem; color: var(--accent-color);">
                    Invalid EAN-13 checksum: <strong>${formatBarcode(code)}</strong><br>
                    <small>The barcode checksum is invalid</small>
                </p>
            `;
            return;
        }

        document.getElementById('scannerResult').innerHTML = `
            <i class="fas fa-check-circle" style="color: var(--secondary-color); font-size: 2rem;"></i>
            <p style="margin-top: 0.5rem;">Valid EAN-13: <strong>${formatBarcode(code)}</strong></p>
        `;

        // If scanning for product form, populate barcode field
        if (document.getElementById('productModal').classList.contains('active')) {
            // Check which barcode field to populate
            const productBarcodeField = document.getElementById('productBarcode');
            const packageBarcodeField = document.getElementById('packageBarcode');

            // Determine which scan button was clicked based on recent click
            if (window.lastScanButtonClicked === 'package') {
                packageBarcodeField.value = code;
                showBarcodeValidation('packageBarcode', true);
            } else {
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
    document.getElementById('scannerModal').classList.remove('active');
    document.getElementById('scannerResult').innerHTML = '';
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
    document.getElementById('historyModal').classList.add('active');
    displayHistory(allHistory);
};

// Display history
function displayHistory(historyData) {
    const historyTableBody = document.getElementById('historyTableBody');

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

// Event Listeners

// Mobile menu toggle
document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('active');
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
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

// Add product button
document.getElementById('addProductBtn').addEventListener('click', showProductModal);

// Scan barcode button (topbar)
document.getElementById('scanBtn').addEventListener('click', () => {
    document.getElementById('scannerModal').classList.add('active');
    initBarcodeScanner();
});

// Scan barcode button (in form)
document.getElementById('scanBarcodeBtn').addEventListener('click', () => {
    window.lastScanButtonClicked = 'unit';
    document.getElementById('scannerModal').classList.add('active');
    initBarcodeScanner();
});

// Scan package barcode button
document.getElementById('scanPackageBarcodeBtn').addEventListener('click', () => {
    window.lastScanButtonClicked = 'package';
    document.getElementById('scannerModal').classList.add('active');
    initBarcodeScanner();
});

// Has Packaging checkbox
document.getElementById('hasPackaging').addEventListener('change', (e) => {
    const packagingDetails = document.getElementById('packagingDetails');
    if (e.target.checked) {
        packagingDetails.style.display = 'block';
    } else {
        packagingDetails.style.display = 'none';
    }
});

// Units per package input - update stock calculation
document.getElementById('unitsPerPackage').addEventListener('input', updatePackageStockInfo);
document.getElementById('currentStock').addEventListener('input', updatePackageStockInfo);

// Barcode validation on input
document.getElementById('productBarcode').addEventListener('input', (e) => {
    const barcode = e.target.value.trim();
    if (barcode.length === 13) {
        showBarcodeValidation('productBarcode', validateEAN13(barcode));
    } else if (barcode.length > 0) {
        showBarcodeValidation('productBarcode', false);
    }
});

document.getElementById('packageBarcode').addEventListener('input', (e) => {
    const barcode = e.target.value.trim();
    if (barcode.length === 13) {
        showBarcodeValidation('packageBarcode', validateEAN13(barcode));
    } else if (barcode.length > 0) {
        showBarcodeValidation('packageBarcode', false);
    }
});

// Only allow numbers in barcode fields
document.getElementById('productBarcode').addEventListener('keypress', (e) => {
    if (!/\d/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab') {
        e.preventDefault();
    }
});

document.getElementById('packageBarcode').addEventListener('keypress', (e) => {
    if (!/\d/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab') {
        e.preventDefault();
    }
});

// History button
document.getElementById('historyBtn').addEventListener('click', showHistoryModal);

// Export button
document.getElementById('exportBtn').addEventListener('click', () => {
    showToast('Export functionality coming soon', 'success');
});

// Bulk upload button
document.getElementById('bulkUploadBtn').addEventListener('click', () => {
    showToast('Bulk upload functionality coming soon', 'success');
});

// Close modals
document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('productModal').classList.remove('active');
});

document.getElementById('cancelProductForm').addEventListener('click', () => {
    document.getElementById('productModal').classList.remove('active');
});

document.getElementById('closeScannerModal').addEventListener('click', closeBarcodeScanner);

document.getElementById('closeHistoryModal').addEventListener('click', () => {
    document.getElementById('historyModal').classList.remove('active');
});

// View toggle
document.getElementById('gridViewBtn').addEventListener('click', () => {
    currentView = 'grid';
    document.getElementById('gridViewBtn').classList.add('active');
    document.getElementById('listViewBtn').classList.remove('active');
    document.getElementById('productsGrid').style.display = 'grid';
    document.getElementById('productsList').style.display = 'none';
    displayProducts();
});

document.getElementById('listViewBtn').addEventListener('click', () => {
    currentView = 'list';
    document.getElementById('listViewBtn').classList.add('active');
    document.getElementById('gridViewBtn').classList.remove('active');
    document.getElementById('productsGrid').style.display = 'none';
    document.getElementById('productsList').style.display = 'block';
    displayProducts();
});

// Filters
document.getElementById('categoryFilter').addEventListener('change', (e) => {
    currentFilters.category = e.target.value;
    displayProducts();
});

document.getElementById('stockFilter').addEventListener('change', (e) => {
    currentFilters.stock = e.target.value;
    displayProducts();
});

document.getElementById('branchFilter').addEventListener('change', (e) => {
    currentFilters.branch = e.target.value;
    displayProducts();
});

document.getElementById('sortFilter').addEventListener('change', (e) => {
    currentFilters.sort = e.target.value;
    displayProducts();
});

// Search
document.getElementById('searchInput').addEventListener('input', (e) => {
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

// Profit calculation listeners
document.getElementById('costPrice').addEventListener('input', updateProfitCalculations);
document.getElementById('sellPrice').addEventListener('input', updateProfitCalculations);

// Add category button
document.getElementById('addCategoryBtn').addEventListener('click', async () => {
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

// Product form submission
document.getElementById('productForm').addEventListener('submit', async (e) => {
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
        const confirm = window.confirm('Sell price is lower than cost price. Continue anyway?');
        if (!confirm) return;
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

        document.getElementById('productModal').classList.remove('active');
        await loadInventory();
        await loadHistory();

    } catch (error) {
        console.error('Error saving product:', error);
        showToast('Failed to save product', 'error');
    } finally {
        setLoading(btn, false);
    }
});

// History filters
document.getElementById('applyHistoryFilter').addEventListener('click', () => {
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

// Helper functions
function setLoading(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');

    if (isLoading) {
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-block';
        button.disabled = true;
    } else {
        btnText.style.display = 'inline-block';
        btnLoader.style.display = 'none';
        button.disabled = false;
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById(type === 'success' ? 'successToast' : 'errorToast');
    const messageSpan = type === 'success' ?
        document.getElementById('toastMessage') :
        document.getElementById('errorToastMessage');

    messageSpan.textContent = message;
    toast.style.display = 'flex';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

console.log('BongoBoss POS - Inventory Management Initialized ✓');