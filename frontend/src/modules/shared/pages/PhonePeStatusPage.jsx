import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Loader2, AlertTriangle, ArrowRight, RefreshCcw } from 'lucide-react';
import api from '../../../shared/api/axiosInstance';
import { userAuthService } from '../../user/services/authService';
import { userService } from '../../user/services/userService';
import {
  clearPendingPhonePeRedirect,
  readPendingPhonePeRedirect,
  resolvePendingPhonePeTransaction,
} from '../../../shared/utils/phonePeResume';

const FLOWS = {
  'user-wallet': {
    flowKey: 'user-wallet-topup',
    targetPath: '/taxi/user/wallet',
    label: 'Wallet top-up',
    paidRedirectPath: '/taxi/user/wallet',
    verify: (merchantTransactionId) => userAuthService.verifyPhonePeWalletTopup(merchantTransactionId),
  },
  'driver-wallet': {
    flowKey: 'driver-wallet-topup',
    targetPath: '/taxi/driver/wallet',
    label: 'Driver wallet top-up',
    paidRedirectPath: '/taxi/driver/wallet',
    verify: (merchantTransactionId) => api.get(`/drivers/wallet/top-up/phonepe/status/${merchantTransactionId}`),
  },
  'user-rental': {
    flowKey: 'user-rental-advance',
    targetPath: '/rental/deposit',
    label: 'Rental advance',
    paidRedirectPath: null,
    verify: (merchantTransactionId) => userService.verifyPhonePeRentalAdvancePayment(merchantTransactionId),
  },
};

const normalizeResponse = (response) => response?.data || response || {};

const buildPhonePeFailureMessage = (payload = {}) => {
  const data = payload?.data || {};
  const providerMessage = String(
    data.providerMessage || payload?.message || 'Transaction Rejected',
  ).trim();
  const code = String(data.code || '').trim();
  const state = String(data.state || '').trim();

  return [providerMessage, code ? `Code: ${code}` : '', state ? `State: ${state}` : '']
    .filter(Boolean)
    .join(' | ');
};

const PhonePeStatusPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('Please wait while we confirm your transaction with PhonePe. Do not refresh or go back.');
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [retrySeed, setRetrySeed] = useState(0);
  const maxRetries = 10;
  const pollInterval = useRef(null);

  const flow = String(searchParams.get('flow') || '').trim();
  const config = FLOWS[flow] || null;
  const merchantTransactionId = config
    ? resolvePendingPhonePeTransaction(config.flowKey, `?${searchParams.toString()}`)
    : '';
  const pendingPayload = config ? readPendingPhonePeRedirect(config.flowKey) || {} : {};

  const destinationUrl = useMemo(() => {
    if (!config?.targetPath) return '/';
    if (config.paidRedirectPath) return config.paidRedirectPath;
    if (!merchantTransactionId) return config.targetPath;
    return `${config.targetPath}?phonepe_txn=${encodeURIComponent(merchantTransactionId)}`;
  }, [config?.paidRedirectPath, config?.targetPath, merchantTransactionId]);

  useEffect(() => {
    if (!config || !merchantTransactionId) {
      setStatus('failure');
      setError('Invalid payment reference');
      return undefined;
    }

    const verify = async () => {
      try {
        const response = await config.verify(merchantTransactionId);
        const payload = normalizeResponse(response);
        const data = payload?.data || {};
        const nextStatus = String(data.status || payload.status || '').trim().toLowerCase();

        if (nextStatus === 'paid') {
          clearPendingPhonePeRedirect(config.flowKey);
          setStatus('success');
          if (pollInterval.current) window.clearInterval(pollInterval.current);
          window.setTimeout(() => {
            navigate(destinationUrl, { replace: true });
          }, 4000);
          return;
        }

        if (nextStatus === 'failed') {
          setStatus('failure');
          setError(buildPhonePeFailureMessage(payload));
          if (pollInterval.current) window.clearInterval(pollInterval.current);
          return;
        }

        setRetryCount((current) => current + 1);
      } catch (error) {
        const statusCode = error?.response?.status;
        const isNetworkError = !error?.response;

        if (isNetworkError) {
          setStatus('timeout');
          setError('Cannot reach the backend. If PhonePe opened this on another device/app, localhost URLs will not work.');
          if (pollInterval.current) window.clearInterval(pollInterval.current);
          return;
        }

        if (statusCode === 401) {
          setStatus('failure');
          setError('Your session is missing or expired. Please log in again and check your payment history.');
          if (pollInterval.current) window.clearInterval(pollInterval.current);
          return;
        }

        setRetryCount((current) => current + 1);
      }
    };

    verify();
    pollInterval.current = window.setInterval(() => {
      setRetryCount((current) => {
        if (current >= maxRetries) {
          setStatus('timeout');
          if (pollInterval.current) window.clearInterval(pollInterval.current);
          return current;
        }

        verify();
        return current;
      });
    }, 3000);

    return () => {
      if (pollInterval.current) window.clearInterval(pollInterval.current);
    };
  }, [config, destinationUrl, merchantTransactionId, navigate, retrySeed]);

  const handleManualRetry = () => {
    setRetryCount(0);
    setStatus('verifying');
    setError('');
    setRetrySeed((current) => current + 1);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[2.5rem] p-8 shadow-2xl shadow-slate-200 border border-slate-100 text-center relative overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {status === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-50 rounded-full blur-3xl pointer-events-none"
            />
          )}
          {(status === 'failure' || status === 'timeout') && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute -top-24 -right-24 w-64 h-64 bg-rose-50 rounded-full blur-3xl pointer-events-none"
            />
          )}
        </AnimatePresence>

        <div className="relative z-10">
          <div className="mb-8 flex justify-center">
            <AnimatePresence mode="wait">
              {status === 'verifying' && (
                <motion.div
                  key="verifying"
                  initial={{ scale: 0.5, rotate: 0 }}
                  animate={{ scale: 1, rotate: 360 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ rotate: { duration: 2, repeat: Infinity, ease: 'linear' } }}
                  className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center shadow-inner"
                >
                  <Loader2 size={40} />
                </motion.div>
              )}

              {status === 'success' && (
                <motion.div
                  key="success"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 12 }}
                  className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-100/50"
                >
                  <Check size={40} strokeWidth={3} />
                </motion.div>
              )}

              {status === 'failure' && (
                <motion.div
                  key="failure"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center shadow-lg shadow-rose-100/50"
                >
                  <X size={40} strokeWidth={3} />
                </motion.div>
              )}

              {status === 'timeout' && (
                <motion.div
                  key="timeout"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center shadow-lg shadow-amber-100/50"
                >
                  <AlertTriangle size={40} strokeWidth={3} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            {status === 'verifying' && (
              <motion.div key="text-verifying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h1 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">Verifying Payment</h1>
                <p className="text-slate-500 text-sm font-medium">Please wait while we confirm your transaction with PhonePe. Do not refresh or go back.</p>
                <div className="mt-6 flex justify-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      className="w-2 h-2 bg-blue-400 rounded-full"
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {status === 'success' && (
              <motion.div key="text-success" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h1 className="text-2xl font-[1000] text-slate-800 mb-2 uppercase tracking-tight">Payment Successful</h1>
                <p className="text-emerald-600 text-sm font-black mb-6 uppercase tracking-wider">{config?.label || 'Payment'} confirmed</p>
                <div className="bg-slate-50 rounded-2xl p-4 mb-8 border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reference</span>
                    <span className="text-xs font-black text-slate-700">#{merchantTransactionId?.slice(-8).toUpperCase()}</span>
                  </div>
                  <div className="h-px bg-slate-200 my-2" />
                  <p className="text-[11px] text-slate-500 font-medium">Redirecting in 4 seconds...</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(destinationUrl, { replace: true })}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 rounded-xl flex items-center justify-center gap-2"
                >
                  Continue <ArrowRight size={18} />
                </button>
              </motion.div>
            )}

            {status === 'failure' && (
              <motion.div key="text-failure" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h1 className="text-2xl font-[1000] text-slate-800 mb-2 uppercase tracking-tight">Payment Failed</h1>
                <p className="text-rose-600 text-sm font-black mb-6 uppercase tracking-wider">{error || 'Transaction Rejected'}</p>
                <p className="text-slate-500 text-sm font-medium mb-8">Oops! Something went wrong with the transaction. Your money, if debited, should be refunded automatically by PhonePe.</p>
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(destinationUrl, { replace: true })}
                    className="w-full bg-slate-900 hover:bg-black text-white font-bold h-12 rounded-xl"
                  >
                    Go Back
                  </button>
                </div>
              </motion.div>
            )}

            {status === 'timeout' && (
              <motion.div key="text-timeout" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h1 className="text-2xl font-[1000] text-slate-800 mb-2 uppercase tracking-tight">Payment Pending</h1>
                <p className="text-amber-600 text-sm font-black mb-6 uppercase tracking-wider">Awaiting Confirmation</p>
                <div className="bg-amber-50 rounded-2xl p-4 mb-8 border border-amber-100 flex items-start gap-3 text-left">
                  <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                  <p className="text-xs text-amber-800 font-medium leading-relaxed">
                    We have not received confirmation from PhonePe yet. This can happen due to bank delays. Please check again in a few minutes.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleManualRetry}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold h-12 rounded-xl flex items-center justify-center gap-2"
                  >
                    <RefreshCcw size={18} /> Check Again
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(destinationUrl, { replace: true })}
                    className="w-full border border-slate-200 text-slate-600 font-bold h-12 rounded-xl"
                  >
                    Go Back
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {pendingPayload?.merchantTransactionId ? (
            <p className="mt-4 text-[10px] font-bold tracking-[0.18em] text-slate-400 uppercase">
              Ref {String(pendingPayload.merchantTransactionId).slice(-10).toUpperCase()}
            </p>
          ) : null}
        </div>

        {status === 'verifying' && (
          <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-100">
            <motion.div
              className="h-full bg-blue-500"
              initial={{ width: 0 }}
              animate={{ width: `${(retryCount / maxRetries) * 100}%` }}
            />
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default PhonePeStatusPage;
