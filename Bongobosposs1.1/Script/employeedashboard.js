import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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
let branchProducts = {};
let shoppingCart = [];
let todaysSales = [];
let shiftStartTime = new Date();
let scanner = null;

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

        // Check if user is employee
        if (userData.role !== 'employee' && userData.role !== 'admin' && userData.role !== 'manager') {
            showToast('Access denied. Employee dashboard only.', 'error');
            setTimeout(() => {
                window.location.href = 'Dashboard.html';
            }, 2000);
            return;
        }

        if (!businessId || !userData.branchId) {
            showToast('No business or branch assigned.', 'error');
            setTimeout(() => {
                window.location.href = '../Authentication Pages/Register.html';
            }, 2000);
            return;
        }

        await loadBusinessInfo();
        await loadBranchProducts();
        await loadTodaysSales();

        // Update UI
        document.getElementById('employeeName').textContent = userData.displayName || 'Employee';
        document.getElementById('employeeRole').textContent = userData.jobTitle || userData.role;

        // Start shift timer
        startShiftTimer();

        // Start clock
        startClock();

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

            if (businessData.logo) {
                const logoContainer = document.getElementById('businessLogoContainer');
                logoContainer.innerHTML = `<img src="${businessData.logo}" alt="Business Logo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }
        }

        // Load branch info
        const branchRef = ref(db, `businesses/${businessId}/branches/${userData.branchId}`);
        const branchSnap = await get(branchRef);

        if (branchSnap.exists()) {
            const branch = branchSnap.val();
            document.getElementById('branchName').textContent = branch.branchName || 'Branch';
        }
    } catch (error) {
        console.error('Error loading business info:', error);
    }
}

// Load branch products (only products assigned to employee's branch)
async function loadBranchProducts() {
    try {
        const productsRef = ref(db, `businesses/${businessId}/inventory/products`);
        const snapshot = await get(productsRef);

        if (snapshot.exists()) {
            const allProducts = snapshot.val();

            // Filter products for this branch only
            branchProducts = {};
            Object.entries(allProducts).forEach(([productId, product]) => {
                if (product.branchId === userData.branchId && product.isActive !== false) {
                    branchProducts[productId] = product;
                }
            });

            console.log(`Loaded ${Object.keys(branchProducts).length} products for this branch`);
        }
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

// Load today's sales
async function loadTodaysSales() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const salesRef = ref(db, `businesses/${businessId}/sales`);
        const snapshot = await get(salesRef);

        todaysSales = [];

        if (snapshot.exists()) {
            const allSales = snapshot.val();

            Object.entries(allSales).forEach(([saleId, sale]) => {
                if (sale.date === today && sale.branchId === userData.branchId) {
                    todaysSales.push({ id: saleId, ...sale });
                }
            });
        }

        updateDashboardStats();
    } catch (error) {
        console.error('Error loading sales:', error);
    }
}

// Update dashboard stats
function updateDashboardStats() {
    const currency = businessData?.currency || 'R';

    // Calculate today's sales total
    const totalSales = todaysSales.reduce((sum, sale) => sum + sale.total, 0);
    const transactionCount = todaysSales.length;

    document.getElementById('todaysSalesAmount').textContent = `${currency} ${totalSales.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    document.getElementById('transactionsCount').textContent = transactionCount;

    // Calculate shift sales (sales made by current employee today)
    const shiftSales = todaysSales
        .filter(sale => sale.soldBy === generateCleanId(currentUser.email))
        .reduce((sum, sale) => sum + sale.total, 0);

    document.getElementById('shiftSales').textContent = `${currency} ${shiftSales.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

    // Update recent sales list
    displayRecentSales();
}

// Display recent sales
function displayRecentSales() {
    const recentList = document.getElementById('recentSalesList');
    const currency = businessData?.currency || 'R';

    const recentSales = todaysSales
        .sort((a, b) => new Date(b.soldAt) - new Date(a.soldAt))
        .slice(0, 5);

    if (recentSales.length === 0) {
        recentList.innerHTML = `
            <div class="empty-state-small">
                <i class="fas fa-receipt"></i>
                <p>No sales yet today</p>
            </div>
        `;
        return;
    }

    recentList.innerHTML = recentSales.map(sale => {
        const time = new Date(sale.soldAt).toLocaleTimeString('en-ZA', {
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="recent-item">
                <div class="recent-info">
                    <h5>Receipt #${sale.receiptNumber}</h5>
                    <p>${time} • ${sale.items.length} item${sale.items.length !== 1 ? 's' : ''}</p>
                </div>
                <div class="recent-amount">${currency} ${sale.total.toFixed(2)}</div>
            </div>
        `;
    }).join('');
}

