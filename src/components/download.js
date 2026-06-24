import * as XLSX from 'xlsx';

// ═══════════════════════════════════════════════
//  Storage Keys
// ═══════════════════════════════════════════════
export const getValidKey   = (type) => `leads_${type}`;
export const getMissingKey = (type) => `leads_missing_${type}`;

// ═══════════════════════════════════════════════
//  Type ke hisaab se date column ka label
// ═══════════════════════════════════════════════
const DATE_LABELS = {
    deadAbandoned: 'Date Abandoned',
    deadCancelled: 'Date Cancelled',
    livePending:   'Filing Date',
    liveRegister:  'Registration Date',
};

// ═══════════════════════════════════════════════
//  Ek lead ko Excel row mein convert karo
// ═══════════════════════════════════════════════
const formatRow = (lead, type) => ({
    "Serial Link": {
        f: `HYPERLINK("https://tsdr.uspto.gov/#caseNumber=${lead.serial}&caseType=SERIAL_NO&searchType=statusSearch", "${lead.serial}")`,
        v: lead.serial,
    },
    "Mark":                        lead.mark,
    "Serial Number":               lead.serial,
    [DATE_LABELS[type] || "Date"]: lead.leadDate,
    "Correspondent":               lead.correspondent,
    "Phone":                       lead.phone || "MISSING",
    "Email":                       lead.email || "N/A",
});

// ═══════════════════════════════════════════════
//  Column widths
// ═══════════════════════════════════════════════
const COL_WIDTHS = [
    { wch: 15 },  // Serial Link
    { wch: 30 },  // Mark
    { wch: 15 },  // Serial Number
    { wch: 22 },  // Date
    { wch: 30 },  // Correspondent
    { wch: 18 },  // Phone
    { wch: 30 },  // Email
];

// ═══════════════════════════════════════════════
//  Sheet banao aur workbook mein add karo
// ═══════════════════════════════════════════════
const addSheet = (workbook, leads, type, sheetName) => {
    if (leads.length === 0) return;
    const rows = leads.map(lead => formatRow(lead, type));
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = COL_WIDTHS;
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
};

// ═══════════════════════════════════════════════
//  File trigger — chrome.downloads.download() API se
// ═══════════════════════════════════════════════
// ✅ Anchor-click (<a download>) trick extension POPUP ke andar unreliable hai —
// popup ki apni lifecycle hoti hai aur blob: URL bohot jaldi invalid ho jata hai
// (popup tab nahi hai, normal page nahi hai). Isi liye manifest.json mein
// "downloads" permission already add ki thi — wahi sahi API hai.
// data: URL self-contained string hai (blob: ki tarah document se linked nahi),
// is liye popup chahe kuch bhi kare, download fail nahi hoga.
const triggerDownload = (workbook, filename) => {
    const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;

    chrome.downloads.download(
        { url: dataUrl, filename, saveAs: false },
        (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error("Download failed:", chrome.runtime.lastError);
                alert("Download fail ho gaya: " + chrome.runtime.lastError.message);
            }
        }
    );
};

// ═══════════════════════════════════════════════
//  MAIN DOWNLOAD FUNCTION — Setting.jsx se call hoga
// ═══════════════════════════════════════════════
export const downloadLeads = (type) => {
    const validKey   = getValidKey(type);
    const missingKey = getMissingKey(type);

    chrome.storage.local.get([validKey, missingKey], (res) => {
        const validLeads   = res[validKey]   || [];
        const missingLeads = res[missingKey] || [];

        if (validLeads.length === 0 && missingLeads.length === 0) {
            alert(`No data for ${type}!`);
            return;
        }

        const workbook = XLSX.utils.book_new();

        // Sheet 1 — Valid Leads (phone hai)
        addSheet(workbook, validLeads, type, "Valid Leads");

        // Sheet 2 — Missing Phone (phone nahi)
        addSheet(workbook, missingLeads, type, "Missing Phone");

        // Download trigger karo
        triggerDownload(workbook, `${type}_leads.xlsx`);
    });
};