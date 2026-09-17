import rideRequestAlertUrl from '../../../assets/sounds/ride-request-alert.mp3';

let alertAudio;
let isUnlocked = false;
let shouldKeepPlaying = false;
let playInFlight = null;
let retryTimeoutId = null;
let lifecycleBound = false;
let nativePulseIntervalId = null;
let vibrationIntervalId = null;
let audioContext = null;
let oscillatorTimeoutId = null;
let oscillatorIntervalId = null;
let userHasInteracted = false;
let interactionListenersBound = false;
let unlockInFlight = null;

const markUserInteraction = () => {
    userHasInteracted = true;
};

const bindInteractionListeners = () => {
    if (interactionListenersBound || typeof window === 'undefined') {
        return;
    }

    interactionListenersBound = true;

    const options = { passive: true };
    window.addEventListener('pointerdown', markUserInteraction, options);
    window.addEventListener('touchstart', markUserInteraction, options);
    window.addEventListener('keydown', markUserInteraction, options);
    window.addEventListener('click', markUserInteraction, options);
};

const notifyNativeAlertBridge = (action = 'start') => {
    const payload = {
        type: 'driver_incoming_order_alert',
        action,
        timestamp: Date.now(),
    };

    try {
        window.__nativeDriverOrderAlert?.(payload);
    } catch {}

    try {
        window.flutter_inappwebview?.callHandler?.('driverOrderAlert', payload);
    } catch {}

    try {
        window.ReactNativeWebView?.postMessage?.(JSON.stringify(payload));
    } catch {}

    try {
        if (typeof window.Android?.driverOrderAlert === 'function') {
            window.Android.driverOrderAlert(JSON.stringify(payload));
        }
    } catch {}

    try {
        if (typeof window.webkit?.messageHandlers?.driverOrderAlert?.postMessage === 'function') {
            window.webkit.messageHandlers.driverOrderAlert.postMessage(payload);
        }
    } catch {}
};

const startNativePulse = () => {
    notifyNativeAlertBridge('start');

    if (nativePulseIntervalId || typeof window === 'undefined') {
        return;
    }

    nativePulseIntervalId = window.setInterval(() => {
        if (!shouldKeepPlaying) {
            return;
        }

        notifyNativeAlertBridge('start');
    }, 2000);
};

const stopNativePulse = () => {
    notifyNativeAlertBridge('stop');

    if (nativePulseIntervalId) {
        window.clearInterval(nativePulseIntervalId);
        nativePulseIntervalId = null;
    }
};

const getAudioContext = () => {
    if (audioContext || typeof window === 'undefined') {
        return audioContext;
    }

    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) {
        return null;
    }

    try {
        audioContext = new Context();
    } catch {
        audioContext = null;
    }

    return audioContext;
};

const clearOscillatorPulse = () => {
    if (oscillatorTimeoutId) {
        window.clearTimeout(oscillatorTimeoutId);
        oscillatorTimeoutId = null;
    }
};

const stopOscillatorLoop = () => {
    clearOscillatorPulse();

    if (oscillatorIntervalId) {
        window.clearInterval(oscillatorIntervalId);
        oscillatorIntervalId = null;
    }
};

const pulseOscillator = () => {
    const context = getAudioContext();
    if (!context || context.state !== 'running') {
        return;
    }

    try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;

        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(880, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start(now);
        oscillator.stop(now + 0.24);
    } catch {}
};

const startOscillatorLoop = () => {
    if (typeof window === 'undefined') {
        return;
    }

    pulseOscillator();

    if (oscillatorIntervalId) {
        return;
    }

    oscillatorIntervalId = window.setInterval(() => {
        if (!shouldKeepPlaying) {
            return;
        }

        pulseOscillator();
    }, 1400);
};

const startVibrationLoop = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.vibrate) {
        return;
    }

    bindInteractionListeners();

    if (!userHasInteracted) {
        return;
    }

    navigator.vibrate([400, 180, 400]);

    if (vibrationIntervalId) {
        return;
    }

    vibrationIntervalId = window.setInterval(() => {
        if (!shouldKeepPlaying) {
            return;
        }

        navigator.vibrate([400, 180, 400]);
    }, 1800);
};

