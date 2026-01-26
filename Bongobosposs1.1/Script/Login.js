import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
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
const googleProvider = new GoogleAuthProvider();

// Generate clean ID from email
function generateCleanId(email) {
    // Extract username from email (part before @)
    const username = email.split('@')[0];
    // Remove special characters and convert to lowercase
    const cleanId = username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return cleanId;
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

// Check user status and redirect appropriately
async function handleUserRedirect(user) {
    try {
        // Use clean email-based ID
        const userId = generateCleanId(user.email);
        const userRef = ref(db, `users/${userId}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            // User document doesn't exist, create it and redirect to setup
            await createUserDocument(user);
            window.location.href = '../Authentication Pages/BusinessSetupWizard.html';
            return;
        }

        const userData = snapshot.val();

        // Check if user is active
        if (userData.isActive === false) {
            showError('Your account has been deactivated. Please contact your administrator.');
            await auth.signOut();
            return;
        }

        // Update last login time
        await update(userRef, {
            lastLogin: new Date().toISOString()
        });

        // Check if business setup is complete
        if (!userData.businessSetupComplete) {
            window.location.href = '../Authentication Pages/BusinessSetupWizard.html';
        } else {
            // Redirect based on user role
            switch (userData.role) {
                case 'admin':
                    // Admin role - full system access
                    window.location.href = '../Dashboard/DashboardAdmin.html';
                    break;

                case 'partner':
                    // Business partner - owner-level access
                    window.location.href = '../Dashboard/DashboardOwner.html';
                    break;

                case 'owner':
                    // Original business owner - full access
                    window.location.href = '../Dashboard/DashboardOwner.html';
                    break;

                case 'employee':
                    // Employee - limited access
                    window.location.href = '../Dashboard/DashboardEmployee.html';
                    break;

                case 'manager':
                    // Branch/Store manager - admin-level access
                    window.location.href = '../Dashboard/DashboardAdmin.html';
                    break;

                default:
                    // Fallback for unknown roles
                    console.warn('Unknown user role:', userData.role);
                    window.location.href = '../Dashboard/DashboardEmployee.html';
            }
        }
    } catch (error) {
        console.error('Error handling user redirect:', error);
        showError('Failed to load user data. Please try again.');
    }
}

// Create user document if it doesn't exist (for Google sign-in)
async function createUserDocument(user) {
    const userId = generateCleanId(user.email);
    const userRef = ref(db, `users/${userId}`);

    const names = user.displayName ? user.displayName.split(' ') : ['', ''];
    const userData = {
        userId: userId, // Store the clean ID
        uid: user.uid, // Keep Firebase UID for reference
        email: user.email,
        displayName: user.displayName || '',
        firstName: names[0] || '',
        lastName: names.slice(1).join(' ') || '',
        phone: '',
        role: 'owner',
        businessSetupComplete: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
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

    await update(userRef, userData);
}

// Email/Password Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    const loginBtn = document.getElementById('loginBtn');

    // Validation
    if (!email || !password) {
        showError('Please enter both email and password.');
        return;
    }

    setLoading(loginBtn, true);

    try {
        // Set persistence based on "Remember Me" checkbox
        const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
        await setPersistence(auth, persistence);

        // Sign in user
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        console.log('User signed in:', user);

        // Handle redirect based on user status
        await handleUserRedirect(user);

    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Login failed. Please try again.';

        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'No account found with this email. Please sign up.';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Incorrect password. Please try again.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address.';
                break;
            case 'auth/user-disabled':
                errorMessage = 'This account has been disabled. Please contact support.';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Too many failed login attempts. Please try again later.';
                break;
            case 'auth/invalid-credential':
                errorMessage = 'Invalid email or password. Please check your credentials.';
                break;
        }

        showError(errorMessage);
        setLoading(loginBtn, false);
    }
});

// Google Sign In
document.getElementById('googleSignIn').addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        console.log('Google sign in successful:', user);

        // Handle redirect based on user status
        await handleUserRedirect(user);

    } catch (error) {
        console.error('Google sign in error:', error);
        let errorMessage = 'Google sign in failed. Please try again.';

        switch (error.code) {
            case 'auth/popup-closed-by-user':
                errorMessage = 'Sign in cancelled.';
                break;
            case 'auth/popup-blocked':
                errorMessage = 'Popup blocked. Please allow popups and try again.';
                break;
            case 'auth/account-exists-with-different-credential':
                errorMessage = 'An account already exists with this email using a different sign-in method.';
                break;
        }

        showError(errorMessage);
    }
});

// Check if user is already logged in
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // User is already logged in, redirect appropriately
        await handleUserRedirect(user);
    }
});