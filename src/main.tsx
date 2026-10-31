import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';

// The physical screen height in CSS px: base.css makes every page a little taller than this (D37).
function setScreenHeight() {
  document.documentElement.style.setProperty('--screen-h', `${Math.max(window.screen.height, window.screen.width)}px`);
}

async function start() {
  setScreenHeight();
  // dev-only fake TMDB/OMDb: open the app with ?mock
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
    await (await import('./dev/mock')).installMock();
  }
  render();
}

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
