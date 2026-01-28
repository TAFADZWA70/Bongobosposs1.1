import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, remove } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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
 * CHANGE MANAGEMENT SYSTEM
 * 
 * DATABASE STRUCTURE:
 * /businesses/{businessId}/changeManagement/
 *   ├── dailyRecords/{recordId}
 *   │   ├── date (YYYY-MM-DD)
 *   │   ├── branchId
 *   │   ├── branchName
 *   │   ├── notes (1 cent)
 *   │   ├── fiveCents (5 cents)
 *   │   ├── tenCents (10 cents)
 *   │   ├── twentyCents (20 cents)
 *   │   ├── fiftyCents (50 cents)
 *   │   ├── oneRand (R1 coins)
 *   │   ├── twoRand (R2 coins)
 *   │   ├── fiveRand (R5 coins)
 *   │   ├── tenRand (R10 notes)
 *   │   ├── twentyRand (R20 notes)
 *   │   ├── fiftyRand (R50 notes)
 *   │   ├── hundredRand (R100 notes)
 *   │   ├── twoHundredRand (R200 notes)
 *   │   ├── totalCoins (calculated)
 *   │   ├── totalNotes (calculated)
 *   │   ├── totalChange (calculated)
 *   │   ├── recordedBy
 *   │   ├── recordedByName
 *   │   ├── recordedAt (timestamp)
 *   │   ├── lastModifiedBy
 *   │   ├── lastModifiedAt
 *   │   └── status (active, archived)
 *   │
 *   └── changeHistory/{historyId}
 *       ├── recordId
 *       ├── date
 *       ├── branchId
 *       ├── action (created, updated, archived)
 *       ├── oldValue
 *       ├── newValue
 *       ├── changedBy
 *       ├── changedByName
 *       └── timestamp
 * 
 * DENOMINATION VALUES (ZAR - South African Rand):
 * - Coins: 1c, 5c, 10c, 20c, 50c, R1, R2, R5
 * - Notes: R10, R20, R50, R100, R200
 */

// Global variables
let currentUser = null;
let userData = null;
let businessId = null;
let businessData = null;
let allBranches = {};
let dailyRecords = {};
let changeHistory = [];

