import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { ToastProvider } from './components/Toast';
import { Ajustes } from './screens/Ajustes';
import { Avisos } from './screens/Avisos';
import { Clasificar } from './screens/Clasificar';
import { Explorar } from './screens/Explorar';
import { Ficha } from './screens/Ficha';
import { Gustos } from './screens/Gustos';
import { Inicio } from './screens/Inicio';
import { MiLista } from './screens/MiLista';
import { RefreshProvider } from './hooks/useRefresh';
import { useUnread } from './hooks/useUnread';
import { SettingsProvider, useSettings } from './store/SettingsContext';
import { needsSetup } from './store/settings';

// Routes — spec §1. HashRouter because GitHub Pages has no rewrites.
// Without saved keys every route redirects to Ajustes in first-run mode.

function Layout() {
  const location = useLocation();
  const { settings } = useSettings();
  const setup = needsSetup(settings);
  const unread = useUnread();
  const onSettings = location.pathname === '/ajustes';

  // a new screen starts at the top
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (setup && !onSettings) return <Navigate to="/ajustes" replace />;

  return (
    <>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/titulo/:type/:id" element={<Ficha />} />
        <Route path="/explorar" element={<Explorar />} />
        <Route path="/gustos" element={<Gustos />} />
        <Route path="/lista" element={<MiLista />} />
        <Route path="/clasificar" element={<Clasificar />} />
        <Route path="/avisos" element={<Avisos />} />
        <Route path="/ajustes" element={<Ajustes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!onSettings && <BottomNav hasUnreadAlerts={unread > 0} />}
    </>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <RefreshProvider>
          <HashRouter>
            <Layout />
          </HashRouter>
        </RefreshProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}
