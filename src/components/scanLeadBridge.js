// ✅ Bridge module
// ScanButton.jsx (React component) apna `scanLead` function yahan register karta hai.
// Koi bhi plain script (jaise shortkey.js), jo React tree ke bahar hai, isay
// seedha import karke call kar sakti hai — DOM se button dhoondne/click() karne
// ki zaroorat nahi rehti.

let scanLeadHandler = null;

// ScanButton.jsx mount hote waqt apna scanLead yahan register karega
export const registerScanLead = (fn) => {
    scanLeadHandler = fn;
};

// ScanButton.jsx unmount hote waqt cleanup
export const unregisterScanLead = () => {
    scanLeadHandler = null;
};

// Bahar se (shortkey.js se) scanLead ko call karne ka tareeqa
export const callScanLead = () => {
    if (typeof scanLeadHandler === 'function') {
        scanLeadHandler();
        return true;
    }
    return false;
};