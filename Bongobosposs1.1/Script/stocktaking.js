/**
 * STOCK TAKING MODULE
 * 
 * Handles physical inventory verification and stock reconciliation
 * - Record physical stock counts
 * - Compare with system records
 * - Identify discrepancies (theft, damage, errors)
 * - Schedule regular stock taking sessions
 * - Generate variance reports
 * - Track stock taking history
 * 
 * DATABASE STRUCTURE:
 * /businesses/{businessId}/inventory/stockTaking/
 *   ├── sessions/{sessionId}
 *   │   ├── sessionName
 *   │   ├── branchId
 *   │   ├── branchName
 *   │   ├── status (in-progress, completed, cancelled)
 *   │   ├── startedAt
 *   │   ├── completedAt
 *   │   ├── startedBy
 *   │   ├── startedByName
 *   │   ├── completedBy
 *   │   ├── completedByName
 *   │   ├── totalProducts
 *   │   ├── countedProducts
 *   │   ├── totalVariance
 *   │   ├── varianceValue (cost impact)
 *   │   ├── notes
 *   │   └── counts/{productId}
 *   │       ├── productId
 *   │       ├── productName
 *   │       ├── sku
 *   │       ├── barcode
 *   │       ├── systemCount (expected)
 *   │       ├── physicalCount (actual)
 *   │       ├── variance (difference)
 *   │       ├── variancePercentage
 *   │       ├── costPrice
 *   │       ├── varianceValue (cost impact)
 *   │       ├── unit
 *   │       ├── countedBy
 *   │       ├── countedAt
 *   │       ├── notes
 *   │       └── varianceReason (theft, damage, error, expired, other)
 *   │
 *   ├── schedule/
 *   │   ├── frequency (weekly, fortnightly, monthly)
 *   │   ├── nextDueDate
 *   │   ├── lastCompletedDate
 *   │   ├── createdBy
 *   │   ├── createdAt
 *   │   └── isActive
 *   │
 *   └── history/{historyId}
 *       └── (archive of completed sessions)
 */

import { getDatabase, ref, get, set, update, push, remove } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

let currentUser = null;
let userData = null;
let businessId = null;
let businessData = null;
let allProducts = {};
let allBranches = {};
let db = null;

/**
 * Initialize stock taking module
 */
export function initStockTaking(user, userDataObj, busId, busData, products, branches) {
    currentUser = user;
    userData = userDataObj;
    businessId = busId;
    businessData = busData;
    allProducts = products;
    allBranches = branches;
    db = getDatabase();

    console.log('Stock Taking Module Initialized ✓');
}

/**
 * Create new stock taking session
 */
export async function createStockTakingSession(branchId, sessionName, notes = '') {
    try {
        if (!branchId) {
            throw new Error('Branch ID is required');
        }

        const branch = allBranches[branchId];
        if (!branch) {
            throw new Error('Branch not found');
        }

        // Get all products for this branch
        const branchProducts = Object.entries(allProducts)
            .filter(([_, product]) => product.branchId === branchId)
            .reduce((obj, [id, product]) => {
                obj[id] = product;
                return obj;
            }, {});

        const totalProducts = Object.keys(branchProducts).length;

        if (totalProducts === 0) {
            throw new Error('No products found for this branch');
        }

        // Create session
        const sessionsRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions`);
        const newSessionRef = push(sessionsRef);
        const sessionId = newSessionRef.key;

        const sessionData = {
            sessionId,
            sessionName: sessionName || `Stock Taking - ${new Date().toLocaleDateString()}`,
            branchId,
            branchName: branch.branchName,
            status: 'in-progress',
            startedAt: new Date().toISOString(),
            completedAt: null,
            startedBy: generateCleanId(currentUser.email),
            startedByName: userData.displayName,
            completedBy: null,
            completedByName: null,
            totalProducts,
            countedProducts: 0,
            totalVariance: 0,
            varianceValue: 0,
            notes: notes.trim()
        };

        await set(newSessionRef, sessionData);

        // Initialize counts for all products
        const countsRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions/${sessionId}/counts`);
        const countsData = {};

        Object.entries(branchProducts).forEach(([productId, product]) => {
            countsData[productId] = {
                productId,
                productName: product.productName,
                sku: product.sku || 'N/A',
                barcode: product.barcode || '',
                systemCount: product.currentStock,
                physicalCount: null,
                variance: null,
                variancePercentage: null,
                costPrice: product.costPrice,
                sellPrice: product.sellPrice,
                varianceValue: null,
                unit: product.unit,
                countedBy: null,
                countedAt: null,
                notes: '',
                varianceReason: null,
                isCounted: false
            };
        });

        await set(countsRef, countsData);

        return {
            success: true,
            sessionId,
            sessionData
        };

    } catch (error) {
        console.error('Error creating stock taking session:', error);
        throw error;
    }
}

