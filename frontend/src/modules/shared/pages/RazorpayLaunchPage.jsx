import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw, XCircle } from 'lucide-react';

const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const getParam = (searchParams, key) => String(searchParams.get(key) || '').trim();

const RazorpayLaunchPage = () => {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retrySeed, setRetrySeed] = useState(0);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const flow = getParam(params, 'flow') || 'driver-wallet';
  const callbackUrl = getParam(params, 'callback_url');
  const key = getParam(params, 'key');
  const orderId = getParam(params, 'order_id');
  const amount = Number(getParam(params, 'amount') || 0);
  const currency = getParam(params, 'currency') || 'INR';
  const name = getParam(params, 'name') || 'Payment';
  const description = getParam(params, 'description') || 'Complete your payment';
  const prefillName = getParam(params, 'prefill_name');
  const prefillEmail = getParam(params, 'prefill_email');
  const prefillContact = getParam(params, 'prefill_contact');

  useEffect(() => {
    let mounted = true;

    const launchCheckout = async () => {
      if (!callbackUrl || !key || !orderId || !Number.isFinite(amount) || amount <= 0) {
        setStatus('failed');
        setError('Razorpay launch details are incomplete.');
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setStatus('failed');
        setError('Razorpay SDK failed to load.');
        return;
      }

      if (!mounted) {
        return;
      }

      setStatus('opening');

      const rzp = new window.Razorpay({
        key,
        order_id: orderId,
        amount,
        currency,
        name,
        description,
        callback_url: callbackUrl,
        redirect: true,
        prefill: {
          name: prefillName,
          email: prefillEmail,
          contact: prefillContact,
        },
        modal: {
          ondismiss: () => {
            setStatus('failed');
            setError('Payment window was closed before completion.');
          },
        },
        theme: {
          color: '#0F172A',
        },
      });

      rzp.on('payment.failed', (event) => {
        const message = event?.error?.description || event?.error?.reason || 'Payment failed.';
        setStatus('failed');
        setError(message);
      });

      rzp.open();
    };

    launchCheckout();

    return () => {
      mounted = false;
    };
  }, [amount, callbackUrl, currency, description, key, name, orderId, prefillContact, prefillEmail, prefillName, retrySeed]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md rounded-[2rem] border border-slate-100 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
        {status === 'failed' ? (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <XCircle size={36} />
          </div>
        ) : (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Loader2 size={36} className="animate-spin" />
          </div>
        )}

        <h1 className="mt-6 text-2xl font-black text-slate-900">
          {status === 'failed' ? 'Unable to open checkout' : 'Opening Razorpay'}
        </h1>
        <p className="mt-3 text-sm font-semibold text-slate-500">
          {status === 'failed'
            ? (error || 'Please retry the payment launch.')
            : `Launching the ${flow.replace(/-/g, ' ')} payment page in your browser.`}
        </p>

        {status === 'failed' ? (
          <button
            type="button"
            onClick={() => {
              setError('');
              setStatus('loading');
              setRetrySeed((current) => current + 1);
            }}
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-black uppercase tracking-wide text-white"
          >
            <RefreshCcw size={16} />
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default RazorpayLaunchPage;
