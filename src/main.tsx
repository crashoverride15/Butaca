import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';

async function start() {
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
