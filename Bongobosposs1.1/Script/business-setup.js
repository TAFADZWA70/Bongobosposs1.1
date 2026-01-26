import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, set, update, get } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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

let currentStep = 1;
let businessData = {};
let logoBase64 = '';
let currentUserEmail = '';
let isEditMode = false;
let existingBusinessId = null;

// Check if we're in edit mode
const urlParams = new URLSearchParams(window.location.search);
isEditMode = urlParams.get('edit') === 'true';
existingBusinessId = urlParams.get('businessId');

// Generate clean ID from email
function generateCleanId(email) {
    const username = email.split('@')[0];
    const cleanId = username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return cleanId;
}

// Generate business ID from business name and email
function generateBusinessId(businessName, email) {
    // Clean business name: remove special chars, spaces to underscores, lowercase
    const cleanBusinessName = businessName
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase();

    // Get email username
    const emailUsername = email.split('@')[0].toLowerCase();

    // Combine: businessname_emailusername
    const businessId = `${cleanBusinessName}_${emailUsername}`;

    return businessId;
}

// Check authentication
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../Authentication Pages/Register.html';
    } else {
        currentUserEmail = user.email;

        // Load existing business data if in edit mode
        if (isEditMode && existingBusinessId) {
            await loadExistingBusinessData();
        }
    }
});

// Load existing business data for editing
async function loadExistingBusinessData() {
    try {
        const businessReference = ref(db, `businesses/${existingBusinessId}`);
        const snapshot = await get(businessReference);

        if (snapshot.exists()) {
            const business = snapshot.val();

            // Populate form fields
            document.getElementById('businessName').value = business.businessName || '';
            document.getElementById('businessType').value = business.businessType || '';
            document.getElementById('businessPhone').value = business.businessPhone || '';
            document.getElementById('businessEmail').value = business.businessEmail || '';
            document.getElementById('businessAddress').value = business.businessAddress || '';
            document.getElementById('businessCity').value = business.businessCity || '';
            document.getElementById('businessProvince').value = business.businessProvince || '';
            document.getElementById('currency').value = business.currency || '';
            document.getElementById('taxRate').value = business.taxRate || '';
            document.getElementById('financialYearEnd').value = business.financialYearEnd || '';
            document.getElementById('vatRegistered').checked = business.vatRegistered || false;
            document.getElementById('vatNumber').value = business.vatNumber || '';

            // Handle VAT number visibility
            const vatNumberGroup = document.getElementById('vatNumberGroup');
            vatNumberGroup.style.display = business.vatRegistered ? 'block' : 'none';

            // Load logo if exists
            if (business.logo) {
                logoBase64 = business.logo;
                logoImage.src = business.logo;
                logoUploadArea.querySelector('.upload-placeholder').style.display = 'none';
                logoPreview.style.display = 'block';
            }

            // Store in businessData
            businessData = {
                businessName: business.businessName,
                businessType: business.businessType,
                businessPhone: business.businessPhone,
                businessEmail: business.businessEmail,
                businessAddress: business.businessAddress,
                businessCity: business.businessCity,
                businessProvince: business.businessProvince,
                currency: business.currency,
                vatRegistered: business.vatRegistered,
                vatNumber: business.vatNumber,
                taxRate: business.taxRate,
                financialYearEnd: business.financialYearEnd
            };

            console.log('Loaded business data for editing:', existingBusinessId);
        } else {
            console.error('Business not found');
            showToast('Business not found', 'error');
        }
    } catch (error) {
        console.error('Error loading business data:', error);
        showToast('Failed to load business data', 'error');
    }
}

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = '../Index.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
});

// Logo upload functionality
const logoUploadArea = document.getElementById('logoUploadArea');
const logoInput = document.getElementById('businessLogo');
const logoPreview = document.getElementById('logoPreview');
const logoImage = document.getElementById('logoImage');

