import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, set, update, get, remove } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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
 * IMPORTANT NOTE ABOUT USER CREATION:
 * When creating a new user with Firebase Authentication's createUserWithEmailAndPassword(),
 * Firebase automatically signs in as the newly created user, which logs out the current admin.
 * 
 * This is the expected Firebase behavior. After creating a user, we:
 * 1. Save the new user's data to the database
 * 2. Sign out (which logs out the new user)
 * 3. Redirect the admin back to login
 * 4. Admin must sign in again to continue
 * 
 * For production apps, consider using Firebase Admin SDK on the backend to create users
 * without affecting the current session.
 * 
 * DATABASE STRUCTURE:
 * Users are stored in multiple locations for better data organization:
 * 
 * 1. Main user record: /users/{userId}
 *    - Contains complete user information
 *    - Used for authentication and global user data
 * 
 * 2. Branch employees: /businesses/{businessId}/branches/{branchId}/employees/{userId}
 *    - Stores employees and admins assigned to specific branches
 *    - Makes it easy to query all employees at a branch
 *    - Enables branch-level user management
 * 
 * 3. Business owners: /businesses/{businessId}/owners/{userId}
 *    - Stores business partners/co-owners
 *    - Separate from employees for access control
 *    - Enables easy owner management
 * 
 * This structure allows:
 * - Quick branch-level queries (get all employees at Branch A)
 * - Easy user management per branch
 * - Proper role separation (owners vs employees)
 * - Scalable architecture for multiple branches
 */

let currentUser = null;
let userData = null;
let businessId = null;
let allUsers = {};
let allBranches = {};
let isEditMode = false;
let editingUserId = null;

// Generate clean ID from email
function generateCleanId(email) {
    const username = email.split('@')[0];
    const cleanId = username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return cleanId;
}

// Check authentication
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../Authentication Pages/Register.html';
    } else {
        currentUser = user;
        await loadUserData();
        await loadBranches();
        await loadUsers();
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
                await loadBusinessInfo();
            }
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

            document.getElementById('businessName').textContent = business.businessName || 'Business Name';
            document.getElementById('businessType').textContent = business.businessType || 'Business Type';

            if (business.logo) {
                const logoContainer = document.getElementById('businessLogoContainer');
                logoContainer.innerHTML = `<img src="${business.logo}" alt="Business Logo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }
        }
    } catch (error) {
        console.error('Error loading business info:', error);
    }
}

// Load branches for dropdown
async function loadBranches() {
    try {
        const branchesRef = ref(db, `businesses/${businessId}/branches`);
        const snapshot = await get(branchesRef);

        const branchSelect = document.getElementById('userBranch');
        const branchFilter = document.getElementById('branchFilter');

        if (snapshot.exists()) {
            allBranches = snapshot.val();

            branchSelect.innerHTML = '<option value="">Select branch...</option>';
            branchFilter.innerHTML = '<option value="all">All Branches</option>';

            Object.entries(allBranches).forEach(([branchId, branch]) => {
                const option = new Option(branch.branchName, branchId);
                branchSelect.appendChild(option);

                const filterOption = new Option(branch.branchName, branchId);
                branchFilter.appendChild(filterOption);
            });
        }
    } catch (error) {
        console.error('Error loading branches:', error);
    }
}

// Load all users
async function loadUsers() {
    try {
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);

        const usersContainer = document.querySelector('.users-container');
        const loadingState = document.getElementById('usersLoading');

        if (snapshot.exists()) {
            const allUsersData = snapshot.val();

            // Filter users by businessId
            allUsers = {};
            Object.entries(allUsersData).forEach(([userId, user]) => {
                if (user.businessId === businessId) {
                    allUsers[userId] = user;
                }
            });

            // Update stats
            updateUserStats();

            // Display users
            loadingState.style.display = 'none';
            displayUsers();
        } else {
            loadingState.style.display = 'none';
            usersContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users-slash" style="font-size: 4rem; color: #cbd5e1;"></i>
                    <h3>No Users Yet</h3>
                    <p>Add your first team member to get started</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showToast('Failed to load users', 'error');
    }
}

// Update user stats
function updateUserStats() {
    const userArray = Object.values(allUsers);

    const totalUsers = userArray.length;
    const admins = userArray.filter(u => u.role === 'admin').length;
    const partners = userArray.filter(u => u.role === 'partner').length;
    const employees = userArray.filter(u => u.role === 'employee').length;

    document.getElementById('totalUsers').textContent = totalUsers;
    document.getElementById('totalAdmins').textContent = admins;
    document.getElementById('totalPartners').textContent = partners;
    document.getElementById('totalEmployees').textContent = employees;
}

// Display users
function displayUsers() {
    const usersContainer = document.querySelector('.users-container');
    const roleFilter = document.getElementById('roleFilter').value;
    const branchFilter = document.getElementById('branchFilter').value;

    let filteredUsers = Object.entries(allUsers);

    // Apply filters
    if (roleFilter !== 'all') {
        filteredUsers = filteredUsers.filter(([_, user]) => user.role === roleFilter);
    }

    if (branchFilter !== 'all') {
        filteredUsers = filteredUsers.filter(([_, user]) => user.branchId === branchFilter);
    }

    if (filteredUsers.length === 0) {
        usersContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-filter" style="font-size: 4rem; color: #cbd5e1;"></i>
                <h3>No Users Match Filter</h3>
                <p>Try adjusting your filter criteria</p>
            </div>
        `;
        return;
    }

    usersContainer.innerHTML = filteredUsers.map(([userId, user]) => createUserCard(userId, user)).join('');
}

