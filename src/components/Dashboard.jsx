import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';

// ─── Constants ───────────────────────────────────────────────
const LEAD_TYPES = [
  { key: 'deadAbandoned', label: 'Dead Abandoned', color: '#ef4444', badge: 'DA' },
  { key: 'deadCancelled', label: 'Dead Cancelled', color: '#f97316', badge: 'DC' },
  { key: 'livePending',   label: 'Live Pending',   color: '#3b82f6', badge: 'LP' },
  { key: 'liveRegister',  label: 'Live Register',  color: '#22c55e', badge: 'LR' },
];

const DATE_LABELS = {
  deadAbandoned: 'Date Abandoned',
  deadCancelled: 'Date Cancelled',
  livePending:   'Filing Date',
  liveRegister:  'Registration Date',
};

const getValidKey   = (type) => `leads_${type}`;
const getMissingKey = (type) => `leads_missing_${type}`;

// Remove leads (by serial) from a given storage key
const deleteLeadsFromStorage = (storageKey, serialsToDelete, callback) => {
  chrome.storage.local.get([storageKey], (res) => {
    const current = res[storageKey] || [];
    const updated = current.filter(l => !serialsToDelete.includes(l.serial));
    chrome.storage.local.set({ [storageKey]: updated }, () => {
      if (callback) callback(updated);
    });
  });
};