// Generate clean ID from email
function generateCleanId(email) {
    const username = email.split('@')[0];
    return username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

// Initialize the module
export function initChangeManagement(user, userDataObj, businessIdStr, businessDataObj, branches) {
    currentUser = user;
    userData = userDataObj;
    businessId = businessIdStr;
    businessData = businessDataObj;
    allBranches = branches;

    loadDailyRecords();
    loadChangeHistory();
}

// Load all daily records
async function loadDailyRecords() {
    try {
        const recordsRef = ref(db, `businesses/${businessId}/changeManagement/dailyRecords`);
        const snapshot = await get(recordsRef);

        if (snapshot.exists()) {
            dailyRecords = snapshot.val();
        } else {
            dailyRecords = {};
        }

        updateChangeDisplay();
    } catch (error) {
        console.error('Error loading daily records:', error);
    }
}

// Load change history
async function loadChangeHistory() {
    try {
        const historyRef = ref(db, `businesses/${businessId}/changeManagement/changeHistory`);
        const snapshot = await get(historyRef);

        if (snapshot.exists()) {
            const historyData = snapshot.val();
            changeHistory = Object.entries(historyData)
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } else {
            changeHistory = [];
        }
    } catch (error) {
        console.error('Error loading change history:', error);
    }
}

// Calculate denomination totals
function calculateDenominationTotals(denominations) {
    const values = {
        notes: 0.01,
        fiveCents: 0.05,
        tenCents: 0.10,
        twentyCents: 0.20,
        fiftyCents: 0.50,
        oneRand: 1.00,
        twoRand: 2.00,
        fiveRand: 5.00,
        tenRand: 10.00,
        twentyRand: 20.00,
        fiftyRand: 50.00,
        hundredRand: 100.00,
        twoHundredRand: 200.00
    };

    let totalCoins = 0;
    let totalNotes = 0;

    // Calculate coins
    const coins = ['notes', 'fiveCents', 'tenCents', 'twentyCents', 'fiftyCents', 'oneRand', 'twoRand', 'fiveRand'];
    coins.forEach(coin => {
        const count = parseInt(denominations[coin]) || 0;
        totalCoins += count * values[coin];
    });

    // Calculate notes
    const notes = ['tenRand', 'twentyRand', 'fiftyRand', 'hundredRand', 'twoHundredRand'];
    notes.forEach(note => {
        const count = parseInt(denominations[note]) || 0;
        totalNotes += count * values[note];
    });

    return {
        totalCoins: parseFloat(totalCoins.toFixed(2)),
        totalNotes: parseFloat(totalNotes.toFixed(2)),
        totalChange: parseFloat((totalCoins + totalNotes).toFixed(2))
    };
}

// Record daily change
export async function recordDailyChange(changeData) {
    try {
        const totals = calculateDenominationTotals(changeData.denominations);

        const recordData = {
            date: changeData.date,
            branchId: changeData.branchId,
            branchName: allBranches[changeData.branchId].branchName,
            notes: parseInt(changeData.denominations.notes) || 0,
            fiveCents: parseInt(changeData.denominations.fiveCents) || 0,
            tenCents: parseInt(changeData.denominations.tenCents) || 0,
            twentyCents: parseInt(changeData.denominations.twentyCents) || 0,
            fiftyCents: parseInt(changeData.denominations.fiftyCents) || 0,
            oneRand: parseInt(changeData.denominations.oneRand) || 0,
            twoRand: parseInt(changeData.denominations.twoRand) || 0,
            fiveRand: parseInt(changeData.denominations.fiveRand) || 0,
            tenRand: parseInt(changeData.denominations.tenRand) || 0,
            twentyRand: parseInt(changeData.denominations.twentyRand) || 0,
            fiftyRand: parseInt(changeData.denominations.fiftyRand) || 0,
            hundredRand: parseInt(changeData.denominations.hundredRand) || 0,
            twoHundredRand: parseInt(changeData.denominations.twoHundredRand) || 0,
            totalCoins: totals.totalCoins,
            totalNotes: totals.totalNotes,
            totalChange: totals.totalChange,
            recordedBy: generateCleanId(currentUser.email),
            recordedByName: userData.displayName,
            recordedAt: new Date().toISOString(),
            lastModifiedBy: userData.displayName,
            lastModifiedAt: new Date().toISOString(),
            status: 'active'
        };

        const recordsRef = ref(db, `businesses/${businessId}/changeManagement/dailyRecords`);
        const newRecordRef = push(recordsRef);

        await set(newRecordRef, recordData);

        // Log change history
        await logChangeHistory({
            recordId: newRecordRef.key,
            date: changeData.date,
            branchId: changeData.branchId,
            action: 'created',
            oldValue: 'null',
            newValue: JSON.stringify(recordData)
        });

        await loadDailyRecords();
        await loadChangeHistory();

        return { success: true, recordId: newRecordRef.key };

    } catch (error) {
        console.error('Error recording daily change:', error);
        throw error;
    }
}

// Update daily change record
export async function updateDailyChange(recordId, changeData) {
    try {
        const oldRecord = dailyRecords[recordId];
        if (!oldRecord) throw new Error('Record not found');

        const totals = calculateDenominationTotals(changeData.denominations);

        const updatedData = {
            notes: parseInt(changeData.denominations.notes) || 0,
            fiveCents: parseInt(changeData.denominations.fiveCents) || 0,
            tenCents: parseInt(changeData.denominations.tenCents) || 0,
            twentyCents: parseInt(changeData.denominations.twentyCents) || 0,
            fiftyCents: parseInt(changeData.denominations.fiftyCents) || 0,
            oneRand: parseInt(changeData.denominations.oneRand) || 0,
            twoRand: parseInt(changeData.denominations.twoRand) || 0,
            fiveRand: parseInt(changeData.denominations.fiveRand) || 0,
            tenRand: parseInt(changeData.denominations.tenRand) || 0,
            twentyRand: parseInt(changeData.denominations.twentyRand) || 0,
            fiftyRand: parseInt(changeData.denominations.fiftyRand) || 0,
            hundredRand: parseInt(changeData.denominations.hundredRand) || 0,
            twoHundredRand: parseInt(changeData.denominations.twoHundredRand) || 0,
            totalCoins: totals.totalCoins,
            totalNotes: totals.totalNotes,
            totalChange: totals.totalChange,
            lastModifiedBy: userData.displayName,
            lastModifiedAt: new Date().toISOString()
        };

        const recordRef = ref(db, `businesses/${businessId}/changeManagement/dailyRecords/${recordId}`);
        await update(recordRef, updatedData);

        // Log change history
        await logChangeHistory({
            recordId: recordId,
            date: oldRecord.date,
            branchId: oldRecord.branchId,
            action: 'updated',
            oldValue: JSON.stringify(oldRecord),
            newValue: JSON.stringify({ ...oldRecord, ...updatedData })
        });

        await loadDailyRecords();
        await loadChangeHistory();

        return { success: true };

    } catch (error) {
        console.error('Error updating daily change:', error);
        throw error;
    }
}

// Delete daily change record
export async function deleteDailyChange(recordId) {
    try {
        const record = dailyRecords[recordId];
        if (!record) throw new Error('Record not found');

        const recordRef = ref(db, `businesses/${businessId}/changeManagement/dailyRecords/${recordId}`);
        await remove(recordRef);

        // Log deletion
        await logChangeHistory({
            recordId: recordId,
            date: record.date,
            branchId: record.branchId,
            action: 'deleted',
            oldValue: JSON.stringify(record),
            newValue: 'null'
        });

        await loadDailyRecords();
        await loadChangeHistory();

        return { success: true };

    } catch (error) {
        console.error('Error deleting daily change:', error);
        throw error;
    }
}

// Archive old records (for records older than 90 days)
export async function archiveOldRecords() {
    try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const recordsToArchive = Object.entries(dailyRecords).filter(([_, record]) => {
            return new Date(record.date) < ninetyDaysAgo && record.status === 'active';
        });

        for (const [recordId, record] of recordsToArchive) {
            const recordRef = ref(db, `businesses/${businessId}/changeManagement/dailyRecords/${recordId}`);
            await update(recordRef, {
                status: 'archived',
                archivedAt: new Date().toISOString(),
                archivedBy: userData.displayName
            });

            await logChangeHistory({
                recordId: recordId,
                date: record.date,
                branchId: record.branchId,
                action: 'archived',
                oldValue: record.status,
                newValue: 'archived'
            });
        }

        await loadDailyRecords();

        return { success: true, archivedCount: recordsToArchive.length };

    } catch (error) {
        console.error('Error archiving records:', error);
        throw error;
    }
}