/**
 * Record physical count for a product
 */
export async function recordPhysicalCount(sessionId, productId, physicalCount, notes = '', varianceReason = null) {
    try {
        const countRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions/${sessionId}/counts/${productId}`);
        const countSnap = await get(countRef);

        if (!countSnap.exists()) {
            throw new Error('Product count record not found');
        }

        const countData = countSnap.val();
        const systemCount = countData.systemCount;
        const variance = physicalCount - systemCount;
        const variancePercentage = systemCount > 0 ? ((variance / systemCount) * 100).toFixed(2) : 0;
        const varianceValue = Math.abs(variance) * countData.costPrice;

        // Update count record
        await update(countRef, {
            physicalCount,
            variance,
            variancePercentage: parseFloat(variancePercentage),
            varianceValue,
            countedBy: generateCleanId(currentUser.email),
            countedByName: userData.displayName,
            countedAt: new Date().toISOString(),
            notes: notes.trim(),
            varianceReason: varianceReason || (variance === 0 ? null : 'pending-review'),
            isCounted: true
        });

        // Update session progress
        await updateSessionProgress(sessionId);

        return {
            success: true,
            variance,
            variancePercentage,
            varianceValue
        };

    } catch (error) {
        console.error('Error recording physical count:', error);
        throw error;
    }
}

/**
 * Update session progress
 */
async function updateSessionProgress(sessionId) {
    try {
        const countsRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions/${sessionId}/counts`);
        const countsSnap = await get(countsRef);

        if (!countsSnap.exists()) return;

        const counts = countsSnap.val();
        const countedProducts = Object.values(counts).filter(c => c.isCounted).length;
        const totalProducts = Object.keys(counts).length;

        let totalVariance = 0;
        let totalVarianceValue = 0;

        Object.values(counts).forEach(count => {
            if (count.isCounted) {
                totalVariance += Math.abs(count.variance || 0);
                totalVarianceValue += count.varianceValue || 0;
            }
        });

        const sessionRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions/${sessionId}`);
        await update(sessionRef, {
            countedProducts,
            totalVariance,
            varianceValue: totalVarianceValue
        });

    } catch (error) {
        console.error('Error updating session progress:', error);
    }
}

/**
 * Complete stock taking session and update inventory
 */
export async function completeStockTakingSession(sessionId, applyAdjustments = true) {
    try {
        const sessionRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions/${sessionId}`);
        const sessionSnap = await get(sessionRef);

        if (!sessionSnap.exists()) {
            throw new Error('Session not found');
        }

        const sessionData = sessionSnap.val();

        if (sessionData.status === 'completed') {
            throw new Error('Session already completed');
        }

        // Get all counts
        const countsRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions/${sessionId}/counts`);
        const countsSnap = await get(countsRef);

        if (!countsSnap.exists()) {
            throw new Error('No counts found');
        }

        const counts = countsSnap.val();
        const unCountedProducts = Object.values(counts).filter(c => !c.isCounted);

        if (unCountedProducts.length > 0) {
            const confirmComplete = confirm(
                `${unCountedProducts.length} products have not been counted. Complete session anyway?`
            );
            if (!confirmComplete) {
                return { success: false, message: 'Session not completed' };
            }
        }

        // Apply stock adjustments if requested
        if (applyAdjustments) {
            const adjustmentPromises = [];

            Object.entries(counts).forEach(([productId, count]) => {
                if (count.isCounted && count.variance !== 0) {
                    const productRef = ref(db, `businesses/${businessId}/inventory/products/${productId}`);

                    adjustmentPromises.push(
                        update(productRef, {
                            currentStock: count.physicalCount,
                            lastModifiedBy: userData.displayName,
                            lastModifiedAt: new Date().toISOString()
                        })
                    );

                    // Log inventory change
                    const historyRef = ref(db, `businesses/${businessId}/inventory/history`);
                    const newHistoryRef = push(historyRef);

                    adjustmentPromises.push(
                        set(newHistoryRef, {
                            productId,
                            productName: count.productName,
                            action: 'stock-taking-adjustment',
                            changedBy: generateCleanId(currentUser.email),
                            changedByName: userData.displayName,
                            timestamp: new Date().toISOString(),
                            oldValue: `${count.systemCount} ${count.unit}`,
                            newValue: `${count.physicalCount} ${count.unit}`,
                            field: 'currentStock',
                            notes: `Stock taking adjustment. Variance: ${count.variance} ${count.unit}. Reason: ${count.varianceReason || 'Not specified'}`,
                            sessionId
                        })
                    );
                }
            });

            await Promise.all(adjustmentPromises);
        }

        // Update session status
        await update(sessionRef, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: generateCleanId(currentUser.email),
            completedByName: userData.displayName
        });

        // Archive to history
        const historyRef = ref(db, `businesses/${businessId}/inventory/stockTaking/history/${sessionId}`);
        await set(historyRef, {
            ...sessionData,
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: generateCleanId(currentUser.email),
            completedByName: userData.displayName,
            counts
        });

        // Update schedule if exists
        await updateScheduleAfterCompletion();

        return {
            success: true,
            message: 'Stock taking session completed successfully',
            adjustmentsApplied: applyAdjustments
        };

    } catch (error) {
        console.error('Error completing session:', error);
        throw error;
    }
}

/**
 * Cancel stock taking session
 */
export async function cancelStockTakingSession(sessionId, reason = '') {
    try {
        const sessionRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions/${sessionId}`);
        const sessionSnap = await get(sessionRef);

        if (!sessionSnap.exists()) {
            throw new Error('Session not found');
        }

        const sessionData = sessionSnap.val();

        await update(sessionRef, {
            status: 'cancelled',
            completedAt: new Date().toISOString(),
            completedBy: generateCleanId(currentUser.email),
            completedByName: userData.displayName,
            notes: `${sessionData.notes}\n\nCancelled: ${reason}`
        });

        return { success: true, message: 'Session cancelled' };

    } catch (error) {
        console.error('Error cancelling session:', error);
        throw error;
    }
}

