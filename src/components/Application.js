// ============================================
// Application.js - TSDR Application Doc Opener
// Finds the Application document link from the current page DOM,
// checks the docId date, and builds the correct viewer URL.
//
// Rule:
//   docId date >= 18 Jan 2025  -> NEW XML proxy URL (serial only)
//   docId date <= 17 Jan 2025  -> OLD webcontent URL (serial + docId)
// ============================================

// ── Application link keywords ──────────────
// Covers all variations of application doc names
const APP_KEYWORDS = [
    "PR-Section 8 and 9",
    'teas plus new application',
    'teas rf new application',
    'teas standard new application',
    'new application',
    'application',  // fallback — last resort
];

// Date boundary: 18 Jan 2025 (inclusive -> NEW url)
const DATE_BOUNDARY = new Date(2025, 0, 18); // months are 0-indexed -> January

// ── Find Application link from DOM ─────────
// "PR-Section 8 and 9" is matched case-sensitively (exact casing in DOM).
// All other keywords are matched case-insensitively via toLowerCase().
const CASE_SENSITIVE_KEYWORDS = new Set(['PR-Section 8 and 9']);

// ── Extract date from docId ─────────────────
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

// ── Find Application link from DOM (best-match scoring) ───
// Instead of returning the FIRST link whose text merely contains a keyword
// (which can wrongly grab some unrelated row before the real Application
// row is reached), we score every link against every keyword and pick the
// single best match overall:
//   - lower keyword index (earlier in APP_KEYWORDS) = higher priority
//   - exact text match beats substring/"includes" match
//   - among ties, the EARLIEST docId date wins
// We do NOT assume anything about the docId format/prefix (it can be APP,
// REV, NEWAPP, REG, RFA, etc. depending on doc type) — text matching is
// based purely on the link's visible text/description.
//
// Why "earliest date" matters: the real Application is always the FIRST
// document ever filed in a case. Other later documents (responses,
// amendments, RFA filings, revivals, etc.) can ALSO contain the word
// "application" in their description and would otherwise win the keyword
// match purely by DOM order — picking the earliest-dated candidate avoids
// that trap.
const findAppLinkFromDOM = () => {
    const allLinks = document.querySelectorAll('#docResultsTbody a, #docsTab a, .toggle_container a');

    let best = null; // { keywordIndex, exact, docDate, href, rawText }

    for (const a of allLinks) {
        const href = a.getAttribute('href');
        if (!href || href === 'javascript:;') continue;

        const rawText = a.textContent.trim();
        if (!rawText) continue;

        for (let i = 0; i < APP_KEYWORDS.length; i++) {
            const keyword = APP_KEYWORDS[i];
            const caseSensitive = CASE_SENSITIVE_KEYWORDS.has(keyword);
            const text   = caseSensitive ? rawText : rawText.toLowerCase();
            const needle = caseSensitive ? keyword : keyword.toLowerCase();

            const isExact = text === needle;
            const isMatch = isExact || text.includes(needle);
            if (!isMatch) continue;

            // Pull the docId date (if any) purely as a tie-breaker signal.
            let docDate = null;
            try {
                const u = new URL(href, 'https://tsdr.uspto.gov');
                docDate = extractDateFromDocId(u.searchParams.get('docId'));
            } catch (e) {
                docDate = null;
            }

            const candidate = { keywordIndex: i, exact: isExact, docDate, href, rawText };

            if (!best) {
                best = candidate;
            } else if (candidate.keywordIndex < best.keywordIndex) {
                best = candidate;
            } else if (candidate.keywordIndex === best.keywordIndex) {
                if (candidate.exact && !best.exact) {
                    best = candidate;
                } else if (candidate.exact === best.exact) {
                    // Same priority & same exactness — prefer the earlier-dated doc.
                    if (candidate.docDate && best.docDate) {
                        if (candidate.docDate < best.docDate) best = candidate;
                    } else if (candidate.docDate && !best.docDate) {
                        best = candidate; // prefer a dated candidate over an undated one
                    }
                }
            }
            break; // this link already matched its best-fitting keyword, move to next link
        }
    }

    if (best) {
        // console.log(`✅ Link found: "${best.rawText}" → ${best.href}`);
        return best.href;
    }
    return null;
};

// docId prefixes that must ALWAYS use the OLD webcontent URL, regardless of
// date — the date-based NEW/OLD rule doesn't apply to these doc types.
// e.g. "S89" (PR-Section 8 and 9 filings) keeps using the old format even
// when its docId date is after the 18-Jan-2025 boundary.
const ALWAYS_OLD_PREFIXES = ['S89'];

// ── Build viewer URL (date-based) ──────────
const buildViewerUrl = (href) => {
    try {
        const url = new URL(href, 'https://tsdr.uspto.gov');
        const caseId = url.searchParams.get('caseId'); // sn90092363
        const docId  = url.searchParams.get('docId');  // APP20200807094744
        if (!caseId || !docId) return null;

        const serial = caseId.replace(/^sn/i, '');

        const forceOld = ALWAYS_OLD_PREFIXES.some(prefix =>
            docId.toUpperCase().startsWith(prefix)
        );

        if (forceOld) {
            return `https://tsdrsec.uspto.gov/ts/cd/casedoc/sn${serial}/${docId}/1/webcontent?scale=1`;
        }

        const docDate = extractDateFromDocId(docId);
        if (!docDate) return null;

        if (docDate >= DATE_BOUNDARY) {
            // New XML proxy URL — only serial needed, doc name is fixed
            return `https://tsdrsec.uspto.gov/ts/cd/tmcasedoc/pageproxy?url=/casedoc/cms/case/${serial}/tmdocument/NEWAPP0000.XML&caseid=sn${serial}`;
        } else {
            // Old webcontent URL — serial + original docId required
            return `https://tsdrsec.uspto.gov/ts/cd/casedoc/sn${serial}/${docId}/1/webcontent?scale=1`;
        }
    } catch (e) {
        return null;
    }
};

// ── Main function ───────────────────────────
// Finds the Application document from page DOM, builds the correct
// URL based on date, and opens it in a new tab.
// Returns: { success: boolean, message: string }
export const openApplicationDoc = () => {
    // Step 1: Find link from DOM
    const appHref = findAppLinkFromDOM();

    if (!appHref) {
        return { success: false, message: '❌ Application link not found' };
    }

    // Step 2: Build viewer URL (with date check)
    const viewerUrl = buildViewerUrl(appHref);
    if (!viewerUrl) {
        return { success: false, message: '❌ Failed to build viewer URL' };
    }

    // console.log('Viewer URL:', viewerUrl);

    // Step 3: Open in new tab
    window.open(viewerUrl, '_blank');

    return { success: true, message: '✅ Application Opened' };
};