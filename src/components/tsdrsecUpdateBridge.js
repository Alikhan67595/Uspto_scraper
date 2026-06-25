// ============================================
// tsdrsecUpdateBridge.js
// scanLeadBridge.js jaisa hi pattern — TsdrsecWidget ke
// performUpdate() calls ko register karta hai taake
// shortkey.js unhe seedha call kar sake (DOM click() nahi).
//
// Isse widget hidden (isHide = true) ho tab bhi shortcuts
// kaam karte hain, kyunki function reference already
// register ho chuka hota hai — sirf UI render nahi ho rahi.
// ============================================

let updateAllFn    = null;
let updateNameFn   = null;
let updatePhoneFn  = null;

export const registerTsdrsecUpdaters = ({ updateAll, updateName, updatePhone }) => {
    updateAllFn   = updateAll;
    updateNameFn  = updateName;
    updatePhoneFn = updatePhone;
};

export const unregisterTsdrsecUpdaters = () => {
    updateAllFn   = null;
    updateNameFn  = null;
    updatePhoneFn = null;
};

export const callUpdateAll   = () => { if (updateAllFn)   updateAllFn(); };
export const callUpdateName  = () => { if (updateNameFn)  updateNameFn(); };
export const callUpdatePhone = () => { if (updatePhoneFn) updatePhoneFn(); };
