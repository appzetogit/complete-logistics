import { useEffect } from 'react';

const CHECK_INTERVAL_MS = 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 1500;

const getCurrentEntryScript = () => {
  if (typeof document === 'undefined') {
    return '';
  }

  const scripts = Array.from(document.querySelectorAll('script[type="module"][src]'));
  return scripts[scripts.length - 1]?.getAttribute('src') || '';
};

const getEntryScriptFromHtml = (html = '') => {
  const match = String(html).match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i);
  return match?.[1] || '';
};

const AppAutoUpdater = () => {
  useEffect(() => {
    if (!import.meta.env.PROD || typeof window === 'undefined') {
      return undefined;
    }

    const currentEntryScript = getCurrentEntryScript();

    if (!currentEntryScript) {
      return undefined;
    }

    const checkForUpdate = async () => {
      try {
        const response = await fetch(`/?t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        const html = await response.text();
        const nextEntryScript = getEntryScriptFromHtml(html);

        if (nextEntryScript && nextEntryScript !== currentEntryScript) {
          window.location.reload();
        }
      } catch {
        // Stay on the current bundle if update probing fails.
      }
    };

    const initialCheckTimer = window.setTimeout(checkForUpdate, INITIAL_CHECK_DELAY_MS);
    const interval = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    window.addEventListener('focus', checkForUpdate);
    window.addEventListener('pageshow', checkForUpdate);

    return () => {
      window.clearTimeout(initialCheckTimer);
      window.clearInterval(interval);
      window.removeEventListener('focus', checkForUpdate);
      window.removeEventListener('pageshow', checkForUpdate);
    };
  }, []);

  return null;
};

export default AppAutoUpdater;
