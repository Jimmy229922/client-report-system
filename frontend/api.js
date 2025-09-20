// This file centralizes API calls

export async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401 || response.status === 403) {
        const errorData = await response.json().catch(() => ({ message: 'فشل المصادقة. الرجاء تسجيل الدخول مرة أخرى.' }));

        // On 403 (Forbidden), the user is authenticated but not authorized.
        // We should show the specific error message instead of logging them out.
        if (response.status === 403) {
            throw new Error(errorData.message || 'صلاحية الوصول مرفوضة.');
        }

        // On 401 (Unauthorized), the token is invalid/expired, so we force a logout.
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        location.reload();
        throw new Error(errorData.message);
    }

    return response;
}