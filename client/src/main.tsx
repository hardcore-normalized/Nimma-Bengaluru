import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/nunito/index.css';
import '@fontsource/caveat-brush/latin-400.css';
import '@fontsource/patrick-hand/latin-400.css';
import './styles/base.css';
import App from './App';

// A running tab can outlive a deployment and still request a removed hashed
// chunk. Refresh once so it picks up the current index.html and asset names.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    const key = 'nb:last-stale-asset-refresh';
    const now = Date.now();
    const last = Number(sessionStorage.getItem(key) || 0);
    if (now - last < 15_000) return;
    sessionStorage.setItem(key, String(now));
  } catch {
    // Storage can be disabled; a single refresh is still useful.
  }
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
