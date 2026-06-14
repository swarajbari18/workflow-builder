import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// React Flow triggers ResizeObserver notifications when many nodes re-render
// simultaneously (e.g. after a DAG parse stamps roles on all nodes at once).
// This is benign — the browser simply couldn't deliver all resize notifications
// in one animation frame and will catch up on the next. CRA's dev overlay
// treats it as a fatal error and blanks the screen. Suppress it here before
// the CRA error handler sees it. Has zero effect in production builds.
window.addEventListener('error', (e) => {
  if (e.message === 'ResizeObserver loop completed with undelivered notifications.') {
    e.stopImmediatePropagation();
    // Also remove the CRA overlay if it managed to mount before we intercepted.
    const overlay = document.getElementById('webpack-dev-server-client-overlay');
    if (overlay) overlay.remove();
  }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
