const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

async function setup() {
  console.log('\n--- Client Report System Setup ---');
  console.log('Please provide your Telegram Bot details.');
  console.log('You can get these from @BotFather on Telegram.');
  console.log('-------------------------------------\n');

  const botToken = await question('Enter your BOT_TOKEN: ');
  if (!botToken || !botToken.trim()) {
    console.error('\nError: BOT_TOKEN is required. Setup aborted.');
    rl.close();
    return;
  }

  const chatId = await question('Enter your CHAT_ID (the ID of the group or channel): ');
  if (!chatId || !chatId.trim()) {
    console.error('\nError: CHAT_ID is required. Setup aborted.');
    rl.close();
    return;
  }

  const jwtSecret = crypto.randomBytes(32).toString('hex');

  const envContent = `BOT_TOKEN=${botToken.trim()}\nCHAT_ID=${chatId.trim()}\nJWT_SECRET=${jwtSecret}`;

  try {
    fs.writeFileSync('.env', envContent);
    console.log('\n\n\x1b[32m%s\x1b[0m', '✅ Setup complete! .env file created successfully.'); // Green text
    console.log('You can now run "start-server.bat" to start the application.');
  } catch (error) {
    console.error('\n\n\x1b[31m%s\x1b[0m', '❌ Failed to create .env file:', error); // Red text
  } finally {
    rl.close();
  }
}

setup();