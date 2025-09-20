// This file centralizes API calls

export async function fetchWithAuth(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20-second timeout

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

        if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            location.reload();
            throw new Error('انتهت صلاحية الجلسة. الرجاء تسجيل الدخول مرة أخرى.');
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const errorText = await response.text();
            throw new Error(`استجابة غير متوقعة من السيرفر (Status: ${response.status}). قد يكون السيرفر متوقفاً.`);
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || `HTTP Error: ${response.status}`);
        }

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