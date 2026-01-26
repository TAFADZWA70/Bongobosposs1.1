import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDuZ980qpXORaxy_B10LNhUZ2KDfrngrwU",
    authDomain: "bongobosspos.firebaseapp.com",
    projectId: "bongobosspos",
    storageBucket: "bongobosspos.firebasestorage.app",
    messagingSenderId: "773564291065",
    appId: "1:773564291065:web:aba370070c91aaba2e0f28"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let userEmail = '';

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

// Show success section
function showSuccess(email) {
    document.getElementById('resetFormSection').style.display = 'none';
    document.getElementById('successSection').style.display = 'block';
    document.getElementById('sentEmail').textContent = email;
}

// Send password reset email
async function sendResetEmail(email) {
    const resetBtn = document.getElementById('resetBtn');
    const resendBtn = document.getElementById('resendBtn');
    const activeBtn = resetBtn.style.display !== 'none' ? resetBtn : resendBtn;

    setLoading(activeBtn, true);

    try {
        await sendPasswordResetEmail(auth, email);
        console.log('Password reset email sent to:', email);
        userEmail = email;
        showSuccess(email);
    } catch (error) {
        console.error('Password reset error:', error);
        let errorMessage = 'Failed to send reset email. Please try again.';

        switch (error.code) {
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address.';
                break;
            case 'auth/user-not-found':
                errorMessage = 'No account found with this email address.';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Too many attempts. Please try again later.';
                break;
        }

        showError(errorMessage);
    } finally {
        setLoading(activeBtn, false);
    }
}

// Handle form submission
document.getElementById('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    await sendResetEmail(email);
});

// Handle resend button
document.getElementById('resendBtn').addEventListener('click', async () => {
    if (userEmail) {
        await sendResetEmail(userEmail);
        showError('Reset email sent again!');
    }
});