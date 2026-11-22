/**
 * Manual Self-Healing Script for Manager IDs and References
 * SHIVAY ENERGY SOLUTIONS
 * 
 * Usage:
 *   node scripts/self_heal_managers.js             # Dry-run mode (default, no writes)
 *   node scripts/self_heal_managers.js --execute   # Explicit execution mode
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function runSelfHeal() {
    const isExecute = process.argv.includes('--execute');
    console.log(`[Self-Heal Managers] Starting in ${isExecute ? 'EXECUTE' : 'DRY-RUN'} mode...`);

    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoURI) {
        console.error('[Self-Heal Managers] Error: MONGODB_URI is not set.');
        process.exit(1);
    }

    try {
        await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 8000 });
        console.log('[Self-Heal Managers] Connected to MongoDB.');

        const User = require('../models/User');
        const managers = await User.find({ role: { $in: ['BRANCH_MANAGER', 'MANAGER'] } });
        console.log(`[Self-Heal Managers] Found ${managers.length} manager accounts to inspect.`);

        let modifiedCount = 0;
        for (const m of managers) {
            let changed = false;
            let oldEmpId = m.employeeId;
            let hadManager = !!m.managerId;

            if (m.employeeId && m.employeeId.startsWith('SES-EMP-')) {
                m.employeeId = m.employeeId.replace('SES-EMP-', 'SES-MGR-');
                changed = true;
            }
            if (m.managerId) {
                m.managerId = null;
                changed = true;
            }

            if (changed) {
                modifiedCount++;
                console.log(`[Candidate] ID: ${m._id}, Name: ${m.name}, OldEmpId: ${oldEmpId} -> New: ${m.employeeId}, ManagerRef: ${hadManager} -> null`);
                if (isExecute) {
                    await m.save();
                    console.log(`  -> Saved changes for ${m.name}`);
                }
            }
        }

        console.log(`[Self-Heal Managers] Inspection complete. ${modifiedCount} record(s) ${isExecute ? 'updated' : 'identified for update'}.`);
        if (!isExecute && modifiedCount > 0) {
            console.log('[Self-Heal Managers] Note: No changes were written to database. Run with --execute to apply changes.');
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('[Self-Heal Managers] Error during execution:', err.message);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        process.exit(1);
    }
}

runSelfHeal();
