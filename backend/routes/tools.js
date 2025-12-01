const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');

module.exports = (verifyToken) => {
    /**
     * @route   POST /api/tools/filter-data
     * @desc    Processes raw text to find and sort unique account-IP pairs
     * @access  Private
     */
    router.post('/filter-data', verifyToken, (req, res) => {
        try {
            const { text } = req.body;

            if (!text || typeof text !== 'string' || !text.trim()) {
                return res.status(400).json({ msg: 'Input text is required.' });
            }

            // New, more stable approach to avoid catastrophic backtracking
            const accountRegex = /\b(\d{7})\b/g;
            const ipRegex = /((?:\d{1,3}\.){3}\d{1,3})/g;

            const accounts = [];
            const ips = [];
            let match;

            // 1. Find all accounts and their positions
            while ((match = accountRegex.exec(text)) !== null) {
                accounts.push({ value: match[1], index: match.index });
            }

            // 2. Find all IPs and their positions
            while ((match = ipRegex.exec(text)) !== null) {
                ips.push({ value: match[1], index: match.index });
            }

            // 3. Pair each account with the nearest subsequent IP
            const uniquePairs = new Set();
            accounts.forEach(account => {
                // Find the first IP that appears after the account
                const closestIp = ips.find(ip => ip.index > account.index);

                if (closestIp) {
                    // To ensure we don't pair an account with an IP that belongs to a later account,
                    // check if there's another account between this account and the found IP.
                    const nextAccount = accounts.find(nextAcc => nextAcc.index > account.index && nextAcc.index < closestIp.index);
                    if (!nextAccount) {
                        uniquePairs.add(`${account.value} - ${closestIp.value}`);
                    }
                }
            });

            const sortedPairs = Array.from(uniquePairs).sort();
            res.json({ uniquePairs: sortedPairs });

        } catch (error) {
            console.error('Error in /filter-data:', error);
            res.status(500).send('Server Error');
        }
    });

    /**
     * @route   POST /api/tools/update-system
     * @desc    Triggers system update from GitHub
     * @access  Private (Admin only recommended)
     */
    router.post('/update-system', verifyToken, (req, res) => {
        try {
            const projectRoot = path.resolve(__dirname, '..', '..');
            const updateScript = path.join(projectRoot, 'update-system.bat');

            // Execute the update script in detached mode
            exec(`start "" "${updateScript}"`, { cwd: projectRoot }, (error) => {
                if (error) {
                    console.error('Failed to trigger update script:', error);
                    return res.status(500).json({ message: 'فشل تشغيل سكربت التحديث.' });
                }
            });

            // Respond immediately
            res.json({ message: 'تم بدء عملية التحديث. سيتم إعادة تشغيل السيرفر تلقائياً.' });

        } catch (error) {
            console.error('Error in /update-system:', error);
            res.status(500).json({ message: 'حدث خطأ أثناء التحديث.' });
        }
    });

    return router;
};