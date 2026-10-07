import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/globals.css';
import { App } from './app/App';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { AuthorizationProvider } from '@/lib/permissions/AuthorizationContext';
import { NotificationProvider } from '@/features/notifications/hooks/NotificationContext';

const root = document.getElementById('root');

if (!root) {
  throw new Error('SHAKH root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AuthorizationProvider>
          <NotificationProvider>
            <App />
          </NotificationProvider>
        </AuthorizationProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
