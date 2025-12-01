/**
 * Migration Script: Update Legacy Image URLs to GridFS Format
 * 
 * This script updates all old image URLs stored in the database from the legacy
 * filesystem format (/uploads/reports/...) to the new GridFS format (/api/files/...).
 * 
 * Usage: node migrate-image-urls.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load configuration
let config;
try {
    config = require('./config.json');
} catch (error) {
    console.error('ERROR: Cannot find config.json. Please ensure it exists.');
    process.exit(1);
}

// Define Report Schema (must match your actual schema)
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

async function migrateImageUrls() {
    console.log('\n🔄 Starting Image URL Migration...\n');

    try {
        // Connect to MongoDB
        console.log('📡 Connecting to MongoDB...');
        await mongoose.connect(config.MONGODB_URI);
        console.log('✓ Connected to MongoDB successfully.\n');

        // Get the Report model
        const Report = mongoose.model('Report', reportSchema);

        // Find all reports with image_urls
        console.log('🔍 Finding reports with images...');
        const reportsWithImages = await Report.find({ 
            image_urls: { $exists: true, $not: { $size: 0 } } 
        });

        console.log(`📊 Found ${reportsWithImages.length} reports with images.\n`);

        if (reportsWithImages.length === 0) {
            console.log('✓ No reports to migrate. All done!');
            await mongoose.disconnect();
            return;
        }

        let updatedCount = 0;
        let skippedCount = 0;

        // Process each report
        for (const report of reportsWithImages) {
            let needsUpdate = false;
            const newImageUrls = report.image_urls.map(url => {
                // Check if URL is in old format (contains /uploads/)
                if (url.includes('/uploads/')) {
                    needsUpdate = true;
                    
                    // Extract just the filename from the URL
                    // Handle both absolute URLs (with domain) and relative URLs
                    let filename;
                    
                    try {
                        // Try parsing as URL first (for absolute URLs)
                        const urlObj = new URL(url);
                        filename = path.basename(urlObj.pathname);
                    } catch (e) {
                        // If it fails, treat as relative path
                        filename = path.basename(url);
                    }
                    
                    // Return the new GridFS format
                    const newUrl = `/api/files/${filename}`;
                    console.log(`  🔄 Converting: ${url}`);
                    console.log(`     ➜ To: ${newUrl}`);
                    return newUrl;
                }
                
                // URL is already in new format, keep it
                return url;
            });

            if (needsUpdate) {
                // Update the report with new URLs
                report.image_urls = newImageUrls;
                await report.save();
                updatedCount++;
                console.log(`  ✓ Updated report ID: ${report._id}\n`);
            } else {
                skippedCount++;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📈 Migration Summary:');
        console.log('='.repeat(60));
        console.log(`✓ Total reports processed: ${reportsWithImages.length}`);
        console.log(`✓ Reports updated: ${updatedCount}`);
        console.log(`⊘ Reports skipped (already migrated): ${skippedCount}`);
        console.log('='.repeat(60) + '\n');

        if (updatedCount > 0) {
            console.log('🎉 Migration completed successfully!');
            console.log('💡 Tip: You can now reload your application to see the updated image URLs.\n');
        } else {
            console.log('✓ All image URLs are already in the correct format. No changes needed.\n');
        }

    } catch (error) {
        console.error('\n❌ Migration failed with error:');
        console.error(error);
        console.error('\nPlease check the error above and try again.');
    } finally {
        // Disconnect from MongoDB
        await mongoose.disconnect();
        console.log('📡 Disconnected from MongoDB.\n');
    }
}

// Run the migration
migrateImageUrls().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
