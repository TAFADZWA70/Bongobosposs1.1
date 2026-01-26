import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, updateProfile } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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
const googleProvider = new GoogleAuthProvider();

// Generate clean ID from email
function generateCleanId(email) {
    // Extract username from email (part before @)
    const username = email.split('@')[0];
    // Remove special characters and convert to lowercase
    const cleanId = username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return cleanId;
}

// Check user status and redirect appropriately
async function handleUserRedirect(user) {
    try {
        const userId = generateCleanId(user.email);
        const userRef = ref(db, `users/${userId}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            // New user - redirect to business setup
            window.location.href = '../Authentication Pages/BusinessSetupWizard.html';
            return;
        }

        const userData = snapshot.val();

        // Check if business setup is complete
        if (!userData.businessSetupComplete) {
            window.location.href = '../Authentication Pages/BusinessSetupWizard.html';
        } else {
            // Redirect based on user role
            if (userData.role === 'owner' || userData.role === 'manager') {
                window.location.href = '../Dashboard/DashboardOwner.html';
            } else {
                window.location.href = '../Dashboard/DashboardEmployee.html';
            }
        }
    } catch (error) {
        console.error('Error checking user status:', error);
        // Default to setup if there's an error
        window.location.href = '../Authentication Pages/BusinessSetupWizard.html';
    }
}

// Toggle password visibility
document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', function () {
        const targetId = this.dataset.target;
        const passwordInput = document.getElementById(targetId);
        const icon = this.querySelector('i');

        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            passwordInput.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });
});

// Password strength checker
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

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Show loading state
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

// Create user document in Realtime Database
async function createUserDocument(user, additionalData = {}) {
    // Use clean email-based ID instead of UID
    const userId = generateCleanId(user.email);
    const userRef = ref(db, `users/${userId}`);

    const userData = {
        userId: userId, // Store the clean ID
        uid: user.uid, // Keep Firebase UID for reference
        email: user.email,
        displayName: user.displayName || additionalData.displayName || '',
        firstName: additionalData.firstName || '',
        lastName: additionalData.lastName || '',
        phone: additionalData.phone || '',
        role: 'owner', // First user is always owner
        businessSetupComplete: false,
        createdAt: new Date().toISOString(),
        isActive: true,
        permissions: {
            canEditProducts: true,
            canDeleteSales: true,
            canViewReports: true,
            canManageStock: true,
            canViewExpenses: true,
            canManageUsers: true
        }
    };

    await set(userRef, userData);
    return userData;
}

// Email/Password Registration
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const terms = document.getElementById('terms').checked;
    const registerBtn = document.getElementById('registerBtn');

    // Validation
    if (!terms) {
        showError('Please accept the Terms of Service and Privacy Policy.');
        return;
    }

    if (password.length < 8) {
        showError('Password must be at least 8 characters long.');
        return;
    }

    if (password !== confirmPassword) {
        showError('Passwords do not match.');
        return;
    }

    setLoading(registerBtn, true);

    try {
        // Create user account
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update user profile
        await updateProfile(user, {
            displayName: `${firstName} ${lastName}`
        });

        // Create user document in Realtime Database
        await createUserDocument(user, {
            firstName,
            lastName,
            displayName: `${firstName} ${lastName}`,
            phone
        });

        console.log('User registered:', user);

        // Redirect to business setup (new user always needs setup)
        window.location.href = '../Authentication Pages/BusinessSetupWizard.html';
    } catch (error) {
        console.error('Registration error:', error);
        let errorMessage = 'Registration failed. Please try again.';

        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'This email is already registered. Please sign in.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address.';
                break;
            case 'auth/weak-password':
                errorMessage = 'Password is too weak. Please use a stronger password.';
                break;
        }

        showError(errorMessage);
        setLoading(registerBtn, false);
    }
});

// Google Sign Up
document.getElementById('googleSignUp').addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // Use clean email-based ID
        const userId = generateCleanId(user.email);
        const userRef = ref(db, `users/${userId}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            // Create user document for new Google user
            const names = user.displayName ? user.displayName.split(' ') : ['', ''];
            await createUserDocument(user, {
                firstName: names[0] || '',
                lastName: names.slice(1).join(' ') || '',
                displayName: user.displayName || ''
            });

            console.log('Google sign up successful - new user:', user);

            // New user - redirect to business setup
            window.location.href = '../Authentication Pages/BusinessSetupWizard.html';
        } else {
            // Existing user - check their setup status
            console.log('Google sign in successful - existing user:', user);
            await handleUserRedirect(user);
        }
    } catch (error) {
        console.error('Google sign up error:', error);
        let errorMessage = 'Google sign up failed. Please try again.';

        switch (error.code) {
            case 'auth/popup-closed-by-user':
                errorMessage = 'Sign up cancelled.';
                break;
            case 'auth/popup-blocked':
                errorMessage = 'Popup blocked. Please allow popups and try again.';
                break;
        }

        showError(errorMessage);
    }
});

// Check if user is already logged in
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // User is already logged in, check their status and redirect appropriately
        await handleUserRedirect(user);
    }
});