// Start shift timer
function startShiftTimer() {
    setInterval(() => {
        const now = new Date();
        const diff = now - shiftStartTime;

        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);

        const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        document.getElementById('shiftTime').textContent = timeStr;
    }, 1000);
}

// Start clock
function startClock() {
    function updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-ZA', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const timeElement = document.querySelector('#currentTime span');
        if (timeElement) {
            timeElement.textContent = timeStr;
        }
    }

    updateClock();
    setInterval(updateClock, 1000);
}

// Product search
const productSearch = document.getElementById('productSearch');
if (productSearch) {
    productSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();

        if (searchTerm.length < 2) {
            document.getElementById('productSuggestions').innerHTML = '';
            return;
        }

        const matches = Object.entries(branchProducts).filter(([_, product]) => {
            return product.productName.toLowerCase().includes(searchTerm) ||
                product.sku?.toLowerCase().includes(searchTerm) ||
                product.barcode?.includes(searchTerm);
        }).slice(0, 5);

        displayProductSuggestions(matches);
    });
}

// Display product suggestions
function displayProductSuggestions(matches) {
    const suggestionsContainer = document.getElementById('productSuggestions');
    const currency = businessData?.currency || 'R';

    if (matches.length === 0) {
        suggestionsContainer.innerHTML = '<p style="padding: 1rem; color: var(--gray-600);">No products found</p>';
        return;
    }

    suggestionsContainer.innerHTML = matches.map(([productId, product]) => {
        let stockStatus = 'in-stock';
        let stockClass = '';

        if (product.currentStock === 0) {
            stockStatus = 'Out of stock';
            stockClass = 'out';
        } else if (product.currentStock <= product.minStock) {
            stockStatus = `Low stock: ${product.currentStock} ${product.unit}`;
            stockClass = 'low';
        } else {
            stockStatus = `In stock: ${product.currentStock} ${product.unit}`;
        }

        return `
            <div class="suggestion-item" onclick="addToCart('${productId}')" ${product.currentStock === 0 ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>
                <div class="suggestion-info">
                    <h4>${product.productName}</h4>
                    <p>SKU: ${product.sku || 'N/A'}</p>
                </div>
                <div class="suggestion-price">
                    <div class="price">${currency} ${product.sellPrice.toFixed(2)}</div>
                    <div class="stock ${stockClass}">${stockStatus}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Add to cart
window.addToCart = function (productId) {
    const product = branchProducts[productId];
    if (!product) return;

    if (product.currentStock === 0) {
        showToast('Product out of stock', 'error');
        return;
    }

    // Check if product already in cart
    const existingItem = shoppingCart.find(item => item.productId === productId);

    if (existingItem) {
        // Check if adding one more exceeds stock
        if (existingItem.quantity >= product.currentStock) {
            showToast('Not enough stock available', 'error');
            return;
        }
        existingItem.quantity++;
    } else {
        shoppingCart.push({
            productId: productId,
            productName: product.productName,
            sku: product.sku,
            sellPrice: product.sellPrice,
            taxRate: product.taxRate !== undefined ? product.taxRate : 15, // Store tax rate with item
            unit: product.unit,
            quantity: 1,
            maxStock: product.currentStock
        });
    }

    updateCart();
    showToast(`${product.productName} added to cart`, 'success');

    // Clear search
    document.getElementById('productSearch').value = '';
    document.getElementById('productSuggestions').innerHTML = '';

    // Auto-open cart modal on tablet/mobile for better UX
    if (window.innerWidth <= 1024) {
        setTimeout(() => {
            document.getElementById('cartModal').classList.add('active');
        }, 500);
    }
};

// Update cart display
function updateCart() {
    const cartItems = document.getElementById('cartItems');
    const cartCount = document.getElementById('cartCount');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const viewCartBtn = document.getElementById('viewCartBtn');
    const currency = businessData?.currency || 'R';

    cartCount.textContent = shoppingCart.length;

    // Update modal count if exists
    const modalCount = document.getElementById('cartModalCount');
    if (modalCount) {
        modalCount.textContent = shoppingCart.length;
    }

    // Show/hide view cart button
    if (viewCartBtn) {
        viewCartBtn.style.display = shoppingCart.length > 0 ? 'flex' : 'none';
    }

    if (shoppingCart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart"></i>
                <p>Cart is empty</p>
                <small>Scan or search for products to add</small>
            </div>
        `;
        checkoutBtn.disabled = true;
    } else {
        cartItems.innerHTML = shoppingCart.map((item, index) => `
            <div class="cart-item">
                <div class="item-info">
                    <h4>${item.productName}</h4>
                    <p>SKU: ${item.sku} • ${currency} ${item.sellPrice.toFixed(2)} each</p>
                </div>
                <div class="item-controls">
                    <div class="item-quantity">
                        <button class="qty-btn" onclick="updateQuantity(${index}, -1)">-</button>
                        <span class="qty-display">${item.quantity}</span>
                        <button class="qty-btn" onclick="updateQuantity(${index}, 1)">+</button>
                    </div>
                    <div class="item-price">${currency} ${(item.sellPrice * item.quantity).toFixed(2)}</div>
                    <button class="remove-item-btn" onclick="removeFromCart(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        checkoutBtn.disabled = false;
    }

    updateCartTotals();
    updateCartModal();
}

// Update cart modal
function updateCartModal() {
    const cartModalItems = document.getElementById('cartModalItems');
    const checkoutModalBtn = document.getElementById('checkoutModalBtn');
    const currency = businessData?.currency || 'R';

    if (!cartModalItems) return;

    if (shoppingCart.length === 0) {
        cartModalItems.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart"></i>
                <p>Cart is empty</p>
                <small>Scan or search for products to add</small>
            </div>
        `;
        if (checkoutModalBtn) checkoutModalBtn.disabled = true;
    } else {
        cartModalItems.innerHTML = shoppingCart.map((item, index) => `
            <div class="cart-modal-item">
                <div class="modal-item-info">
                    <h4>${item.productName}</h4>
                    <p>SKU: ${item.sku}</p>
                    <p style="color: var(--primary-color); font-weight: 600;">${currency} ${item.sellPrice.toFixed(2)} per unit</p>
                </div>
                <div class="modal-item-controls">
                    <div class="modal-item-price">${currency} ${(item.sellPrice * item.quantity).toFixed(2)}</div>
                    <div class="modal-item-quantity">
                        <button class="modal-qty-btn" onclick="updateQuantity(${index}, -1)">-</button>
                        <span class="modal-qty-display">${item.quantity}</span>
                        <button class="modal-qty-btn" onclick="updateQuantity(${index}, 1)">+</button>
                    </div>
                    <button class="modal-remove-btn" onclick="removeFromCart(${index})">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
            </div>
        `).join('');
        if (checkoutModalBtn) checkoutModalBtn.disabled = false;
    }

    // Update modal totals
    updateModalTotals();
}

// Update modal totals
function updateModalTotals() {
    const subtotal = shoppingCart.reduce((sum, item) => sum + (item.sellPrice * item.quantity), 0);

    // Calculate tax based on individual product tax rates
    const tax = shoppingCart.reduce((sum, item) => {
        const itemSubtotal = item.sellPrice * item.quantity;
        const itemTax = itemSubtotal * ((item.taxRate || 0) / 100);
        return sum + itemTax;
    }, 0);

    const total = subtotal + tax;
    const currency = businessData?.currency || 'R';

    const modalSubtotal = document.getElementById('modalSubtotal');
    const modalTaxAmount = document.getElementById('modalTaxAmount');
    const modalCartTotal = document.getElementById('modalCartTotal');

    if (modalSubtotal) modalSubtotal.textContent = `${currency} ${subtotal.toFixed(2)}`;
    if (modalTaxAmount) modalTaxAmount.textContent = `${currency} ${tax.toFixed(2)}`;
    if (modalCartTotal) modalCartTotal.textContent = `${currency} ${total.toFixed(2)}`;
}

// Update quantity
window.updateQuantity = function (index, change) {
    const item = shoppingCart[index];
    const newQuantity = item.quantity + change;

    if (newQuantity < 1) {
        removeFromCart(index);
        return;
    }

    if (newQuantity > item.maxStock) {
        showToast('Not enough stock available', 'error');
        return;
    }

    item.quantity = newQuantity;
    updateCart();
};

// Remove from cart
window.removeFromCart = function (index) {
    shoppingCart.splice(index, 1);
    updateCart();
    showToast('Item removed from cart', 'success');
};

// Update cart totals
function updateCartTotals() {
    const subtotal = shoppingCart.reduce((sum, item) => sum + (item.sellPrice * item.quantity), 0);

    // Calculate tax based on individual product tax rates
    const tax = shoppingCart.reduce((sum, item) => {
        const itemSubtotal = item.sellPrice * item.quantity;
        const itemTax = itemSubtotal * ((item.taxRate || 0) / 100);
        return sum + itemTax;
    }, 0);

    const total = subtotal + tax;

    const currency = businessData?.currency || 'R';

    document.getElementById('subtotal').textContent = `${currency} ${subtotal.toFixed(2)}`;
    document.getElementById('taxAmount').textContent = `${currency} ${tax.toFixed(2)}`;
    document.getElementById('cartTotal').textContent = `${currency} ${total.toFixed(2)}`;
}

// Clear cart
const clearCartBtn = document.getElementById('clearCartBtn');
if (clearCartBtn) {
    clearCartBtn.addEventListener('click', () => {
        if (shoppingCart.length === 0) return;

        if (confirm('Clear all items from cart?')) {
            shoppingCart = [];
            updateCart();
            showToast('Cart cleared', 'success');
        }
    });
}

// View cart modal
const viewCartBtn = document.getElementById('viewCartBtn');
if (viewCartBtn) {
    viewCartBtn.addEventListener('click', () => {
        updateCartModal();
        document.getElementById('cartModal').classList.add('active');
    });
}

// Close cart modal
const closeCartModal = document.getElementById('closeCartModal');
if (closeCartModal) {
    closeCartModal.addEventListener('click', () => {
        document.getElementById('cartModal').classList.remove('active');
    });
}

// Clear cart from modal
const clearCartModalBtn = document.getElementById('clearCartModalBtn');
if (clearCartModalBtn) {
    clearCartModalBtn.addEventListener('click', () => {
        if (shoppingCart.length === 0) return;

        if (confirm('Clear all items from cart?')) {
            shoppingCart = [];
            updateCart();
            document.getElementById('cartModal').classList.remove('active');
            showToast('Cart cleared', 'success');
        }
    });
}

// Checkout from modal
const checkoutModalBtn = document.getElementById('checkoutModalBtn');
if (checkoutModalBtn) {
    checkoutModalBtn.addEventListener('click', () => {
        // Close cart modal
        document.getElementById('cartModal').classList.remove('active');

        // Open payment modal
        if (shoppingCart.length === 0) return;

        const subtotal = shoppingCart.reduce((sum, item) => sum + (item.sellPrice * item.quantity), 0);

        // Calculate tax based on individual product tax rates
        const tax = shoppingCart.reduce((sum, item) => {
            const itemSubtotal = item.sellPrice * item.quantity;
            const itemTax = itemSubtotal * ((item.taxRate || 0) / 100);
            return sum + itemTax;
        }, 0);

        const total = subtotal + tax;

        const currency = businessData?.currency || 'R';

        document.getElementById('paymentTotalAmount').textContent = `${currency} ${total.toFixed(2)}`;
        document.getElementById('paymentSubtotal').textContent = `${currency} ${subtotal.toFixed(2)}`;
        document.getElementById('paymentTax').textContent = `${currency} ${tax.toFixed(2)}`;

        document.getElementById('amountPaid').value = '';
        document.getElementById('changeDisplay').style.display = 'none';
        document.getElementById('completeSaleBtn').disabled = true;

        document.getElementById('paymentModal').classList.add('active');
    });
}

// Checkout - show payment modal
const checkoutBtn = document.getElementById('checkoutBtn');
if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
        if (shoppingCart.length === 0) return;

        const subtotal = shoppingCart.reduce((sum, item) => sum + (item.sellPrice * item.quantity), 0);

        // Calculate tax based on individual product tax rates
        const tax = shoppingCart.reduce((sum, item) => {
            const itemSubtotal = item.sellPrice * item.quantity;
            const itemTax = itemSubtotal * ((item.taxRate || 0) / 100);
            return sum + itemTax;
        }, 0);

        const total = subtotal + tax;

        const currency = businessData?.currency || 'R';

        document.getElementById('paymentTotalAmount').textContent = `${currency} ${total.toFixed(2)}`;
        document.getElementById('paymentSubtotal').textContent = `${currency} ${subtotal.toFixed(2)}`;
        document.getElementById('paymentTax').textContent = `${currency} ${tax.toFixed(2)}`;

        document.getElementById('amountPaid').value = '';
        document.getElementById('changeDisplay').style.display = 'none';
        document.getElementById('completeSaleBtn').disabled = true;

        document.getElementById('paymentModal').classList.add('active');
    });
}