// Get daily change for specific date and branch
export function getDailyChange(date, branchId) {
    const record = Object.entries(dailyRecords).find(([_, r]) =>
        r.date === date && r.branchId === branchId && r.status === 'active'
    );

    if (record) {
        const [recordId, recordData] = record;
        return { recordId, ...recordData };
    }

    return null;
}

// Get change summary for period
export function getChangeSummary(startDate, endDate, branchId = 'all') {
    const start = new Date(startDate);
    const end = new Date(endDate);

    let relevantRecords = Object.entries(dailyRecords).filter(([_, record]) => {
        const recordDate = new Date(record.date);
        return recordDate >= start && recordDate <= end &&
            (branchId === 'all' || record.branchId === branchId) &&
            record.status === 'active';
    });

    if (relevantRecords.length === 0) {
        return {
            totalRecords: 0,
            averageChange: 0,
            totalCoins: 0,
            totalNotes: 0,
            totalChange: 0,
            highestChange: 0,
            lowestChange: 0
        };
    }

    const totals = relevantRecords.reduce((acc, [_, record]) => {
        acc.totalCoins += record.totalCoins;
        acc.totalNotes += record.totalNotes;
        acc.totalChange += record.totalChange;
        return acc;
    }, { totalCoins: 0, totalNotes: 0, totalChange: 0 });

    const changes = relevantRecords.map(([_, r]) => r.totalChange);

    return {
        totalRecords: relevantRecords.length,
        averageChange: parseFloat((totals.totalChange / relevantRecords.length).toFixed(2)),
        totalCoins: parseFloat(totals.totalCoins.toFixed(2)),
        totalNotes: parseFloat(totals.totalNotes.toFixed(2)),
        totalChange: parseFloat(totals.totalChange.toFixed(2)),
        highestChange: parseFloat(Math.max(...changes).toFixed(2)),
        lowestChange: parseFloat(Math.min(...changes).toFixed(2))
    };
}

