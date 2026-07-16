// background.js
//
// LEADS BRIDGE - standalone dashboard website ko live leads data bhejta hai
// chrome.runtime long-lived port ke zariye, kyunki website directly
// chrome.storage.local access nahi kar sakti.

/* ═══════════════════════ LEADS BRIDGE ═══════════════════════ */

const LEAD_TYPES = ['deadAbandoned', 'deadCancelled', 'livePending', 'liveRegister'];
const getValidKey = (type) => `leads_${type}`;
const getMissingKey = (type) => `leads_missing_${type}`;
const ALL_LEAD_KEYS = LEAD_TYPES.flatMap((t) => [getValidKey(t), getMissingKey(t)]);

const dashboardPorts = new Set();

function buildSnapshot(callback) {
  chrome.storage.local.get(ALL_LEAD_KEYS, callback);
}

function pushSnapshotToAll() {
  buildSnapshot((snapshot) => {
    dashboardPorts.forEach((p) => {
      try {
        p.postMessage({ type: 'LEADS_SNAPSHOT', data: snapshot });
      } catch (e) {
        // port band ho chuka hoga — onDisconnect khud clean up kar dega
      }
    });
  });
}

chrome.runtime.onConnectExternal.addListener((port) => {
  dashboardPorts.add(port);

  port.onMessage.addListener((msg) => {
    if (msg?.type === 'REQUEST_SNAPSHOT') {
      buildSnapshot((snapshot) => port.postMessage({ type: 'LEADS_SNAPSHOT', data: snapshot }));
    }

    if (msg?.type === 'DELETE_LEADS') {
      const { type, subType, serials } = msg.payload || {};
      if (!type || !Array.isArray(serials)) return;
      const key = subType === 'valid' ? getValidKey(type) : getMissingKey(type);
      const toDelete = new Set(serials);
      chrome.storage.local.get([key], (res) => {
        const updated = (res[key] || []).filter((l) => !toDelete.has(l.serial));
        chrome.storage.local.set({ [key]: updated }, pushSnapshotToAll);
      });
    }
  });

  port.onDisconnect.addListener(() => dashboardPorts.delete(port));

  // Connect hote hi ek snapshot bhej do, dashboard ko REQUEST_SNAPSHOT
  // bhejne ka intezaar na karna pade.
  buildSnapshot((snapshot) => port.postMessage({ type: 'LEADS_SNAPSHOT', data: snapshot }));
});

// Extension popup ke andar koi bhi change ho (naya lead save hua, ya koi
// lead delete hua) — websites ko bhi turant naya snapshot mile.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const relevant = ALL_LEAD_KEYS.some((k) => changes[k]);
  if (relevant) pushSnapshotToAll();
});

/* ═══════════════════════ LIFECYCLE EVENTS ═══════════════════════ */

chrome.runtime.onInstalled.addListener(() => {
  const DEFAULT_TYPE = 'deadAbandoned';
  chrome.storage.local.get(['savedType', 'isHide'], (res) => {
    if (!res.savedType) {
      chrome.storage.local.set({ savedType: DEFAULT_TYPE });
      console.log('Default type set:', DEFAULT_TYPE);
    }
    // isHide bhi yahan se hi initialize ho jaye gi, taake har jagah
    // (Footer.jsx, ScanButton.jsx) ek hi default state se shuru ho
    if (res.isHide === undefined) {
      chrome.storage.local.set({ isHide: false });
      console.log('Default isHide set: false');
    }
  });
});