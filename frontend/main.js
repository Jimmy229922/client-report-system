import { checkAuth, handleLogin } from './auth.js';
import { initApp } from './app.js';

document.addEventListener('DOMContentLoaded', async () => {
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const loader = document.getElementById('loader');

    // Attach login form handler
    handleLogin();

    // Check authentication status
    if (checkAuth()) {
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        try {
            await initApp(); // Initialize the main application, which includes starting SSE
        } catch (error) {
            console.error("Failed to initialize the application:", error);
            // Optionally show an error message to the user
        }
    } else {
        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
        loader.classList.add('hidden'); // Hide loader to show login form
    }
});