import { useEffect, useState } from 'react';
import { registerTsdrsecUpdaters, unregisterTsdrsecUpdaters } from './tsdrsecUpdateBridge.js';

// ─────────────────────────────────────────────────────────────────
// Yeh widget SIRF https://tsdrsec.uspto.gov/* par inject hota hai
// (manifest.json mein content_scripts ka "matches" field dekhein)
// ─────────────────────────────────────────────────────────────────

// URL se Serial Number nikalna.
// Serial hamesha "sn" ke baad aata hai, "/" ya "=" se pehle. e.g:
//   .../casedoc/sn98931039/FTK.../webcontent          -> sn98931039
//   .../pageproxy?url=...&caseid=sn99247208           -> sn99247208
const SERIAL_URL_REGEX = /[/=]sn(\d+)/i;

const getSerialFromUrl = () => {
    const match = window.location.href.match(SERIAL_URL_REGEX);
    return match ? match[1] : null;
};

// Placeholder values (e.g. "NOT PROVIDED", "N/A", "NONE", "XXXX") ko reject
// karne ke liye — yeh kabhi bhi real data ke taur par save nahi hone chahiye.
const PLACEHOLDER_REGEX = /^(not\s*provided|n\/?a|none|x{2,})$/i;

// Signatory Name nikalna.
// Label kuch bhi ho sakta hai: "SIGNATORY NAME" / "SIGNATORY'S NAME" /
// "Signatory's name" / "Signatory name" — sab match ho jayenge.
const extractSignatoryName = () => {
    const bodyText = document.body.innerText;
    const raw = bodyText.match(/Signatory(?:['’]s)?\s+Name\s*[:\t]\s*([^\n\t]+)/i)?.[1];
    if (!raw) return "";

    const cleaned = raw.replace(/\s+/g, " ").trim();
    if (!cleaned || PLACEHOLDER_REGEX.test(cleaned)) return "";

    return cleaned;
};

// Phone Number nikalna.
// Pehle "Signatory's Phone Number" / "Signatory Phone Number" try karo.
// Agar woh na mile to "Primary telephone number" ko fallback ke taur par use karo.

// ── USA-only phone validation ───────────────────────────────
// Sirf USA number chahiye:
//   - 10 digits (bina country code) → valid
//   - 11 digits jo "1" se start hon (US country code) → valid, leading 1 hata do
//   - koi bhi aur case (dusra country code jaisa +86/+91, 11 digits jo 1 se
//     start na hon, 12+ digits, masked "XXX-XXX-XXXX", waghera) → INVALID
// ── Toll-free prefixes reject karne ke liye — ye office/business lines hoti
// hain, kisi individual ka personal number nahi, isliye lead ke liye bekaar
const TOLL_FREE_PREFIXES = ['800', '833', '844', '855', '866', '877', '888'];

const extractValidPhoneFromSegment = (segment) => {
    if (!segment) return "";
    // sirf pehli line lo — baad ki lines mein address/fax ka data nahi ana chahiye
    const firstLine = segment.trim().split("\n")[0].trim();
    if (!firstLine || PLACEHOLDER_REGEX.test(firstLine)) return "";

    // ✅ Layer 1: "(" wale area code ko anchor bana ke sirf wahi block nikalo —
    // extension chahe number se PEHLE ho ("101ext1-(336) 757-1222") ya BAAD mein
    // ("1-(336) 757-1222x101"), extension ke digits mein kabhi literal "(" nahi
    // hota isliye ye pattern khud hi extension ko ignore kar deta hai
    const parenMatch = firstLine.match(/(1[-.\s]?)?\(\d{3}\)[-.\s]*\d{3}[-.\s]*\d{4}/);

    let digitsOnly;
    if (parenMatch) {
        // ✅ Match se pehle jo bhi text hai usko check karo — agar usme digit
        // hai lekin wo extension marker (x101, ext101) nahi hai, to ye kisi
        // FOREIGN country code ka hissa hai (e.g. "86-1 (566) 905-6568" is
        // actually a China +86 number, "1 (566)..." sirf coincidence se US
        // jaisa dikh raha hai) — reject karo
        const beforeMatch = firstLine.slice(0, parenMatch.index);
        const isExtensionPrefix = /\d+\s*(?:x|ext\.?|extension)\.?\s*$/i.test(beforeMatch);
        if (/\d/.test(beforeMatch) && !isExtensionPrefix) {
            return ""; // foreign country code prefix — reject
        }
        digitsOnly = parenMatch[0].replace(/\D/g, "");
    } else {
        // ✅ Layer 2: fallback jab "(" na ho — extension ko line ke start ya
        // end se strip karo, phir jo bache us se digits nikalo
        const noExt = firstLine
            .replace(/^\s*\d{1,8}\s*(?:x|ext\.?|extension)\.?\s*/i, "")
            .replace(/\s*(?:x|ext\.?|extension)\.?\s*\d{1,8}\s*$/i, "");
        digitsOnly = noExt.replace(/\D/g, "");
    }

    let tenDigits = "";
    if (digitsOnly.length === 10) {
        tenDigits = digitsOnly;
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
        tenDigits = digitsOnly.slice(1);
    } else {
        return ""; // invalid — wrong country code, extension, ya galat digit count
    }

    if (TOLL_FREE_PREFIXES.includes(tenDigits.slice(0, 3))) {
        return ""; // toll-free — reject
    }

    return `${tenDigits.slice(0, 3)}-${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
};

// Returns { phone, invalidFound } — invalidFound true hota hai jab koi
// label mila aur usmein digits bhi thay, magar wo USA format mein fit
// nahi hue (dusra country code, galat digit count, waghera).
const extractPhone = () => {
    const bodyText = document.body.innerText;
    let sawDigitsButInvalid = false;

    const tryLabel = (regex) => {
        const segment = bodyText.match(regex)?.[1];
        if (!segment) return "";
        const phone = extractValidPhoneFromSegment(segment);
        if (!phone) {
            const digits = segment.trim().split("\n")[0].replace(/\D/g, "");
            if (digits.length > 0) sawDigitsButInvalid = true;
        }
        return phone;
    };

    // 1) "Signatory's Phone Number" — USPTO yahan aksar number ko
    //    "XXX-XXX-XXXX" se mask kar deta hai, isliye match milne ke
    //    bawajood digits na ho to agle label par fall through karte hain.
    let phone = tryLabel(/Signatory(?:['’]s)?\s+Phone\s+Number\s*[:\t]\s*([^\n]+)/i);
    if (phone) return { phone, invalidFound: false };

    // 2) "Primary telephone number"
    phone = tryLabel(/Primary\s+telephone\s+number\s*[:\t]\s*([^\n]+)/i);
    if (phone) return { phone, invalidFound: false };

    // 3) Section 8/9 (aur waisi hi TEAS filing receipt) pages par "Signatory's
    //    Phone Number" / "Primary telephone number" jaisa koi label nahi hota —
    //    sirf "OWNER SECTION (current)" ke neeche plain "PHONE" label hota hai.
    //    \bPHONE\b isliye "TELEPHONE" jaise words ke beech match nahi karega,
    //    aur "FAX" ko bhi touch nahi karega kyunke wo alag label hai.
    phone = tryLabel(/\bPHONE\b\s*[:\t]?\s*([^\n]+)/i);
    if (phone) return { phone, invalidFound: false };

    return { phone: "", invalidFound: sawDigitsButInvalid };
};

// Email nikalna.
// Label har form mein alag ho sakta hai — "Primary correspondence email address",
// "Secondary correspondence email address", "Courtesy copy email addresses",
// "PRIMARY EMAIL ADDRESS FOR CORRESPONDENCE", ya sirf "Email" — isliye koi fix
// label match nahi karte, balki jis line mein "email" word ho usi line se
// email pattern uthate hain. "*EMAIL ADDRESS\tXXXX" (owner ka masked email) ya
// "NOT PROVIDED" wali lines apne aap skip ho jati hain kyunki unmein valid
// @ pattern hota hi nahi.
// Blacklist: notifications/info/tmapp/uspto/trademark wali emails reject —
// (ScanButton.jsx ka EMAIL_BLACKLIST jaisa hi rule)
const EMAIL_BLACKLIST = /notifications|info|tmapp|uspto|trademark/i;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/i;

const extractEmail = () => {
    const bodyText = document.body.innerText;
    const lines = bodyText.split("\n");

    for (const line of lines) {
        if (!/email/i.test(line)) continue;

        const match = line.match(EMAIL_REGEX);
        if (match && !EMAIL_BLACKLIST.test(match[0])) {
            return match[0];
        }
    }
    return "";
};

// Tamam leads_* keys (valid + missing, har type) mein se serial dhoondna.
const findLeadBySerial = (serial, callback) => {
    chrome.storage.local.get(null, (all) => {
        const keys = Object.keys(all).filter(
            (k) => k.startsWith('leads_') && Array.isArray(all[k])
        );

        for (const key of keys) {
            const index = all[key].findIndex((l) => l.serial === serial);
            if (index !== -1) {
                callback({ key, index, leads: all[key] });
                return;
            }
        }
        callback(null);
    });
};

// Updated lead ko save karna.
// Agar lead "leads_missing_<type>" array mein tha aur update ke baad
// phone non-empty ho gaya hai, to use missing array se hata kar
// "leads_<type>" (valid) array mein move kar do.
const MISSING_PREFIX = 'leads_missing_';

const saveUpdatedLead = (result, updatedLead, callback) => {
    const sourceKey = result.key;
    const isFromMissing = sourceKey.startsWith(MISSING_PREFIX);
    const hasPhoneNow = !!updatedLead.phone;

    if (isFromMissing && hasPhoneNow) {
        const validKey = sourceKey.replace(MISSING_PREFIX, 'leads_');
        const remainingMissing = result.leads.filter((_, i) => i !== result.index);

        chrome.storage.local.get([validKey], (res) => {
            const validLeads = (res[validKey] || []).filter((l) => l.serial !== updatedLead.serial);
            const updatedValid = [...validLeads, updatedLead];

            chrome.storage.local.set(
                { [sourceKey]: remainingMissing, [validKey]: updatedValid },
                () => callback({ moved: true })
            );
        });
        return;
    }

    const updatedLeads = [...result.leads];
    updatedLeads[result.index] = updatedLead;
    chrome.storage.local.set({ [sourceKey]: updatedLeads }, () => callback({ moved: false }));
};

const FIELD_LABELS = { correspondent: 'Correspondent', phone: 'Phone', email: 'Email' };

// ── Toggle arrow icons (panel collapse/expand ke liye) ──
const ChevronUpIcon = () => (
    <svg viewBox="0 0 1024 1024" width="12" height="12" fill="currentColor">
        <path d="M8.2 751.4c0 8.6 3.4 17.401 10 24.001 13.2 13.2 34.8 13.2 48 0l451.8-451.8 445.2 445.2c13.2 13.2 34.8 13.2 48 0s13.2-34.8 0-48L542 251.401c-13.2-13.2-34.8-13.2-48 0l-475.8 475.8c-6.8 6.8-10 15.4-10 24.2z" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg viewBox="0 0 1024 1024" width="12" height="12" fill="currentColor">
        <path d="M8.2 275.4c0-8.6 3.4-17.401 10-24.001 13.2-13.2 34.8-13.2 48 0l451.8 451.8 445.2-445.2c13.2-13.2 34.8-13.2 48 0s13.2 34.8 0 48L542 775.399c-13.2 13.2-34.8 13.2-48 0l-475.8-475.8c-6.8-6.8-10-15.4-10-24.199z" />
    </svg>
);

let toastIdCounter = 0;

const TsdrsecWidget = () => {
    const [isHide, setIsHide] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [toasts, setToasts] = useState([]);

    // ── Toast helper — har message ab YAHAN se show hoga, widget panel mein nahi ──
    const showToast = (msg, color) => {
        const id = ++toastIdCounter;
        setToasts((prev) => [...prev, { id, msg, color, fading: false }]);

        // 2.5s baad fade out shuru, 2.85s baad DOM se hata do
        setTimeout(() => {
            setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, fading: true } : t)));
        }, 2500);

        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 2850);
    };

    // ── isHide ko ScanButton ke same storage key se sync karna ──
    // ── isOpen (panel expanded/collapsed) bhi yahin se load + sync hota hai ──
    useEffect(() => {
        chrome.storage.local.get(['isHide', 'isOpen'], (res) => {
            setIsHide(res.isHide ?? false);
            setIsOpen(res.isOpen === 'true');
        });

        const syncHide = (changes, area) => {
            if (area !== 'local') return;
            if (changes.isHide) setIsHide(changes.isHide.newValue ?? false);
            if (changes.isOpen) setIsOpen(changes.isOpen.newValue === 'true');
        };

        chrome.storage.onChanged.addListener(syncHide);
        return () => chrome.storage.onChanged.removeListener(syncHide);
    }, []);

    // ── Down/Up arrow dabane par panel expand/collapse, value local storage mein save ──
    const toggleOpen = () => {
        const newVal = !isOpen;
        setIsOpen(newVal);
        chrome.storage.local.set({ isOpen: newVal ? 'true' : 'false' });
    };

    const performUpdate = async (fields) => {
        if (busy) return;
        setBusy(true);

        const serial = getSerialFromUrl();
        if (!serial) {
            showToast('❌ Serial not found', '#ff4d4d');
            setBusy(false);
            return;
        }

        findLeadBySerial(serial, (result) => {
            if (!result) {
                showToast(`ℹ️ Serial ${serial} doesn't exist in the dashboard`, '#3498db');
                setBusy(false);
                return;
            }

            const updates = {};
            const notFound = [];

            if (fields.includes('correspondent')) {
                const name = extractSignatoryName();
                if (name) updates.correspondent = name;
                else notFound.push('Signatory Name');
            }

            if (fields.includes('phone')) {
                const { phone, invalidFound } = extractPhone();
                if (phone) updates.phone = phone;
                else notFound.push(invalidFound ? 'Phone Number (Invalid — non-USA/format)' : 'Phone Number');
            }

            if (fields.includes('email')) {
                const email = extractEmail();
                if (email) updates.email = email;
                else notFound.push('Email');
            }

            if (Object.keys(updates).length === 0) {
                showToast(`❌ ${notFound.join(' & ')} not found on page`, '#ff4d4d');
                setBusy(false);
                return;
            }

            const updatedLead = { ...result.leads[result.index], ...updates };

            saveUpdatedLead(result, updatedLead, ({ moved }) => {
                const updatedLabel = Object.keys(updates).map((k) => FIELD_LABELS[k]).join(' & ');
                let msg = `✅ ${updatedLabel} Updated!`;
                if (moved) msg += ' → Moved to Valid';
                if (notFound.length) msg += ` (${notFound.join(' & ')} not found)`;

                showToast(msg, '#4caf50');
                setBusy(false);
            });
        });
    };

    // ── Shortcut bridge: widget hidden ho tab bhi shortkey.js se ──
    // ── seedha performUpdate call ho sake (DOM click() nahi) ──
    useEffect(() => {
        registerTsdrsecUpdaters({
            updateAll:   () => performUpdate(['correspondent', 'phone', 'email']),
            updateName:  () => performUpdate(['correspondent']),
            updatePhone: () => performUpdate(['phone']),
            updateEmail: () => performUpdate(['email']),
        });
        return () => unregisterTsdrsecUpdaters();
    });

    return (
        <>
            {!isHide && (
                <div style={panelStyle}>
                    <div style={headerStyle}>
                        <span>Lead Data Updater</span>
                        <button
                            style={toggleBtnStyle}
                            onClick={toggleOpen}
                            aria-label={isOpen ? 'Collapse' : 'Expand'}
                        >
                            {isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                        </button>
                    </div>

                    <button
                        style={btnStyle('#27ae60')}
                        disabled={busy}
                        onClick={() => performUpdate(['correspondent', 'phone', 'email'])}
                    >
                        Update All
                    </button>

                    {isOpen && (
                        <>
                            <button
                                style={btnStyle('#2980b9')}
                                disabled={busy}
                                onClick={() => performUpdate(['phone'])}
                            >
                                Update Phone
                            </button>

                            <button
                                style={btnStyle('#8e44ad')}
                                disabled={busy}
                                onClick={() => performUpdate(['correspondent'])}
                            >
                                Update Name
                            </button>

                            <button
                                style={btnStyle('#d35400')}
                                disabled={busy}
                                onClick={() => performUpdate(['email'])}
                            >
                                Update Email
                            </button>
                        </>
                    )}
                </div>
            )}

            <div style={toastContainerStyle}>
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        style={{
                            ...toastStyle,
                            borderLeft: `4px solid ${t.color}`,
                            opacity: t.fading ? 0 : 1,
                        }}
                    >
                        {t.msg}
                    </div>
                ))}
            </div>
        </>
    );
};

const panelStyle = {
    position: 'fixed',
    top: '300px',
    left: '5px',
    zIndex: 9999999,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px',
    background: '#1e1e1e',
    borderRadius: '10px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
    width: '150px',
    fontFamily: 'sans-serif',
};

const headerStyle = {
    color: '#fff',
    fontSize: '12px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '2px',
};

const btnStyle = (bg) => ({
    padding: '6px 10px',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
});

const toggleBtnStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    padding: '0',
    margin: '0',
    flexShrink: 0,
    lineHeight: 0,
    background: 'transparent',
    border: 'none',
    color: '#aaa',
    cursor: 'pointer',
};

const toastContainerStyle = {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 9999999,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none',
};

const toastStyle = {
    background: '#1e1e1e',
    color: '#fff',
    padding: '18px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    // fontWeight: 'semi-bold',
    fontFamily: 'sans-serif',
    boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
    minWidth: '220px',
    transition: 'opacity 0.3s ease',
};

export default TsdrsecWidget;