const fs = require('fs');
const path = require('path');

// This script is called by start-server.bat to update the config with the ngrok URL.

const configPath = path.join(__dirname, 'config.json');

async function updateConfigWithNgrokUrl() {
    try {
        // ngrok exposes a local API to get tunnel information.
        const response = await fetch('http://127.0.0.1:4040/api/tunnels');
        if (!response.ok) {
            throw new Error(`ngrok API returned status: ${response.status}`);
        }

        const data = await response.json();
        const httpsTunnel = data.tunnels.find(t => t.proto === 'https');

        if (!httpsTunnel || !httpsTunnel.public_url) {
            console.error('[ngrok-updater] ERROR: Could not find an HTTPS tunnel from ngrok. The server will use the local IP.');
            return;
        }

        const publicUrl = httpsTunnel.public_url;

        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configContent);
            config.SERVER_URL = publicUrl;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log(`[ngrok-updater] SUCCESS: Server URL updated to: ${publicUrl}`);
        }
    } catch (error) {
        console.error(`[ngrok-updater] ERROR: Failed to fetch ngrok URL. Make sure ngrok is running. Error: ${error.message}`);
    }
}

updateConfigWithNgrokUrl();