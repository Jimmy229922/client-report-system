const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const os = require('os');

/**
 * Finds the primary local IPv4 address of the machine.
 * @returns {string} The local IP address or 'localhost' as a fallback.
 */
function getIpAddress() {
    let preferredIp = null;
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                // Prefer private network IPs (like 192.168.x.x) over others.
                if (iface.address.startsWith('192.168.')) {
                    return iface.address; // Found the best option, return immediately.
                }
                // If it's not a 192.168 address, keep it as a potential candidate.
                if (!preferredIp) {
                    preferredIp = iface.address;
                }
            }
        }
    }
    return preferredIp || 'localhost'; // Return the preferred IP, or fallback to localhost.
}

/**
 * Parses a .env file content into a key-value object.
 * @param {string} content - The content of the .env file.
 * @returns {object} The parsed configuration object.
 */
function parseEnv(content) {
    const config = {};
    const lines = content.split('\n');
    for (const line of lines) {
        if (line.trim() && !line.startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            const value = valueParts.join('=').trim();
            // Remove surrounding quotes if they exist
            if (value.startsWith('"') && value.endsWith('"')) {
                config[key.trim()] = value.slice(1, -1);
            } else {
                config[key.trim()] = value;
            }
        }
    }
    return config;
}

/**
 * Ensures that secret files are listed in .gitignore.
 */
function ensureGitignore() {
    const gitignorePath = path.join(__dirname, '..', '.gitignore');
    const gitignoreEntries = [
        '\n# Secret configuration files',
        'backend/config.json',
        'backend/.env'
    ];

    try {
        if (fs.existsSync(gitignorePath)) {
            const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
            let needsUpdate = false;
            if (!gitignoreContent.includes('backend/config.json')) {
                fs.appendFileSync(gitignorePath, `\n${gitignoreEntries[1]}`);
                needsUpdate = true;
            }
            if (!gitignoreContent.includes('backend/.env')) {
                fs.appendFileSync(gitignorePath, `\n${gitignoreEntries[2]}`);
                needsUpdate = true;
            }
            if (needsUpdate) {
                console.log('\x1b[32m%s\x1b[0m', '✓ Updated .gitignore to keep your keys safe.');
            }
        } else {
            fs.writeFileSync(gitignorePath, gitignoreEntries.join('\n').trim());
            console.log('\x1b[32m%s\x1b[0m', '✓ Created .gitignore and added secret files to it.');
        }
    } catch (e) {
        console.warn('\n\x1b[33m%s\x1b[0m', 'Warning: Could not automatically update .gitignore. Please manually add `backend/config.json` and `backend/.env` to your .gitignore file.');
    }
}

async function setup() {
    console.log('\n--- INZO System Configuration ---');
    const envPath = path.join(__dirname, '.env');

    // If .env doesn't exist, create it from the example file and abort.
    if (!fs.existsSync(envPath)) {
        const exampleContent = `
# Telegram Bot Configuration
BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
CHAT_ID="YOUR_TELEGRAM_CHAT_ID"

    # Optional: disable Telegram integration for local setups
    # Set to true to skip bot initialization and avoid errors
    TELEGRAM_DISABLED=true

# MongoDB Database Configuration
MONGODB_URI="mongodb://127.0.0.1:27017/client-report-system"

# Default Admin Account
ADMIN_EMAIL="admin@inzo.com"
ADMIN_PASSWORD="inzo123"

# Server Port (Optional, defaults to 3001)
PORT=3001
`;
        fs.writeFileSync(envPath, exampleContent.trim());
        console.log('\n\x1b[33m%s\x1b[0m', '⚠️ WARNING: `.env` file was not found, so a new one has been created.');
        console.log('Please open `backend/.env`, fill in your details, and run this setup again.');
        return; // Abort setup
    }

    console.log('✓ Found `.env` file. Generating `config.json`...');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envConfig = parseEnv(envContent);

    // Determine whether Telegram is disabled for this environment
    const telegramDisabled = String(envConfig.TELEGRAM_DISABLED || '').toLowerCase() === 'true';

    // Validate required keys (Telegram keys are required only when not disabled)
    const requiredKeys = ['MONGODB_URI', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'].concat(
        telegramDisabled ? [] : ['BOT_TOKEN', 'CHAT_ID']
    );
    const missingKeys = requiredKeys.filter(key => !envConfig[key] || envConfig[key] === `YOUR_${key}`);
    if (missingKeys.length > 0) {
        console.error('\n\x1b[31m%s\x1b[0m', `❌ ERROR: The following keys are missing or not set in your \`backend/.env\` file: ${missingKeys.join(', ')}`);
        console.log('Please fill in the required values and run the setup again.');
        return;
    }

    const port = envConfig.PORT || 3001;
    const localIp = getIpAddress();

    // Build the final configuration object
    const finalConfig = {
        ...envConfig,
        SERVER_URL: `http://${localIp}:${port}`,
        JWT_SECRET: crypto.randomBytes(32).toString('hex'),
        PORT: parseInt(port, 10),
        TELEGRAM_DISABLED: telegramDisabled || (!envConfig.BOT_TOKEN || !envConfig.CHAT_ID)
    };

    fs.writeFileSync('config.json', JSON.stringify(finalConfig, null, 2));
    console.log('\n\x1b[32m%s\x1b[0m', '✅ Configuration complete! `config.json` has been generated.');
    console.log(`   - Server URL set to: ${finalConfig.SERVER_URL}`);
    console.log('   - A new secure JWT_SECRET has been generated.');

    ensureGitignore();
}

setup();