import React from 'react'
import Settings from './Setting.jsx'
import Navbar from './Navbar.jsx'

const Setup = () => {
  return (
    <div className='w-full h-full'>
    <div>
      <Navbar/>
    </div>
    <div className='h-full w-full'>
<Settings/>
    </div>
    </div>
  )
}

export default Setup