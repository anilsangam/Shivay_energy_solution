const path = require('path');
const crypto = require('crypto');
const { isConfigured, uploadBufferToCloudinary, CLOUDINARY_FOLDER } = require('../config/cloudinary');

// Allowed File Specifications
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_UPLOADS = 5;

/**
 * Validate buffer magic bytes against expected file signatures
 */
function validateMagicBytes(buffer, declaredMime) {
    if (!buffer || buffer.length < 8) return false;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return declaredMime === 'image/jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
        return declaredMime === 'image/png';
    }

    // PDF: %PDF (25 50 44 46)
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        return declaredMime === 'application/pdf';
    }

    // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return declaredMime === 'image/webp';
    }

    return false;
}

class UploadService {
    /**
     * Validate buffer magic bytes against expected file signatures
     */
    static validateMagicBytes(buffer, declaredMime) {
        return validateMagicBytes(buffer, declaredMime);
    }

    /**
     * Process and upload file directly to Cloudinary (shivay_energy folder).
     * Strictly cloud-only: never writes to local server storage/disk.
     */
    static async processUpload(fileObj) {
        if (!fileObj) throw new Error('No file provided.');

        let { name, type, data, category } = fileObj;
        if (!data || !name || !type) {
            throw new Error('Incomplete upload data: filename, mimeType, and data are required.');
        }

        // Clean & sanitize filename and extension
        const originalName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
        const ext = path.extname(originalName).toLowerCase();
        const mimeType = type.toLowerCase().trim();

        if (!ALLOWED_EXTENSIONS.has(ext)) {
            throw new Error(`Invalid file extension "${ext}". Allowed: JPG, PNG, WEBP, PDF.`);
        }

        if (!ALLOWED_MIME_TYPES.has(mimeType)) {
            throw new Error(`Unsupported MIME type "${mimeType}".`);
        }

        // Decode buffer
        let buffer;
        if (Buffer.isBuffer(data)) {
            buffer = data;
        } else if (typeof data === 'string') {
            const base64Index = data.indexOf(';base64,');
            const cleanBase64 = base64Index !== -1 ? data.slice(base64Index + 8) : data;
            buffer = Buffer.from(cleanBase64, 'base64');
        } else {
            throw new Error('Invalid file payload.');
        }

        // Check size
        if (buffer.length > MAX_FILE_SIZE) {
            throw new Error(`File "${originalName}" exceeds the 5 MB maximum size limit.`);
        }

        // Validate Magic Bytes
        const isValidMagic = validateMagicBytes(buffer, mimeType);
        if (!isValidMagic) {
            throw new Error(`Security validation failed: File "${originalName}" content does not match declared format.`);
        }

        // Enforce Cloudinary configuration - strictly no local file writes
        if (!isConfigured) {
            throw new Error('Cloud storage configuration missing: Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) must be set in .env. Local storage is disabled.');
        }

        // Generate unguessable random storage identifier
        const fileId = crypto.randomUUID();
        const storageFilename = `${fileId}${ext}`;

        // Upload directly to Cloudinary under folder 'shivay_energy'
        let cloudRes;
        try {
            cloudRes = await uploadBufferToCloudinary(buffer, {
                fileId,
                mimeType,
                category: category || 'document',
                originalName
            });
        } catch (cloudErr) {
            console.error('[UploadService] Cloudinary upload error:', cloudErr.message);
            throw new Error(`Cloudinary upload failed: ${cloudErr.message}`);
        }

        if (!cloudRes || !cloudRes.secure_url) {
            throw new Error('Cloudinary did not return a valid asset URL.');
        }

        return {
            fileId,
            filename: storageFilename,
            originalName,
            mimeType,
            size: buffer.length,
            sizeBytes: buffer.length,
            path: cloudRes.secure_url,
            url: cloudRes.secure_url,
            cloudinaryUrl: cloudRes.secure_url,
            cloudinaryPublicId: cloudRes.public_id,
            category: category || 'OTHER',
            uploadedAt: new Date()
        };
    }

    /**
     * Process an array of uploaded files with maximum limit
     */
    static async processUploads(files) {
        if (!Array.isArray(files) || files.length === 0) return [];
        if (files.length > MAX_UPLOADS) {
            throw new Error(`Maximum ${MAX_UPLOADS} attachments allowed per request.`);
        }
        const results = [];
        for (const f of files) {
            results.push(await this.processUpload(f));
        }
        return results;
    }

    /**
     * Get path/URL for secure file access (Cloudinary direct redirect)
     */
    static getFilePath(fileId, storedPath) {
        if (storedPath && typeof storedPath === 'string' && (storedPath.startsWith('http://') || storedPath.startsWith('https://'))) {
            return storedPath;
        }
        return null;
    }
}

module.exports = UploadService;
