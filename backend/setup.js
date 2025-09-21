const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');
const path = require('path');

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

  const chatId = await question('Enter your Telegram CHAT_ID (the ID of the group or channel): ');
  if (!chatId || !chatId.trim()) {
    console.error('\nError: CHAT_ID is required. Setup aborted.');
    rl.close();
    return;
  }

  console.log('\n--- Supabase Details ---');
  console.log('You can get these from your Supabase project API settings.');
  console.log('------------------------\n');

  const supabaseUrl = await question('Enter your Supabase Project URL: ');
  if (!supabaseUrl || !supabaseUrl.trim()) {
    console.error('\nError: Supabase URL is required. Setup aborted.');
    rl.close();
    return;
  }

  console.log('\nIMPORTANT: For the backend to work correctly, you must use the "service_role" key.');
  console.log('You can find this in your Supabase project under: Settings > API > Project API keys');
  const supabaseKey = await question('Enter your Supabase service_role Key: ');
  if (!supabaseKey || !supabaseKey.trim()) {
    console.error('\nError: Supabase service_role Key is required. Setup aborted.');
    rl.close();
    return;
  }

  const jwtSecret = crypto.randomBytes(32).toString('hex');

  const config = {
    BOT_TOKEN: botToken.trim(),
    CHAT_ID: chatId.trim(),
    JWT_SECRET: jwtSecret,
    SUPABASE_URL: supabaseUrl.trim(),
    SUPABASE_KEY: supabaseKey.trim()
  };

  const configContent = JSON.stringify(config, null, 2);

  try {
    fs.writeFileSync('config.json', configContent);
    console.log('\n\n\x1b[32m%s\x1b[0m', '✅ Configuration complete! `config.json` file created successfully.');

    // Ensure config.json is in .gitignore
    const gitignorePath = path.join(__dirname, '..', '.gitignore');
    const gitignoreEntry = '\n# Secret configuration file\nbackend/config.json\n';
    try {
        if (fs.existsSync(gitignorePath)) {
            if (!fs.readFileSync(gitignorePath, 'utf8').includes('backend/config.json')) {
                fs.appendFileSync(gitignorePath, gitignoreEntry);
                console.log('\x1b[32m%s\x1b[0m', '✓ Added `backend/config.json` to .gitignore to keep your keys safe.');
            }
        } else {
            fs.writeFileSync(gitignorePath, gitignoreEntry.trim());
            console.log('\x1b[32m%s\x1b[0m', '✓ Created .gitignore and added `backend/config.json` to keep your keys safe.');
        }
    } catch (e) {
        console.warn('\n\x1b[33m%s\x1b[0m', 'Warning: Could not automatically update .gitignore. Please manually add `backend/config.json` to your .gitignore file.');
    }

    console.log('\n--- Deployment Instructions ---');
    console.log('1. Make sure this project is on a private GitHub repository.');
    console.log('2. You can now share the GitHub repository link with your employees.');
    console.log('3. They can download the project and run `start-server.bat` to begin the setup on their machine.');
  } catch (error) {
    console.error('\n\n\x1b[31m%s\x1b[0m', '❌ Failed to create config.json file:', error); // Red text
  } finally {
    rl.close();
  }
}

setup();