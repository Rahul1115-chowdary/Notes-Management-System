/**
 * ========================================================
 * NOTES MANAGEMENT SYSTEM - FRONTEND CONFIGURATION
 * ========================================================
 * 
 * Set your live backend API URL below (e.g. from Render or Railway).
 * If left empty (""), the app automatically auto-detects:
 * 1. Saved URL in localStorage ('nova_api_base')
 * 2. Same-domain origin (when frontend & backend run together, e.g., on Vercel)
 * 3. http://localhost:5000 (when running locally)
 */

window.APP_CONFIG = {
  // 👉 Live Render backend URL:
  BACKEND_URL: "https://notes-management-backend-h087.onrender.com",

  // Default credentials for one-click demo login
  DEMO_EMAIL: "demo@novanotes.ai",
  DEMO_PASSWORD: "password123"
};

/**
 * Helper to determine the active backend API URL
 */
function getEffectiveApiBase() {
  // 1. Manually specified BACKEND_URL in config.js
  if (window.APP_CONFIG && typeof window.APP_CONFIG.BACKEND_URL === 'string' && window.APP_CONFIG.BACKEND_URL.trim() !== '') {
    return window.APP_CONFIG.BACKEND_URL.trim().replace(/\/$/, '');
  }

  // 2. Custom backend saved in browser LocalStorage
  const savedApi = localStorage.getItem('nova_api_base');
  if (savedApi && savedApi.trim() !== '') {
    return savedApi.trim().replace(/\/$/, '');
  }

  // 3. Same-domain origin (e.g. full-stack Vercel or full-stack Render)
  if (window.location.origin && window.location.origin.startsWith('http')) {
    return window.location.origin;
  }

  // 4. Default local development server
  return 'http://localhost:5000';
}
