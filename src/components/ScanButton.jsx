import { useEffect, useState, useRef, useCallback } from 'react'
import { registerScanLead, unregisterScanLead } from './scanLeadBridge';

const DATE_FIELD = {
    deadAbandoned: { regex: /Date Abandoned:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Date Abandoned" },
    deadCancelled: { regex: /Date Cancelled:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Date Cancelled" },
    livePending:   { regex: /Application Filing Date:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Filing Date" },
    liveRegister:  { regex: /Registration Date:\s*([A-Za-z]+\.?\s\d{1,2},\s\d{4})/i, label: "Registration Date" },
};

const PAGE_STATUS_MAP = {
    deadAbandoned: /Abandoned/i,
    deadCancelled: /Cancelled/i,
    livePending:   /Pending/i,
    liveRegister:  /Registered/i,
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

// ✅ Valid aur Missing ke liye alag storage keys
const getValidKey   = (type) => `leads_${type}`;
const getMissingKey = (type) => `leads_missing_${type}`;

const BADGE_ID = "scan-status-badge";

// ✅ "Attorney of Record - None" wale caption div ke andar status span
// inject/update karta hai. Original text node ko bilkul touch nahi karta,
// sirf end mein child span append karta hai (margin se thora space).
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
        captionDiv.appendChild(badge); // sirf append, existing text node intact rehta hai
    }
    badge.style.color = color;
    badge.textContent = msg;
};

// ✅ Container (Attorney/Correspondence section) ke andar
// "Attorney of Record" wala caption div dhoondta hai
const findAttorneyCaptionDiv = (container) => {
    if (!container) return null;
    let found = null;
    container.querySelectorAll(".caption").forEach((cap) => {
        if (cap.textContent.includes("Attorney of Record")) {
            found = cap;
        }
    });
    return found;
};

const ScanButton = () => {
    const [scraperType, setScraperType] = useState('deadAbandoned');
    const [validCount, setValidCount]   = useState(0);
    const [missingCount, setMissingCount] = useState(0);
    const [status, setStatus] = useState({ msg: "Ready", color: "white" });
    const [isHide, setIsHide] = useState(false); // ✅ Footer ke "Hide" toggle se sync hota hai

    const scraperTypeRef = useRef('deadAbandoned');
    const updateStatus = (msg, color) => setStatus({ msg, color });

    const loadCounts = (type) => {
        chrome.storage.local.get([getValidKey(type), getMissingKey(type)], (res) => {
            setValidCount((res[getValidKey(type)] || []).length);
            setMissingCount((res[getMissingKey(type)] || []).length);
        });
    };

    const scanLead = useCallback(() => {
        updateStatus("Scanning...", "white");

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

                        // ✅ Caption div dhoond lo isi waqt, baad mein status update karne ke liye
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
                updateStatus("❌ Invalid", "#ff4d4d");
                updateCaptionBadge(attorneyCaptionDiv, "❌ Invalid", "#ff4d4d");
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
                updateStatus(`❌ Mismatch Lead Type`, "#ff4d4d");
                updateCaptionBadge(attorneyCaptionDiv, "❌ Mismatch Lead Type", "#ff4d4d");
                if (targetSpan) targetSpan.style.backgroundColor = "#ffcccc";
                return;
            }

            // Conflict check
            const conflicts = CONFLICT_FIELDS[selectedType] || [];
            const conflictHit = conflicts.find(c => c.regex.test(bodyText));
            if (conflictHit) {
                updateStatus(`❌ Invalid: ${conflictHit.label} found`, "#ff4d4d");
                updateCaptionBadge(attorneyCaptionDiv, `❌ Invalid: ${conflictHit.label} found`, "#ff4d4d");
                if (targetSpan) targetSpan.style.backgroundColor = "#ffcccc";
                return;
            }

            try {
                const serial = bodyText.match(/(?:US )?Serial Number:\s*(\d+)/i)?.[1] || "";
                let mark = bodyText.match(/Mark:\s*(.+)/)?.[1]?.split("\n")[0]?.trim() || "";

                // ✅ Garbage-guard: agar "Mark:" ke baad literal text na ho (design-only mark,
                // jaise sirf image — "Mark Literal Elements: None"), to regex aage badh kar
                // agle field (Serial Number / Filing Date / Registration Date waghera) ko
                // pakar leta hai (tabs se joint hua text). Yahan us garbage ko detect kar
                // ke mark ko khali kar diya — taake niche "Missing Core Data" trigger ho
                // aur yeh invalid lead save na ho.
                const markLooksLikeAnotherField =
                    mark.includes("\t") ||
                    /Serial Number|Filing Date|Registration Date|Date Abandoned|Date Cancelled/i.test(mark);
                if (markLooksLikeAnotherField) {
                    mark = "";
                }

                const block = bodyText.split(/Correspondent Name\/Address:/i)[1] || "";
                const correspondent = block.split("\n").find(l => l.trim())?.trim() || "";
                const phoneMatch = block.match(/(\+?\d{1,2}[\s-]?)?\(?\d{3}\)?[\/\s.-]?\d{3}[\/\s.-]?\d{4}/g);
                const phone = phoneMatch ? phoneMatch[0] : "";
                const email = block.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/i)?.[0] || "N/A";
                const leadDate = bodyText.match(DATE_FIELD[selectedType].regex)?.[1] || "";

                // Core fields missing
                if (!serial || !mark || !correspondent || !leadDate) {
                    updateStatus("❌ Missing Data", "#ffeb3b");
                    updateCaptionBadge(attorneyCaptionDiv, "❌ Missing Data", "#ffeb3b");
                    if (targetSpan) targetSpan.style.backgroundColor = "#FFFF1FFF";
                    console.log("Validation Failed:", { serial, mark, correspondent, leadDate });
                    return;
                }

                const newEntry = {
                    serial, mark, correspondent, phone, email,
                    leadDate, type: selectedType,
                    dateLabel: DATE_FIELD[selectedType].label,
                };

                // ✅ Duplicate check — dono arrays mein dekho
                const alreadyExists =
                    validLeads.some(l => l.serial === serial) ||
                    missingLeads.some(l => l.serial === serial);

                if (alreadyExists) {
                    updateStatus("ℹ️ Already Exist", "#3498db");
                    updateCaptionBadge(attorneyCaptionDiv, "ℹ️ Already Exist", "#3498db");
                    if (targetSpan) targetSpan.style.backgroundColor = "#add8e6";
                    return;
                }

                // ✅ Phone hai → valid, phone nahi → missing
                if (phone) {
                    const updated = [...validLeads, newEntry];
                    chrome.storage.local.set({ [validKey]: updated }, () => {
                        setValidCount(updated.length);
                        updateStatus("✅ Saved!", "#4caf50");
                        updateCaptionBadge(attorneyCaptionDiv, "✅ Saved!", "#4caf50");
                        if (targetSpan) targetSpan.style.backgroundColor = "#ccffcc";
                    });
                } else {
                    const updated = [...missingLeads, newEntry];
                    chrome.storage.local.set({ [missingKey]: updated }, () => {
                        setMissingCount(updated.length);
                        updateStatus("⚠️ Saved (No Phone)", "#FFFF47FF");
                        updateCaptionBadge(attorneyCaptionDiv, "⚠️ Saved (No Phone)", "#FFD52FFF");
                        if (targetSpan) targetSpan.style.backgroundColor = "#FFFF1FFF";
                    });
                }

            } catch (error) {
                updateStatus("Err!", "red");
                updateCaptionBadge(attorneyCaptionDiv, "Err!", "red");
                console.error(error);
            }
        });
    }, []); // ✅ refs aur stable setters use karta hai, isliye empty deps theek hai

    // ✅ Mount hote waqt scanLead ko bridge mein register karo,
    // taake shortkey.js (ya koi aur script) seedha import karke isay call kar sake
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
            setIsHide(res.isHide ?? false); // ✅ extension load hotay hi hide/show state set ho jaye
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

            // ✅ Footer se "Hide" button click hote hi yahan bhi turant update ho jaye,
            // bina kisi extra message-passing ke
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

    // ✅ Hide ON hone par UI render hi nahi hogi — lekin upar wala
    // registerScanLead(scanLead) useEffect hamesha chalta rehta hai,
    // isliye shortkey.js se scan abhi bhi kaam karega hide state mein bhi
    if (isHide) {
        return null;
    }

    return (
        <div className="w-full flex flex-col gap-2">
            {/* Type + counts badge */}
            <div className=" flex flex-col text-[9px] text-center font-mono bg-slate-800 rounded py-[2px] flex justify-around">
               
                <div className="text-slate-400">{scraperType}</div>
                
                <div className='w-full flex flex-row justify-around'>
                <span className="text-green-400 W-[50%]">✅ {validCount}</span>
                <span className="text-yellow-400 W-[50%]">⚠️ {missingCount}</span>
                </div>
            </div>

            <button
                id="scanLeadBtn"
                onClick={scanLead}
                className='bg-green-400 hover:bg-green-500 text-slate-900 rounded-[8px] py-[4px] font-bold cursor-pointer w-full text-[14px]'
            >
                Scan Lead
            </button>

            <div style={{ color: status.color, fontSize: '11px', textAlign: 'center', fontWeight: 'bold' }}>
                {status.msg}
            </div>
        </div>
    );
};

export default ScanButton;