// ─── Hook: real-time storage listener ────────────────────────
function useLeadData(type, subType) {
  const [leads, setLeads] = useState([]);
  const [allCounts, setAllCounts] = useState({});

  // Load counts for all types (for sidebar badges)
  const loadAllCounts = (res) => {
    const c = {};
    LEAD_TYPES.forEach(t => {
      c[t.key] = {
        valid:   (res[getValidKey(t.key)]   || []).length,
        missing: (res[getMissingKey(t.key)] || []).length,
      };
    });
    setAllCounts(c);
  };

  useEffect(() => {
    const allKeys = LEAD_TYPES.flatMap(t => [getValidKey(t.key), getMissingKey(t.key)]);

    const load = () => {
      chrome.storage.local.get(allKeys, (res) => {
        loadAllCounts(res);
        if (type) {
          const key = subType === 'valid' ? getValidKey(type) : getMissingKey(type);
          setLeads(res[key] || []);
        }
      });
    };

    load();

    const onChange = (changes, area) => {
      if (area !== 'local') return;
      const relevant = allKeys.some(k => changes[k]);
      if (relevant) load();
    };

    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [type, subType]);

  return { leads, allCounts };
}

// ─── Themed Checkbox (dark, matches accent color, no native white box) ──
function ThemedCheckbox({ checked, onChange, accentColor = '#3b82f6', className = '', style = {} }) {
  return (
    <label
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        width: '16px', height: '16px', borderRadius: '4px',
        border: `1.5px solid ${checked ? accentColor : '#334155'}`,
        background: checked ? accentColor : '#0f172a',
        cursor: 'pointer', flexShrink: 0,
        transition: 'all 0.15s',
        ...style,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{
          position: 'absolute', width: '16px', height: '16px',
          opacity: 0, cursor: 'pointer', margin: 0,
        }}
      />
      {checked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#020817" strokeWidth="3.5">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </label>
  );
}

// ─── Trash Icon ─────────────────────────────────────────────
function TrashIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

// ─── Confirm Delete Modal ──────────────────────────────────────
function ConfirmDeleteModal({ count, onConfirm, onCancel }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(2,8,23,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px',
          padding: '22px 24px', width: '320px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: '#ef444422', color: '#ef4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TrashIcon size={16} />
          </div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#f1f5f9' }}>
            Delete {count > 1 ? `${count} leads` : 'lead'}?
          </h3>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
          This action can't be undone. {count > 1 ? 'These leads' : 'This lead'} will be permanently removed from storage.
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 14px', borderRadius: '8px', border: '1px solid #1e293b',
              background: 'transparent', color: '#94a3b8', fontSize: '12px',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '7px 14px', borderRadius: '8px', border: 'none',
              background: '#ef4444', color: 'white', fontSize: '12px',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Table Component ─────────────────────────────────────────
function LeadsTable({ leads, type, subType }) {
  const dateLabel = DATE_LABELS[type] || 'Date';
  const accentColor = LEAD_TYPES.find(t => t.key === type)?.color || '#3b82f6';
  const storageKey = subType === 'valid' ? getValidKey(type) : getMissingKey(type);

  const [selected, setSelected] = useState(new Set());
  const [pendingDelete, setPendingDelete] = useState(null); // { serials: [...] } | null

  // Reset selection whenever the list we're looking at changes (type/subType switch)
  useEffect(() => {
    setSelected(new Set());
  }, [type, subType]);

  const toggleOne = (serial) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(serial)) next.delete(serial);
      else next.add(serial);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev => {
      if (prev.size === leads.length) return new Set();
      return new Set(leads.map(l => l.serial));
    });
  };

  const requestDeleteOne = (serial) => setPendingDelete({ serials: [serial] });
  const requestDeleteSelected = () => setPendingDelete({ serials: Array.from(selected) });

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteLeadsFromStorage(storageKey, pendingDelete.serials, () => {
      setSelected(prev => {
        const next = new Set(prev);
        pendingDelete.serials.forEach(s => next.delete(s));
        return next;
      });
      setPendingDelete(null);
    });
  };

  if (leads.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '300px', gap: '12px',
        color: '#475569'
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="1"/>
        </svg>
        <span style={{ fontSize: '14px', fontWeight: 500 }}>
          No {subType === 'valid' ? 'valid' : 'missing phone'} leads yet
        </span>
        
      </div>
    );
  }

  const allSelected = selected.size > 0 && selected.size === leads.length;

  return (
    <div style={{ position: 'relative' }}>
      {/* Bulk action toolbar — only visible when something is selected */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '8px 14px', margin: '10px 14px 0',
          background: '#ef444414', border: '1px solid #ef444444',
          borderRadius: '8px',
        }}>
          <span style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: 600 }}>
            {selected.size} selected
          </span>
          <button
            onClick={requestDeleteSelected}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '5px 12px', borderRadius: '7px', border: 'none',
              background: '#ef4444', color: 'white', fontSize: '11px',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            <TrashIcon size={12} /> Delete Selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{
              padding: '5px 12px', borderRadius: '7px', border: '1px solid #334155',
              background: 'transparent', color: '#94a3b8', fontSize: '11px',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <style>{`
          .row-checkbox { opacity: 0; transition: opacity 0.15s; }
          .lead-row:hover .row-checkbox,
          .row-checkbox.is-checked { opacity: 1; }
        `}</style>
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: '12px',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
        }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${accentColor}33` }}>
              <th style={{ padding: '10px 14px', width: '30px' }}>
                <ThemedCheckbox
                  checked={allSelected}
                  onChange={toggleAll}
                  accentColor={accentColor}
                />
              </th>
              {['#', 'Serial', 'Mark', dateLabel, 'Correspondent', 'Phone', 'Email'].map(h => (
                <th key={h} style={{
                  padding: '10px 14px', textAlign: 'left', color: '#64748b',
                  fontWeight: 600, fontSize: '10px', letterSpacing: '0.08em',
                  textTransform: 'uppercase', whiteSpace: 'nowrap'
                }}>
                  {h}
                </th>
              ))}
              <th style={{ padding: '10px 14px', width: '40px' }} />
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, i) => {
              const isSelected = selected.has(lead.serial);
              return (
                <tr
                  key={`${lead.serial}-${i}`}
                  className="lead-row"
                  style={{
                    borderBottom: '1px solid #1e293b',
                    background: isSelected ? '#ef444412' : 'transparent',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#0f172a'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <div className={`row-checkbox ${isSelected ? 'is-checked' : ''}`}>
                      <ThemedCheckbox
                        checked={isSelected}
                        onChange={() => toggleOne(lead.serial)}
                        accentColor={accentColor}
                      />
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#334155', fontSize: '11px' }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <a
                      href={`https://tsdr.uspto.gov/#caseNumber=${lead.serial}&caseType=SERIAL_NO&searchType=statusSearch`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: accentColor, textDecoration: 'none', fontWeight: 600 }}
                      onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.target.style.textDecoration = 'none'}
                    >
                      {lead.serial}
                    </a>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#e2e8f0', maxWidth: '200px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.mark}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    {lead.leadDate}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#cbd5e1', maxWidth: '180px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.correspondent}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {lead.phone ? (
                      <a
                        href={`tel:${lead.phone}`}
                        style={{ color: '#4ade80', textDecoration: 'none' }}
                      >
                        {lead.phone}
                      </a>
                    ) : (
                      <span style={{ color: '#ef4444', fontSize: '11px' }}>MISSING</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: '200px' }}>
                    {lead.email && lead.email !== 'N/A' ? (
                      <a
                        href={`mailto:${lead.email}`}
                        style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '11px' }}
                      >
                        {lead.email}
                      </a>
                    ) : (
                      <span style={{ color: '#475569', fontSize: '11px' }}>N/A</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      onClick={() => requestDeleteOne(lead.serial)}
                      title="Delete lead"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '26px', height: '26px', borderRadius: '6px',
                        border: '1px solid transparent', background: 'transparent',
                        color: '#64748b', cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#ef444422';
                        e.currentTarget.style.color = '#ef4444';
                        e.currentTarget.style.borderColor = '#ef444444';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#64748b';
                        e.currentTarget.style.borderColor = 'transparent';
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pendingDelete && (
        <ConfirmDeleteModal
          count={pendingDelete.serials.length}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

// ─── Lead Type View (with Valid / Missing sub-tabs) ───────────
function LeadTypeView({ typeKey }) {
  const [subTab, setSubTab] = useState('valid');
  const { leads, allCounts } = useLeadData(typeKey, subTab);
  const typeInfo = LEAD_TYPES.find(t => t.key === typeKey);
  const counts = allCounts[typeKey] || { valid: 0, missing: 0 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px 0',
        borderBottom: '1px solid #1e293b',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: typeInfo?.color, boxShadow: `0 0 8px ${typeInfo?.color}`
          }} />
          <h2 style={{
            margin: 0, fontSize: '18px', fontWeight: 700,
            color: '#f1f5f9', letterSpacing: '-0.02em'
          }}>
            {typeInfo?.label}
          </h2>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
            <span style={{
              fontSize: '11px', padding: '3px 10px', borderRadius: '20px',
              background: '#16a34a22', color: '#4ade80', border: '1px solid #16a34a44'
            }}>
              ✅ {counts.valid} valid
            </span>
            <span style={{
              fontSize: '11px', padding: '3px 10px', borderRadius: '20px',
              background: '#d9770622', color: '#fbbf24', border: '1px solid #d9770644'
            }}>
              ⚠️ {counts.missing} missing
            </span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: '0' }}>
          {[
            { key: 'valid',   label: 'Valid Leads',   count: counts.valid   },
            { key: 'missing', label: 'Missing Phone',  count: counts.missing },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              style={{
                padding: '8px 18px', border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: 600, transition: 'all 0.15s',
                borderBottom: subTab === tab.key
                  ? `2px solid ${tab.key === 'valid' ? '#4ade80' : '#fbbf24'}`
                  : '2px solid transparent',
                color: subTab === tab.key
                  ? (tab.key === 'valid' ? '#4ade80' : '#fbbf24')
                  : '#475569',
                background: 'transparent',
              }}
            >
              {tab.label}
              <span style={{
                marginLeft: '6px', fontSize: '10px', padding: '1px 6px',
                borderRadius: '10px',
                background: subTab === tab.key ? '#ffffff15' : '#ffffff08',
                color: subTab === tab.key ? '#e2e8f0' : '#475569',
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
        <LeadsTable leads={leads} type={typeKey} subType={subTab} />
      </div>
    </div>
  );
}

// ─── Home/Overview View ───────────────────────────────────────
function Overview({ allCounts, navigate }) {
  return (
    <div style={{ padding: '32px' }}>
      <h2 style={{
        margin: '0 0 6px', fontSize: '22px', fontWeight: 700,
        color: '#f1f5f9', letterSpacing: '-0.02em'
      }}>
        Leads Overview
      </h2>
      <p style={{ margin: '0 0 28px', color: '#475569', fontSize: '13px' }}>
        Summary across all trademark lead types
      </p>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px'
      }}>
        {LEAD_TYPES.map(type => {
          const c = allCounts[type.key] || { valid: 0, missing: 0 };
          return (
            <div
              key={type.key}
              onClick={() => navigate(`/dashboard/${type.key}/valid`)}
              style={{
                background: '#0f172a', border: `1px solid ${type.color}33`,
                borderRadius: '12px', padding: '20px', cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = type.color + '88';
                e.currentTarget.style.background = '#111827';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = type.color + '33';
                e.currentTarget.style.background = '#0f172a';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px',
                  background: type.color + '22', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: type.color, fontSize: '10px', fontWeight: 800,
                  letterSpacing: '0.05em'
                }}>
                  {type.badge}
                </div>
                <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '14px' }}>
                  {type.label}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#4ade80', lineHeight: 1 }}>
                    {c.valid}
                  </div>
                  <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>Valid</div>
                </div>
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#fbbf24', lineHeight: 1 }}>
                    {c.missing}
                  </div>
                  <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>Missing</div>
                </div>
                <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: type.color, lineHeight: 1 }}>
                    {c.valid + c.missing}
                  </div>
                  <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>Total</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────
function Sidebar({ allCounts }) {
  const location = useLocation();

  return (
    <div style={{
      width: '220px', flexShrink: 0, background: '#070d15',
      borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0
    }}>
      {/* Logo */}
      <div style={{
        padding: '18px 16px', borderBottom: '1px solid #1e293b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M9 12h6M9 16h4"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>
              TM Leads
            </div>
            <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>Dashboard</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        {/* Overview link */}
        <NavLink
          to="/dashboard"
          end
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 10px', borderRadius: '8px', marginBottom: '4px',
            textDecoration: 'none', fontSize: '12px', fontWeight: 500,
            background: isActive ? '#1e293b' : 'transparent',
            color: isActive ? '#e2e8f0' : '#475569',
            transition: 'all 0.15s',
          })}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          Overview
        </NavLink>

        {/* Divider */}
        <div style={{ margin: '8px 4px', borderTop: '1px solid #1e293b' }} />
        <div style={{ fontSize: '9px', color: '#334155', padding: '0 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Lead Types
        </div>

        {LEAD_TYPES.map(type => {
          const c = allCounts[type.key] || { valid: 0, missing: 0 };
          const isActive = location.pathname.includes(`/dashboard/${type.key}`);
          return (
            <div key={type.key} style={{ marginBottom: '2px' }}>
              <NavLink
                to={`/dashboard/${type.key}/valid`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 10px', borderRadius: '8px',
                  textDecoration: 'none', fontSize: '12px', fontWeight: 500,
                  background: isActive ? type.color + '18' : 'transparent',
                  color: isActive ? type.color : '#475569',
                  transition: 'all 0.15s',
                  border: isActive ? `1px solid ${type.color}33` : '1px solid transparent',
                }}
              >
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: type.color, flexShrink: 0,
                  boxShadow: isActive ? `0 0 6px ${type.color}` : 'none'
                }} />
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {type.label}
                </span>
                <span style={{
                  fontSize: '10px', padding: '1px 5px', borderRadius: '8px',
                  background: '#ffffff0a', color: '#475569'
                }}>
                  {c.valid + c.missing}
                </span>
              </NavLink>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #1e293b' }}>
        <div style={{ fontSize: '10px', color: '#334155' }}>Live sync enabled</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80',
            animation: 'pulse 2s infinite'
          }} />
          <span style={{ fontSize: '10px', color: '#4ade80' }}>Connected to storage</span>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Root ───────────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate();
  const { allCounts } = useLeadData(null, null);

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      background: '#020817', color: '#e2e8f0',
      fontFamily: "'Inter', system-ui, sans-serif"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      <Sidebar allCounts={allCounts} />

      <main style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <Routes>
          <Route index element={<Overview allCounts={allCounts} navigate={navigate} />} />
          {LEAD_TYPES.map(type => (
            <Route
              key={type.key}
              path={`${type.key}/:subTab`}
              element={<LeadTypeView typeKey={type.key} />}
            />
          ))}
        </Routes>
      </main>
    </div>
  );
};

export default Dashboard;