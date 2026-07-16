import { useEffect, useState, useRef, useCallback } from 'react'
import { registerScanLead, unregisterScanLead } from './scanLeadBridge.js';
import { openApplicationDoc } from './Application.js';

// ── Toast system (same pattern as TsdrsecWidget) ──────────────────
let toastIdCounter = 0;

const toastContainerStyle = {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 2147483647,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none',
};

const toastStyle = {
    background: '#12161C',
    color: '#E6E8EB',
    padding: '12px 14px',
    borderRadius: '10px',
    fontSize: '13px',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    border: '1px solid #1E232A',
    minWidth: '220px',
    transition: 'opacity 0.3s ease',
};
// ──────────────────────────────────────────────────────────────────

// ── Main widget styles — inline (Tailwind classes purge ho rahe the
// build mein, isliye button/card transparent dikh raha tha) ──────
const wrapStyle = {
    display: 'flex',
    width: '100%',
    flexDirection: 'column',
    gap: '8px',
};

const cardStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    borderRadius: '8px',
    border: '1px solid #1E232A',
    backgroundColor: '#12161C',
    padding: '7px 8px',
};

const typeLabelStyle = {
    textAlign: 'center',
    fontSize: '9px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#8B95A1',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};

const countsRowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
};

const countItemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
};

const dotStyle = {
    height: '6px',
    width: '6px',
    borderRadius: '9999px',
};

const countTextStyle = {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '12px',
    fontWeight: 600,
};

const dividerStyle = {
    height: '14px',
    width: '1px',
    backgroundColor: '#1E232A',
};

