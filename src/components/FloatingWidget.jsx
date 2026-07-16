import React, { useState, useEffect } from 'react'
import ScanButton from './ScanButton.jsx'

// ── Inline styles — Tailwind arbitrary-value classes ka bharosa nahi kiya
// (JIT/purge ke wajah se transparent render ho raha tha), isliye yahan
// sab kuch hardcoded inline style objects se guaranteed solid dikhega ──

const collapsedStyle = {
  position: 'fixed',
  top: '300px',
  left: 0,
  zIndex: 2147483647,
  width: '20px',
  height: '60px',
  backgroundColor: '#12161C',
  border: '1px solid #1E232A',
  borderLeft: 'none',
  borderTopRightRadius: '12px',
  borderBottomRightRadius: '12px',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  userSelect: 'none',
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  transition: 'background-color 0.2s ease',
}

const panelStyle = {
  position: 'fixed',
  top: '300px',
  left: 0,
  zIndex: 2147483647,
  width: '150px',
  minHeight: '80px',
  backgroundColor: '#0D1015',
  border: '1px solid #1E232A',
  borderLeft: 'none',
  borderTopRightRadius: '12px',
  borderBottomRightRadius: '12px',
  color: '#fff',
  textAlign: 'center',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '10px',
  userSelect: 'none',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
}

const FloatingWidget = () => {
  const [isHide, setIsHide] = useState(false)

  // ✅ Same 'isHide' key jo Footer.jsx aur ScanButton.jsx mein use ho raha hai —
  // poori extension mein ek hi source of truth, alag alag keys (isOpen/isWidgetHidden) ki zaroorat khatam
  useEffect(() => {
    chrome.storage.local.get(['isHide'], (res) => {
      setIsHide(res.isHide ?? false)
    })

    // Real-time Listener: Footer ke Hide button ya doosre tabs ke liye
    const syncStorage = (changes, area) => {
      if (area === 'local' && changes.isHide) {
        setIsHide(changes.isHide.newValue ?? false)
      }
    }

    chrome.storage.onChanged.addListener(syncStorage)
    return () => chrome.storage.onChanged.removeListener(syncStorage)
  }, [])

  // Storage aur State dono ko update karne wala function
  const toggleWidget = (hideVal) => {
    setIsHide(hideVal)
    chrome.storage.local.set({ isHide: hideVal })
  }

  // ✅ isHide true → poora widget gayab, sirf ek chota tab dikhega jo
  // click karne se wapas khul jayega
  if (isHide) {
    return (
      <div
        style={collapsedStyle}
        onClick={(e) => { e.stopPropagation(); toggleWidget(false) }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#161B22')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#12161C')}
        title="Open scraper panel"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path
            d="M9 6l6 6-6 6"
            stroke="#C99A2E"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    )
  }

  return (
    <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
      <div style={{ width: '100%' }}>
        <ScanButton />
      </div>
    </div>
  )
}

export default FloatingWidget