// ============================================
// Application.js - TSDR Application Doc Opener
// Current page ke DOM se Application document link
// nikalta hai, docId ki date check karta hai, aur
// date ke hisaab se sahi viewer URL banata hai.
//
// Rule:
//   docId ki date >= 18 Jan 2025  -> NEW XML proxy URL (sirf serial)
//   docId ki date <= 17 Jan 2025  -> OLD webcontent URL (serial + docId)
// ============================================

// ── Application link keywords ──────────────
// Har tarah ke application doc names cover karo
const APP_KEYWORDS = [
    'teas plus new application',
    'teas rf new application',
    'teas standard new application',
    'new application',
    'application',  // fallback — last resort
];

// Date boundary: 18 Jan 2025 (inclusive -> NEW url)
const DATE_BOUNDARY = new Date(2025, 0, 18); // months are 0-indexed -> January

// ── DOM se Application link dhundo ─────────
const findAppLinkFromDOM = () => {
    const allLinks = document.querySelectorAll('#docResultsTbody a, #docsTab a, .toggle_container a');

    // Priority order mein check karo
    for (const keyword of APP_KEYWORDS) {
        for (const a of allLinks) {
            const text = a.textContent.trim().toLowerCase();
            if (text === keyword || text.includes(keyword)) {
                const href = a.getAttribute('href');
                if (href && href !== 'javascript:;') {
                    console.log(`✅ Link mila: "${a.textContent.trim()}" → ${href}`);
                    return href;
                }
            }
        }
    }
    return null;
};

// ── docId se date nikalo ────────────────────
// docId format: <PREFIX><YYYY><MM><DD><HHMMSS>
// e.g. APP20250118060628 -> 2025-01-18
//      FTK20250119202902 -> 2025-01-19
const extractDateFromDocId = (docId) => {
    if (!docId) return null;
    const match = docId.match(/(\d{4})(\d{2})(\d{2})\d{6}$/);
    if (!match) return null;

    const year  = parseInt(match[1], 10);
    const month = parseInt(match[2], 10); // 1-12
    const day   = parseInt(match[3], 10);

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    return new Date(year, month - 1, day);
};

// ── URL convert karo (date-based) ──────────
const buildViewerUrl = (href) => {
    try {
        const url = new URL(href, 'https://tsdr.uspto.gov');
        const caseId = url.searchParams.get('caseId'); // sn90092363
        const docId  = url.searchParams.get('docId');  // APP20200807094744
        if (!caseId || !docId) return null;

        const serial = caseId.replace(/^sn/i, '');

        const docDate = extractDateFromDocId(docId);
        if (!docDate) return null;

        if (docDate >= DATE_BOUNDARY) {
            // Naya XML proxy URL — sirf serial chahiye, doc name fixed hai
            return `https://tsdrsec.uspto.gov/ts/cd/tmcasedoc/pageproxy?url=/casedoc/cms/case/${serial}/tmdocument/NEWAPP0000.XML&caseid=sn${serial}`;
        } else {
            // Purana webcontent URL — serial + asli docId chahiye
            return `https://tsdrsec.uspto.gov/ts/cd/casedoc/sn${serial}/${docId}/1/webcontent?scale=1`;
        }
    } catch (e) {
        return null;
    }
};

// ── Main function ──────────────────────────
// Page ke DOM se Application document dhoond kar, date ke hisaab se
// sahi URL banata hai aur naye tab mein khol deta hai.
// Returns: { success: boolean, message: string }
export const openApplicationDoc = () => {
    // Step 1: DOM se link nikalo
    const appHref = findAppLinkFromDOM();

    if (!appHref) {
        return { success: false, message: '❌ Application link nahi mila' };
    }

    // Step 2: Viewer URL banao (date check ke saath)
    const viewerUrl = buildViewerUrl(appHref);
    if (!viewerUrl) {
        return { success: false, message: '❌ URL build nahi ho saka' };
    }

    console.log('Viewer URL:', viewerUrl);

    // Step 3: New tab mein open karo
    window.open(viewerUrl, '_blank');

    return { success: true, message: '✅ Application Opened' };
};