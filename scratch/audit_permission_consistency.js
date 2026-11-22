/**
 * Static & Dynamic Consistency Audit Script for RBAC + FBAC
 */

const fs = require('fs');
const path = require('path');
const {
    MODULES,
    PERMISSIONS,
    SENSITIVE_FIELDS,
    isValidPermission,
    isValidFieldPermission
} = require('../config/permissionRegistry');

const canonicalKeys = new Set(Object.keys(PERMISSIONS));
const canonicalFieldKeys = new Set(Object.keys(SENSITIVE_FIELDS));

console.log(`Canonical Permissions Count: ${canonicalKeys.size}`);
console.log(`Canonical Sensitive Fields Count: ${canonicalFieldKeys.size}`);

// Scan directory for files
function getFiles(dir, exts = ['.js', '.ejs']) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            if (!['node_modules', '.git', 'backups', 'scratch'].includes(file)) {
                results = results.concat(getFiles(fullPath, exts));
            }
        } else {
            if (exts.includes(path.extname(file))) {
                results.push(fullPath);
            }
        }
    });
    return results;
}

const allFiles = getFiles(path.join(__dirname, '..'));

const usedPermissions = new Set();
const invalidPermissionsFound = [];
const usedFieldPermissions = new Set();
const invalidFieldsFound = [];

const permRegexes = [
    /requirePermission\(['"]([^'"]+)['"]\)/g,
    /hasPermission\([^,]+,\s*['"]([^'"]+)['"]\)/g,
    /checkPerm\(['"]([^'"]+)['"]\)/g
];

const fieldRegexes = [
    /requireFieldAccess\(['"]([^'"]+)['"]\)/g,
    /hasFieldAccess\([^,]+,\s*['"]([^'"]+)['"]\)/g,
    /hasFieldPermission\([^,]+,\s*['"]([^'"]+)['"]\)/g,
    /checkField\(['"]([^'"]+)['"]\)/g
];

allFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');

    // Permissions
    permRegexes.forEach(regex => {
        let match;
        while ((match = regex.exec(content)) !== null) {
            const key = match[1];
            usedPermissions.add(key);
            if (!canonicalKeys.has(key)) {
                invalidPermissionsFound.push({ file: path.relative(path.join(__dirname, '..'), file), key });
            }
        }
    });

    // Fields
    fieldRegexes.forEach(regex => {
        let match;
        while ((match = regex.exec(content)) !== null) {
            const key = match[1];
            usedFieldPermissions.add(key);
            if (!canonicalFieldKeys.has(key)) {
                invalidFieldsFound.push({ file: path.relative(path.join(__dirname, '..'), file), key });
            }
        }
    });
});

console.log(`\nUsed Permission Keys in Codebase: ${usedPermissions.size}`);
console.log(`Invalid Permission Keys Found: ${invalidPermissionsFound.length}`);
if (invalidPermissionsFound.length > 0) {
    console.log('Invalid Permission Keys:', invalidPermissionsFound);
}

console.log(`\nUsed Field Keys in Codebase: ${usedFieldPermissions.size}`);
console.log(`Invalid Field Keys Found: ${invalidFieldsFound.length}`);
if (invalidFieldsFound.length > 0) {
    console.log('Invalid Field Keys:', invalidFieldsFound);
}

// Unused canonical permissions
const unusedPerms = [...canonicalKeys].filter(k => !usedPermissions.has(k));
console.log(`\nCanonical Permissions Not Directly Hardcoded in Routes/Templates: ${unusedPerms.length}`);
console.log(unusedPerms.slice(0, 15));
