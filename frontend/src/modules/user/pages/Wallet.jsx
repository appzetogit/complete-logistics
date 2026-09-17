import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, History, Gift } from 'lucide-react';
import { userAuthService } from '../services/authService';
import { useSettings } from '../../../shared/context/SettingsContext';
import { useUserTheme } from '../../../shared/context/UserThemeContext';
import { openExternalCheckout } from '../../../shared/utils/externalNavigation';
import { rememberPendingPhonePeRedirect } from '../../../shared/utils/phonePeResume';

const PHONEPE_USER_WALLET_FLOW_KEY = 'user-wallet-topup';

const Wallet = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'App';
  const activePaymentGateway = settings.paymentGateway || null;

  const [showAddMoney, setShowAddMoney] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [isAdding, setIsAdding] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [walletLoading, setWalletLoading] = React.useState(true);
  const [walletError, setWalletError] = React.useState('');
  const [wallet, setWallet] = React.useState({ balance: 0, currency: 'INR', recentTransactions: [] });

  const basePath = useMemo(
    () => (window.location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''),
    [],
  );

  const formatInr = (value) => {
    const amountValue = Number(value || 0);
    const fixed = Math.round(amountValue * 100) / 100;
    return fixed.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const splitMoney = (formatted) => {
    const [whole, decimals = '00'] = String(formatted).split('.');
    return { whole, decimals: (decimals || '00').padEnd(2, '0').slice(0, 2) };
  };

  const balanceText = useMemo(() => splitMoney(formatInr(wallet.balance)), [wallet.balance]);
  const walletTopUpGatewayLabel = activePaymentGateway?.label || 'payment gateway';
  const supportsWalletTopUp = activePaymentGateway?.supportsWalletTopUp === true;
  const walletTopUpMode = activePaymentGateway?.walletTopUpMode || '';
  const canTopUpWallet = supportsWalletTopUp && ['razorpay_checkout', 'phonepe_redirect'].includes(walletTopUpMode);

  const refreshWallet = async () => {
    setWalletError('');
    setWalletLoading(true);

    try {
      const response = await userAuthService.getWallet();
      const data = response?.data || {};
      setWallet({
        balance: Number(data.balance || 0),
        currency: data.currency || 'INR',
        recentTransactions: Array.isArray(data.recentTransactions) ? data.recentTransactions : [],
      });
    } catch (err) {
      setWalletError(err?.message || 'Failed to load wallet');
    } finally {
      setWalletLoading(false);
    }
  };

  useEffect(() => {
    refreshWallet();
  }, []);

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

  const isMobileOrWebView = () => {
    const ua = String(window.navigator?.userAgent || '');
    return /Android|iPhone|iPad|iPod/i.test(ua)
      || /; wv\)/i.test(ua)
      || /Version\/[\d.]+/i.test(ua);
  };

  const handleAddMoney = async () => {
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) return;

    setIsAdding(true);
    setWalletError('');

    try {
      if (!activePaymentGateway) {
        throw new Error('No payment gateway is enabled by admin right now.');
      }

      if (!supportsWalletTopUp || !canTopUpWallet) {
        throw new Error(`${walletTopUpGatewayLabel} is enabled by admin, but wallet top-up is not implemented for it yet.`);
      }

      if (walletTopUpMode === 'phonepe_redirect') {
        const sessionResponse = await userAuthService.createPhonePeWalletTopupOrder(amountValue);
        const session = sessionResponse?.data || {};

        if (!session.checkoutUrl) {
          throw new Error('Unable to start PhonePe payment');
        }

        rememberPendingPhonePeRedirect(PHONEPE_USER_WALLET_FLOW_KEY, {
          merchantTransactionId: session.merchantTransactionId,
          checkoutUrl: session.checkoutUrl,
        });
        const opened = await openExternalCheckout(session.checkoutUrl);
        if (!opened) {
          throw new Error('PhonePe checkout could not open outside the app WebView. Please update the app bridge or open this payment flow in your browser.');
        }
        setIsAdding(false);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Razorpay SDK failed to load');
      }

      const orderResponse = await userAuthService.createWalletTopupOrder(amountValue);
      const order = orderResponse?.data || {};

      if (!order.keyId || !order.orderId) {
        throw new Error('Unable to start payment');
      }

      let userInfo = {};
      try {
        userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      } catch {
        userInfo = {};
      }

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: appName,
        description: 'Wallet Topup',
        order_id: order.orderId,
        ...(isMobileOrWebView() && order.callbackUrl
          ? {
              callback_url: order.callbackUrl,
              redirect: true,
            }
          : {}),
        prefill: {
          name: userInfo?.name || '',
          email: userInfo?.email || '',
          contact: userInfo?.phone ? `+91${userInfo.phone}` : '',
        },
        modal: {
          ondismiss: () => {
            setIsAdding(false);
          },
        },
        handler: async (response) => {
          try {
            const verifyResponse = await userAuthService.verifyWalletTopup(response);
            const data = verifyResponse?.data || {};
            setWallet({
              balance: Number(data.balance || 0),
              currency: data.currency || 'INR',
              recentTransactions: Array.isArray(data.recentTransactions) ? data.recentTransactions : [],
            });
            setIsSuccess(true);
            setTimeout(() => {
              setIsSuccess(false);
              setShowAddMoney(false);
              setAmount('');
            }, 1400);
          } catch (err) {
            setWalletError(err?.message || 'Payment verification failed');
          } finally {
            setIsAdding(false);
          }
        },
        theme: {
          color: '#E85D04',
        },
      });

      rzp.on('payment.failed', (event) => {
        const message = event?.error?.description || event?.error?.reason || 'Payment failed';
        setWalletError(message);
        setIsAdding(false);
      });

      rzp.open();
    } catch (err) {
      setWalletError(err?.message || 'Topup failed');
      setIsAdding(false);
    }
  };

  const { theme } = useUserTheme();
  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen max-w-lg mx-auto flex flex-col font-sans pb-28 relative overflow-x-hidden transition-colors duration-300 ${
      isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'
    }`}>
      <AnimatePresence>
        {showAddMoney && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <Motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className={`w-full max-w-md rounded-3xl p-8 pb-10 space-y-8 shadow-2xl relative ${isDark ? 'bg-slate-900 text-white shadow-black/40 border border-slate-800' : 'bg-white text-slate-900 shadow-slate-900/10'}`}
            >
              <button
                onClick={() => setShowAddMoney(false)}
                className={`absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-colors ${isDark ? 'bg-slate-950 text-slate-500 hover:text-white' : 'bg-slate-50 text-slate-400'}`}
              >
                <Plus size={20} className="rotate-45" />
              </button>

                <div className="text-center space-y-2">
                <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Add Money</h3>
                <p className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                  {activePaymentGateway ? `Top-up via ${walletTopUpGatewayLabel}` : 'Select amount to top-up'}
                </p>
              </div>

              {isSuccess ? (
                <Motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center py-8 gap-4">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
                    <History size={32} />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900">Wallet Refilled!</p>
                    <p className="text-xs font-medium text-slate-400 mt-1">Balance updated successfully</p>
                  </div>
                </Motion.div>
              ) : (
                <div className="space-y-8">
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-6 text-2xl font-bold text-slate-900 focus:outline-none focus:border-slate-300 transition-all text-center placeholder:text-slate-200"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {['100', '500', '1000'].map((val) => (
                      <button
                        key={val}
                        onClick={() => setAmount(val)}
                        className={`py-3 rounded-xl font-bold text-sm transition-all ${
                          amount === val ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-600 border border-slate-100'
                        }`}
                      >
                        +₹{val}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleAddMoney}
                    disabled={isAdding || !amount}
                    className={`w-full h-14 rounded-2xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 ${
                      isAdding || !amount ? 'bg-slate-100 text-slate-400 shadow-none cursor-not-allowed' : 'bg-slate-900 text-white shadow-slate-200'
                    }`}
                  >
                    {isAdding ? 'Processing...' : 'Refill Wallet'}
                    {!isAdding && <Plus size={18} />}
                  </button>
                </div>
              )}
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      <header className={`px-5 pt-10 pb-4 sticky top-0 z-20 border-b transition-colors duration-300 ${isDark ? 'bg-slate-900/90 border-slate-800 text-white shadow-sm' : 'bg-white border-slate-100 text-slate-900 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer ${isDark ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-900'}`}
          >
            <ArrowLeft size={18} className={isDark ? 'text-white' : 'text-slate-900'} />
          </button>
          <h1 className={`text-[19px] font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>My Wallet</h1>
        </div>
      </header>

      <div className="px-5 mt-6">
        <Motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-3xl p-8 shadow-xl relative overflow-hidden border ${isDark ? 'bg-slate-900 border-slate-800 text-white shadow-black/40' : 'bg-[#FFFDF0] border-yellow-100/70 text-slate-900 shadow-yellow-900/5'}`}
        >
          <div className="relative z-10 flex flex-col gap-8">
            <div className="space-y-1">
              <p className={`font-bold uppercase tracking-wider text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Available Balance</p>
              <h2 className="text-3xl font-black tracking-tight">
                {walletLoading ? (
                  <>₹ 0<span className={`text-xl ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>.00</span></>
                ) : (
                  <>₹ {balanceText.whole}<span className={`text-xl ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>.{balanceText.decimals}</span></>
                )}
              </h2>
              {walletError && <p className="text-xs font-bold text-rose-400 mt-2">{walletError}</p>}
              {activePaymentGateway && !canTopUpWallet && (
                <p className="text-xs font-bold text-amber-300 mt-2">
                  {walletTopUpGatewayLabel} is active, but wallet top-up is not available for it yet.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setWalletError('');
                  setShowAddMoney(true);
                }}
                disabled={!canTopUpWallet}
                className="flex-1 bg-white text-slate-900 h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed"
              >
                <Plus size={16} strokeWidth={2.5} />
                Add Money
              </button>
            </div>
          </div>
        </Motion.div>
      </div>

      <div className="px-5 mt-6">
        <Motion.button
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          onClick={() => navigate(`${basePath}/referral`)}
          className={`w-full border rounded-3xl p-5 flex items-center gap-4 shadow-md group cursor-pointer relative overflow-hidden text-left ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-100/30 border-yellow-250'}`}
        >
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shrink-0 group-hover:scale-110 group-hover:rotate-6 duration-300 ${isDark ? 'bg-slate-950 text-white group-hover:bg-white group-hover:text-slate-950' : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20'}`}>
            <Gift size={20} />
          </div>
          <div className="flex-1 text-left">
            <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Refer & Earn <span className="text-emerald-600 dark:text-emerald-400 font-extrabold ml-1">₹50</span>
            </h4>
            <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Invite friends to {appName}</p>
          </div>
          <ArrowLeft size={18} className={`rotate-180 transition-all duration-300 group-hover:translate-x-1 ${isDark ? 'text-slate-600 group-hover:text-white' : 'text-slate-900'}`} />
        </Motion.button>
      </div>

      <div className="px-5 mt-10">
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Transaction History</h3>
          <button onClick={() => navigate(`${basePath}/activity`)} className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>View All</button>
        </div>
        
        <div className={`rounded-3xl border shadow-sm overflow-hidden divide-y ${isDark ? 'bg-slate-900 border-slate-800 divide-slate-800/60' : 'bg-white border-slate-100 divide-slate-50'}`}>
          {walletLoading ? (
            <div className="p-8 text-center text-xs font-bold text-slate-400">Loading transactions...</div>
          ) : wallet.recentTransactions?.length ? (
            wallet.recentTransactions.map((tx) => {
              const isDebit = tx.kind === 'debit';
              const title = tx.title || (isDebit ? 'Debit' : 'Credit');
              const sign = isDebit ? '-' : '+';
              const amountText = formatInr(tx.amount);
              const whenText = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

              return (
                <div key={tx.id} className={`flex items-center gap-4 p-4 transition-colors group ${isDark ? 'hover:bg-slate-850' : 'hover:bg-slate-50'}`}>
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                      isDebit ? (isDark ? 'bg-slate-950 text-slate-400' : 'bg-slate-50 text-slate-600') : (isDark ? 'bg-emerald-950/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                    }`}
                  >
                    {isDebit ? <ArrowLeft size={16} className="rotate-45" /> : <Plus size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{title}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{whenText}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <h4 className={`text-base font-bold ${isDebit ? (isDark ? 'text-white' : 'text-slate-900') : 'text-emerald-600'}`}>
                      {sign}₹{amountText}
                    </h4>
                    <span className={`text-[8px] font-bold uppercase tracking-wider ${isDebit ? 'text-slate-400' : 'text-emerald-400'}`}>
                      {isDebit ? 'Debit' : 'Credit'}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs font-bold text-slate-400">No transactions yet</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Wallet;
