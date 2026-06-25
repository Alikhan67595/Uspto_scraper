import { useState, useEffect } from 'react' 
import { LinkIcon, ViewIcon, HideIcon } from './icons/icon.jsx'

const DASHBOARD_URL = 'https://alikhan.site'

const Footer = () => {

    const [isHide, setIsHide] = useState(false)

    // ✅ Extension load hotay hi storage se isHide uthao (agar key missing ho
    // to background.js already false set kar deta hai, so res.isHide ?? false
    // safe fallback hai)
    useEffect(() => {
        chrome.storage.local.get(['isHide'], (res) => {
            setIsHide(res.isHide ?? false)
        })

        // ✅ Agar koi aur jagah se (ya future mein) isHide change ho to Footer
        // bhi sync rahe
        const syncIsHide = (changes, area) => {
            if (area !== 'local') return
            if (changes.isHide) {
                setIsHide(changes.isHide.newValue)
            }
        }
        chrome.storage.onChanged.addListener(syncIsHide)
        return () => chrome.storage.onChanged.removeListener(syncIsHide)
    }, [])

    // ✅ Toggle karte waqt seedha storage mein likho — ScanButton.jsx aur
    // FloatingWidget.jsx wahi value sun ke apna UI show/hide karenge
    const toggleHide = () => {
        const newVal = !isHide
        setIsHide(newVal)
        chrome.storage.local.set({ isHide: newVal })
    }

    // // ✅ chrome.tabs.create taake popup band hone ke bawajood naya tab
    // // reliably khulay (window.open popup context mein hamesha trust nahi hota)
    // const openDashboard = () => {
    //     chrome.tabs.create({ url: DASHBOARD_URL })
    // }

const openDashboard = () => {
         // Vite ke default index.html ke aage HashRouter ka path
        const dashboardUrl = chrome.runtime.getURL("index.html#/dashboard");
        
        chrome.windows.create({
            url: dashboardUrl,
            type: "popup", // "popup" type se address bar aur bookmarks hide ho jaate hain, clean app look milti hai
            width: 1000,
            height: 1000
        });
    }



  return (
    <div className='px-3 pb-3 pt-1 absolute bottom-0 w-full'>
        {/* ✅ Home.jsx ke counts cards jaisa hi bg-slate-900 + border-slate-800 +
            rounded-lg card — ab Footer Navbar jaisa "alag tukda" nahi lagta,
            balke baqi popup ke design system ka hissa lagta hai */}
        <div className='flex bg-slate-900 border border-slate-800 rounded-lg overflow-hidden'>

            <button
                onClick={toggleHide}
                className={`flex-1 h-9 flex items-center justify-center gap-[6px] text-[12px] font-semibold transition-colors duration-200
                ${isHide
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
            >
                {isHide ? <ViewIcon size="13px" /> : <HideIcon size="13px" />}
                {isHide ? "Show" : "Hide"}
            </button>

            <div className='w-px bg-slate-800'/>

            <button
                onClick={openDashboard}
                className='flex-1 h-9 flex items-center justify-center gap-[6px] text-[12px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors duration-200'
            >
                Leads Dashboard
                <LinkIcon size="13px" />
            </button>

        </div>
    </div>
  )
}

export default Footer