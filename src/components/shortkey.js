import { callScanLead } from './scanLeadBridge';

window.addEventListener('keydown', (e) => {
    const url = window.location.href;

    if (e.key === 'Enter') {
        if (url.includes('documentSearch')) {
            e.preventDefault();
            e.stopImmediatePropagation(); // ✅ website ke native Status handler ko rok do
            const btn = document.getElementById('documentSearch');
            if (btn) {
                btn.click();
                console.log('✅ Enter pressed — URL: documentSearch -> Documents button clicked');
            }
        } else if (url.includes('statusSearch')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const btn = document.getElementById('statusSearch');
            if (btn) {
                btn.click();
                console.log('✅ Enter pressed — URL: statusSearch -> Status button clicked');
            }
        }
        return;
    }

    // ✅ Alt key -> scanLead function ko seedha import karke call karo (DOM click() nahi)
    if (e.key === 'Alt') {
        if (e.repeat) return; // Alt dabakar rakhne par baar baar fire na ho

        // 👉 Yahan baad mein condition add karni hai (e.g. url check, ya kisi state check)
        // if (someCondition) { return; }

        e.preventDefault();
        e.stopImmediatePropagation();
        callScanLead();
        console.log('✅ Alt pressed — scanLead function call hua');
        return;
    }
    // ✅ Agar koi match nahi -> website ka apna default behavior chalne do
}, true); // ✅ true = capture phase, native listener se pehle execute hoga