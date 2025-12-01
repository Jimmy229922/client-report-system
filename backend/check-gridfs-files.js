/**
 * Diagnostic Script: Check GridFS Files and Database Image URLs
 * 
 * This script helps diagnose image loading issues by:
 * 1. Listing all files currently stored in GridFS
 * 2. Listing all image URLs referenced in the database
 * 3. Identifying missing files (URLs in DB but not in GridFS)
 * 
 * Usage: node check-gridfs-files.js
 */

const mongoose = require('mongoose');
const Grid = require('gridfs-stream');

// Load configuration
let config;
try {
    config = require('./config.json');
} catch (error) {
    console.error('ERROR: Cannot find config.json. Please ensure it exists.');
    process.exit(1);
}

// Define Report Schema
const reportSchema = new mongoose.Schema({
    report_text: { type: String, required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, default: Date.now },
    type: { 
        type: String, 
        enum: ['suspicious', 'credit-out', 'payouts', 'PAYOUTS', 'deposit_percentages', 'new-positions', 'account_transfer'], 
        required: true 
    },
    image_urls: { type: [String], default: [] },
    is_resolved: { type: Boolean, default: false },
    resolution_notes: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

async function checkGridFSAndDatabase() {
    console.log('\n🔍 Starting GridFS and Database Diagnostic...\n');

    try {
        // Connect to MongoDB
        console.log('📡 Connecting to MongoDB...');
        const conn = await mongoose.createConnection(config.MONGODB_URI).asPromise();
        console.log('✓ Connected to MongoDB successfully.\n');

        // Initialize GridFS
        const gridfsBucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'uploads' });
        const gfs = Grid(conn.db, mongoose.mongo);
        gfs.collection('uploads');

        const Report = conn.model('Report', reportSchema);

        // === PART 1: List all files in GridFS ===
        console.log('=' .repeat(70));
        console.log('📂 FILES IN GRIDFS:');
        console.log('='.repeat(70));

        const gridfsFiles = await gridfsBucket.find({}).toArray();
        
        if (gridfsFiles.length === 0) {
            console.log('❌ No files found in GridFS!');
            console.log('💡 This means all old images need to be re-uploaded or migrated.\n');
        } else {
            console.log(`✓ Found ${gridfsFiles.length} file(s) in GridFS:\n`);
            gridfsFiles.forEach((file, index) => {
                console.log(`  ${index + 1}. ${file.filename}`);
                console.log(`     - Content Type: ${file.contentType}`);
                console.log(`     - Size: ${(file.length / 1024).toFixed(2)} KB`);
                console.log(`     - Upload Date: ${file.uploadDate}`);
                console.log('');
            });
        }

        const gridfsFilenames = new Set(gridfsFiles.map(f => f.filename));

        // === PART 2: List all image URLs in Reports ===
        console.log('=' .repeat(70));
        console.log('🗄️  IMAGE URLS IN DATABASE:');
        console.log('='.repeat(70));

        const reportsWithImages = await Report.find({ 
            image_urls: { $exists: true, $not: { $size: 0 } } 
        }).select('_id image_urls').lean();

        if (reportsWithImages.length === 0) {
            console.log('✓ No reports with images found in database.\n');
        } else {
            console.log(`✓ Found ${reportsWithImages.length} report(s) with images:\n`);
            
            const allImageUrls = [];
            reportsWithImages.forEach(report => {
                report.image_urls.forEach(url => allImageUrls.push({ reportId: report._id, url }));
            });

            console.log(`📊 Total image URLs: ${allImageUrls.length}\n`);
            
            allImageUrls.forEach((item, index) => {
                console.log(`  ${index + 1}. Report ID: ${item.reportId}`);
                console.log(`     URL: ${item.url}`);
            });
            console.log('');
        }

        // === PART 3: Find Missing Files ===
        console.log('=' .repeat(70));
        console.log('🔎 CHECKING FOR MISSING FILES:');
        console.log('='.repeat(70));

        const missingFiles = [];
        const foundFiles = [];

        for (const report of reportsWithImages) {
            for (const url of report.image_urls) {
                // Extract filename from URL
                let filename = '';
                
                // Handle different URL formats
                if (url.startsWith('/api/files/')) {
                    // New format: /api/files/filename.png
                    filename = url.replace('/api/files/', '');
                } else if (url.includes('/uploads/')) {
                    // Old format: https://domain.com/uploads/reports/filename.png or /uploads/reports/filename.png
                    const parts = url.split('/');
                    filename = parts[parts.length - 1];
                } else {
                    // Unknown format
                    filename = url;
                }

                // Check if file exists in GridFS
                if (gridfsFilenames.has(filename)) {
                    foundFiles.push({ reportId: report._id, url, filename });
                } else {
                    missingFiles.push({ reportId: report._id, url, filename });
                }
            }
        }

        if (missingFiles.length === 0) {
            console.log('✅ All image URLs have corresponding files in GridFS!\n');
        } else {
            console.log(`⚠️  Found ${missingFiles.length} missing file(s):\n`);
            missingFiles.forEach((item, index) => {
                console.log(`  ${index + 1}. Report ID: ${item.reportId}`);
                console.log(`     URL: ${item.url}`);
                console.log(`     Expected Filename: ${item.filename}`);
                console.log(`     ❌ File NOT found in GridFS\n`);
            });
        }

        if (foundFiles.length > 0) {
            console.log(`✅ Found ${foundFiles.length} file(s) that exist in GridFS:\n`);
            foundFiles.forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.filename} ✓`);
            });
            console.log('');
        }

        // === SUMMARY ===
        console.log('=' .repeat(70));
        console.log('📊 SUMMARY:');
        console.log('='.repeat(70));
        console.log(`Total GridFS Files: ${gridfsFiles.length}`);
        console.log(`Total Image URLs in DB: ${reportsWithImages.reduce((sum, r) => sum + r.image_urls.length, 0)}`);
        console.log(`Files Found: ${foundFiles.length} ✅`);
        console.log(`Files Missing: ${missingFiles.length} ${missingFiles.length > 0 ? '⚠️' : '✅'}`);
        console.log('='.repeat(70));

        if (missingFiles.length > 0) {
            console.log('\n💡 RECOMMENDATION:');
            console.log('Some image files are missing from GridFS. You have two options:');
            console.log('1. Re-upload the missing images through the application');
            console.log('2. Delete the reports with missing images if they are no longer needed');
            console.log('3. Check if the old files still exist in /backend/public/uploads/ and migrate them\n');
        } else if (reportsWithImages.length > 0) {
            console.log('\n✅ All image files are present in GridFS!');
            console.log('If images are still not loading, the issue might be with:');
            console.log('- Network connectivity (ngrok timeout)');
            console.log('- Frontend fetch timeouts (already increased to 120s)');
            console.log('- CORS or ngrok headers\n');
        }

        await conn.close();
        console.log('📡 Disconnected from MongoDB.\n');

    } catch (error) {
        console.error('\n❌ Diagnostic failed with error:');
        console.error(error);
        console.error('\nPlease check the error above and try again.');
    }
}

// Run the diagnostic
checkGridFSAndDatabase().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
