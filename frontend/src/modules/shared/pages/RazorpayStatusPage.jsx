import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Loader2, RefreshCcw, X } from 'lucide-react';
import api from '../../../shared/api/axiosInstance';

const FLOWS = {
  'driver-wallet': {
    label: 'Driver wallet top-up',
    destination: '/taxi/driver/wallet',
    verify: (payload) => api.post('/drivers/wallet/top-up/razorpay/verify', payload),
  },
  'user-wallet': {
    label: 'User wallet top-up',
    destination: '/taxi/user/wallet',
    verify: (payload) => api.post('/users/wallet/razorpay/verify', payload),
  },
};

const unwrapPayload = (response) => response?.data?.data || response?.data || response || {};

const RazorpayStatusPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying');
  const [error, setError] = useState('');
  const [retrySeed, setRetrySeed] = useState(0);

  const flow = String(searchParams.get('flow') || '').trim().toLowerCase();
  const config = FLOWS[flow] || null;
  const callbackStatus = String(searchParams.get('status') || '').trim().toLowerCase();
  const payload = {
    razorpay_order_id: String(searchParams.get('razorpay_order_id') || '').trim(),
    razorpay_payment_id: String(searchParams.get('razorpay_payment_id') || '').trim(),
    razorpay_signature: String(searchParams.get('razorpay_signature') || '').trim(),
  };
  const providerError = String(searchParams.get('error_description') || searchParams.get('error_code') || '').trim();

  useEffect(() => {
    if (!config) {
      setStatus('failure');
      setError('Unsupported Razorpay flow.');
      return undefined;
    }

    if (callbackStatus === 'success') {
      setStatus('success');
      window.setTimeout(() => {
        navigate(config.destination, { replace: true });
      }, 2200);
      return undefined;
    }

    if (providerError) {
      setStatus('failure');
      setError(providerError);
      return undefined;
    }

    if (!payload.razorpay_order_id || !payload.razorpay_payment_id || !payload.razorpay_signature) {
      setStatus('failure');
      setError('Razorpay did not return the required payment verification details.');
      return undefined;
    }

    let active = true;

    const verifyPayment = async () => {
      try {
        setStatus('verifying');
        setError('');
        await config.verify(payload);

        if (!active) {
          return;
        }

        setStatus('success');
        window.setTimeout(() => {
          navigate(config.destination, { replace: true });
        }, 2200);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setStatus('failure');
        setError(
          requestError?.response?.data?.message
          || requestError?.message
          || 'Payment verification failed.',
        );
      }
    };

    verifyPayment();

    return () => {
      active = false;
    };
  }, [
    config,
    navigate,
    payload.razorpay_order_id,
    payload.razorpay_payment_id,
    payload.razorpay_signature,
    providerError,
    callbackStatus,
    retrySeed,
  ]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md rounded-[2rem] border border-slate-100 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
        <div className="mb-6 flex justify-center">
          {status === 'verifying' ? (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Loader2 size={36} className="animate-spin" />
            </div>
          ) : status === 'success' ? (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Check size={36} strokeWidth={3} />
            </div>
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <X size={36} strokeWidth={3} />
            </div>
          )}
        </div>

        {status === 'verifying' ? (
          <>
            <h1 className="text-2xl font-black text-slate-900">Confirming payment</h1>
            <p className="mt-3 text-sm font-semibold text-slate-500">
              Please wait while we verify your Razorpay transaction.
            </p>
          </>
        ) : null}

        {status === 'success' ? (
          <>
            <h1 className="text-2xl font-black text-slate-900">Payment successful</h1>
            <p className="mt-3 text-sm font-semibold text-emerald-600">
              {config?.label || 'Payment'} was verified. Redirecting you back now.
            </p>
          </>
        ) : null}

        {status === 'failure' ? (
          <>
            <h1 className="text-2xl font-black text-slate-900">Verification failed</h1>
            <p className="mt-3 text-sm font-semibold text-rose-600">
              {error || 'We could not verify your Razorpay payment.'}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setRetrySeed((current) => current + 1)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-black uppercase tracking-wide text-white"
              >
                <RefreshCcw size={16} />
                Retry verification
              </button>
              <button
                type="button"
                onClick={() => navigate(config?.destination || '/', { replace: true })}
                className="flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 text-sm font-black uppercase tracking-wide text-slate-600"
              >
                Back to wallet
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default RazorpayStatusPage;
