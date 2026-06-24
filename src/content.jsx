// src/content.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import FloatingWidget from './components/FloatingWidget.jsx'
import css from './index.css?inline'
import './components/shortkey.js';

function mount() {
  // console.log("CSS Loaded:", css)
  if (document.getElementById('uspto-scraper-root')) return

  const host = document.createElement("div")
  host.id = "uspto-scraper-root"
  
  // FIXED: Host ko styling dena zaroori hai taake ye 0x0 size ka na rahe
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  host.style.top = "0";
  host.style.left = "0";
 

  document.body.appendChild(host)

  const shadowRoot = host.attachShadow({mode: "open"})

  const style = document.createElement('style')
  style.textContent = css
  shadowRoot.appendChild(style)

  const rootElement = document.createElement('div')
  rootElement.id = 'shadow-root-container'
  shadowRoot.appendChild(rootElement)

  createRoot(rootElement).render(
    <StrictMode>
      <FloatingWidget />
    </StrictMode>,
  )
}

if (document.body) mount()
else document.addEventListener('DOMContentLoaded', mount, { once: true })