logoUploadArea.addEventListener('click', () => {
    logoInput.click();
});

logoUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    logoUploadArea.style.borderColor = '#2563eb';
});

logoUploadArea.addEventListener('dragleave', () => {
    logoUploadArea.style.borderColor = '#cbd5e1';
});

logoUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    logoUploadArea.style.borderColor = '#cbd5e1';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleLogoUpload(file);
    }
});

logoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleLogoUpload(file);
    }
});

function handleLogoUpload(file) {
    // Limit to 1MB for base64 storage in Realtime Database
    if (file.size > 1 * 1024 * 1024) {
        alert('File size must be less than 1MB for optimal performance');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        logoBase64 = e.target.result;
        logoImage.src = e.target.result;
        logoUploadArea.querySelector('.upload-placeholder').style.display = 'none';
        logoPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

document.getElementById('removeLogo').addEventListener('click', (e) => {
    e.stopPropagation();
    logoBase64 = '';
    logoInput.value = '';
    logoUploadArea.querySelector('.upload-placeholder').style.display = 'flex';
    logoPreview.style.display = 'none';
});

// VAT toggle
document.getElementById('vatRegistered').addEventListener('change', (e) => {
    const vatNumberGroup = document.getElementById('vatNumberGroup');
    vatNumberGroup.style.display = e.target.checked ? 'block' : 'none';
});

// Navigation functions
function goToStep(step) {
    // Hide all steps
    document.querySelectorAll('.setup-step').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.progress-step').forEach(s => s.classList.remove('active', 'completed'));

    // Show target step
    document.getElementById(`step${step}`).classList.add('active');

    // Update progress
    for (let i = 1; i <= 4; i++) {
        const progressStep = document.querySelector(`.progress-step[data-step="${i}"]`);
        if (i < step) {
            progressStep.classList.add('completed');
        } else if (i === step) {
            progressStep.classList.add('active');
        }
    }

    currentStep = step;

    // Update review if going to step 4
    if (step === 4) {
        updateReview();
    }
}

window.goToStep = goToStep;

// Step 1 - Next
document.getElementById('step1Next').addEventListener('click', () => {
    const businessName = document.getElementById('businessName').value.trim();
    const businessType = document.getElementById('businessType').value;

    if (!businessName || !businessType) {
        alert('Please fill in all required fields');
        return;
    }

    businessData.businessName = businessName;
    businessData.businessType = businessType;

    goToStep(2);
});

// Step 2 - Navigation
document.getElementById('step2Prev').addEventListener('click', () => goToStep(1));
document.getElementById('step2Next').addEventListener('click', () => {
    const phone = document.getElementById('businessPhone').value.trim();
    const address = document.getElementById('businessAddress').value.trim();
    const city = document.getElementById('businessCity').value.trim();
    const province = document.getElementById('businessProvince').value;

    if (!phone || !address || !city || !province) {
        alert('Please fill in all required fields');
        return;
    }

    businessData.businessPhone = phone;
    businessData.businessEmail = document.getElementById('businessEmail').value.trim();
    businessData.businessAddress = address;
    businessData.businessCity = city;
    businessData.businessProvince = province;

    goToStep(3);
});

// Step 3 - Navigation
document.getElementById('step3Prev').addEventListener('click', () => goToStep(2));
document.getElementById('step3Next').addEventListener('click', () => {
    const currency = document.getElementById('currency').value;
    const taxRate = document.getElementById('taxRate').value;
    const financialYearEnd = document.getElementById('financialYearEnd').value;

    if (!currency || !taxRate || !financialYearEnd) {
        alert('Please fill in all required fields');
        return;
    }

    businessData.currency = currency;
    businessData.vatRegistered = document.getElementById('vatRegistered').checked;
    businessData.vatNumber = document.getElementById('vatNumber').value.trim();
    businessData.taxRate = parseFloat(taxRate);
    businessData.financialYearEnd = financialYearEnd;

    goToStep(4);
});

// Step 4 - Navigation
document.getElementById('step4Prev').addEventListener('click', () => goToStep(3));

// Update review section
function updateReview() {
    document.getElementById('reviewBusinessName').textContent = businessData.businessName;
    document.getElementById('reviewBusinessType').textContent = businessData.businessType;
    document.getElementById('reviewPhone').textContent = businessData.businessPhone;
    document.getElementById('reviewEmail').textContent = businessData.businessEmail || 'Not provided';
    document.getElementById('reviewAddress').textContent =
        `${businessData.businessAddress}, ${businessData.businessCity}, ${businessData.businessProvince}`;
    document.getElementById('reviewCurrency').textContent = businessData.currency;
    document.getElementById('reviewTaxRate').textContent = `${businessData.taxRate}%`;
    document.getElementById('reviewVATStatus').textContent = businessData.vatRegistered ?
        `Yes (${businessData.vatNumber || 'No VAT number'})` : 'No';
}

// Complete setup
document.getElementById('completeSetup').addEventListener('click', async () => {
    const btn = document.getElementById('completeSetup');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-block';
    btn.disabled = true;

    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('No user logged in');
        }

        const userId = generateCleanId(user.email);

        let businessId;
        let isNewBusiness = true;
        let existingBusinessData = null;

        // Check if we're in edit mode with existing businessId
        if (isEditMode && existingBusinessId) {
            businessId = existingBusinessId;
            isNewBusiness = false;
            console.log('Updating existing business (edit mode):', businessId);
        } else {
            // Check if user already has a business
            const userReference = ref(db, `users/${userId}`);
            const userSnapshot = await get(userReference);
            const userData = userSnapshot.val();

            if (userData && userData.businessId) {
                // User already has a business - use existing ID for editing
                businessId = userData.businessId;
                isNewBusiness = false;
                console.log('Updating existing business:', businessId);

                // Get existing business data to preserve certain fields
                const existingBusinessRef = ref(db, `businesses/${businessId}`);
                const existingBusinessSnapshot = await get(existingBusinessRef);
                existingBusinessData = existingBusinessSnapshot.val();
            } else {
                // New business setup - generate new ID
                businessId = generateBusinessId(businessData.businessName, user.email);
                console.log('Creating new business:', businessId);
            }
        }

        const businessReference = ref(db, `businesses/${businessId}`);

        if (isNewBusiness) {
            // Create new business document
            await set(businessReference, {
                ...businessData,
                businessId,
                ownerId: user.uid,
                ownerEmail: user.email,
                logo: logoBase64,
                createdAt: new Date().toISOString(),
                isActive: true,
                subscription: {
                    plan: 'trial',
                    startDate: new Date().toISOString(),
                    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                    status: 'active'
                }
            });
        } else {
            // Update existing business document
            const updateData = {
                ...businessData,
                updatedAt: new Date().toISOString()
            };

            // Only update logo if a new one was uploaded
            if (logoBase64) {
                updateData.logo = logoBase64;
            }

            await update(businessReference, updateData);
        }

        // Update user document
        const userReference = ref(db, `users/${userId}`);
        await update(userReference, {
            businessId,
            businessName: businessData.businessName,
            businessSetupComplete: true,
            updatedAt: new Date().toISOString()
        });

        console.log('Business setup complete!');
        console.log('Business ID:', businessId);
        console.log('User ID:', userId);

        // Redirect to dashboard or profile based on mode
        if (isEditMode) {
            window.location.href = '../Authentication Pages/UserProfile';
        } else {
            window.location.href = '../Dashboard/DashboardOwner.html';
        }
    } catch (error) {
        console.error('Setup error:', error);
        alert('Failed to complete setup. Please try again.');

        btnText.style.display = 'inline-block';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    }
});

// Helper function for toast notifications
function showToast(message, type = 'error') {
    alert(message);
}