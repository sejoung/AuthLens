import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { Topbar } from './components/Topbar.js';
import { FirstLaunchModal } from './components/FirstLaunchModal.js';
import { HomePage } from './pages/Home.js';
import { CapturePage } from './pages/Capture.js';
import { AnalysisPage } from './pages/Analysis.js';
import { ReportPage } from './pages/Report.js';
import { SettingsPage } from './pages/Settings.js';
import { store, useAppState } from './state/store.js';

export function App() {
  const state = useAppState();

  useEffect(() => {
    void store.loadRecent();
  }, []);

  return (
    <div className="app-shell">
      <Topbar />
      <Sidebar />
      <main className="main" id="main-content">
        {state.route === 'home' && <HomePage />}
        {state.route === 'capture' && <CapturePage />}
        {state.route === 'analysis' && <AnalysisPage />}
        {state.route === 'report' && <ReportPage />}
        {state.route === 'settings' && <SettingsPage />}
      </main>
      <FirstLaunchModal />
    </div>
  );
}
