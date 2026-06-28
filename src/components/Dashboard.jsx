import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import logo from "../assets/icon128.png"

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

// ─── Hook: real-time storage listener ────────────────────────
function useLeadData(type, subType) {
  const [leads, setLeads] = useState([]);
  const [allCounts, setAllCounts] = useState({});

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

// ─── Delete helpers ───────────────────────────────────────────
function deleteSingleLead(type, subType, serial, callback) {
  const key = subType === 'valid' ? getValidKey(type) : getMissingKey(type);
  chrome.storage.local.get([key], (res) => {
    const updated = (res[key] || []).filter(l => l.serial !== serial);
    chrome.storage.local.set({ [key]: updated }, callback);
  });
}

function deleteMultipleLeads(type, subType, serials, callback) {
  const key = subType === 'valid' ? getValidKey(type) : getMissingKey(type);
  const set = new Set(serials);
  chrome.storage.local.get([key], (res) => {
    const updated = (res[key] || []).filter(l => !set.has(l.serial));
    chrome.storage.local.set({ [key]: updated }, callback);
  });
}

// ─── Trash Icon ───────────────────────────────────────────────
function TrashIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
    </svg>
  );
}

// ─── Custom Checkbox ──────────────────────────────────────────
function Checkbox({ checked, indeterminate, onChange }) {
  const [hovered, setHovered] = React.useState(false);
  const active = checked || indeterminate;

  return (
    <div
      onClick={e => { e.stopPropagation(); onChange && onChange(e); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '15px', height: '15px', borderRadius: '4px', flexShrink: 0,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1.5px solid ${active ? '#3b82f6' : hovered ? '#475569' : '#2d3f55'}`,
        background: active ? '#3b82f6' : hovered ? '#1e293b' : '#0f172a',
        transition: 'all 0.12s ease',
        boxShadow: active ? '0 0 0 3px #3b82f620' : hovered ? '0 0 0 3px #3b82f610' : 'none',
        userSelect: 'none',
      }}
    >
      {indeterminate && !checked ? (
        <div style={{ width: '7px', height: '1.5px', background: '#fff', borderRadius: '1px' }} />
      ) : checked ? (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <polyline points="1,3.5 3.5,6 8,1" stroke="white" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : null}
    </div>
  );
}

// ─── Filter helpers ──────────────────────────────────────────
const LLC_REGEX = /\bllc\b|l\.l\.c\.?/i;
const INC_REGEX = /\binc\b|i\.n\.c\.?/i;

// Parse "Jan. 15, 2024" or "January 15, 2024" to Date object
function parseLeadDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function applyFilters(leads, filterLLC, filterINC, searchQuery, dateFrom, dateTo) {
  return leads.filter(l => {
    const c = l.correspondent || '';
    if (filterLLC && !filterINC && !LLC_REGEX.test(c)) return false;
    if (filterINC && !filterLLC && !INC_REGEX.test(c)) return false;
    if (filterLLC && filterINC && !(LLC_REGEX.test(c) || INC_REGEX.test(c))) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const haystack = [l.serial, l.mark, l.correspondent, l.phone, l.email, l.leadDate].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    if (dateFrom || dateTo) {
      const ld = parseLeadDate(l.leadDate);
      if (!ld) return false;
      if (dateFrom && ld < new Date(dateFrom)) return false;
      if (dateTo && ld > new Date(dateTo + 'T23:59:59')) return false;
    }

    return true;
  });
}

// ─── Filter Toggle Button ─────────────────────────────────────
function FilterChip({ label, active, count, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '4px 11px', borderRadius: '20px', border: `1px solid ${active ? color : '#1e293b'}`,
        background: active ? color + '22' : 'transparent',
        color: active ? color : '#475569',
        cursor: 'pointer', fontSize: '11px', fontWeight: 600,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = color + '55'; e.currentTarget.style.color = color + 'aa'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#475569'; } }}
    >
      {label}
      <span style={{
        padding: '1px 5px', borderRadius: '8px', fontSize: '10px',
        background: active ? color + '33' : '#ffffff08',
        color: active ? color : '#334155',
      }}>
        {count}
      </span>
    </button>
  );
}

// ─── Row with hover-revealed checkbox ────────────────────────
function RowWithCheckbox({ children, isSelected, isDeleting, onToggle, isVisited, accentColor, isSearchMatch }) {
  const [rowHovered, setRowHovered] = React.useState(false);
  const showCheckbox = rowHovered || isSelected;

  return (
    <tr
      style={{
        borderBottom: '1px solid #1e293b',
        background: isSelected ? '#1e3a5f33' : isSearchMatch ? '#1e3a5f20' : 'transparent',
        opacity: isDeleting ? 0.4 : 1,
        transition: 'background 0.1s, opacity 0.2s',
        borderLeft: isVisited ? `3px solid ${accentColor}80` : '3px solid transparent',
      }}
      onMouseEnter={() => setRowHovered(true)}
      onMouseLeave={() => setRowHovered(false)}
    >
      {/* Checkbox cell — visible on hover or when selected */}
      <td style={{ padding: '10px 14px', width: '36px' }} onClick={e => e.stopPropagation()}>
        <div style={{
          opacity: showCheckbox ? 1 : 0,
          transform: showCheckbox ? 'scale(1)' : 'scale(0.7)',
          transition: 'opacity 0.15s, transform 0.15s',
          pointerEvents: showCheckbox ? 'auto' : 'none',
        }}>
          <Checkbox checked={isSelected} onChange={onToggle} />
        </div>
      </td>
      {children}
    </tr>
  );
}

// ─── Date input style ─────────────────────────────────────────
const dateInputStyle = {
  padding: '4px 8px', borderRadius: '6px',
  border: '1px solid #1e293b', background: '#0f172a',
  color: '#94a3b8', fontSize: '11px', cursor: 'pointer',
  outline: 'none', fontFamily: 'inherit',
};

// ─── Table Component ─────────────────────────────────────────
function LeadsTable({ leads, type, subType }) {
  const [selected, setSelected] = useState(new Set());
  const [deletingId, setDeletingId] = useState(null);
  const [filterLLC, setFilterLLC] = useState(false);
  const [filterINC, setFilterINC] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Visited serials — in-memory only, resets on page refresh
  const [visitedSerials, setVisitedSerials] = useState(new Set());

  const dateLabel = DATE_LABELS[type] || 'Date';
  const accentColor = LEAD_TYPES.find(t => t.key === type)?.color || '#3b82f6';

  // Filtered leads
  const filteredLeads = applyFilters(leads, filterLLC, filterINC, searchQuery, dateFrom, dateTo);

  // Counts for filter chips
  const llcCount = leads.filter(l => LLC_REGEX.test(l.correspondent || '')).length;
  const incCount = leads.filter(l => INC_REGEX.test(l.correspondent || '')).length;

  // Reset selection when leads or filters change
  useEffect(() => { setSelected(new Set()); }, [leads, filterLLC, filterINC, searchQuery, dateFrom, dateTo]);

  const allChecked  = filteredLeads.length > 0 && selected.size === filteredLeads.length;
  const someChecked = selected.size > 0 && selected.size < filteredLeads.length;

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filteredLeads.map(l => l.serial)));
  };

  const toggleOne = (serial) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(serial) ? next.delete(serial) : next.add(serial);
      return next;
    });
  };

  const handleDeleteOne = (serial) => {
    setDeletingId(serial);
    deleteSingleLead(type, subType, serial, () => setDeletingId(null));
  };

  const handleDeleteSelected = () => {
    if (selected.size === 0) return;
    const serials = [...selected];
    deleteMultipleLeads(type, subType, serials, () => setSelected(new Set()));
  };

  const handleSerialClick = (serial) => {
    setVisitedSerials(prev => new Set([...prev, serial]));
  };

  const clearDateFilter = () => { setDateFrom(''); setDateTo(''); };

  if (leads.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '300px', gap: '12px', color: '#475569'
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="1"/>
        </svg>
        <span style={{ fontSize: '14px', fontWeight: 500 }}>
          No {subType === 'valid' ? 'valid' : 'missing phone'} leads yet
        </span>
        <span style={{ fontSize: '12px', color: '#334155' }}>
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ── Sticky filter + search bar (sits right under the header above) ── */}
      <div style={{
        position: 'sticky', top: 'var(--leadtype-header-h, 0px)', zIndex: 10,
        background: '#070d15',
        borderBottom: '1px solid #1e293b',
      }}>
        {/* Filter chips + date range + search — sab ek hi line mein */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 16px', borderBottom: '1px solid #1a2540',
          background: '#06111e', flexWrap: 'nowrap', overflowX: 'auto',
        }}>
          {/* Type filter label + chips */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span style={{ fontSize: '10px', color: '#475569', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
            Filter
          </span>
          <FilterChip label="LLC" active={filterLLC} count={llcCount} color="#a78bfa" onClick={() => setFilterLLC(v => !v)} />
          <FilterChip label="INC" active={filterINC} count={incCount} color="#38bdf8" onClick={() => setFilterINC(v => !v)} />

          {/* Divider */}
          <div style={{ width: '1px', height: '18px', background: '#1e293b', margin: '0 2px', flexShrink: 0 }} />

          {/* Date section */}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            title="From date"
            style={dateInputStyle}
          />
          <span style={{ color: '#334155', fontSize: '11px', flexShrink: 0 }}>→</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            title="To date"
            style={dateInputStyle}
          />
          {(dateFrom || dateTo) && (
            <button onClick={clearDateFilter} style={{
              padding: '2px 8px', borderRadius: '5px',
              border: '1px solid #1e293b', background: 'transparent',
              color: '#64748b', cursor: 'pointer', fontSize: '10px', flexShrink: 0,
            }}>✕</button>
          )}

          {/* Divider */}
          <div style={{ width: '1px', height: '18px', background: '#1e293b', margin: '0 2px', flexShrink: 0 }} />

          {/* Search - takes remaining space, pushed to the right */}
          <div style={{ position: 'relative', flex: 1, minWidth: '110px', maxWidth: '280px', marginLeft: 'auto' }}>
            <svg style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '5px 26px 5px 26px',
                background: '#0f172a', border: `1px solid ${searchQuery ? '#3b82f6' : '#1e293b'}`,
                borderRadius: '6px', color: '#e2e8f0', fontSize: '11px',
                outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = searchQuery ? '#3b82f6' : '#1e293b'}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{
                position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: '#475569', cursor: 'pointer',
                fontSize: '13px', lineHeight: 1, padding: '0',
              }}>×</button>
            )}
          </div>

          {/* Match count — search/date/LLC/INC sab ke liye combined */}
          {(searchQuery || dateFrom || dateTo || filterLLC || filterINC) && (
            <span style={{ fontSize: '10px', color: '#64748b', flexShrink: 0 }}>
              <strong style={{ color: '#e2e8f0' }}>{filteredLeads.length}</strong>/{leads.length}
            </span>
          )}

          {/* Clear all active filters — chip, date, search sab ek saath reset */}
          {(filterLLC || filterINC || dateFrom || dateTo || searchQuery) && (
            <button
              onClick={() => { setFilterLLC(false); setFilterINC(false); clearDateFilter(); setSearchQuery(''); }}
              style={{
                padding: '2px 9px', borderRadius: '6px', flexShrink: 0,
                border: '1px solid #1e293b', background: 'transparent',
                color: '#64748b', cursor: 'pointer', fontSize: '10px',
              }}
            >Clear</button>
          )}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 16px', background: '#1e293b',
            borderBottom: '1px solid #334155',
          }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              <strong style={{ color: '#e2e8f0' }}>{selected.size}</strong> selected
            </span>
            <button
              onClick={handleDeleteSelected}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '4px 12px', borderRadius: '6px', border: 'none',
                background: '#ef444422', color: '#ef4444', cursor: 'pointer',
                fontSize: '11px', fontWeight: 600, transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#ef444433'}
              onMouseLeave={e => e.currentTarget.style.background = '#ef444422'}
            >
              <TrashIcon size={12} />
              Delete {selected.size === filteredLeads.length ? 'All' : 'Selected'}
            </button>
            <button onClick={() => setSelected(new Set())} style={{
              padding: '4px 10px', borderRadius: '6px', border: '1px solid #334155',
              background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '11px',
            }}>Cancel</button>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: '12px',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
        }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${accentColor}33` }}>
              <th style={{ padding: '10px 14px', width: '36px' }}>
                <div style={{ opacity: someChecked || allChecked ? 1 : 0.25, transition: 'opacity 0.15s' }}>
                  <Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} />
                </div>
              </th>
              {['#', 'Serial', 'Mark', dateLabel, 'Correspondent', 'Phone', 'Email', ''].map(h => (
                <th key={h} style={{
                  padding: '10px 14px', textAlign: 'left', color: '#64748b',
                  fontWeight: 600, fontSize: '10px', letterSpacing: '0.08em',
                  textTransform: 'uppercase', whiteSpace: 'nowrap'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
                  No leads match the current filter
                </td>
              </tr>
            ) : filteredLeads.map((lead, i) => {
              const isSelected = selected.has(lead.serial);
              const isDeleting = deletingId === lead.serial;
              const isVisited  = visitedSerials.has(lead.serial);
              const isSearchMatch = !!searchQuery;
              return (
                <RowWithCheckbox
                  key={`${lead.serial}-${i}`}
                  isSelected={isSelected}
                  isDeleting={isDeleting}
                  onToggle={() => toggleOne(lead.serial)}
                  isVisited={isVisited}
                  accentColor={accentColor}
                  isSearchMatch={isSearchMatch}
                >
                  <td style={{ padding: '10px 14px', color: '#334155', fontSize: '11px' }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <a
                      href={`https://tsdr.uspto.gov/#caseNumber=${lead.serial}&caseType=SERIAL_NO&searchType=statusSearch`}
                      target="_blank" rel="noreferrer"
                      onClick={() => handleSerialClick(lead.serial)}
                      style={{ color: isVisited ? '#94a3b8' : accentColor, textDecoration: 'none', fontWeight: 600 }}
                      onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.target.style.textDecoration = 'none'}
                    >
                      {lead.serial}
                    </a>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#e2e8f0', maxWidth: '200px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.mark}</div>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{lead.leadDate}</td>
                  <td style={{ padding: '10px 14px', color: '#cbd5e1', maxWidth: '180px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(filterLLC || filterINC)
                        ? <span dangerouslySetInnerHTML={{
                            __html: (lead.correspondent || '').replace(
                              /(llc|l\.l\.c\.?|inc|i\.n\.c\.?)/gi,
                              m => `<mark style="background:#7c3aed33;color:#a78bfa;border-radius:2px;padding:0 2px">${m}</mark>`
                            )
                          }} />
                        : lead.correspondent}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {lead.phone
                      ? <a href={`tel:${lead.phone}`} style={{ color: '#4ade80', textDecoration: 'none' }}>{lead.phone}</a>
                      : <span style={{ color: '#ef4444', fontSize: '11px' }}>MISSING</span>}
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: '200px' }}>
                    {lead.email && lead.email !== 'N/A'
                      ? <a href={`mailto:${lead.email}`} style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '11px' }}>{lead.email}</a>
                      : <span style={{ color: '#475569', fontSize: '11px' }}>N/A</span>}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleDeleteOne(lead.serial)}
                      disabled={isDeleting}
                      title="Delete lead"
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '26px', height: '26px', borderRadius: '6px',
                        border: '1px solid #1e293b', background: 'transparent',
                        color: '#475569', cursor: isDeleting ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#ef444422'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef444444'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = '#1e293b'; }}
                    >
                      <TrashIcon size={13} />
                    </button>
                  </td>
                </RowWithCheckbox>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Lead Type View ───────────────────────────────────────────
function LeadTypeView({ typeKey }) {
  const [subTab, setSubTab] = useState('valid');
  const { leads, allCounts } = useLeadData(typeKey, subTab);
  const typeInfo = LEAD_TYPES.find(t => t.key === typeKey);
  const counts = allCounts[typeKey] || { valid: 0, missing: 0 };

  // Measure this header's real height so the filter bar below it
  // (rendered inside LeadsTable) can stick right underneath it
  // instead of both fighting over the same top:0 spot.
  const headerRef = React.useRef(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const updateHeight = () => {
      document.documentElement.style.setProperty('--leadtype-header-h', `${el.offsetHeight}px`);
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, [typeKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div ref={headerRef} style={{
        position: 'fixed', top: 0, left: '220px', right: 0, zIndex: 20,
        padding: '20px 24px 0', borderBottom: '1px solid #1e293b', flexShrink: 0,
        background: '#020817',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: typeInfo?.color, boxShadow: `0 0 8px ${typeInfo?.color}`
          }} />
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
            {typeInfo?.label}
          </h2>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
            <span style={{
              fontSize: '11px', padding: '3px 10px', borderRadius: '20px',
              background: '#16a34a22', color: '#4ade80', border: '1px solid #16a34a44'
            }}>✅ {counts.valid} valid</span>
            <span style={{
              fontSize: '11px', padding: '3px 10px', borderRadius: '20px',
              background: '#d9770622', color: '#fbbf24', border: '1px solid #d9770644'
            }}>⚠️ {counts.missing} missing</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0' }}>
          {[
            { key: 'valid',   label: 'Valid Leads',  count: counts.valid   },
            { key: 'missing', label: 'Missing Phone', count: counts.missing },
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

      <div style={{ flex: 1, position: 'relative', paddingTop: 'var(--leadtype-header-h, 0px)' }}>
        <LeadsTable leads={leads} type={typeKey} subType={subTab} />
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────
function Overview({ allCounts, navigate }) {
  return (
    <div style={{ padding: '32px' }}>
      <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
        Leads Overview
      </h2>
      <p style={{ margin: '0 0 28px', color: '#475569', fontSize: '13px' }}>
        Real-time summary across all trademark lead types
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
        {LEAD_TYPES.map(type => {
          const c = allCounts[type.key] || { valid: 0, missing: 0 };
          return (
            <div
              key={type.key}
              onClick={() => navigate(`/dashboard/${type.key}/valid`)}
              style={{
                background: '#0f172a', border: `1px solid ${type.color}33`,
                borderRadius: '12px', padding: '20px', cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = type.color + '88'; e.currentTarget.style.background = '#111827'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = type.color + '33'; e.currentTarget.style.background = '#0f172a'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px',
                  background: type.color + '22', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: type.color, fontSize: '10px', fontWeight: 800,
                }}>
                  {type.badge}
                </div>
                <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '14px' }}>{type.label}</span>
              </div>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#4ade80', lineHeight: 1 }}>{c.valid}</div>
                  <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>Valid</div>
                </div>
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#fbbf24', lineHeight: 1 }}>{c.missing}</div>
                  <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>Missing</div>
                </div>
                <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: type.color, lineHeight: 1 }}>{c.valid + c.missing}</div>
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
      <div style={{ padding: '18px 16px', borderBottom: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '35px', height: '35px',
            borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <img src={logo} alt="" />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>USPTO Leads</div>
            <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>Dashboard</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        <NavLink to="/dashboard" end style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 10px', borderRadius: '8px', marginBottom: '4px',
          textDecoration: 'none', fontSize: '12px', fontWeight: 500,
          background: isActive ? '#1e293b' : 'transparent',
          color: isActive ? '#e2e8f0' : '#475569', transition: 'all 0.15s',
        })}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          Overview
        </NavLink>

        <div style={{ margin: '8px 4px', borderTop: '1px solid #1e293b' }} />
        <div style={{ fontSize: '9px', color: '#334155', padding: '0 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Lead Types
        </div>

        {LEAD_TYPES.map(type => {
          const c = allCounts[type.key] || { valid: 0, missing: 0 };
          const isActive = location.pathname.includes(`/dashboard/${type.key}`);
          return (
            <div key={type.key} style={{ marginBottom: '2px' }}>
              <NavLink to={`/dashboard/${type.key}/valid`} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 10px', borderRadius: '8px',
                textDecoration: 'none', fontSize: '12px', fontWeight: 500,
                background: isActive ? type.color + '18' : 'transparent',
                color: isActive ? type.color : '#475569', transition: 'all 0.15s',
                border: isActive ? `1px solid ${type.color}33` : '1px solid transparent',
              }}>
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: type.color, flexShrink: 0,
                  boxShadow: isActive ? `0 0 6px ${type.color}` : 'none'
                }} />
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {type.label}
                </span>
                <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '8px', background: '#ffffff0a', color: '#475569' }}>
                  {c.valid + c.missing}
                </span>
              </NavLink>
            </div>
          );
        })}
      </nav>

      <div style={{ padding: '12px 16px', borderTop: '1px solid #1e293b' }}>
        <div style={{ fontSize: '10px', color: '#334155' }}>Live sync enabled</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', animation: 'pulse 2s infinite' }} />
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
    <div style={{ display: 'flex', minHeight: '100vh', background: '#020817', color: '#e2e8f0', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
      <Sidebar allCounts={allCounts} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route index element={<Overview allCounts={allCounts} navigate={navigate} />} />
          {LEAD_TYPES.map(type => (
            <Route key={type.key} path={`${type.key}/:subTab`} element={<LeadTypeView typeKey={type.key} />} />
          ))}
        </Routes>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;