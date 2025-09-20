export function initQuickIpModal() {
    const openBtn = document.getElementById('quick-ip-check-btn');
    const modal = document.getElementById('quick-ip-modal');
    const closeBtn = document.getElementById('quick-ip-modal-close-btn');
    const ipInput = document.getElementById('quick-ip-input');
    const resultDiv = document.getElementById('quick-ip-result');

    if (!openBtn || !modal || !closeBtn || !ipInput || !resultDiv) {
        console.warn('Quick IP Modal elements not found.');
        return;
    }

    const openModal = () => {
        modal.style.display = 'flex';
        setTimeout(() => ipInput.focus(), 50); // Focus after transition
    };

    const closeModal = () => {
        modal.style.display = 'none';
        ipInput.value = '';
        resultDiv.style.display = 'none';
    };

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    ipInput.addEventListener('input', () => {
        const ip = ipInput.value.trim();

        if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
            resultDiv.style.display = 'none';
            return;
        }

        resultDiv.style.display = 'flex';

        // Use the globally available ipToCountry function from the library
        const countryCode = window.ipToCountry.lookup(ip);

        if (countryCode) {
            const regionNames = new Intl.DisplayNames(['ar'], { type: 'region' });
            const countryName = regionNames.of(countryCode) || countryCode;
            resultDiv.innerHTML = `
                <img src="https://flagcdn.com/w40/${countryCode.toLowerCase()}.png" alt="${countryCode}" style="margin-bottom: 0.5rem;">
                ${countryName}
            `;
        } else {
            resultDiv.innerHTML = 'غير معروف';
        }
    });

    ipInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}