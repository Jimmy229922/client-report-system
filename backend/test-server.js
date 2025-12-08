/**
 * Test script to diagnose server startup issues
 * Run: node test-server.js
 */

console.log('=== Server Diagnostic Test ===\n');

// Step 1: Check config.json
console.log('[1/5] Checking config.json...');
let config;
try {
    config = require('./config.json');
    console.log('  ✓ config.json loaded successfully');
    console.log('  - SERVER_URL:', config.SERVER_URL || 'NOT SET');
    console.log('  - MONGODB_URI:', config.MONGODB_URI ? 'SET' : 'NOT SET');
    console.log('  - PORT:', config.PORT || 'NOT SET');
    console.log('  - TELEGRAM_DISABLED:', config.TELEGRAM_DISABLED);
} catch (e) {
    console.log('  ✗ ERROR: Cannot load config.json');
    console.log('  Error:', e.message);
    process.exit(1);
}

// Step 2: Check MongoDB connection
console.log('\n[2/5] Testing MongoDB connection...');
const mongoose = require('mongoose');

mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => {
        console.log('  ✓ MongoDB connected successfully');
        
        // Step 3: Test Express
        console.log('\n[3/5] Testing Express...');
        const express = require('express');
        const app = express();
        console.log('  ✓ Express loaded');
        
        // Step 4: Test port binding
        console.log('\n[4/5] Testing port binding...');
        const port = config.PORT || 3001;
        
        const server = app.listen(port, () => {
            console.log(`  ✓ Server started on port ${port}`);
            console.log('\n[5/5] All tests passed!');
            console.log('\n=== DIAGNOSIS ===');
            console.log('Basic server components are working.');
            console.log('The issue might be in:');
            console.log('  1. Telegram bot initialization (if not disabled)');
            console.log('  2. Route definitions');
            console.log('  3. Middleware configuration');
            console.log('\nTry setting TELEGRAM_DISABLED=true in your .env file');
            console.log('\nPress Ctrl+C to exit...');
        });
        
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`  ✗ ERROR: Port ${port} is already in use!`);
                console.log('  Solution: Close other applications using this port or change PORT in .env');
            } else {
                console.log('  ✗ ERROR:', err.message);
            }
            process.exit(1);
        });
    })
    .catch((err) => {
        console.log('  ✗ ERROR: MongoDB connection failed');
        console.log('  Error:', err.message);
        console.log('\n=== DIAGNOSIS ===');
        console.log('MongoDB is not accessible. Make sure:');
        console.log('  1. MongoDB is running (check start-mongodb.bat)');
        console.log('  2. MONGODB_URI in .env is correct');
        console.log('  3. No firewall blocking port 27017');
        process.exit(1);
    });

// Timeout after 30 seconds
setTimeout(() => {
    console.log('\n  ✗ TIMEOUT: Server took too long to start');
    console.log('  This usually means MongoDB connection is hanging.');
    process.exit(1);
}, 30000);
