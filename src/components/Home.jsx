// src/components/Home.jsx
import React, { useState, useEffect, useRef } from 'react'
import Navbar from './Navbar.jsx'
import { getValidKey, getMissingKey, downloadLeads } from './download.js'
import Footer from './Footer.jsx'

const TYPE_LABELS = {
  deadAbandoned: 'Dead Abandoned',
  deadCancelled: 'Dead Cancelled',
  livePending:   'Live Pending',
  liveRegister:  'Live Register',
}

const Home = () => {
  const [activeType, setActiveType] = useState('deadAbandoned')
  const [counts, setCounts] = useState({ valid: 0, missing: 0 })

  // ✅ scraperTypeRef wale pattern jaisa — listener ke andar stale closure
  // se bachne ke liye current type ka ref rakha
  const activeTypeRef = useRef('deadAbandoned')

  const loadCounts = (type) => {
    chrome.storage.local.get([getValidKey(type), getMissingKey(type)], (res) => {
      setCounts({
        valid:   (res[getValidKey(type)]   || []).length,
        missing: (res[getMissingKey(type)] || []).length,
      })
    })
  }

  useEffect(() => {
    chrome.storage.local.get(['savedType'], (res) => {
      const type = res.savedType || 'deadAbandoned'
      activeTypeRef.current = type
      setActiveType(type)
      loadCounts(type)
    })

    const sync = (changes, area) => {
      if (area !== 'local') return

      // ✅ Type kahin se bhi switch ho (content script, dusra tab, waghera)
      // — yahan real-time reflect hoga
      if (changes.savedType) {
        const newType = changes.savedType.newValue
        activeTypeRef.current = newType
        setActiveType(newType)
        loadCounts(newType)
        return
      }

      // ✅ Sirf currently active type ke leads change hue to counts refresh karo
      const t = activeTypeRef.current
      if (changes[getValidKey(t)] || changes[getMissingKey(t)]) {
        loadCounts(t)
      }
    }

    chrome.storage.onChanged.addListener(sync)
    return () => chrome.storage.onChanged.removeListener(sync)
  }, [])

  const handleDownload = () => downloadLeads(activeType)

  const handleClearValid = () => {
    if (!confirm(`Clear all VALID leads for ${TYPE_LABELS[activeType]}?`)) return
    chrome.storage.local.set({ [getValidKey(activeType)]: [] }, () => loadCounts(activeType))
  }

  const handleClearMissing = () => {
    if (!confirm(`Clear all MISSING-PHONE leads for ${TYPE_LABELS[activeType]}?`)) return
    chrome.storage.local.set({ [getMissingKey(activeType)]: [] }, () => loadCounts(activeType))
  }

  return (
    <div className="w-[300px] min-h-[420px] bg-slate-950 text-white font-sans flex flex-col">
      <Navbar />

      {/* Active type */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">
          Active Lead Type
        </p>
        <h1 className="text-[18px] font-bold text-blue-400 leading-tight">
          {TYPE_LABELS[activeType]}
        </h1>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 gap-2 px-3 mb-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex flex-col items-center">
          <span className="text-green-400 text-[18px] font-bold leading-none">
            {counts.valid}
          </span>
          <span className="text-[9px] text-slate-400 mt-1">✅ Valid Leads</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex flex-col items-center">
          <span className="text-yellow-400 text-[18px] font-bold leading-none">
            {counts.missing}
          </span>
          <span className="text-[9px] text-slate-400 mt-1">⚠️ Missing Phone</span>
        </div>
      </div>

      {/* Actions — sab current activeType ke liye */}
      <div className="px-3 flex flex-col gap-2">
        <button
          onClick={handleDownload}
          className="w-full py-2 bg-green-400 hover:bg-green-500 text-slate-900 rounded-md font-bold text-[13px] cursor-pointer"
        >
          Download {TYPE_LABELS[activeType]}
        </button>

        <button
          onClick={handleClearValid}
          className="w-full py-2 bg-red-400/90 hover:bg-red-500 text-slate-900 rounded-md font-bold text-[12px] cursor-pointer"
        >
          Clear Valid Data
        </button>

        <button
          onClick={handleClearMissing}
          className="w-full py-2 bg-orange-400/90 hover:bg-orange-500 text-slate-900 rounded-md font-bold text-[12px] cursor-pointer"
        >
          Clear Missing Data
        </button>
      </div>

      <footer>
        <Footer/>
      </footer>
    </div>
  )
}

export default Home