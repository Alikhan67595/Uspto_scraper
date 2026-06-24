import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ToastContainer } from 'react-toastify';
import { HashRouter } from 'react-router-dom'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
    <App />
    <ToastContainer position="top-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick={false}
            rtl={false}
            pauseOnFocusLoss
            theme="dark"
             />
             </HashRouter>
  </StrictMode>,
)