/**
 * Set stock taking schedule
 */
export async function setStockTakingSchedule(frequency) {
    try {
        const validFrequencies = ['weekly', 'fortnightly', 'monthly'];

        if (!validFrequencies.includes(frequency)) {
            throw new Error('Invalid frequency. Must be weekly, fortnightly, or monthly');
        }

        // Calculate next due date
        const nextDueDate = calculateNextDueDate(frequency);

        const scheduleRef = ref(db, `businesses/${businessId}/inventory/stockTaking/schedule`);
        const scheduleData = {
            frequency,
            nextDueDate: nextDueDate.toISOString(),
            lastCompletedDate: null,
            createdBy: generateCleanId(currentUser.email),
            createdByName: userData.displayName,
            createdAt: new Date().toISOString(),
            isActive: true
        };

        await set(scheduleRef, scheduleData);

        return {
            success: true,
            schedule: scheduleData,
            nextDueDate: nextDueDate.toLocaleDateString()
        };

    } catch (error) {
        console.error('Error setting schedule:', error);
        throw error;
    }
}

/**
 * Calculate next due date based on frequency
 */
function calculateNextDueDate(frequency, fromDate = new Date()) {
    const nextDate = new Date(fromDate);

    switch (frequency) {
        case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
        case 'fortnightly':
            nextDate.setDate(nextDate.getDate() + 14);
            break;
        case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
    }

    return nextDate;
}

/**
 * Update schedule after session completion
 */
async function updateScheduleAfterCompletion() {
    try {
        const scheduleRef = ref(db, `businesses/${businessId}/inventory/stockTaking/schedule`);
        const scheduleSnap = await get(scheduleRef);

        if (!scheduleSnap.exists()) return;

        const schedule = scheduleSnap.val();
        const now = new Date();
        const nextDueDate = calculateNextDueDate(schedule.frequency, now);

        await update(scheduleRef, {
            lastCompletedDate: now.toISOString(),
            nextDueDate: nextDueDate.toISOString()
        });

    } catch (error) {
        console.error('Error updating schedule:', error);
    }
}

/**
 * Get active stock taking sessions
 */
