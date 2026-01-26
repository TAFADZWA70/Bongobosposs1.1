import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = '../Authentication Pages/Register.html';
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Failed to logout', 'error');
    }
});

// Tab navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = item.dataset.tab;

        // Update active states
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');
    });
});

// Load user data
async function loadUserData() {
    try {
        // Use email-based ID
        const userId = generateCleanId(currentUser.email);
        const userReference = ref(db, `users/${userId}`);
        const snapshot = await get(userReference);

        if (snapshot.exists()) {
            userData = snapshot.val();

            // Update profile display
            document.getElementById('userName').textContent = userData.displayName || 'User';
            document.getElementById('userEmail').textContent = currentUser.email;
            document.getElementById('userRole').textContent = userData.role?.toUpperCase() || 'OWNER';

            // Update profile image - use base64 from userData if available
            if (userData.profilePhoto) {
                document.getElementById('profileImage').src = userData.profilePhoto;
            } else if (currentUser.photoURL) {
                document.getElementById('profileImage').src = currentUser.photoURL;
            }

            // Fill form fields
            document.getElementById('firstName').value = userData.firstName || '';
            document.getElementById('lastName').value = userData.lastName || '';
            document.getElementById('email').value = currentUser.email;
            document.getElementById('phone').value = userData.phone || '';

            // Load notification settings
            loadNotificationSettings(userData);

            // Load business info
            await loadBusinessInfo(userData.businessId);
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Failed to load user data', 'error');
    }
}

// Load notification settings
function loadNotificationSettings(userData) {
    const notifications = userData.notifications || {};

    document.getElementById('emailDailyReports').checked = notifications.emailDailyReports !== false;
    document.getElementById('emailLowStock').checked = notifications.emailLowStock !== false;
    document.getElementById('emailSalesAlerts').checked = notifications.emailSalesAlerts || false;
    document.getElementById('whatsappReports').checked = notifications.whatsappReports !== false;
    document.getElementById('whatsappAlerts').checked = notifications.whatsappAlerts !== false;
}

// Load business info
async function loadBusinessInfo(businessId) {
    const businessInfoDiv = document.getElementById('businessInfo');

    if (!businessId) {
        businessInfoDiv.innerHTML = '<p>No business information available</p>';
        return;
    }

    try {
        const businessReference = ref(db, `businesses/${businessId}`);
        const snapshot = await get(businessReference);

        if (snapshot.exists()) {
            const business = snapshot.val();

            businessInfoDiv.innerHTML = `
                <div class="form-row">
                    ${business.logo ? `
                        <div class="business-logo">
                            <img src="${business.logo}" alt="Business Logo" style="max-width: 150px; border-radius: 8px;">
                        </div>
                    ` : ''}
                </div>
                
                <div class="review-item">
                    <span class="review-label">Business Name:</span>
                    <span class="review-value">${business.businessName}</span>
                </div>
                <div class="review-item">
                    <span class="review-label">Business Type:</span>
                    <span class="review-value">${business.businessType}</span>
                </div>
                <div class="review-item">
                    <span class="review-label">Phone:</span>
                    <span class="review-value">${business.businessPhone}</span>
                </div>
                <div class="review-item">
                    <span class="review-label">Email:</span>
                    <span class="review-value">${business.businessEmail || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="review-label">Address:</span>
                    <span class="review-value">${business.businessAddress}, ${business.businessCity}, ${business.businessProvince}</span>
                </div>
                <div class="review-item">
                    <span class="review-label">Currency:</span>
                    <span class="review-value">${business.currency}</span>
                </div>
                <div class="review-item">
                    <span class="review-label">Tax Rate:</span>
                    <span class="review-value">${business.taxRate}%</span>
                </div>
                <div class="review-item">
                    <span class="review-label">VAT Registered:</span>
                    <span class="review-value">${business.vatRegistered ? 'Yes' : 'No'}</span>
                </div>
                
                ${userData.role === 'owner' ? `
                    <div style="margin-top: 1.5rem;">
                        <button onclick="editBusinessInfo()" class="btn-primary" style="display: inline-block; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; border: none; cursor: pointer;">
                            <i class="fas fa-edit"></i> Edit Business Info
                        </button>
                    </div>
                ` : ''}
            `;
        }
    } catch (error) {
        console.error('Error loading business info:', error);
        businessInfoDiv.innerHTML = '<p>Failed to load business information</p>';
    }
}

// Edit business info - pass businessId to setup page
window.editBusinessInfo = function () {
    if (userData && userData.businessId) {
        // Redirect to business setup page with edit mode parameter
        window.location.href = `business-setup.html?edit=true&businessId=${userData.businessId}`;
    } else {
        showToast('No business found to edit', 'error');
    }
};

// Profile photo upload (base64 - no storage)
document.querySelector('.profile-photo').addEventListener('click', () => {
    document.getElementById('photoInput').click();
});

document.getElementById('photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Limit to 500KB for profile photos
    if (file.size > 500 * 1024) {
        showToast('Image must be less than 500KB', 'error');
        return;
    }

    try {
        // Convert to base64
        const reader = new FileReader();
        reader.onload = async (event) => {
            const photoBase64 = event.target.result;

            // Update Realtime Database with base64 image
            const userId = generateCleanId(currentUser.email);
            const userReference = ref(db, `users/${userId}`);
            await update(userReference, {
                profilePhoto: photoBase64,
                updatedAt: new Date().toISOString()
            });

            // Update UI
            document.getElementById('profileImage').src = photoBase64;
            showToast('Profile photo updated!', 'success');
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('Photo upload error:', error);
        showToast('Failed to upload photo', 'error');
    }
});

// Toggle password visibility
document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', function () {
        const targetId = this.dataset.target;
        const input = document.getElementById(targetId);
        const icon = this.querySelector('i');

        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });
});

