import React from 'react'
import { NavLink } from 'react-router-dom'

const Navbar = () => {
  return (
    <nav className='w-full h-[42px] flex flex-row bg-slate-950 border-b border-white/10'>

      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `w-[50%] h-full flex items-center justify-center gap-[6px] text-[12px] font-semibold transition-all duration-200
          ${isActive
            ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`
        }
      >
        {/* Status Icon */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        Status
      </NavLink>

      <div className='w-[1px] bg-white/10 my-2'/>

      <NavLink
        to="/setup"
        className={({ isActive }) =>
          `w-[50%] h-full flex items-center justify-center gap-[6px] text-[12px] font-semibold transition-all duration-200
          ${isActive
            ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`
        }
      >
        {/* Settings Icon */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Settings
      </NavLink>

    </nav>
  )
}

export default Navbar