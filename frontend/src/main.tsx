import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'

// Detecta ambiente Desktop (Electron) e plataforma para ajustes nativos (drag, traffic lights)
if (typeof window !== 'undefined') {
  const desktopBridge = (
    window as Window & {
      desktopBridge?: { isDesktop?: boolean; platform?: string };
    }
  ).desktopBridge;
  const isDesktop = Boolean(desktopBridge?.isDesktop);
  const platform = desktopBridge?.platform;
  if (isDesktop) {
    document.documentElement.classList.add('is-desktop');
    document.body.classList.add('is-desktop');
    if (platform === 'darwin' || navigator.userAgent.includes('Macintosh')) {
      document.documentElement.classList.add('is-desktop-mac');
      document.body.classList.add('is-desktop-mac');
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
