import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, set, update, get, push, remove } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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

let currentUser = null;
let userData = null;
let businessId = null;
let currentStep = 1;
let branchData = {};
let isEditMode = false;
let editingBranchId = null;
let allBranches = {};

// Generate clean ID from email
function generateCleanId(email) {
    const username = email.split('@')[0];
    const cleanId = username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return cleanId;
}

// Generate branch ID from branch code and business ID
function generateBranchId(branchCode, businessId) {
    const cleanCode = branchCode.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const timestamp = Date.now();
    return `${businessId}_${cleanCode}_${timestamp}`;
}

// Check authentication and load data
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../Authentication Pages/Register.html';
    } else {
        currentUser = user;
        await loadUserData();
        await loadBranches();
    }
});

// Load user data
async function loadUserData() {
    try {
        const userId = generateCleanId(currentUser.email);
        const userReference = ref(db, `users/${userId}`);
        const snapshot = await get(userReference);

        if (snapshot.exists()) {
            userData = snapshot.val();
            businessId = userData.businessId;

            if (!businessId) {
                showToast('No business found. Please complete business setup first.', 'error');
                setTimeout(() => {
                    window.location.href = '../Business Setup/business-setup.html';
                }, 2000);
            } else {
                // Load business info for sidebar
                await loadBusinessInfo();
            }
        } else {
            showToast('User data not found', 'error');
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Failed to load user data', 'error');
    }
}

// Load business info for sidebar
async function loadBusinessInfo() {
    try {
        const businessRef = ref(db, `businesses/${businessId}`);
        const snapshot = await get(businessRef);

        if (snapshot.exists()) {
            const business = snapshot.val();

            // Update business info in sidebar
            document.getElementById('businessName').textContent = business.businessName || 'Business Name';
            document.getElementById('businessType').textContent = business.businessType || 'Business Type';

            // Update business logo if available
            if (business.logo) {
                const logoContainer = document.getElementById('businessLogoContainer');
                logoContainer.innerHTML = `<img src="${business.logo}" alt="Business Logo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }
        }
    } catch (error) {
        console.error('Error loading business info:', error);
    }
}

// Load all branches
async function loadBranches() {
    if (!businessId) {
        console.log('No businessId available');
        return;
    }

    console.log('Loading branches for businessId:', businessId);

    try {
        const branchesRef = ref(db, `businesses/${businessId}/branches`);
        const snapshot = await get(branchesRef);

        const branchesContainer = document.getElementById('branchesContainer');
        const loadingState = document.getElementById('branchesLoading');

        console.log('Branches snapshot exists:', snapshot.exists());

        if (snapshot.exists()) {
            allBranches = snapshot.val();
            const branchArray = Object.entries(allBranches);

            console.log('Total branches found:', branchArray.length);
            console.log('Branches data:', allBranches);

            // Update stats
            const totalBranches = branchArray.length;
            const activeBranches = branchArray.filter(([_, branch]) => branch.isActive).length;

            document.getElementById('totalBranches').textContent = totalBranches;
            document.getElementById('activeBranches').textContent = activeBranches;

            // Display branches
            loadingState.style.display = 'none';
            branchesContainer.innerHTML = '';

            branchArray.forEach(([branchId, branch]) => {
                console.log('Creating card for branch:', branchId, branch);
                const branchCard = createBranchCard(branchId, branch);
                branchesContainer.appendChild(branchCard);
            });

            console.log('Branches loaded successfully');
        } else {
            // No branches yet
            console.log('No branches found in database');
            loadingState.style.display = 'none';
            branchesContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-store-slash" style="font-size: 4rem; color: #cbd5e1; margin-bottom: 1rem;"></i>
                    <h3>No Branches Yet</h3>
                    <p>Get started by adding your first business branch</p>
                    <button class="btn-primary" onclick="showBranchForm()">
                        <i class="fas fa-plus"></i> Add Your First Branch
                    </button>
                </div>
            `;

            document.getElementById('totalBranches').textContent = '0';
            document.getElementById('activeBranches').textContent = '0';
        }
    } catch (error) {
        console.error('Error loading branches:', error);
        showToast('Failed to load branches', 'error');

        const loadingState = document.getElementById('branchesLoading');
        loadingState.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #ef4444;"></i>
            <p style="color: #ef4444;">Failed to load branches. Please refresh the page.</p>
        `;
    }
}

// Create branch card element
function createBranchCard(branchId, branch) {
    const card = document.createElement('div');
    card.className = 'branch-card';

    const statusClass = branch.isActive ? 'status-active' : 'status-inactive';
    const statusText = branch.isActive ? 'Active' : 'Inactive';
    const statusIcon = branch.isActive ? 'fa-check-circle' : 'fa-times-circle';

    card.innerHTML = `
        <div class="branch-card-header">
            <div class="branch-title">
                <h3>${branch.branchName}</h3>
                <span class="branch-code">${branch.branchCode}</span>
            </div>
            <span class="branch-status ${statusClass}">
                <i class="fas ${statusIcon}"></i> ${statusText}
            </span>
        </div>
        <div class="branch-card-body">
            <div class="branch-info-row">
                <i class="fas fa-tag"></i>
                <span>${branch.branchType || 'N/A'}</span>
            </div>
            <div class="branch-info-row">
                <i class="fas fa-user-tie"></i>
                <span>${branch.branchManager || 'No manager assigned'}</span>
            </div>
            <div class="branch-info-row">
                <i class="fas fa-phone"></i>
                <span>${branch.branchPhone}</span>
            </div>
            <div class="branch-info-row">
                <i class="fas fa-map-marker-alt"></i>
                <span>${branch.branchCity}, ${branch.branchProvince}</span>
            </div>
        </div>
        <div class="branch-card-footer">
            <button class="btn-edit" onclick="editBranch('${branchId}')">
                <i class="fas fa-edit"></i> Edit
            </button>
            <button class="btn-toggle" onclick="toggleBranchStatus('${branchId}', ${!branch.isActive})">
                <i class="fas fa-${branch.isActive ? 'pause' : 'play'}"></i> 
                ${branch.isActive ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn-delete" onclick="deleteBranch('${branchId}', '${branch.branchName}')">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
    `;

    return card;
}

// Show branch form
window.showBranchForm = function () {
    document.getElementById('branchListView').style.display = 'none';
    document.getElementById('branchFormView').style.display = 'block';
    isEditMode = false;
    editingBranchId = null;
    resetBranchForm();
    goToBranchStep(1);
};

// Edit branch
window.editBranch = async function (branchId) {
    isEditMode = true;
    editingBranchId = branchId;

    try {
        const branchRef = ref(db, `businesses/${businessId}/branches/${branchId}`);
        const snapshot = await get(branchRef);

        if (snapshot.exists()) {
            const branch = snapshot.val();

            // Populate form fields
            document.getElementById('branchName').value = branch.branchName || '';
            document.getElementById('branchCode').value = branch.branchCode || '';
            document.getElementById('branchType').value = branch.branchType || '';
            document.getElementById('branchManager').value = branch.branchManager || '';
            document.getElementById('branchPhone').value = branch.branchPhone || '';
            document.getElementById('branchEmail').value = branch.branchEmail || '';
            document.getElementById('branchAddress').value = branch.branchAddress || '';
            document.getElementById('branchCity').value = branch.branchCity || '';
            document.getElementById('branchProvince').value = branch.branchProvince || '';
            document.getElementById('branchPostalCode').value = branch.branchPostalCode || '';
            document.getElementById('branchIsActive').checked = branch.isActive !== false;
            document.getElementById('branchNotes').value = branch.branchNotes || '';

            // Store in branchData
            branchData = { ...branch };

            // Show form
            document.getElementById('branchListView').style.display = 'none';
            document.getElementById('branchFormView').style.display = 'block';
            goToBranchStep(1);
        }
    } catch (error) {
        console.error('Error loading branch:', error);
        showToast('Failed to load branch data', 'error');
    }
};

// Toggle branch status
window.toggleBranchStatus = async function (branchId, newStatus) {
    try {
        const branchRef = ref(db, `businesses/${businessId}/branches/${branchId}`);
        await update(branchRef, {
            isActive: newStatus,
            updatedAt: new Date().toISOString()
        });

        showToast(`Branch ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
        await loadBranches();
    } catch (error) {
        console.error('Error toggling branch status:', error);
        showToast('Failed to update branch status', 'error');
    }
};

// Delete branch
window.deleteBranch = async function (branchId, branchName) {
    if (!confirm(`Are you sure you want to delete "${branchName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const branchRef = ref(db, `businesses/${businessId}/branches/${branchId}`);
        await remove(branchRef);

        showToast('Branch deleted successfully', 'success');
        await loadBranches();
    } catch (error) {
        console.error('Error deleting branch:', error);
        showToast('Failed to delete branch', 'error');
    }
};

// Reset form
function resetBranchForm() {
    document.getElementById('branchName').value = '';
    document.getElementById('branchCode').value = '';
    document.getElementById('branchType').value = '';
    document.getElementById('branchManager').value = '';
    document.getElementById('branchPhone').value = '';
    document.getElementById('branchEmail').value = '';
    document.getElementById('branchAddress').value = '';
    document.getElementById('branchCity').value = '';
    document.getElementById('branchProvince').value = '';
    document.getElementById('branchPostalCode').value = '';
    document.getElementById('branchIsActive').checked = true;
    document.getElementById('branchNotes').value = '';
    branchData = {};
}

// Navigation functions
window.goToBranchStep = function (step) {
    // Hide all steps
    document.querySelectorAll('.setup-step').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.progress-step').forEach(s => s.classList.remove('active', 'completed'));

    // Show target step
    document.getElementById(`branchStep${step}`).classList.add('active');

    // Update progress
    for (let i = 1; i <= 3; i++) {
        const progressStep = document.querySelector(`.progress-step[data-step="${i}"]`);
        if (i < step) {
            progressStep.classList.add('completed');
        } else if (i === step) {
            progressStep.classList.add('active');
        }
    }

    currentStep = step;

    // Update review if going to step 3
    if (step === 3) {
        updateBranchReview();
    }
};

// Step 1 - Next
document.getElementById('branchStep1Next').addEventListener('click', () => {
    const branchName = document.getElementById('branchName').value.trim();
    const branchCode = document.getElementById('branchCode').value.trim().toUpperCase();
    const branchType = document.getElementById('branchType').value;
    const branchPhone = document.getElementById('branchPhone').value.trim();

    if (!branchName || !branchCode || !branchType || !branchPhone) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    // Check if branch code is unique (only for new branches)
    if (!isEditMode) {
        const existingCodes = Object.values(allBranches).map(b => b.branchCode);
        if (existingCodes.includes(branchCode)) {
            showToast('Branch code already exists. Please use a unique code.', 'error');
            return;
        }
    }

    branchData.branchName = branchName;
    branchData.branchCode = branchCode;
    branchData.branchType = branchType;
    branchData.branchManager = document.getElementById('branchManager').value.trim();
    branchData.branchPhone = branchPhone;
    branchData.branchEmail = document.getElementById('branchEmail').value.trim();

    goToBranchStep(2);
});

// Step 2 - Navigation
document.getElementById('branchStep2Prev').addEventListener('click', () => goToBranchStep(1));
document.getElementById('branchStep2Next').addEventListener('click', () => {
    const branchAddress = document.getElementById('branchAddress').value.trim();
    const branchCity = document.getElementById('branchCity').value.trim();
    const branchProvince = document.getElementById('branchProvince').value;
    const branchPostalCode = document.getElementById('branchPostalCode').value.trim();

    if (!branchAddress || !branchCity || !branchProvince || !branchPostalCode) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    branchData.branchAddress = branchAddress;
    branchData.branchCity = branchCity;
    branchData.branchProvince = branchProvince;
    branchData.branchPostalCode = branchPostalCode;
    branchData.isActive = document.getElementById('branchIsActive').checked;
    branchData.branchNotes = document.getElementById('branchNotes').value.trim();

    goToBranchStep(3);
});

// Step 3 - Navigation
document.getElementById('branchStep3Prev').addEventListener('click', () => goToBranchStep(2));

// Update review section
function updateBranchReview() {
    document.getElementById('reviewBranchName').textContent = branchData.branchName;
    document.getElementById('reviewBranchCode').textContent = branchData.branchCode;
    document.getElementById('reviewBranchType').textContent = branchData.branchType;
    document.getElementById('reviewBranchManager').textContent = branchData.branchManager || 'Not assigned';
    document.getElementById('reviewBranchPhone').textContent = branchData.branchPhone;
    document.getElementById('reviewBranchEmail').textContent = branchData.branchEmail || 'Not provided';
    document.getElementById('reviewBranchAddress').textContent =
        `${branchData.branchAddress}, ${branchData.branchCity}, ${branchData.branchProvince} ${branchData.branchPostalCode}`;
    document.getElementById('reviewBranchStatus').textContent = branchData.isActive ? 'Active' : 'Inactive';
}

// Save branch
document.getElementById('saveBranch').addEventListener('click', async () => {
    const btn = document.getElementById('saveBranch');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-block';
    btn.disabled = true;

    try {
        let branchId;

        if (isEditMode && editingBranchId) {
            // Update existing branch
            branchId = editingBranchId;
            const branchRef = ref(db, `businesses/${businessId}/branches/${branchId}`);
            await update(branchRef, {
                ...branchData,
                updatedAt: new Date().toISOString()
            });
            showToast('Branch updated successfully!', 'success');
        } else {
            // Create new branch
            branchId = generateBranchId(branchData.branchCode, businessId);
            const branchRef = ref(db, `businesses/${businessId}/branches/${branchId}`);
            await set(branchRef, {
                ...branchData,
                branchId,
                businessId,
                createdAt: new Date().toISOString(),
                createdBy: currentUser.uid
            });
            showToast('Branch created successfully!', 'success');
        }

        // Return to list view
        setTimeout(() => {
            showBranchList();
        }, 1500);
    } catch (error) {
        console.error('Error saving branch:', error);
        showToast('Failed to save branch', 'error');

        btnText.style.display = 'inline-block';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    }
});

// Show branch list
function showBranchList() {
    document.getElementById('branchFormView').style.display = 'none';
    document.getElementById('branchListView').style.display = 'block';
    loadBranches();
}

// Event Listeners
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = '../Index.html';
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Failed to logout', 'error');
    }
});

document.getElementById('addBranchBtn').addEventListener('click', showBranchForm);

document.getElementById('backToDashboard').addEventListener('click', () => {
    window.location.href = '../Dashboard/DashboardOwner.html';
});

document.getElementById('cancelBranchForm').addEventListener('click', () => {
    if (confirm('Are you sure? Any unsaved changes will be lost.')) {
        showBranchList();
    }
});

// Sidebar toggle for mobile
document.getElementById('menuToggle').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
});

// Update user profile image if available
if (currentUser && currentUser.photoURL) {
    document.getElementById('userProfile').innerHTML = `<img src="${currentUser.photoURL}" alt="User" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">`;
}

// Helper functions
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