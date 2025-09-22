// This file centralizes API calls

export async function fetchWithAuth(url, options = {}) {
    const controller = new AbortController();
    // Use a custom timeout from options, or default to 20 seconds
    const timeoutDuration = options.timeout || 20000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

    const token = localStorage.getItem('token');
    const headers = { ...options.headers };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, { 
            ...options,
            headers,
            signal: controller.signal // Pass the abort signal to fetch
        });

        clearTimeout(timeoutId); // Clear the timeout if the request succeeds

        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                location.reload();
                throw new Error('انتهت صلاحية الجلسة. الرجاء تسجيل الدخول مرة أخرى.');
            }
            // Try to parse the error response as JSON. If it fails, it's not a standard API error.
            try {
                const errorData = await response.json();
                const error = new Error(errorData.message || errorData.error || `HTTP Error: ${response.status}`);
                error.data = errorData; // Attach the full payload for more detailed error handling
                throw error;
            } catch (jsonError) {
                // This happens if the server returns HTML (e.g., a 500 error page) instead of JSON.
                console.error("Failed to parse server error response as JSON:", jsonError);
                throw new Error(`استجابة غير متوقعة من السيرفر (Status: ${response.status}). قد يكون هناك خطأ في الخادم.`);
            }
        }

        // If the response is OK, we expect JSON.
        const data = await response.json();
        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('انتهت مهلة الطلب. قد يكون هناك بطء في الشبكة أو مشكلة في السيرفر.');
        }
        // Re-throw other errors
        throw error;
    }
}