export async function getActiveStockTakingSessions() {
    try {
        const sessionsRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions`);
        const sessionsSnap = await get(sessionsRef);

        if (!sessionsSnap.exists()) {
            return [];
        }

        const sessions = sessionsSnap.val();
        return Object.entries(sessions)
            .filter(([_, session]) => session.status === 'in-progress')
            .map(([id, session]) => ({ id, ...session }));

    } catch (error) {
        console.error('Error getting active sessions:', error);
        return [];
    }
}

/**
 * Get stock taking session details
 */
export async function getStockTakingSessionDetails(sessionId) {
    try {
        const sessionRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions/${sessionId}`);
        const countsRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions/${sessionId}/counts`);

        const [sessionSnap, countsSnap] = await Promise.all([
            get(sessionRef),
            get(countsRef)
        ]);

        if (!sessionSnap.exists()) {
            throw new Error('Session not found');
        }

        const sessionData = sessionSnap.val();
        const counts = countsSnap.exists() ? countsSnap.val() : {};

        return {
            session: sessionData,
            counts: Object.entries(counts).map(([id, count]) => ({ id, ...count }))
        };

    } catch (error) {
        console.error('Error getting session details:', error);
        throw error;
    }
}

/**
 * Get stock taking history
 */
export async function getStockTakingHistory(limit = 10) {
    try {
        const historyRef = ref(db, `businesses/${businessId}/inventory/stockTaking/history`);
        const historySnap = await get(historyRef);

        if (!historySnap.exists()) {
            return [];
        }

        const history = historySnap.val();
        const historyArray = Object.entries(history)
            .map(([id, session]) => ({ id, ...session }))
            .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
            .slice(0, limit);

        return historyArray;

    } catch (error) {
        console.error('Error getting history:', error);
        return [];
    }
}

/**
 * Get stock taking schedule
 */
export async function getStockTakingSchedule() {
    try {
        const scheduleRef = ref(db, `businesses/${businessId}/inventory/stockTaking/schedule`);
        const scheduleSnap = await get(scheduleRef);

        if (!scheduleSnap.exists()) {
            return null;
        }

        return scheduleSnap.val();

    } catch (error) {
        console.error('Error getting schedule:', error);
        return null;
    }
}

/**
 * Check if stock taking is due
 */
export async function isStockTakingDue() {
    try {
        const schedule = await getStockTakingSchedule();

        if (!schedule || !schedule.isActive) {
            return false;
        }

        const now = new Date();
        const dueDate = new Date(schedule.nextDueDate);

        return now >= dueDate;

    } catch (error) {
        console.error('Error checking if stock taking is due:', error);
        return false;
    }
}

/**
 * Generate variance report
 */
export function generateVarianceReport(counts) {
    const currency = businessData?.currency || 'R';

    const report = {
        totalCounted: 0,
        totalUncounted: 0,
        totalVariance: 0,
        totalVarianceValue: 0,
        overages: [],
        shortages: [],
        matches: [],
        byVarianceReason: {
            theft: { count: 0, value: 0 },
            damage: { count: 0, value: 0 },
            error: { count: 0, value: 0 },
            expired: { count: 0, value: 0 },
            other: { count: 0, value: 0 },
            'pending-review': { count: 0, value: 0 }
        }
    };

    counts.forEach(count => {
        if (count.isCounted) {
            report.totalCounted++;

            if (count.variance > 0) {
                report.overages.push(count);
            } else if (count.variance < 0) {
                report.shortages.push(count);
            } else {
                report.matches.push(count);
            }

            report.totalVariance += Math.abs(count.variance || 0);
            report.totalVarianceValue += count.varianceValue || 0;

            if (count.varianceReason && report.byVarianceReason[count.varianceReason]) {
                report.byVarianceReason[count.varianceReason].count++;
                report.byVarianceReason[count.varianceReason].value += count.varianceValue || 0;
            }
        } else {
            report.totalUncounted++;
        }
    });

    // Sort by variance value (highest impact first)
    report.overages.sort((a, b) => b.varianceValue - a.varianceValue);
    report.shortages.sort((a, b) => b.varianceValue - a.varianceValue);

    return report;
}

/**
 * Bulk update variance reasons
 */
export async function updateVarianceReason(sessionId, productId, varianceReason, notes = '') {
    try {
        const countRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions/${sessionId}/counts/${productId}`);

        await update(countRef, {
            varianceReason,
            notes: notes.trim()
        });

        return { success: true };

    } catch (error) {
        console.error('Error updating variance reason:', error);
        throw error;
    }
}

/**
 * Helper function to generate clean ID
 */
function generateCleanId(email) {
    const username = email.split('@')[0];
    return username.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

/**
 * Delete stock taking session
 */
export async function deleteStockTakingSession(sessionId) {
    try {
        const sessionRef = ref(db, `businesses/${businessId}/inventory/stockTaking/sessions/${sessionId}`);
        await remove(sessionRef);

        return { success: true, message: 'Session deleted' };

    } catch (error) {
        console.error('Error deleting session:', error);
        throw error;
    }
}