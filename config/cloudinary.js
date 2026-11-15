const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const isConfigured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

if (isConfigured) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
        api_key: process.env.CLOUDINARY_API_KEY.trim(),
        api_secret: process.env.CLOUDINARY_API_SECRET.trim(),
        secure: true
    });
}

const CLOUDINARY_FOLDER = 'shivay_energy';

/**
 * Upload a file Buffer directly to Cloudinary into the 'shivay_energy' folder
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - Upload options (fileId, mimeType, category, originalName)
 * @returns {Promise<Object>} Cloudinary upload result
 */
function uploadBufferToCloudinary(buffer, options = {}) {
    return new Promise((resolve, reject) => {
        if (!isConfigured) {
            return reject(new Error('Cloudinary credentials not configured.'));
        }

        const isImage = options.mimeType && options.mimeType.startsWith('image/');
        const resourceType = isImage ? 'image' : 'auto';

        const uploadOptions = {
            folder: CLOUDINARY_FOLDER,
            resource_type: resourceType,
            public_id: options.fileId || undefined,
            tags: ['shivay_energy', options.category || 'document']
        };

        const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
            if (error) {
                return reject(error);
            }
            resolve(result);
        });

        stream.end(buffer);
    });
}

module.exports = {
    cloudinary,
    isConfigured,
    CLOUDINARY_FOLDER,
    uploadBufferToCloudinary
};