// Quick amount buttons
document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.classList.contains('exact-btn')) {
            const total = parseFloat(document.getElementById('paymentTotalAmount').textContent.replace(/[^0-9.]/g, ''));
            document.getElementById('amountPaid').value = total.toFixed(2);
        } else {
            const amount = parseFloat(btn.dataset.amount);
            document.getElementById('amountPaid').value = amount.toFixed(2);
        }

        calculateChange();
    });
});

// Amount paid input
const amountPaid = document.getElementById('amountPaid');
if (amountPaid) {
    amountPaid.addEventListener('input', calculateChange);
}

// Calculate change
function calculateChange() {
    const total = parseFloat(document.getElementById('paymentTotalAmount').textContent.replace(/[^0-9.]/g, ''));
    const paid = parseFloat(document.getElementById('amountPaid').value) || 0;

    if (paid >= total) {
        const change = paid - total;
        const currency = businessData?.currency || 'R';

        document.getElementById('changeAmount').textContent = `${currency} ${change.toFixed(2)}`;
        document.getElementById('changeDisplay').style.display = 'block';
        document.getElementById('completeSaleBtn').disabled = false;
    } else {
        document.getElementById('changeDisplay').style.display = 'none';
        document.getElementById('completeSaleBtn').disabled = true;
    }
}

