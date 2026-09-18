import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/i18n';
import App from '@/App';
import '@/index.css';

// Global error handler for unhandled promise rejections (often fetch errors)
window.addEventListener('unhandledrejection', (event) => {
  console.warn('Unhandled promise rejection:', event.reason);
  // Prevent the default handler if necessary, though usually logging is enough
  // event.preventDefault(); 
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);
