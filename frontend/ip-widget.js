// Helper function to delay execution after user stops typing
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// API 1: ip-api.com (returns JSON)
async function fetchCountryFromIpApi(ip) {
    // Note: The free endpoint for ip-api.com is HTTP. This is fine for localhost.
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,message`);
    if (!response.ok) {
        throw new Error('ip-api.com network response was not ok');
    }
    const data = await response.json();
    if (data.status === 'fail') {
        throw new Error(data.message || 'Invalid IP address according to ip-api.com');
    }
    return data.country;
}

// API 2 (Fallback): ipapi.co (returns plain text)
async function fetchCountryFromIpapiCo(ip) {
    const response = await fetch(`https://ipapi.co/${ip}/country_name/`);
    if (!response.ok) {
        throw new Error('ipapi.co network response was not ok');
    }
    const countryName = await response.text();
    // ipapi.co returns a page with the word "error" on failure
    if (countryName.toLowerCase().includes('error') || countryName.toLowerCase().includes('reserved range')) {
        throw new Error(countryName);
    }
    return countryName;
}

// --- Self-attaching logic ---

// We use a global variable to avoid re-attaching listeners to the same element.
let lastIpInputHandled = null;

function setupIpWidget() {
    const ipInput = document.getElementById('ip-input');
    const countryOutput = document.getElementById('country-output');

    if (!ipInput || !countryOutput) {
        // This is expected if the current page doesn't have the IP widget.
        return;
    }

    // If we've already attached a listener to this specific element, do nothing.
    // This prevents issues if the observer fires multiple times for the same page load.
    if (lastIpInputHandled === ipInput) {
        return;
    }

    const debouncedIpCheck = debounce(async (e) => {
        const ip = e.target.value.trim();

        // Simple regex to validate IP format
        if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
            countryOutput.textContent = '';
            return;
        }

        countryOutput.textContent = 'جاري البحث...';

        try {
            // Try the primary API
            const country = await fetchCountryFromIpApi(ip);
            countryOutput.textContent = country || 'غير معروف';
        } catch (error1) {
            console.warn('Primary API (ip-api.com) failed:', error1.message);
            console.log('Trying fallback API (ipapi.co)...');
            try {
                // If the first fails, try the fallback API
                const country = await fetchCountryFromIpapiCo(ip);
                countryOutput.textContent = country || 'غير معروف';
            } catch (error2) {
                console.error('Fallback API (ipapi.co) also failed:', error2.message);
                countryOutput.textContent = 'فشل البحث';
            }
        }
    }, 500); // 500ms delay after user stops typing

    ipInput.addEventListener('input', debouncedIpCheck);
    lastIpInputHandled = ipInput; // Remember the element we've handled.
    console.log('IP to Country widget initialized on new element.');
}

// Use a MutationObserver to watch for page changes inside #main-content.
// This is more robust than assuming when a page will be rendered.
document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.getElementById('main-content');
    
    if (mainContent) {
        const observer = new MutationObserver(() => {
            // When content changes, check if the IP widget is present and set it up.
            setupIpWidget();
        });

        // Start observing the target node for child node changes.
        observer.observe(mainContent, { childList: true, subtree: true });
        
        // Also run it once initially in case the first page has the widget.
        setupIpWidget();
    }
});