// Complete sale
const completeSaleBtn = document.getElementById('completeSaleBtn');
if (completeSaleBtn) {
    completeSaleBtn.addEventListener('click', async () => {
        setLoading(completeSaleBtn, true);

        try {
            const subtotal = shoppingCart.reduce((sum, item) => sum + (item.sellPrice * item.quantity), 0);

            // Calculate tax based on individual product tax rates
            const tax = shoppingCart.reduce((sum, item) => {
                const itemSubtotal = item.sellPrice * item.quantity;
                const itemTax = itemSubtotal * ((item.taxRate || 0) / 100);
                return sum + itemTax;
            }, 0);

            const total = subtotal + tax;
            const paid = parseFloat(document.getElementById('amountPaid').value);
            const change = paid - total;
            const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

            // Generate receipt number
            const receiptNumber = generateReceiptNumber();

            // Create sale record
            const saleData = {
                receiptNumber: receiptNumber,
                items: shoppingCart.map(item => ({
                    productId: item.productId,
                    productName: item.productName,
                    sku: item.sku,
                    sellPrice: item.sellPrice,
                    taxRate: item.taxRate,
                    quantity: item.quantity,
                    subtotal: item.sellPrice * item.quantity,
                    tax: (item.sellPrice * item.quantity) * ((item.taxRate || 0) / 100)
                })),
                subtotal: subtotal,
                tax: tax,
                total: total,
                amountPaid: paid,
                change: change,
                paymentMethod: paymentMethod,
                branchId: userData.branchId,
                branchName: userData.branchName || 'Unknown Branch',
                soldBy: generateCleanId(currentUser.email),
                soldByName: userData.displayName,
                soldAt: new Date().toISOString(),
                date: new Date().toISOString().split('T')[0]
            };

            // Save sale
            const salesRef = ref(db, `businesses/${businessId}/sales`);
            const newSaleRef = push(salesRef);
            await set(newSaleRef, saleData);

            // Update inventory for each item
            for (const item of shoppingCart) {
                const product = branchProducts[item.productId];
                const newStock = product.currentStock - item.quantity;

                const productRef = ref(db, `businesses/${businessId}/inventory/products/${item.productId}`);
                await update(productRef, {
                    currentStock: newStock,
                    lastModifiedBy: userData.displayName,
                    lastModifiedAt: new Date().toISOString()
                });

                // Log inventory change
                const historyRef = ref(db, `businesses/${businessId}/inventory/history`);
                const newHistoryRef = push(historyRef);
                await set(newHistoryRef, {
                    productId: item.productId,
                    productName: item.productName,
                    action: 'sold',
                    changedBy: generateCleanId(currentUser.email),
                    changedByName: userData.displayName,
                    timestamp: new Date().toISOString(),
                    oldValue: `${product.currentStock} ${product.unit}`,
                    newValue: `${newStock} ${product.unit}`,
                    field: 'currentStock',
                    notes: `Sale: Receipt #${receiptNumber} - Quantity: ${item.quantity}`
                });
            }

            showToast(`Sale completed! Receipt #${receiptNumber}`, 'success');

            // Clear cart
            shoppingCart = [];
            updateCart();

            // Close modal
            document.getElementById('paymentModal').classList.remove('active');

            // Reload products and sales
            await loadBranchProducts();
            await loadTodaysSales();

        } catch (error) {
            console.error('Error completing sale:', error);
            showToast('Failed to complete sale', 'error');
        } finally {
            setLoading(completeSaleBtn, false);
        }
    });
}