// Create user card
function createUserCard(userId, user) {
    const roleColors = {
        admin: { bg: '#ef4444', icon: 'fa-user-shield' },
        partner: { bg: '#f59e0b', icon: 'fa-handshake' },
        employee: { bg: '#3b82f6', icon: 'fa-user-tie' }
    };

    const roleInfo = roleColors[user.role] || roleColors.employee;
    const branchName = user.branchId && allBranches[user.branchId] ? allBranches[user.branchId].branchName : 'No branch';

    return `
        <div class="user-card">
            <div class="user-card-header">
                <div class="user-avatar">
                    ${user.profilePhoto ?
            `<img src="${user.profilePhoto}" alt="${user.displayName}">` :
            `<i class="fas fa-user"></i>`
        }
                </div>
                <div class="user-info">
                    <h3>${user.displayName || 'No Name'}</h3>
                    <p class="user-email">${user.email}</p>
                    <p class="user-phone"><i class="fas fa-phone"></i> ${user.phone || 'No phone'}</p>
                </div>
                <div class="user-role-badge" style="background: ${roleInfo.bg}">
                    <i class="fas ${roleInfo.icon}"></i>
                    <span>${user.role.toUpperCase()}</span>
                </div>
            </div>
            
            <div class="user-card-body">
                <div class="user-detail">
                    <i class="fas fa-briefcase"></i>
                    <span>${user.jobTitle || user.partnerTitle || 'No title'}</span>
                </div>
                <div class="user-detail">
                    <i class="fas fa-code-branch"></i>
                    <span>${branchName}</span>
                </div>
                <div class="user-detail">
                    <i class="fas fa-calendar"></i>
                    <span>Added ${new Date(user.createdAt).toLocaleDateString()}</span>
                </div>
            </div>

            <div class="user-card-footer">
                <button class="btn-edit" onclick="editUser('${userId}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn-toggle" onclick="toggleUserStatus('${userId}', ${!user.isActive})">
                    <i class="fas fa-${user.isActive ? 'pause' : 'play'}"></i>
                    ${user.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button class="btn-delete" onclick="deleteUser('${userId}', '${user.displayName}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `;
}

// Show user modal
window.showUserModal = function () {
    document.getElementById('userModal').style.display = 'flex';
    document.getElementById('modalTitle').textContent = 'Add New User';
    document.getElementById('saveUserBtn').querySelector('.btn-text').innerHTML = '<i class="fas fa-save"></i> Create User';
    isEditMode = false;
    editingUserId = null;
    document.getElementById('userForm').reset();
};

// Edit user
window.editUser = function (userId) {
    // Implementation for editing - would need to handle re-authentication
    showToast('Edit functionality requires additional authentication handling', 'error');
};

