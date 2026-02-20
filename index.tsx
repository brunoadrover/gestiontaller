
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

console.log("GEyT App starting...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <div style={{ position: 'fixed', top: 0, left: 0, background: 'white', color: 'black', padding: '4px', fontSize: '10px', zIndex: 9999 }}>
      Debug: React Mounted
    </div>
    <App />
  </React.StrictMode>
);
