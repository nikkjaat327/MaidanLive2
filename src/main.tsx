import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { isCapacitorNative } from './utils/appOrigin.ts';

if (
  import.meta.env.PROD &&
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  !isCapacitorNative()
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Non-blocking SW registration
    });
  });
}

if ('serviceWorker' in navigator) {
  if (Capacitor.isNativePlatform()) {
    void navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.all(registrations.map((registration) => registration.unregister()))
    ).catch((error: unknown) => {
      console.error('Unable to unregister the PWA service worker in the native app.', error);
    });
  } else {
    registerSW({ immediate: true });
  }
}

createRoot(document.getElementById('root')!).render(<App />);
