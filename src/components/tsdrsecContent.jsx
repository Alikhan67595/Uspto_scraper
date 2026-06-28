import { createRoot } from 'react-dom/client';
import TsdrsecWidget from './TsdrsecWidget.jsx';
import './shortkey.js'; // ✅ Alt / Ctrl+Enter / Ctrl+Shift / Ctrl+/ shortcuts register karne ke liye

// Yeh content script SIRF https://tsdrsec.uspto.gov/* par chalega
// (manifest.json mein "matches" check karein)

const mountWidget = () => {
    if (document.getElementById('tsdrsec-widget-root')) return;

    const container = document.createElement('div');
    container.id = 'tsdrsec-widget-root';
    document.body.appendChild(container);

    const root = createRoot(container);
    root.render(<TsdrsecWidget />);
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    mountWidget();
} else {
    document.addEventListener('DOMContentLoaded', mountWidget);
}