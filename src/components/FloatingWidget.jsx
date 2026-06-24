import React, { useState, useEffect } from 'react'
import { SettingsIcon, HideIcon, ViewIcon } from './icons/icon'
import ScanButton from './ScanButton.jsx'


const FloatingWidget = () => {

  const [isHide, setIsHide] = useState(false)
  const [isSetting, setIsSetting] = useState(true)

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
  // click karne se wapas khul jayega (purane code mein yeh check kahin tha
  // hi nahi, isliye hide karne par bhi full div render hoti rehti thi)
  if (isHide) {
    return (
      <div
        className="w-[18px] h-[60px] fixed top-[300px] left-4 px-2 z-[2147483647] bg-slate-900 rounded-tr-xl rounded-br-xl cursor-pointer flex justify-center items-center select-none transition-all ease-in-out duration-500"
        onClick={(e) => { e.stopPropagation(); toggleWidget(false) }}
      >
        <ViewIcon size="18px" className="text-white" />
        <div >
        <ScanButton/>
      </div>
      </div>
    )
  }

  return (
    <div
      className="w-[150px] min-h-20 fixed top-[300px] left-0 z-[2147483647] p-[10px] bg-slate-900 text-white rounded-tr-xl rounded-br-xl text-center font-sans flex justify-center items-center flex-col gap-2 select-none transition-all ease-in-out duration-500"
      onClick={(e) => e.stopPropagation()}
    >
    

      <div className="w-full">
        <ScanButton/>
      </div>

    </div>
  )
}

export default FloatingWidget