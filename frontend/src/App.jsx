import { Suspense } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { SettingsProvider } from './shared/context/SettingsContext';
import { UserThemeProvider } from './shared/context/UserThemeContext';
import AppAutoUpdater from './modules/shared/components/AppAutoUpdater';
import MainLayout from './layouts/MainLayout';
import AppRoutes from './routes';
import './App.css';

const suspenseFallback = (
  <div className="flex items-center justify-center min-h-screen bg-white">
    <span className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></span>
  </div>
);

function App() {
  return (
    <Router>
      <SettingsProvider>
        <UserThemeProvider>
          <AppAutoUpdater />
          <MainLayout>
            <Suspense fallback={suspenseFallback}>
              <Toaster position="top-right" />
              <AppRoutes />
            </Suspense>
          </MainLayout>
        </UserThemeProvider>
      </SettingsProvider>
    </Router>
  );
}

export default App;
