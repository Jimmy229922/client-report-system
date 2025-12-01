import { fetchWithAuth } from './api.js';
import { showSpecialIpWarningModal } from './app.js';
import { showToast } from './ui.js';

let specialIdentifiers = [];

/**
 * Fetches the list of special identifiers from the server and stores them.
 */
export async function loadSpecialIdentifiers() {
    try {
        const response = await fetchWithAuth('/api/special-identifiers/list');
        specialIdentifiers = response.data || [];
    } catch (error) {
        console.error('Failed to load special identifiers:', error);
        specialIdentifiers = []; // Reset on failure
    }
}

/**
 * Checks a given value (IP or email) against the loaded list of special identifiers.
 * If a match is found, it displays the special warning modal.
 * @param {string} value - The IP address or email to check.
 * @param {'ip'|'email'} type - The type of the value being checked.
 */
export function checkSpecialIdentifier(value, type) {
    if (!value || specialIdentifiers.length === 0) {
        return;
    }

    const trimmedValue = value.trim().toLowerCase();

    const found = specialIdentifiers.find(item => 
        item.type === type && item.identifier.toLowerCase() === trimmedValue
    );

    if (found) {
        // Use the message from the database
        showSpecialIpWarningModal(found.message);
    }
}

/**
 * Listens for real-time updates and reloads the identifiers.
 */
export function listenForSpecialIdentifierUpdates() {
    document.addEventListener('specialIdentifiersUpdated', async () => {
        console.log('[Special Identifiers] Update event received. Reloading list...');
        await loadSpecialIdentifiers();
        showToast('تم تحديث قائمة التبليغات الخاصة.');
    });
}