// Generate receipt number
function generateReceiptNumber() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${dateStr}${timeStr}${random}`;
}

// Validate EAN-13 barcode (13 digits used in South Africa)
function validateEAN13(barcode) {
    // Check if barcode is exactly 13 digits
    if (!/^\d{13}$/.test(barcode)) {
        return false;
    }

    // Calculate checksum using EAN-13 algorithm
    const digits = barcode.split('').map(Number);
    let sum = 0;

    // Sum odd position digits (1st, 3rd, 5th, etc.) and multiply by 1
    // Sum even position digits (2nd, 4th, 6th, etc.) and multiply by 3
    for (let i = 0; i < 12; i++) {
        sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }

    // Calculate check digit
    const checkDigit = (10 - (sum % 10)) % 10;

    // Verify check digit matches the last digit
    return checkDigit === digits[12];
}

// Barcode scanner
const scanBarcodeBtn = document.getElementById('scanBarcodeBtn');
if (scanBarcodeBtn) {
    scanBarcodeBtn.addEventListener('click', () => {
        document.getElementById('scannerModal').classList.add('active');
        initBarcodeScanner();
    });
}

// Initialize barcode scanner with EAN-13 validation
function initBarcodeScanner() {
    if (typeof Quagga === 'undefined') {
        showToast('Barcode scanner not available', 'error');
        return;
    }

    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector('#interactive'),
            constraints: {
                width: { min: 640, ideal: 1280, max: 1920 },
                height: { min: 480, ideal: 720, max: 1080 },
                facingMode: "environment",
                aspectRatio: { min: 1, max: 2 }
            },
            area: { // defines rectangle of the detection/localization area
                top: "0%",    // top offset
                right: "0%",  // right offset
                left: "0%",   // left offset
                bottom: "0%"  // bottom offset
            },
            singleChannel: false
        },
        locator: {
            patchSize: "medium",
            halfSample: true
        },
        numOfWorkers: 4,
        frequency: 10,
        decoder: {
            readers: ["ean_reader", "ean_8_reader"], // Focus on EAN readers for SA barcodes
            debug: {
                drawBoundingBox: true,
                showFrequency: true,
                drawScanline: true,
                showPattern: true
            }
        },
        locate: true
    }, function (err) {
        if (err) {
            console.error('Barcode scanner error:', err);
            showToast('Failed to start camera', 'error');
            return;
        }
        console.log("Barcode scanner initialized successfully");
        Quagga.start();
    });

    Quagga.onDetected(function (result) {
        const code = result.codeResult.code;
        console.log("Barcode detected:", code);

        const scannerResult = document.getElementById('scannerResult');

        // Validate EAN-13 format (South African standard)
        if (!validateEAN13(code)) {
            scannerResult.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="color: var(--accent-color); font-size: 2rem;"></i>
                <p style="margin-top: 0.5rem; color: var(--accent-color);">
                    <strong>Invalid Barcode Format</strong><br>
                    Expected: 13-digit EAN-13 barcode<br>
                    Scanned: ${code} (${code.length} digits)
                </p>
            `;

            // Auto-clear after 3 seconds
            setTimeout(() => {
                scannerResult.innerHTML = '';
            }, 3000);
            return;
        }

        scannerResult.innerHTML = `
            <i class="fas fa-check-circle" style="color: var(--secondary-color); font-size: 2rem;"></i>
            <p style="margin-top: 0.5rem; color: var(--secondary-color);">
                <strong>Valid EAN-13 Barcode</strong><br>
                ${code}
            </p>
        `;

        // Search for product
        const product = Object.entries(branchProducts).find(([_, p]) => p.barcode === code);

        if (product) {
            const [productId, _] = product;

            setTimeout(() => {
                closeBarcodeScanner();
                addToCart(productId);
            }, 1000);
        } else {
            scannerResult.innerHTML = `
                <i class="fas fa-times-circle" style="color: var(--danger-color); font-size: 2rem;"></i>
                <p style="margin-top: 0.5rem; color: var(--danger-color);">
                    <strong>Product Not Found</strong><br>
                    Barcode: ${code}
                </p>
            `;

            // Auto-clear after 3 seconds
            setTimeout(() => {
                scannerResult.innerHTML = '';
            }, 3000);
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

// Expense request
const expenseRequestBtn = document.getElementById('expenseRequestBtn');
const requestExpenseBtn = document.getElementById('requestExpenseBtn');

[expenseRequestBtn, requestExpenseBtn].forEach(btn => {
    if (btn) {
        btn.addEventListener('click', () => {
            document.getElementById('expenseModal').classList.add('active');
        });
    }
});

const expenseRequestForm = document.getElementById('expenseRequestForm');
if (expenseRequestForm) {
    expenseRequestForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const amount = parseFloat(document.getElementById('expenseAmount').value);
        const purpose = document.getElementById('expensePurpose').value;
        const description = document.getElementById('expenseDescription').value.trim();
        const notes = document.getElementById('expenseNotes').value.trim();

        const btn = document.getElementById('submitExpenseBtn');
        setLoading(btn, true);

        try {
            const requestData = {
                amount: amount,
                purpose: purpose,
                description: description,
                notes: notes,
                branchId: userData.branchId,
                branchName: userData.branchName || 'Unknown Branch',
                requestedBy: generateCleanId(currentUser.email),
                requestedByName: userData.displayName,
                requestedAt: new Date().toISOString(),
                status: 'pending'
            };

            const requestsRef = ref(db, `businesses/${businessId}/finances/paymentRequests`);
            const newRequestRef = push(requestsRef);
            await set(newRequestRef, requestData);

            showToast('Expense request submitted successfully', 'success');

            document.getElementById('expenseModal').classList.remove('active');
            expenseRequestForm.reset();

        } catch (error) {
            console.error('Error submitting expense request:', error);
            showToast('Failed to submit request', 'error');
        } finally {
            setLoading(btn, false);
        }
    });
}