// Toggle user status
window.toggleUserStatus = async function (userId, newStatus) {
    try {
        const user = allUsers[userId];

        // Update main user record
        const userRef = ref(db, `users/${userId}`);
        await update(userRef, {
            isActive: newStatus,
            updatedAt: new Date().toISOString()
        });

        // Update branch employee record if applicable
        if (user.branchId && (user.role === 'employee' || user.role === 'admin')) {
            const branchUserRef = ref(db, `businesses/${businessId}/branches/${user.branchId}/employees/${userId}`);
            await update(branchUserRef, {
                isActive: newStatus,
                updatedAt: new Date().toISOString()
            });
        }

        showToast(`User ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
        await loadUsers();
    } catch (error) {
        console.error('Error toggling user status:', error);
        showToast('Failed to update user status', 'error');
    }
};

// Delete user
window.deleteUser = async function (userId, userName) {
    if (!confirm(`Are you sure you want to delete ${userName}? This action cannot be undone.`)) {
        return;
    }

    try {
        const user = allUsers[userId];

        // Remove from main users collection
        const userRef = ref(db, `users/${userId}`);
        await remove(userRef);

        // Remove from branch employees if applicable
        if (user.branchId && (user.role === 'employee' || user.role === 'admin')) {
            const branchUserRef = ref(db, `businesses/${businessId}/branches/${user.branchId}/employees/${userId}`);
            await remove(branchUserRef);
        }

        // Remove from business owners if partner
        if (user.role === 'partner') {
            const ownerRef = ref(db, `businesses/${businessId}/owners/${userId}`);
            await remove(ownerRef);
        }

        showToast('User deleted successfully', 'success');
        await loadUsers();
    } catch (error) {
        console.error('Error deleting user:', error);
        showToast('Failed to delete user', 'error');
    }
};

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

document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('active');
});

document.getElementById('addUserBtn').addEventListener('click', showUserModal);

document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('userModal').style.display = 'none';
});

document.getElementById('cancelUserForm').addEventListener('click', () => {
    document.getElementById('userModal').style.display = 'none';
});

// Filter listeners
document.getElementById('roleFilter').addEventListener('change', displayUsers);
document.getElementById('branchFilter').addEventListener('change', displayUsers);

// Password toggle
document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', function () {
        const targetId = this.dataset.target;
        const input = document.getElementById(targetId);
        const icon = this.querySelector('i');

        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });
});

// Password strength
document.getElementById('password').addEventListener('input', function () {
    const password = this.value;
    const strengthFill = document.getElementById('strengthFill');
    const strengthText = document.getElementById('strengthText');

    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]+/)) strength++;
    if (password.match(/[A-Z]+/)) strength++;
    if (password.match(/[0-9]+/)) strength++;
    if (password.match(/[$@#&!]+/)) strength++;

    const percentage = (strength / 5) * 100;
    let color = '#ef4444';
    let text = 'Weak';

    if (strength > 2 && strength <= 3) {
        color = '#f59e0b';
        text = 'Fair';
    } else if (strength > 3 && strength <= 4) {
        color = '#10b981';
        text = 'Good';
    } else if (strength > 4) {
        color = '#059669';
        text = 'Strong';
    }

    strengthFill.style.width = percentage + '%';
    strengthFill.style.background = color;
    strengthText.textContent = text;
    strengthText.style.color = color;
});

// Form submission
document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const userRole = document.getElementById('userRole').value;
    const jobTitle = document.getElementById('jobTitle').value.trim();
    const userBranch = document.getElementById('userBranch').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validation
    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }

    if (!userBranch) {
        showToast('Please select a branch', 'error');
        return;
    }

    const btn = document.getElementById('saveUserBtn');
    setLoading(btn, true);

    try {
        // Create user account
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = userCredential.user;

        const displayName = `${firstName} ${lastName}`;
        await updateProfile(newUser, { displayName });

        // Create user document
        const newUserId = generateCleanId(email);
        const newUserRef = ref(db, `users/${newUserId}`);

        const newUserData = {
            userId: newUserId,
            uid: newUser.uid,
            email: email,
            displayName: displayName,
            firstName: firstName,
            lastName: lastName,
            phone: phone,
            role: userRole,
            jobTitle: jobTitle,
            businessId: businessId,
            businessName: userData.businessName,
            branchId: userBranch,
            branchName: allBranches[userBranch].branchName,
            businessSetupComplete: true,
            createdAt: new Date().toISOString(),
            createdBy: userData.displayName,
            isActive: true
        };

        await set(newUserRef, newUserData);

        // Also save user reference under their branch for better organization
        if (userRole === 'employee' || userRole === 'admin') {
            const branchUserRef = ref(db, `businesses/${businessId}/branches/${userBranch}/employees/${newUserId}`);
            await set(branchUserRef, {
                userId: newUserId,
                email: email,
                displayName: displayName,
                role: userRole,
                jobTitle: jobTitle,
                phone: phone,
                isActive: true,
                addedAt: new Date().toISOString()
            });
        }

        // For partners, add to business owners list
        if (userRole === 'partner') {
            const businessOwnersRef = ref(db, `businesses/${businessId}/owners/${newUserId}`);
            await set(businessOwnersRef, {
                userId: newUserId,
                email: email,
                displayName: displayName,
                partnerTitle: jobTitle,
                phone: phone,
                addedAt: new Date().toISOString(),
                addedBy: userData.displayName
            });
        }

        // Sign out the newly created user
        await signOut(auth);

        // Show success message
        showToast('User created successfully! Please sign in again to continue.', 'success');

        // Close modal
        document.getElementById('userModal').style.display = 'none';

        // Redirect to login after 2 seconds
        setTimeout(() => {
            window.location.href = '../Authentication Pages/Register.html';
        }, 2000);

    } catch (error) {
        console.error('Error creating user:', error);

        let errorMessage = 'Failed to create user';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email already in use';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak';
        }

        showToast(errorMessage, 'error');
        setLoading(btn, false);
    }
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