// Get denomination breakdown for period
export function getDenominationBreakdown(startDate, endDate, branchId = 'all') {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const relevantRecords = Object.entries(dailyRecords).filter(([_, record]) => {
        const recordDate = new Date(record.date);
        return recordDate >= start && recordDate <= end &&
            (branchId === 'all' || record.branchId === branchId) &&
            record.status === 'active';
    });

    const breakdown = {
        coins: {
            notes: 0,
            fiveCents: 0,
            tenCents: 0,
            twentyCents: 0,
            fiftyCents: 0,
            oneRand: 0,
            twoRand: 0,
            fiveRand: 0
        },
        notes: {
            tenRand: 0,
            twentyRand: 0,
            fiftyRand: 0,
            hundredRand: 0,
            twoHundredRand: 0
        }
    };

    relevantRecords.forEach(([_, record]) => {
        // Sum coins
        breakdown.coins.notes += record.notes || 0;
        breakdown.coins.fiveCents += record.fiveCents || 0;
        breakdown.coins.tenCents += record.tenCents || 0;
        breakdown.coins.twentyCents += record.twentyCents || 0;
        breakdown.coins.fiftyCents += record.fiftyCents || 0;
        breakdown.coins.oneRand += record.oneRand || 0;
        breakdown.coins.twoRand += record.twoRand || 0;
        breakdown.coins.fiveRand += record.fiveRand || 0;

        // Sum notes
        breakdown.notes.tenRand += record.tenRand || 0;
        breakdown.notes.twentyRand += record.twentyRand || 0;
        breakdown.notes.fiftyRand += record.fiftyRand || 0;
        breakdown.notes.hundredRand += record.hundredRand || 0;
        breakdown.notes.twoHundredRand += record.twoHundredRand || 0;
    });

    return breakdown;
}

// Log change history
async function logChangeHistory(changeData) {
    try {
        const historyRef = ref(db, `businesses/${businessId}/changeManagement/changeHistory`);
        const newHistoryRef = push(historyRef);

        await set(newHistoryRef, {
            ...changeData,
            changedBy: generateCleanId(currentUser.email),
            changedByName: userData.displayName,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error logging change history:', error);
    }
}

// Format currency
function formatCurrency(amount) {
    const currency = businessData?.currency || 'R';
    return `${currency} ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Update change display (to be implemented in UI)
function updateChangeDisplay() {
    console.log('Daily change records loaded:', Object.keys(dailyRecords).length);
}

// Export data for external use
export function getDailyRecordsData() {
    return dailyRecords;
}

export function getChangeHistoryData() {
    return changeHistory;
}

// Get today's change for branch
export function getTodaysChange(branchId) {
    const today = new Date().toISOString().split('T')[0];
    return getDailyChange(today, branchId);
}

// Check if change recorded for today
export function hasChangeForToday(branchId) {
    const today = new Date().toISOString().split('T')[0];
    return getDailyChange(today, branchId) !== null;
}

console.log('BongoBoss POS - Change Management Module Initialized ✓');