const stopVibrationLoop = () => {
    if (vibrationIntervalId) {
        window.clearInterval(vibrationIntervalId);
        vibrationIntervalId = null;
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate && userHasInteracted) {
        navigator.vibrate(0);
    }
};

const clearRetryTimeout = () => {
    if (retryTimeoutId) {
        window.clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
    }
};

const getAlertAudio = () => {
    if (!alertAudio) {
        alertAudio = new Audio(rideRequestAlertUrl);
        alertAudio.loop = true;
        alertAudio.preload = 'auto';
        alertAudio.volume = 0.85;
        alertAudio.playsInline = true;
    }

    return alertAudio;
};

const scheduleRetry = (delay = 900) => {
    if (!shouldKeepPlaying) {
        return;
    }

    clearRetryTimeout();
    retryTimeoutId = window.setTimeout(() => {
        retryTimeoutId = null;
        tryPlayAlertAudio();
    }, delay);
};

const handleLifecycleResume = () => {
    if (!shouldKeepPlaying) {
        return;
    }

    const audio = getAlertAudio();
    getAudioContext()?.resume?.().catch?.(() => {});
    if (audio.paused) {
        tryPlayAlertAudio();
    }

    startOscillatorLoop();
    startVibrationLoop();
};

const bindLifecycleListeners = () => {
    if (lifecycleBound || typeof window === 'undefined') {
        return;
    }

    lifecycleBound = true;
    window.addEventListener('focus', handleLifecycleResume);
    window.addEventListener('pageshow', handleLifecycleResume);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            handleLifecycleResume();
        }
    });
};

const tryPlayAlertAudio = () => {
    const audio = getAlertAudio();
    bindLifecycleListeners();
    audio.load();
    getAudioContext()?.resume?.().catch?.(() => {});

    if (playInFlight) {
        return playInFlight;
    }

    playInFlight = audio.play()
        .then(() => {
            playInFlight = null;
            isUnlocked = true;
            clearRetryTimeout();
            stopOscillatorLoop();
        })
        .catch(() => {
            playInFlight = null;
            startOscillatorLoop();
            scheduleRetry(isUnlocked ? 1200 : 500);
        });

    return playInFlight;
};

export const unlockRideRequestAlertSound = () => {
    markUserInteraction();
    bindInteractionListeners();

    if (isUnlocked) {
        return Promise.resolve();
    }

    if (unlockInFlight) {
        return unlockInFlight;
    }

    const audio = getAlertAudio();
    const previousVolume = audio.volume;
    audio.volume = 0;
    bindLifecycleListeners();
    getAudioContext()?.resume?.().catch?.(() => {});

    unlockInFlight = audio.play()
        .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = previousVolume;
            isUnlocked = true;
            clearRetryTimeout();
            unlockInFlight = null;

            if (shouldKeepPlaying) {
                audio.currentTime = 0;
                tryPlayAlertAudio();
                startOscillatorLoop();
                startVibrationLoop();
            }
        })
        .catch(() => {
            audio.volume = previousVolume;
            unlockInFlight = null;

            if (shouldKeepPlaying) {
                startOscillatorLoop();
                scheduleRetry(500);
            }
        });

    return unlockInFlight;
};

export const playRideRequestAlertSound = () => {
    const audio = getAlertAudio();
    bindInteractionListeners();
    bindLifecycleListeners();
    shouldKeepPlaying = true;
    audio.currentTime = 0;
    startNativePulse();
    startVibrationLoop();
    startOscillatorLoop();
    tryPlayAlertAudio();
};

export const stopRideRequestAlertSound = () => {
    shouldKeepPlaying = false;
    clearRetryTimeout();
    stopNativePulse();
    stopVibrationLoop();
    stopOscillatorLoop();

    if (!alertAudio) return;

    alertAudio.pause();
    alertAudio.currentTime = 0;
};
