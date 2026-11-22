/**
 * SHIVAY ENERGY SOLUTIONS - RBAC + FBAC Authorization Migration Script
 * Idempotent, safe migration with dry-run support.
 *
 * Usage:
 *   Dry-Run (Default, no database writes):
 *     node scripts/migrate_user_permissions.js
 *
 *   Live Execution (Requires explicit --execute flag):
 *     node scripts/migrate_user_permissions.js --execute
 */

require('dotenv').config();
const mongoose = require('mongoose');
const {
    PERMISSIONS,
    SENSITIVE_FIELDS,
    ROLE_MIGRATION_BASELINES,
    isValidPermission,
    isValidFieldPermission
} = require('../config/permissionRegistry');

async function runMigration() {
    const isLiveExecution = process.argv.includes('--execute') || process.argv.includes('--commit');
    const modeLabel = isLiveExecution ? 'LIVE EXECUTION' : 'DRY-RUN (SIMULATION ONLY - NO DATABASE WRITES)';

    console.log('='.repeat(70));
    console.log(`🚀 SHIVAY ENERGY SOLUTIONS — RBAC to FBAC Migration Engine`);
    console.log(`MODE: [${modeLabel}]`);
    console.log('='.repeat(70));

    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    let isConnected = false;
    const DataStore = require('../services/dataStore');
    const User = require('../models/User');

    if (mongoURI && !process.argv.includes('--offline') && !process.argv.includes('--mock')) {
        try {
            if (mongoose.connection.readyState !== 1) {
                const connPromise = mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000 });
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Database connection timed out (offline/sandbox environment).')), 3500));
                await Promise.race([connPromise, timeoutPromise]);
            }
            isConnected = true;
            console.log('✅ Connected to MongoDB Atlas.');
        } catch (dbErr) {
            console.warn(`⚠️ MongoDB Atlas Connection Note: ${dbErr.message}`);
            if (isLiveExecution) {
                console.error('❌ Cannot run LIVE execution without an active MongoDB connection.');
                process.exit(1);
            }
            console.log('ℹ️ Running Dry-Run Simulation on DataStore User Directory.');
        }
    } else {
        console.log('ℹ️ Operating on DataStore User Directory (Offline/Simulation Mode).');
    }

    try {
        // Step 1: Pre-Migration Inventory & Analysis
        let allUsers = [];
        if (isConnected && mongoose.connection.readyState === 1) {
            allUsers = await User.find({}).sort({ createdAt: 1 });
        } else {
            allUsers = await DataStore.getUsers();
        }
        const totalUsersCount = allUsers.length;
        console.log(`\n📊 Pre-Migration User Inventory: ${totalUsersCount} registered user records found.\n`);

        const primaryAdminEmail = (process.env.ADMIN_EMAIL || 'shivayenergysolutions@gmail.com').trim().toLowerCase();
        let existingPrimaryAdmin = allUsers.find(u => u.isPrimarySuperAdmin === true);
        let designatedPrimaryAdmin = existingPrimaryAdmin;

        if (!designatedPrimaryAdmin) {
            // Find by configured ADMIN_EMAIL or employeeId SES-ADMIN-01 or oldest SUPER_ADMIN
            designatedPrimaryAdmin = allUsers.find(u => u.email.toLowerCase() === primaryAdminEmail) ||
                                     allUsers.find(u => u.employeeId === 'SES-ADMIN-01') ||
                                     allUsers.find(u => u.role === 'SUPER_ADMIN');
        }

        if (designatedPrimaryAdmin) {
            console.log(`👑 Designated Primary Super Admin: ${designatedPrimaryAdmin.name} (${designatedPrimaryAdmin.email}) [ID: ${designatedPrimaryAdmin.employeeId || designatedPrimaryAdmin._id}]`);
        } else {
            console.warn(`⚠️ Warning: No candidate user found for Primary Super Admin. One must be created or seeded.`);
        }

        // Summary counters
        const summary = {
            total: totalUsersCount,
            primarySuperAdmin: 0,
            alreadyConfigured: 0,
            migratedSuperAdmin: 0,
            migratedManagers: 0,
            migratedEmployees: 0,
            invalidKeysFound: 0,
            warnings: []
        };

        const proposedOperations = [];

        for (const user of allUsers) {
            const isTargetPrimary = designatedPrimaryAdmin && user._id.toString() === designatedPrimaryAdmin._id.toString();
            const hasExistingPermissions = Array.isArray(user.permissions) && user.permissions.length > 0;
            
            let newIsPrimary = isTargetPrimary;
            let targetPermissions = [];
            let targetFieldPermissions = [];

            if (isTargetPrimary) {
                summary.primarySuperAdmin++;
                targetPermissions = Object.keys(PERMISSIONS);
                targetFieldPermissions = Object.keys(SENSITIVE_FIELDS);
            } else if (hasExistingPermissions) {
                summary.alreadyConfigured++;
                // Preserve explicitly configured permissions, filter out invalid keys
                const validPerms = [];
                for (const p of user.permissions) {
                    if (isValidPermission(p)) validPerms.push(p);
                    else {
                        summary.invalidKeysFound++;
                        summary.warnings.push(`User ${user.email} had invalid permission key: "${p}"`);
                    }
                }
                const validFieldPerms = [];
                if (Array.isArray(user.fieldPermissions)) {
                    for (const f of user.fieldPermissions) {
                        if (isValidFieldPermission(f)) validFieldPerms.push(f);
                        else {
                            summary.invalidKeysFound++;
                            summary.warnings.push(`User ${user.email} had invalid field permission key: "${f}"`);
                        }
                    }
                }
                targetPermissions = validPerms;
                targetFieldPermissions = validFieldPerms;
            } else {
                // Apply role baseline presets so existing users retain their effective access
                const baseline = ROLE_MIGRATION_BASELINES[user.role] || ROLE_MIGRATION_BASELINES.EMPLOYEE;
                targetPermissions = [...baseline.permissions];
                targetFieldPermissions = [...baseline.fieldPermissions];

                if (user.role === 'SUPER_ADMIN') summary.migratedSuperAdmin++;
                else if (user.role === 'BRANCH_MANAGER' || user.role === 'MANAGER') summary.migratedManagers++;
                else summary.migratedEmployees++;
            }

            proposedOperations.push({
                user,
                userId: user._id,
                email: user.email,
                role: user.role,
                isPrimarySuperAdmin: newIsPrimary,
                permissionsCount: targetPermissions.length,
                fieldPermissionsCount: targetFieldPermissions.length,
                targetPermissions,
                targetFieldPermissions
            });
        }

        // Print Operation Table
        console.log('-'.repeat(90));
        console.log(String('USER').padEnd(30) + String('ROLE').padEnd(16) + String('PRIMARY?').padEnd(12) + String('PERMS').padEnd(10) + String('FIELDS').padEnd(10) + 'ACTION');
        console.log('-'.repeat(90));

        for (const op of proposedOperations) {
            const userStr = `${op.user.name} (${op.email})`.substring(0, 28).padEnd(30);
            const roleStr = String(op.role).padEnd(16);
            const primStr = (op.isPrimarySuperAdmin ? 'YES (PROTECTED)' : 'NO').padEnd(12);
            const pCount = String(op.permissionsCount).padEnd(10);
            const fCount = String(op.fieldPermissionsCount).padEnd(10);
            const actionStr = op.isPrimarySuperAdmin ? 'Full Primary Bypass' : 'Role Baseline Preset';
            console.log(userStr + roleStr + primStr + pCount + fCount + actionStr);
        }
        console.log('-'.repeat(90));

        console.log('\n📈 MIGRATION SUMMARY METRICS:');
        console.log(`  • Total Users Checked:            ${summary.total}`);
        console.log(`  • Designated Primary Super Admin: ${summary.primarySuperAdmin}`);
        console.log(`  • Existing Customized Users:      ${summary.alreadyConfigured}`);
        console.log(`  • Migrated Super Admins:          ${summary.migratedSuperAdmin}`);
        console.log(`  • Migrated Managers:              ${summary.migratedManagers}`);
        console.log(`  • Migrated Employees:             ${summary.migratedEmployees}`);
        console.log(`  • Invalid Permission Keys Found:  ${summary.invalidKeysFound}`);

        if (summary.warnings.length > 0) {
            console.log('\n⚠️ WARNINGS & ANOMALIES:');
            summary.warnings.forEach(w => console.warn(`  - ${w}`));
        }

        // Execution Check
        if (isLiveExecution) {
            console.log('\n💾 EXECUTING DATABASE UPDATES...');
            let writeCount = 0;
            for (const op of proposedOperations) {
                const u = op.user;
                u.isPrimarySuperAdmin = op.isPrimarySuperAdmin;
                u.permissions = op.targetPermissions;
                u.fieldPermissions = op.targetFieldPermissions;
                u.permissionVersion = (u.permissionVersion || 0) + 1;
                u.permissionMetadata = {
                    assignedBy: designatedPrimaryAdmin ? designatedPrimaryAdmin._id : null,
                    assignedAt: new Date(),
                    notes: `Automated RBAC-to-FBAC migration executed on ${new Date().toISOString()}`
                };
                await u.save();
                writeCount++;
            }
            console.log(`✅ Live Migration Complete: ${writeCount} user records updated successfully in MongoDB Atlas.`);
        } else {
            console.log('\nℹ️ DRY-RUN FINISHED: Zero database records were modified.');
            console.log('To apply these changes permanently to MongoDB Atlas, run:');
            console.log('  node scripts/migrate_user_permissions.js --execute\n');
        }

        // Print Recommended Backup & Rollback Protocol
        console.log('='.repeat(70));
        console.log('🛡️ BACKUP RECOMMENDATION (BEFORE LIVE EXECUTION):');
        console.log('  mongodump --uri="<MONGODB_URI>" --collection=users --out=./backups/pre_fbac_backup');
        console.log('\n⏪ ROLLBACK PROTOCOL:');
        console.log('  If rollback is needed, run:');
        console.log('  mongorestore --uri="<MONGODB_URI>" --drop ./backups/pre_fbac_backup');
        console.log('='.repeat(70));

        return {
            success: true,
            isLiveExecution,
            summary,
            operationsCount: proposedOperations.length
        };
    } catch (err) {
        console.error('❌ Migration Error:', err);
        return { success: false, error: err.message };
    } finally {
        if (isLiveExecution || process.argv.includes('--close')) {
            await mongoose.disconnect();
            console.log('🔌 Disconnected from MongoDB.');
        }
    }
}

if (require.main === module) {
    runMigration().then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = runMigration;
