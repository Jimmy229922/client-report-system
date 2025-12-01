const DEFAULT_RETRYABLE_CODES = new Set([
    'ETIMEDOUT',
    'ECONNRESET',
    'EAI_AGAIN',
    'ENOTFOUND',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH'
]);

const RETRYABLE_MESSAGE_PATTERNS = [/timeout/i, /timed out/i, /429/i];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shouldRetry(error) {
    if (!error) {
        return false;
    }

    if (typeof error.code === 'string' && DEFAULT_RETRYABLE_CODES.has(error.code)) {
        return true;
    }

    const description = (error.response && error.response.description) || error.message;
    if (description) {
        return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(description));
    }

    return false;
}

function createTelegramService(bot, options = {}) {
    const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? options.maxRetries ?? 3));
    const initialDelayMs = Math.max(200, options.initialDelayMs ?? 1200);
    const maxDelayMs = Math.max(initialDelayMs, options.maxDelayMs ?? 5000);
    const backoffFactor = Math.max(1, options.backoffFactor ?? 1.75);

    async function sendWithRetry(label, sendFn) {
        let delay = initialDelayMs;
        let attempt = 0;

        while (attempt < maxAttempts) {
            attempt += 1;
            try {
                return await sendFn();
            } catch (error) {
                const lastAttempt = attempt >= maxAttempts;
                const retryable = shouldRetry(error);
                if (!retryable || lastAttempt) {
                    throw error;
                }

                console.warn(`[Telegram Retry] ${label} failed (attempt ${attempt}/${maxAttempts}): ${error.message}. Retrying in ${delay}ms.`);
                await sleep(delay);
                delay = Math.min(Math.round(delay * backoffFactor), maxDelayMs);
            }
        }
    }

    return {
        sendPhoto: (chatId, payload, extra) => sendWithRetry('sendPhoto', () => bot.telegram.sendPhoto(chatId, payload, extra)),
        sendMediaGroup: (chatId, mediaGroup, extra) => sendWithRetry('sendMediaGroup', () => bot.telegram.sendMediaGroup(chatId, mediaGroup, extra)),
        sendMessage: (chatId, text, extra) => sendWithRetry('sendMessage', () => bot.telegram.sendMessage(chatId, text, extra))
    };
}

module.exports = createTelegramService;