// Sales history
const salesHistoryBtn = document.getElementById('salesHistoryBtn');
if (salesHistoryBtn) {
    salesHistoryBtn.addEventListener('click', () => {
        displaySalesHistory();
        document.getElementById('salesHistoryModal').classList.add('active');
    });
}

function displaySalesHistory() {
    const tbody = document.getElementById('salesHistoryBody');
    const currency = businessData?.currency || 'R';

    const sales = todaysSales.sort((a, b) => new Date(b.soldAt) - new Date(a.soldAt));

    if (sales.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-receipt" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No sales history
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = sales.map(sale => {
        const time = new Date(sale.soldAt).toLocaleTimeString('en-ZA', {
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <tr>
                <td>${time}</td>
                <td><strong>#${sale.receiptNumber}</strong></td>
                <td>${sale.items.length}</td>
                <td>${currency} ${sale.total.toFixed(2)}</td>
                <td><span class="badge ${sale.paymentMethod}">${sale.paymentMethod.toUpperCase()}</span></td>
                <td>
                    <button class="icon-btn" onclick="viewSaleDetails('${sale.id}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// View inventory
const viewInventoryBtn = document.getElementById('viewInventoryBtn');
if (viewInventoryBtn) {
    viewInventoryBtn.addEventListener('click', () => {
        displayInventory();
        document.getElementById('inventoryModal').classList.add('active');
    });
}

function displayInventory() {
    const tbody = document.getElementById('inventoryTableBody');
    const currency = businessData?.currency || 'R';

    const products = Object.values(branchProducts);

    if (products.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i class="fas fa-boxes" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    No products available
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = products.map(product => {
        let stockStatus = 'in-stock';
        let stockIcon = 'fa-check-circle';

        if (product.currentStock === 0) {
            stockStatus = 'out-of-stock';
            stockIcon = 'fa-times-circle';
        } else if (product.currentStock <= product.minStock) {
            stockStatus = 'low-stock';
            stockIcon = 'fa-exclamation-triangle';
        }

        return `
            <tr>
                <td><strong>${product.productName}</strong></td>
                <td>${product.sku || 'N/A'}</td>
                <td>${product.currentStock} ${product.unit}</td>
                <td>${currency} ${product.sellPrice.toFixed(2)}</td>
                <td>
                    <span class="stock-status ${stockStatus}">
                        <i class="fas ${stockIcon}"></i>
                        ${stockStatus.replace('-', ' ')}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

// Inventory search
const inventorySearch = document.getElementById('inventorySearch');
if (inventorySearch) {
    inventorySearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const tbody = document.getElementById('inventoryTableBody');
        const rows = tbody.querySelectorAll('tr');

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    });
}

// New sale button
const newSaleBtn = document.getElementById('newSaleBtn');
if (newSaleBtn) {
    newSaleBtn.addEventListener('click', () => {
        if (shoppingCart.length > 0) {
            if (confirm('Clear current cart and start new sale?')) {
                shoppingCart = [];
                updateCart();
            }
        }
        document.getElementById('productSearch').focus();
    });
}

// End shift button
const endShiftBtn = document.getElementById('endShiftBtn');
if (endShiftBtn) {
    endShiftBtn.addEventListener('click', async () => {
        const currency = businessData?.currency || 'R';
        const shiftSales = todaysSales
            .filter(sale => sale.soldBy === generateCleanId(currentUser.email))
            .reduce((sum, sale) => sum + sale.total, 0);

        const shiftTransactions = todaysSales
            .filter(sale => sale.soldBy === generateCleanId(currentUser.email))
            .length;

        const message = `End Shift Summary:\n\nSales: ${currency} ${shiftSales.toFixed(2)}\nTransactions: ${shiftTransactions}\n\nEnd shift and logout?`;

        if (confirm(message)) {
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

// Close modals
document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.closest('.modal').classList.remove('active');
        if (btn.id === 'closeScannerModal') {
            closeBarcodeScanner();
        }
    });
});

const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
if (cancelPaymentBtn) {
    cancelPaymentBtn.addEventListener('click', () => {
        document.getElementById('paymentModal').classList.remove('active');
    });
}

const cancelExpenseBtn = document.getElementById('cancelExpenseBtn');
if (cancelExpenseBtn) {
    cancelExpenseBtn.addEventListener('click', () => {
        document.getElementById('expenseModal').classList.remove('active');
    });
}

const closeScannerModal = document.getElementById('closeScannerModal');
if (closeScannerModal) {
    closeScannerModal.addEventListener('click', closeBarcodeScanner);
}

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

console.log('BongoBoss POS - Employee Dashboard with Product-Specific Tax Rates Initialized ✓');