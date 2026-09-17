// Spoof User Agent for WebView containers to prevent payment gateways (PhonePe/Razorpay)
// from hiding UPI intent options.
try {
  const ua = navigator.userAgent;

  // Detect WebView containers — covers standard Android WebView markers, Flutter WebView
  // globals, native bridge interfaces, and heuristic mobile-UA-without-real-browser signals.
  const hasClassicWebViewMarker = /; wv\)/i.test(ua) || /Version\/[\d.]+/i.test(ua);
  const hasFlutterBridge = typeof window.flutter_inappwebview !== 'undefined'
    || typeof window.Flutter !== 'undefined'
    || typeof window.__Appzeto24_native !== 'undefined'
      || typeof window.AndroidBridge !== 'undefined'
      || typeof window.Android !== 'undefined';
  const isMobileUaWithoutBrowser = /Android.*Mobile/i.test(ua)
    && !/\bChrome\/[\d.]+\b.*\bSafari\/[\d.]+\b/.test(ua);
  const isStandaloneMode = typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches
    && /Android|iPhone|iPad/i.test(ua);

  const isWebView = hasClassicWebViewMarker
    || hasFlutterBridge
    || isMobileUaWithoutBrowser
    || isStandaloneMode
    || window.__isAppzeto24WebView === true;

  if (isWebView) {
    window.__isAppzeto24WebView = true;
    const spoofedUa = ua
      .replace(/; wv\)/g, '')
      .replace(/Version\/[\d.]+\s*/g, '');

    Object.defineProperty(navigator, 'userAgent', {
      get: function () {
        return spoofedUa;
      },
      configurable: true,
    });

    Object.defineProperty(navigator, 'appVersion', {
      get: function () {
        return spoofedUa;
      },
      configurable: true,
    });

    console.info('[UA Spoofing] WebView detected, removed identifiers to enable UPI apps.');
  }
} catch (e) {
  console.error('[UA Spoofing] Failed to override userAgent property:', e);
}

if (typeof window !== 'undefined') {
  window.__pendingNativeFcmCalls = Array.isArray(window.__pendingNativeFcmCalls)
    ? window.__pendingNativeFcmCalls
    : [];

  if (typeof window.__saveNativeFcmToken !== 'function') {
    const queueNativeFcmCall = (tokenOrPayload, role, platform = 'android') => {
      const payload =
        typeof tokenOrPayload === 'object' && tokenOrPayload !== null
          ? tokenOrPayload
          : { token: tokenOrPayload, role, platform };

      window.__pendingNativeFcmCalls.push(payload);
      return { ok: false, reason: 'bridge-not-ready' };
    };

    window.__saveNativeFcmToken = (token, role, platform = 'android') => {
      return queueNativeFcmCall(token, role, platform);
    };
    window.__setNativeFcmToken = (token, role, platform = 'android') => {
      return queueNativeFcmCall(token, role, platform);
    };
    window.setNativeFcmToken = (token, role, platform = 'android') => {
      return queueNativeFcmCall(token, role, platform);
    };
    window.onNativeFcmToken = (token, role, platform = 'android') => {
      return queueNativeFcmCall(token, role, platform);
    };
    window.onFcmTokenReceived = (token, role, platform = 'android') => {
      return queueNativeFcmCall(token, role, platform);
    };
    window.saveFcmToken = (token, role, platform = 'android') => {
      return queueNativeFcmCall(token, role, platform);
    };
    window.setFcmToken = (token, role, platform = 'android') => {
      return queueNativeFcmCall(token, role, platform);
    };
  }
}

import { createRoot } from 'react-dom/client'
import './index.css'
import { installLegacyBackendShim } from './shared/api/legacyBackendShim'
import { installBrowserFcmRegistration } from './shared/push/browserFcmRegistration'
import { installNativeFcmBridge } from './shared/push/nativeFcmBridge'
import { installHistoryStateSanitizer } from './shared/utils/historyState'
import App from './App.jsx'

installLegacyBackendShim()
installBrowserFcmRegistration()
installNativeFcmBridge()
installHistoryStateSanitizer()

createRoot(document.getElementById('root')).render(
  <App />,
)

