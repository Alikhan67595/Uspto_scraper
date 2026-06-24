chrome.runtime.onInstalled.addListener(() => {
    const DEFAULT_TYPE = 'deadAbandoned';
    chrome.storage.local.get(['savedType', 'isHide'], (res) => {
        if (!res.savedType) {
            chrome.storage.local.set({ savedType: DEFAULT_TYPE });
            console.log('Default type set:', DEFAULT_TYPE);
        }
        // ✅ isHide bhi yahan se hi initialize ho jaye gi, taake har jagah
        // (Footer.jsx, ScanButton.jsx) ek hi default state se shuru ho
        if (res.isHide === undefined) {
            chrome.storage.local.set({ isHide: false });
            console.log('Default isHide set: false');
        }
    });
});