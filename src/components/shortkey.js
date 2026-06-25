import { callScanLead } from './scanLeadBridge';
import { callUpdateAll, callUpdateName, callUpdatePhone } from './tsdrsecUpdateBridge';

window.addEventListener('keydown', (e) => {
    const url = window.location.href;
    const isTsdrsecPage = window.location.hostname.includes('tsdrsec.uspto.gov');

    // ── tsdrsec.uspto.gov: Ctrl + Enter -> Update Name ──
    if (isTsdrsecPage && e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        callUpdateName();
        console.log('✅ Ctrl+Enter pressed — tsdrsec -> Update Name');
        return;
    }

    // ── tsdrsec.uspto.gov: Ctrl + Shift -> Update Phone ──
    // (Ctrl alag se kuch trigger nahi karta, sirf Shift ke saath combo)
    if (isTsdrsecPage && e.key === 'Shift' && e.ctrlKey) {
        if (e.repeat) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        callUpdatePhone();
        console.log('✅ Ctrl+Shift pressed — tsdrsec -> Update Phone');
        return;
    }

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

    // ✅ Alt key (akela) -> tsdrsec page par Update All, baaki pages par scanLead
    if (e.key === 'Alt') {
        if (e.repeat) return; // Alt dabakar rakhne par baar baar fire na ho

        e.preventDefault();
        e.stopImmediatePropagation();

        if (isTsdrsecPage) {
            callUpdateAll(); // ✅ widget hidden ho tab bhi chalega — bridge se direct call
            console.log('✅ Alt pressed — tsdrsec -> Update All');
        } else {
            callScanLead(); // ✅ scanLeadBridge se seedha import karke call karo (DOM click() nahi)
            console.log('✅ Alt pressed — Scan Lead');
        }

        return;
    }
    // ✅ Agar koi match nahi -> website ka apna default behavior chalne do
}, true); // ✅ true = capture phase, native listener se pehle execute hoga