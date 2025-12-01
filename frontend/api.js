// This file centralizes API calls

export async function fetchWithAuth(url, options = {}, raw = false) {
    const controller = new AbortController();
    // Use a custom timeout from options, or default to 60 seconds (increased for image loading)
    const timeoutDuration = options.timeout || 60000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

    const token = localStorage.getItem('token');
    const headers = { ...options.headers, 'ngrok-skip-browser-warning': 'true' }; // إضافة header لتجنب ngrok warnings
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
            
            const statusErrorMap = {
                409: "هذا العنصر موجود بالفعل (Conflict).",
                403: "صلاحية الوصول مرفوضة.",
                404: "العنصر المطلوب غير موجود."
            };
            const errorTranslations = {
                "This identifier already exists.": "هذا التبليغ (IP أو الإيميل) موجود بالفعل.",
                "Failed to authenticate token.": "فشل التحقق من الجلسة. حاول تسجيل الدخول مرة أخرى.",
                "No token provided.": "لم يتم توفير رمز الجلسة."
            };

            // Try to parse the error response as JSON
            try {
                const errorData = await response.json();
                // If the server provides a specific message, use it.
                if (errorData && errorData.message) {
                    // Translate the message if a translation exists, otherwise use the original message.
                    const translatedMessage = errorTranslations[errorData.message] || errorData.message;
                    throw new Error(translatedMessage);
                }
            } catch (e) { /* Not a JSON response, fall through to generic error */ }

            // Fallback to status code mapping if JSON parsing fails or message is not present
            const fallbackMessage = statusErrorMap[response.status] || `خطأ في الشبكة: ${response.status} ${response.statusText}`;
            throw new Error(fallbackMessage);
        }

        // Handle successful but empty responses (e.g., HTTP 204 No Content)
        if (response.status === 204) {
            return {}; // Return an empty object or null as appropriate for your app logic
        }

        if (raw) {
            // في raw mode: أعد الـ response الخام دون parse (للـ blob أو text في الـ caller)
            return response;
        }

        // If the response is OK and not raw, we expect JSON.
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