const scanButtonStyle = {
    width: '100%',
    cursor: 'pointer',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(to bottom, #E8C46B, #C99A2E)',
    padding: '7px 0',
    fontSize: '13px',
    fontWeight: 700,
    color: '#1A1200',
    boxShadow: '0 2px 0 rgba(0,0,0,0.28)',
    transition: 'transform 0.1s ease, box-shadow 0.1s ease',
};

const statusLineStyle = {
    fontSize: '10.5px',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};
// ──────────────────────────────────────────────────────────────────

const DATE_FIELD = {
    deadAbandoned: { regex: /Date Abandoned:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Date Abandoned" },
    deadCancelled: { regex: /Date Cancelled:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Date Cancelled" },
    livePending:   { regex: /Application Filing Date:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Filing Date" },
    liveRegister:  { regex: /Registration Date:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Registration Date" },
};

const PAGE_STATUS_MAP = {
    deadAbandoned: /DEAD\/APPLICATION/i,
    deadCancelled: /DEAD\/REGISTRATION/i,
    livePending:   /LIVE\/APPLICATION/i,
    liveRegister:  /LIVE\/REGISTRATION/i,
};

const CONFLICT_FIELDS = {
    deadAbandoned: [{ regex: /Date Cancelled:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Date Cancelled" }],
    deadCancelled: [{ regex: /Date Abandoned:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Date Abandoned" }],
    livePending: [
        { regex: /Date Abandoned:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Date Abandoned" },
        { regex: /Date Cancelled:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Date Cancelled" },
        { regex: /Registration Date:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Registration Date" },
    ],
    liveRegister: [
        { regex: /Date Abandoned:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Date Abandoned" },
        { regex: /Date Cancelled:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Date Cancelled" },
    ],
};

const getValidKey   = (type) => `leads_${type}`;
const getMissingKey = (type) => `leads_missing_${type}`;

// ── USA-only phone validation ───────────────────────────────
// Sirf USA number chahiye:
//   - 10 digits (bina country code) → valid
//   - 11 digits jo "1" se start hon (US country code) → valid, leading 1 hata do
//   - koi bhi aur case (dusra country code jaisa +86/+91, 11 digits jo 1 se
//     start na hon, 12+ digits, waghera) → INVALID, empty string return
// ── Toll-free prefixes reject karne ke liye — ye office/business lines hoti
// hain, kisi individual ka personal number nahi, isliye lead ke liye bekaar
const TOLL_FREE_PREFIXES = ['800', '833', '844', '855', '866', '877', '888'];

const extractUSPhone = (segment) => {
    if (!segment) return "";
    // sirf pehli line lo — baad ki lines mein address/fax ka data nahi ana chahiye
    const firstLine = segment.trim().split("\n")[0].trim();
    if (!firstLine) return "";

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

const BADGE_ID = "scan-status-badge";

const updateCaptionBadge = (captionDiv, msg, color) => {
    if (!captionDiv) return;
    let badge = captionDiv.querySelector(`#${BADGE_ID}`);
    if (!badge) {
        badge = document.createElement("span");
        badge.id = BADGE_ID;
        badge.style.marginLeft = "14px";
        badge.style.fontWeight = "bold";
        badge.style.fontSize = "12px";
        badge.style.whiteSpace = "nowrap";
        captionDiv.appendChild(badge);
    }
    badge.style.color = color;
    badge.textContent = msg;
};

const findAttorneyCaptionDiv = (container) => {
    if (!container) return null;
    let found = null;
    container.querySelectorAll(".caption").forEach((cap) => {
        if (cap.textContent.includes("Attorney of Record")) found = cap;
    });
    return found;
};

const ScanButton = () => {
    const [scraperType, setScraperType]     = useState('deadAbandoned');
    const [validCount, setValidCount]       = useState(0);
    const [missingCount, setMissingCount]   = useState(0);
    const [status, setStatus]               = useState({ msg: "Ready", color: "#8B95A1" });
    const [isHide, setIsHide]               = useState(false);
    const [toasts, setToasts]               = useState([]);

    const scraperTypeRef = useRef('deadAbandoned');
    const updateStatus = (msg, color) => setStatus({ msg, color });

    const showToast = (msg, color) => {
        const id = ++toastIdCounter;
        setToasts((prev) => [...prev, { id, msg, color, fading: false }]);
        setTimeout(() => {
            setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, fading: true } : t)));
        }, 2500);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 2850);
    };

    const loadCounts = (type) => {
        chrome.storage.local.get([getValidKey(type), getMissingKey(type)], (res) => {
            setValidCount((res[getValidKey(type)]   || []).length);
            setMissingCount((res[getMissingKey(type)] || []).length);
        });
    };

    const scanLead = useCallback(async () => {
        const currentUrl = window.location.href;

        // ── documentSearch page par hain to Application doc khol do ──
        if (currentUrl.includes('documentSearch')) {
            updateStatus("Opening...", "#8B95A1");
            const result = openApplicationDoc();
            updateStatus(result.message, result.success ? "#34D399" : "#F87171");
            showToast(result.message, result.success ? "#34D399" : "#F87171");
            return;
        }

        // ── statusSearch (ya koi aur) page par normal scan-lead chalega ──
        updateStatus("Scanning...", "#E8C46B");

        let targetSpan = null;
        let attorneyCaptionDiv = null;

        document.querySelectorAll('.expand_heading span').forEach(span => {
            if (span.innerText.includes("Attorney/Correspondence Information")) {
                targetSpan = span;
                const heading = span.closest('.expand_heading');
                if (heading) {
                    const container = heading.nextElementSibling;
                    if (container) {
                        const isHidden = container.classList.contains('hide') ||
                            window.getComputedStyle(container).display === 'none';
                        if (isHidden) {
                            container.style.display = "block";
                            container.classList.remove('hide');
                        }
                        container.scrollIntoView({ behavior: 'instant', block: 'center' });
                        attorneyCaptionDiv = findAttorneyCaptionDiv(container);
                        updateCaptionBadge(attorneyCaptionDiv, "Scanning...", "#999");
                    }
                }
            }
        });

        const selectedType = scraperTypeRef.current;
        const validKey   = getValidKey(selectedType);
        const missingKey = getMissingKey(selectedType);

        chrome.storage.local.get([validKey, missingKey], (leadsRes) => {
            const validLeads   = leadsRes[validKey]   || [];
            const missingLeads = leadsRes[missingKey] || [];
            const bodyText = document.body.innerText;

            // Attorney check
            const isNone = /Attorney of Record\s*-\s*(None|NONE|Pro Se)/i.test(bodyText);
            if (!isNone) {
                updateStatus("❌ Invalid", "#F87171");
                updateCaptionBadge(attorneyCaptionDiv, "❌ Invalid", "#F87171");
                if (targetSpan) targetSpan.style.backgroundColor = "#ffcccc";
                return;
            }

            // Page status match
            const pageStatusMatch = PAGE_STATUS_MAP[selectedType]?.test(bodyText);
            if (!pageStatusMatch) {
                let actualStatus = "unknown";
                for (const [type, regex] of Object.entries(PAGE_STATUS_MAP)) {
                    if (regex.test(bodyText)) { actualStatus = type; break; }
                }
                updateStatus(`❌ Mismatch Lead Type`, "#F87171");
                updateCaptionBadge(attorneyCaptionDiv, "❌ Mismatch Lead Type", "#F87171");
                if (targetSpan) targetSpan.style.backgroundColor = "#ffcccc";
                return;
            }

            // Conflict check
            const conflicts = CONFLICT_FIELDS[selectedType] || [];
            const conflictHit = conflicts.find(c => c.regex.test(bodyText));
            if (conflictHit) {
                updateStatus(`❌ Invalid: ${conflictHit.label} found`, "#F87171");
                updateCaptionBadge(attorneyCaptionDiv, `❌ Invalid: ${conflictHit.label} found`, "#F87171");
                if (targetSpan) targetSpan.style.backgroundColor = "#ffcccc";
                return;
            }

            try {
                const serial = bodyText.match(/(?:US )?Serial Number:\s*(\d+)/i)?.[1] || "";
                let mark = bodyText.match(/Mark:\s*(.+)/)?.[1]?.split("\n")[0]?.trim() || "";

                const markLooksLikeAnotherField =
                    mark.includes("\t") ||
                    /Serial Number|Filing Date|Registration Date|Date Abandoned|Date Cancelled/i.test(mark);
                if (markLooksLikeAnotherField) mark = "";

                const block = bodyText.split(/Correspondent Name\/Address:/i)[1] || "";
                const correspondent = block.split("\n").find(l => l.trim())?.trim() || "";

                // ✅ sirf "Phone:" label ke baad se number uthao
                // poore block se match karne par address ke numbers (103-169) aa jaate the
                const phoneSegment = block.match(/Phone:\s*([\s\S]*?)(?=Fax:|Correspondent e-mail:|$)/i)?.[1] || "";
                // ✅ USA-only validation — dusre country code (+86, +91, etc.) ya
                // 10 se zyada digits (jab tak 11 digits ka leading "1" na ho) reject
                let phone = extractUSPhone(phoneSegment);

                // ✅ Detect "number mila magar invalid tha" (non-USA / galat digit count)
                // vs "number tha hi nahi" — taake status message sahi bole
                const rawPhoneDigits = (phoneSegment.trim().split("\n")[0] || "").replace(/\D/g, "");
                const invalidPhoneFound = !phone && rawPhoneDigits.length > 0;

                // ✅ Saari emails nikalo, phir ek ek validate karo
                // Blacklist: notifications/info/tmapp/uspto/trademark wali emails reject
                const EMAIL_BLACKLIST = /notifications|info|tmapp|uspto|trademark/i;
                const allEmails = block.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi) || [];
                const validEmail = allEmails.find(e => !EMAIL_BLACKLIST.test(e));
                const email = validEmail || "";
                const leadDate = bodyText.match(DATE_FIELD[selectedType].regex)?.[1] || "";

                if (!serial || !mark || !correspondent || !leadDate) {
                    updateStatus("❌ Missing Data", "#FBBF24");
                    updateCaptionBadge(attorneyCaptionDiv, "❌ Missing Data", "#FBBF24");
                    if (targetSpan) targetSpan.style.backgroundColor = "#FFFF1FFF";
                    // console.log("Validation Failed:", { serial, mark, correspondent, leadDate });
                    return;
                }

                const newEntry = {
                    serial, mark, correspondent, phone, email,
                    leadDate, type: selectedType,
                    dateLabel: DATE_FIELD[selectedType].label,
                };

                const alreadyExists =
                    validLeads.some(l => l.serial === serial) ||
                    missingLeads.some(l => l.serial === serial);

                if (alreadyExists) {
                    updateStatus("ℹ️ Already Exist", "#38BDF8");
                    updateCaptionBadge(attorneyCaptionDiv, "ℹ️ Already Exist", "#38BDF8");
                    if (targetSpan) targetSpan.style.backgroundColor = "#add8e6";
                    return;
                }

                if (phone) {
                    const updated = [...validLeads, newEntry];
                    chrome.storage.local.set({ [validKey]: updated }, () => {
                        setValidCount(updated.length);
                        updateStatus("✅ Saved!", "#34D399");
                        updateCaptionBadge(attorneyCaptionDiv, "✅ Saved!", "#34D399");
                        if (targetSpan) targetSpan.style.backgroundColor = "#ccffcc";
                    });
                } else {
                    const updated = [...missingLeads, newEntry];
                    const label = invalidPhoneFound ? "⚠️ Saved (Invalid Number)" : "⚠️ Saved (No Phone)";
                    chrome.storage.local.set({ [missingKey]: updated }, () => {
                        setMissingCount(updated.length);
                        updateStatus(label, "#FBBF24");
                        updateCaptionBadge(attorneyCaptionDiv, label, "#FBBF24");
                        if (targetSpan) targetSpan.style.backgroundColor = "#FFFF1FFF";
                    });
                }

            } catch (error) {
                updateStatus("Err!", "#F87171");
                updateCaptionBadge(attorneyCaptionDiv, "Err!", "#F87171");
                console.error(error);
            }
        });
    }, []);

    useEffect(() => {
        registerScanLead(scanLead);
        return () => unregisterScanLead();
    }, [scanLead]);

    useEffect(() => {
        chrome.storage.local.get(['savedType', 'isHide'], (res) => {
            const type = res.savedType || 'deadAbandoned';
            setScraperType(type);
            scraperTypeRef.current = type;
            loadCounts(type);
            setIsHide(res.isHide ?? false);
        });

        const syncData = (changes, area) => {
            if (area !== 'local') return;

            if (changes.savedType) {
                const newType = changes.savedType.newValue;
                setScraperType(newType);
                scraperTypeRef.current = newType;
                loadCounts(newType);
                updateStatus("Ready", "white");
            }

            if (changes.isHide) {
                setIsHide(changes.isHide.newValue ?? false);
            }

            const t = scraperTypeRef.current;
            if (changes[getValidKey(t)])   setValidCount((changes[getValidKey(t)].newValue || []).length);
            if (changes[getMissingKey(t)]) setMissingCount((changes[getMissingKey(t)].newValue || []).length);
        };

        chrome.storage.onChanged.addListener(syncData);
        return () => chrome.storage.onChanged.removeListener(syncData);
    }, []);

    if (isHide) return null;

    return (
        <>
        <div style={wrapStyle}>
            {/* Type + counts card */}
            <div style={cardStyle}>
                <div style={typeLabelStyle}>
                    {scraperType}
                </div>
                <div style={countsRowStyle}>
                    <div style={countItemStyle} title="Valid leads">
                        <span style={{ ...dotStyle, backgroundColor: '#34D399' }} />
                        <span style={{ ...countTextStyle, color: '#34D399' }}>{validCount}</span>
                    </div>
                    <div style={dividerStyle} />
                    <div style={countItemStyle} title="Missing / invalid phone">
                        <span style={{ ...dotStyle, backgroundColor: '#FBBF24' }} />
                        <span style={{ ...countTextStyle, color: '#FBBF24' }}>{missingCount}</span>
                    </div>
                </div>
            </div>

            {/* Scan button — brass/seal accent */}
            <button
                id="scanLeadBtn"
                onClick={scanLead}
                style={scanButtonStyle}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(1px)'; e.currentTarget.style.boxShadow = 'none'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 0 rgba(0,0,0,0.28)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 0 rgba(0,0,0,0.28)'; }}
            >
                Scan
            </button>

            {/* Status line */}
            <div
                style={{ ...statusLineStyle, color: status.color }}
                title={status.msg}
            >
                {status.msg}
            </div>
        </div>

        {/* Toast — sirf Application open/error ke liye */}
        <div style={toastContainerStyle}>
            {toasts.map((t) => (
                <div
                    key={t.id}
                    style={{
                        ...toastStyle,
                        borderLeft: `3px solid ${t.color}`,
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

export default ScanButton;