// Password strength checker
document.getElementById('newPassword').addEventListener('input', function () {
    const password = this.value;
    const strengthFill = document.getElementById('passwordStrengthFill');
    const strengthText = document.getElementById('passwordStrengthText');

    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]+/)) strength++;
    if (password.match(/[A-Z]+/)) strength++;
    if (password.match(/[0-9]+/)) strength++;
    if (password.match(/[$@#&!]+/)) strength++;

    let percentage = (strength / 5) * 100;
    let color = '';
    let text = '';

    if (strength <= 2) {
        color = '#ef4444';
        text = 'Weak';
    } else if (strength <= 3) {
        color = '#f59e0b';
        text = 'Fair';
    } else if (strength <= 4) {
        color = '#10b981';
        text = 'Good';
    } else {
        color = '#059669';
        text = 'Strong';
    }

    strengthFill.style.width = percentage + '%';
    strengthFill.style.background = color;
    strengthText.textContent = text;
    strengthText.style.color = color;
});

// Personal Info Form
document.getElementById('personalInfoForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const phone = document.getElementById('phone').value.trim();

    const btn = e.target.querySelector('.btn-primary');
    setLoading(btn, true);

    try {
        const displayName = `${firstName} ${lastName}`;

        // Update Firebase Auth profile
        await updateProfile(currentUser, { displayName });

        // Update Realtime Database using email-based ID
        const userId = generateCleanId(currentUser.email);
        const userReference = ref(db, `users/${userId}`);
        await update(userReference, {
            firstName,
            lastName,
            displayName,
            phone,
            updatedAt: new Date().toISOString()
        });

        // Update UI
        document.getElementById('userName').textContent = displayName;

        showToast('Profile updated successfully!', 'success');
    } catch (error) {
        console.error('Update error:', error);
        showToast('Failed to update profile', 'error');
    } finally {
        setLoading(btn, false);
    }
});

// Password Form
document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;

    if (newPassword !== confirmNewPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }

    if (newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }

    const btn = e.target.querySelector('.btn-primary');
    setLoading(btn, true);

    try {
        // Re-authenticate user
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);

        // Update password
        await updatePassword(currentUser, newPassword);

        // Clear form
        document.getElementById('passwordForm').reset();

        showToast('Password updated successfully!', 'success');
    } catch (error) {
        console.error('Password update error:', error);

        let errorMessage = 'Failed to update password';
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'Current password is incorrect';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'New password is too weak';
        }

        showToast(errorMessage, 'error');
    } finally {
        setLoading(btn, false);
    }
});

// Notifications Form
document.getElementById('notificationsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = e.target.querySelector('.btn-primary');
    setLoading(btn, true);

    try {
        const notifications = {
            emailDailyReports: document.getElementById('emailDailyReports').checked,
            emailLowStock: document.getElementById('emailLowStock').checked,
            emailSalesAlerts: document.getElementById('emailSalesAlerts').checked,
            whatsappReports: document.getElementById('whatsappReports').checked,
            whatsappAlerts: document.getElementById('whatsappAlerts').checked
        };

        // Update using email-based ID
        const userId = generateCleanId(currentUser.email);
        const userReference = ref(db, `users/${userId}`);
        await update(userReference, {
            notifications,
            updatedAt: new Date().toISOString()
        });

        showToast('Notification preferences saved!', 'success');
    } catch (error) {
        console.error('Notification update error:', error);
        showToast('Failed to save preferences', 'error');
    } finally {
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