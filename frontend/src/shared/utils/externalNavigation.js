const withTimeout = (promise, timeoutMs = 1500) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      globalThis.setTimeout(() => reject(new Error('External checkout bridge timed out')), timeoutMs);
    }),
  ]);

const isAndroidWebView = () => {
  if (globalThis.window?.__isAppzeto24WebView) return true;
  const ua = String(globalThis.navigator?.userAgent || '');
  // Standard Android WebView marker: "; wv)" in the user agent.
  if (/; wv\)/i.test(ua)) return true;
  // Older WebViews: "Version/X.X Chrome/... Mobile Safari/..."
  if (/Version\/[\d.]+.*Chrome\/[\d.]+.*Mobile Safari/i.test(ua)) return true;
  // Some Flutter WebViews strip the wv marker but still have Android + Chrome.
  // Detect via the standalone property (WebViews are not standalone PWAs).
  if (/Android/i.test(ua) && globalThis.navigator?.standalone === undefined
    && typeof globalThis.matchMedia === 'function'
    && !globalThis.matchMedia('(display-mode: standalone)').matches
    && !globalThis.matchMedia('(display-mode: browser)').matches) {
    return true;
  }
  return false;
};

export const convertToAndroidIntentUrl = (url) => {
  try {
    const hostAndPath = String(url || '').replace(/^https?:\/\//i, '');
    return `intent://${hostAndPath}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  } catch (e) {
    return url;
  }
};

const isAndroid = () => /Android/i.test(String(globalThis.navigator?.userAgent || ''));

const isIos = () => /iPhone|iPad|iPod/i.test(String(globalThis.navigator?.userAgent || ''));

const isIosWebView = () => {
  const userAgent = String(globalThis.navigator?.userAgent || '');
  return /iPhone|iPad|iPod/i.test(userAgent) && /AppleWebKit/i.test(userAgent) && !/Safari/i.test(userAgent);
};

// Detect Flutter-specific bridge globals that confirm we're inside a WebView.
const hasFlutterBridge = () => {
  try {
    return Boolean(
      globalThis.flutter_inappwebview
      || globalThis.FlutterBridge
      || globalThis.Flutter
      || globalThis._flutter_web_set_location_strategy
      || (typeof globalThis.webkit?.messageHandlers?.callHandler?.postMessage === 'function'),
    );
  } catch {
    return false;
  }
};

export const isEmbeddedCheckoutWebView = () =>
  isAndroidWebView() || isIosWebView() || hasFlutterBridge();

export const isMobileOrWebView = () =>
  /Android|iPhone|iPad|iPod/i.test(String(globalThis.navigator?.userAgent || '')) || isEmbeddedCheckoutWebView();

const isMobileBrowser = () => (isAndroid() || isIos()) && !isAndroidWebView() && !isIosWebView();

const buildCheckoutPayload = (targetUrl) => {
  const androidWebView = isAndroidWebView();
  const iosWebView = isIosWebView();
  const android = isAndroid();
  const ios = isIos();

  return {
    type: 'openExternalUrl',
    action: 'phonepe_checkout',
    url: targetUrl,
    platform: android || androidWebView ? 'android' : ios || iosWebView ? 'ios' : 'web',
    runtime: androidWebView
      ? 'android-webview'
      : iosWebView
        ? 'ios-webview'
        : isMobileBrowser()
          ? 'mobile-browser'
          : 'browser',
    timestamp: Date.now(),
  };
};

const isHandledBridgeResponse = (value) => {
  if (value === true) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['ok', 'opened', 'handled', 'success', 'true'].includes(normalized);
  }

  if (value && typeof value === 'object') {
    if (value.handled === true) return true;
    if (value.success === true) return true;
    if (value.opened === true) return true;
    if (value.status && ['ok', 'opened', 'handled', 'success'].includes(String(value.status).trim().toLowerCase())) {
      return true;
    }
  }

  return false;
};

const recordCheckoutDiagnostic = (detail = {}) => {
  const payload = {
    ...detail,
    timestamp: new Date().toISOString(),
    userAgent: String(globalThis.navigator?.userAgent || ''),
  };

  try {
    globalThis.sessionStorage?.setItem('lastExternalCheckoutDiagnostic', JSON.stringify(payload));
  } catch {
    // Ignore storage failures in private browsing or restricted WebViews.
  }

  try {
    globalThis.dispatchEvent(new CustomEvent('external-checkout:diagnostic', { detail: payload }));
  } catch {
    // Ignore dispatch failures when CustomEvent support is unavailable.
  }

  console.info('[external-checkout]', JSON.stringify(payload));
};

const postToJavascriptChannel = (targetUrl, checkoutPayload) => {
  const channelNames = ['openExternalUrl', 'openExternalCheckout', 'ExternalNavigation', 'AppBridge'];

  for (const channelName of channelNames) {
    const channel = globalThis?.[channelName];

    if (typeof channel?.postMessage === 'function') {
      const attempts = [
        { value: JSON.stringify(checkoutPayload), mode: 'json-string' },
        { value: targetUrl, mode: 'plain-url' },
      ];

      for (const attempt of attempts) {
        try {
          channel.postMessage(attempt.value);
          recordCheckoutDiagnostic({ status: 'channel-posted', channelName, mode: attempt.mode });
          return true;
        } catch (error) {
          recordCheckoutDiagnostic({
            status: 'channel-post-failed',
            channelName,
            mode: attempt.mode,
            message: error?.message || String(error),
          });
        }
      }
    }
  }

  return false;
};

const callNativeInterface = (targetUrl, checkoutPayload) => {
  if (typeof globalThis.Appzeto24Native?.openExternalUrl === 'function') {
    try {
      globalThis.Appzeto24Native.openExternalUrl({ url: targetUrl });
      recordCheckoutDiagnostic({ status: 'Appzeto24-native-bridge-called', targetUrl });
      return true;
    } catch (error) {
      recordCheckoutDiagnostic({ status: 'Appzeto24-native-bridge-failed', message: error?.message || String(error) });
    }
  }

  const bridgeNames = ['Android', 'NativeBridge', 'FlutterBridge', 'AppBridge'];
  const methodNames = ['openExternalUrl', 'openExternalCheckout', 'openUrl'];

  for (const bridgeName of bridgeNames) {
    const bridge = globalThis?.[bridgeName];
    if (!bridge) continue;

    for (const methodName of methodNames) {
      if (typeof bridge?.[methodName] === 'function') {
        const attempts = [
          { args: [JSON.stringify(checkoutPayload)], mode: 'json-string' },
          { args: [checkoutPayload], mode: 'object' },
          { args: [targetUrl], mode: 'plain-url' },
        ];

        for (const attempt of attempts) {
          try {
            bridge[methodName](...attempt.args);
            recordCheckoutDiagnostic({
              status: 'native-interface-called',
              bridgeName,
              methodName,
              mode: attempt.mode,
            });
            return true;
          } catch (error) {
            recordCheckoutDiagnostic({
              status: 'native-interface-failed',
              bridgeName,
              methodName,
              mode: attempt.mode,
              message: error?.message || String(error),
            });
          }
        }
      }
    }
  }

  if (typeof globalThis?.ReactNativeWebView?.postMessage === 'function') {
    globalThis.ReactNativeWebView.postMessage(JSON.stringify(checkoutPayload));
    recordCheckoutDiagnostic({ status: 'react-native-posted' });
    return true;
  }

  if (typeof globalThis?.webkit?.messageHandlers?.openExternalUrl?.postMessage === 'function') {
    globalThis.webkit.messageHandlers.openExternalUrl.postMessage(checkoutPayload);
    recordCheckoutDiagnostic({ status: 'webkit-posted', handlerName: 'openExternalUrl' });
    return true;
  }

  if (typeof globalThis?.webkit?.messageHandlers?.openExternalCheckout?.postMessage === 'function') {
    globalThis.webkit.messageHandlers.openExternalCheckout.postMessage(checkoutPayload);
    recordCheckoutDiagnostic({ status: 'webkit-posted', handlerName: 'openExternalCheckout' });
    return true;
  }

  return false;
};

const redirectInCurrentWindow = (targetUrl, status = 'browser-redirect') => {
  recordCheckoutDiagnostic({ status });

  if (isAndroidWebView() || globalThis.window?.__isAppzeto24WebView) {
    const intentUrl = convertToAndroidIntentUrl(targetUrl);
    recordCheckoutDiagnostic({ status: 'android-webview-intent-redirect', intentUrl });
    globalThis.location.href = intentUrl;
    return true;
  }

  globalThis.location.href = targetUrl;
  return true;
};

const openUsingWindowOpen = (targetUrl, status = 'window-open') => {
  try {
    const popup = globalThis.open?.(targetUrl, '_blank', 'noopener,noreferrer');
    if (popup) {
      recordCheckoutDiagnostic({ status, mode: 'window-open' });
      return true;
    }
  } catch (error) {
    recordCheckoutDiagnostic({
      status: `${status}-failed`,
      mode: 'window-open',
      message: error?.message || String(error),
    });
  }

  return false;
};

const openUsingAnchor = (targetUrl, status = 'anchor-open') => {
  try {
    const anchor = globalThis.document?.createElement?.('a');
    if (!anchor) return false;

    anchor.href = targetUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    globalThis.document.body?.appendChild(anchor);
    anchor.click();
    anchor.remove();
    recordCheckoutDiagnostic({ status, mode: 'anchor-click' });
    return true;
  } catch (error) {
    recordCheckoutDiagnostic({
      status: `${status}-failed`,
      mode: 'anchor-click',
      message: error?.message || String(error),
    });
  }

  return false;
};

const redirectTopWindow = (targetUrl, status = 'top-window-redirect') => {
  try {
    if (globalThis.top && globalThis.top !== globalThis && globalThis.top.location) {
      globalThis.top.location.href = targetUrl;
      recordCheckoutDiagnostic({ status, mode: 'top-location' });
      return true;
    }
  } catch (error) {
    recordCheckoutDiagnostic({
      status: `${status}-failed`,
      mode: 'top-location',
      message: error?.message || String(error),
    });
  }

  return false;
};

const failInWebView = (reason, extra = {}) => {
  recordCheckoutDiagnostic({
    status: reason,
    ...extra,
  });

  return false;
};

export const openExternalCheckout = async (url) => {
  const targetUrl = String(url || '').trim();
  const checkoutPayload = buildCheckoutPayload(targetUrl);

  if (!targetUrl) {
    recordCheckoutDiagnostic({ status: 'missing-url' });
    return false;
  }

  recordCheckoutDiagnostic({
    status: 'starting',
    platform: checkoutPayload.platform,
    runtime: checkoutPayload.runtime,
    targetHost: (() => {
      try {
        return new URL(targetUrl).host;
      } catch {
        return '';
      }
    })(),
  });

  // In a WebView environment, try to hand the URL to the native app layer
  // via JavaScript bridges/channels first. This allows the Flutter/native
  // WebView to open the checkout URL externally (Chrome Custom Tab, external
  // browser, etc.) where UPI intents (Google Pay, Paytm, PhonePe UPI) can
  // launch correctly. WebViews cannot handle UPI deep-link intents on their
  // own, so UPI payment options won't appear if we just navigate in-place.
  if (isEmbeddedCheckoutWebView()) {
    recordCheckoutDiagnostic({ status: 'webview-detected', runtime: checkoutPayload.runtime });

    // 1. Try Flutter/native JavaScript channels (postMessage)
    const channelPosted = postToJavascriptChannel(targetUrl, checkoutPayload);
    if (channelPosted) {
      return true;
    }

    // 2. Try native bridge interfaces (Android.openExternalUrl, etc.)
    const nativeCalled = callNativeInterface(targetUrl, checkoutPayload);
    if (nativeCalled) {
      return true;
    }

    // 3. Try intent-based redirection fallback or custom Chrome protocol handler FIRST!
    if (isAndroidWebView() || globalThis.window?.__isAppzeto24WebView) {
      const chromeCustomUrl = `googlechromes://navigate?url=${encodeURIComponent(targetUrl)}`;
      try {
        globalThis.location.href = chromeCustomUrl;
        recordCheckoutDiagnostic({ status: 'webview-chrome-scheme-redirect', chromeCustomUrl });

        globalThis.setTimeout(() => {
          const intentUrl = convertToAndroidIntentUrl(targetUrl);
          recordCheckoutDiagnostic({ status: 'webview-intent-fallback-deferred', intentUrl });
          globalThis.location.href = intentUrl;
        }, 250);
        return true;
      } catch (error) {
        const intentUrl = convertToAndroidIntentUrl(targetUrl);
        recordCheckoutDiagnostic({ status: 'webview-intent-fallback-immediate', intentUrl, message: error?.message || String(error) });
        globalThis.location.href = intentUrl;
        return true;
      }
    }

    // 4. Try window.open to break out of the WebView (using target _blank)
    openUsingWindowOpen(targetUrl, 'webview-window-open');

    // 5. Try dynamic anchor click breakout (using target _blank and noopener)
    openUsingAnchor(targetUrl, 'webview-anchor-open');

    recordCheckoutDiagnostic({ status: 'webview-bridge-unavailable' });
  }

  // For regular browsers, or as a final fallback when no bridge is available,
  // redirect the current window to the hosted checkout URL directly.
  return redirectInCurrentWindow(targetUrl, 'hosted-checkout-redirect');
};
