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

// Signatory Name nikalna.
// Label kuch bhi ho sakta hai: "SIGNATORY NAME" / "SIGNATORY'S NAME" /
// "Signatory's name" / "Signatory name" — sab match ho jayenge.
const extractSignatoryName = () => {
    const bodyText = document.body.innerText;
    const raw = bodyText.match(/Signatory(?:['’]s)?\s+Name\s*[:\t]\s*([^\n\t]+)/i)?.[1];
    if (!raw) return "";
    return raw.replace(/\s+/g, " ").trim();
};

// Phone Number nikalna.
// Pehle "Signatory's Phone Number" / "Signatory Phone Number" try karo.
// Agar woh na mile to "Primary telephone number" ko fallback ke taur par use karo.
const extractPhone = () => {
    const bodyText = document.body.innerText;

    let segment = bodyText.match(/Signatory(?:['’]s)?\s+Phone\s+Number\s*[:\t]\s*([^\n]+)/i)?.[1];

    if (!segment) {
        segment = bodyText.match(/Primary\s+telephone\s+number\s*[:\t]\s*([^\n]+)/i)?.[1];
    }

    if (!segment) return "";

    const match = segment.match(/(?:1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/);
    if (!match) return "";

    const phone = match[0].trim();

    if (phone.replace(/\D/g, "").length < 10) return "";

    return phone;
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

const FIELD_LABELS = { correspondent: 'Correspondent', phone: 'Phone' };

let toastIdCounter = 0;

const TsdrsecWidget = () => {
    const [isHide, setIsHide] = useState(false);
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
    useEffect(() => {
        chrome.storage.local.get(['isHide'], (res) => {
            setIsHide(res.isHide ?? false);
        });

        const syncHide = (changes, area) => {
            if (area !== 'local') return;
            if (changes.isHide) setIsHide(changes.isHide.newValue ?? false);
        };

        chrome.storage.onChanged.addListener(syncHide);
        return () => chrome.storage.onChanged.removeListener(syncHide);
    }, []);

    const performUpdate = (fields) => {
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
                const phone = extractPhone();
                if (phone) updates.phone = phone;
                else notFound.push('Phone Number');
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
            updateAll:   () => performUpdate(['correspondent', 'phone']),
            updateName:  () => performUpdate(['correspondent']),
            updatePhone: () => performUpdate(['phone']),
        });
        return () => unregisterTsdrsecUpdaters();
    });

    if (isHide) return null;

    return (
        <>
            <div style={panelStyle}>
                <div style={titleStyle}>Signatory Updater</div>

                <button
                    style={btnStyle('#27ae60')}
                    disabled={busy}
                    onClick={() => performUpdate(['correspondent', 'phone'])}
                >
                    Update All
                </button>

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
            </div>

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

const titleStyle = {
    color: '#fff',
    fontSize: '12px',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '4px',
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