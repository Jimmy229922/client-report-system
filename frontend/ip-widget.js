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

function setupIpWidget() {
    const ipInput = document.getElementById('ip-input');
    const countryOutput = document.getElementById('country-output');

    if (!ipInput || !countryOutput) {
        console.log('IP widget elements not found on this page.');
        return;
    }

    ipInput.addEventListener('input', debounce(async (e) => {
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
    }, 500)); // 500ms delay after user stops typing
}
