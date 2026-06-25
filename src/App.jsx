import FloatingWidget from './components/FloatingWidget.jsx'
import Home from './components/Home.jsx'
import Settings from './components/Setting.jsx'
import { Route, Routes,useNavigate } from 'react-router-dom'
import Setup from './components/Setup.jsx'
import Dashboard from './components/Dashboard.jsx'




export default function App() {
  return (
    <>
  <Routes>
    <Route path='/' element={<Home/>}/>
    <Route path='/setup' element={<Setup/>}/>
    <Route path='/dashboard/*' element={<Dashboard/>}/>

  </Routes>
    </>
  )
}