import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CreditCard, Plus, Banknote, Smartphone, X } from 'lucide-react';

const PAYMENT_OPTIONS = [
  { id: 'upi', label: 'UPI', icon: Smartphone, color: 'purple' },
  { id: 'card', label: 'Credit / Debit Card', icon: CreditCard, color: 'blue' },
];

const PaymentSettings = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = React.useState(false);
  const [selected, setSelected] = React.useState(null);
  const [upiId, setUpiId] = React.useState('');
  const [cardNumber, setCardNumber] = React.useState('');
  const [cardName, setCardName] = React.useState('');
  const [cardExpiry, setCardExpiry] = React.useState('');
  const [added, setAdded] = React.useState([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  const canSubmit = selected === 'upi' ? upiId.trim() : cardNumber && cardName && cardExpiry;

  const handleAdd = () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
      const label = selected === 'upi' ? upiId : `•••• ${cardNumber.slice(-4)}`;
      setTimeout(() => {
        setAdded(prev => [...prev, { id: Date.now(), type: selected, label }]);
        setIsSuccess(false);
        setShowModal(false);
        setSelected(null);
        setUpiId('');
        setCardNumber('');
        setCardName('');
        setCardExpiry('');
      }, 1800);
    }, 1500);
  };

  const handleClose = () => {
    setShowModal(false);
    setSelected(null);
    setUpiId('');
    setCardNumber('');
    setCardName('');
    setCardExpiry('');
    setIsSuccess(false);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] max-w-lg mx-auto flex flex-col font-sans">
      <header className="bg-white p-5 flex items-center gap-6 border-b border-gray-50 sticky top-0 z-20">
        <button onClick={() => navigate('/taxi/user/profile')} className="p-2 active:scale-95"><ArrowLeft size={24} /></button>
        <h1 className="text-[18px] font-black">Payments</h1>
      </header>

      <div className="p-5 space-y-4">
        <div className="bg-white p-6 rounded-[32px] border border-gray-50 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center"><Banknote /></div>
            <div><p className="font-black">Cash</p><p className="text-xs text-gray-400">Default</p></div>
          </div>
          <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white p-1"><Plus className="rotate-45" /></div>
        </div>

        {added.map(item => (
          <div key={item.id} className="bg-white p-6 rounded-[32px] border border-gray-50 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${item.type === 'upi' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                {item.type === 'upi' ? <Smartphone size={20} /> : <CreditCard size={20} />}
              </div>
              <div><p className="font-black">{item.label}</p><p className="text-xs text-gray-400">{item.type === 'upi' ? 'UPI' : 'Card'}</p></div>
            </div>
            <button onClick={() => setAdded(prev => prev.filter(a => a.id !== item.id))} className="w-7 h-7 bg-red-50 text-red-400 rounded-full flex items-center justify-center active:scale-90">
              <X size={14} strokeWidth={3} />
            </button>
          </div>
        ))}

        <button
          onClick={() => setShowModal(true)}
          className="w-full py-5 border-2 border-dashed border-gray-200 rounded-[32px] text-gray-400 font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform hover:border-gray-300 hover:text-gray-500"
        >
          <Plus size={18} /> Add New Payment Method
        </button>
      </div>

      {/* ADD PAYMENT MODAL */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-md rounded-[32px] p-8 pb-10 space-y-6 shadow-2xl relative"
            >
              <button onClick={handleClose} className="absolute top-6 right-6 w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 active:scale-90">
                <X size={18} />
              </button>

              <div className="text-center space-y-1">
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Add Payment Method</h3>
                <p className="text-[11px] font-bold text-gray-400 tracking-widest uppercase">Choose a method to add</p>
              </div>

              {isSuccess ? (
                <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="flex flex-col items-center py-8 gap-4">
                  <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center">
                    <Plus size={40} strokeWidth={3} />
                  </div>
                  <p className="text-lg font-black text-gray-900">Payment Method Added!</p>
                </motion.div>
              ) : (
                <>
                  {/* Method selector */}
                  <div className="grid grid-cols-2 gap-3">
                    {PAYMENT_OPTIONS.map(({ id, label, icon: Icon, color }) => (
                      <button
                        key={id}
                        onClick={() => setSelected(id)}
                        className={`p-5 rounded-[24px] border-2 flex flex-col items-center gap-3 transition-all active:scale-95 ${
                          selected === id
                            ? color === 'purple' ? 'border-purple-400 bg-purple-50' : 'border-blue-400 bg-blue-50'
                            : 'border-gray-100 bg-white'
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                          color === 'purple' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                          <Icon size={22} strokeWidth={2} />
                        </div>
                        <span className="text-[12px] font-black text-gray-700 text-center leading-tight">{label}</span>
                      </button>
                    ))}
                  </div>

                  {/* UPI form */}
                  {selected === 'upi' && (
                    <input
                      type="text"
                      value={upiId}
                      onChange={e => setUpiId(e.target.value)}
                      placeholder="Enter UPI ID (e.g. name@upi)"
                      className="w-full h-14 bg-gray-50 border-2 border-gray-100 rounded-[18px] px-5 text-[14px] font-bold text-gray-900 focus:outline-none focus:border-purple-300 transition-all placeholder:text-gray-300"
                    />
                  )}

                  {/* Card form */}
                  {selected === 'card' && (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={e => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                        placeholder="Card number"
                        className="w-full h-14 bg-gray-50 border-2 border-gray-100 rounded-[18px] px-5 text-[14px] font-bold text-gray-900 focus:outline-none focus:border-blue-300 transition-all placeholder:text-gray-300"
                      />
                      <input
                        type="text"
                        value={cardName}
                        onChange={e => setCardName(e.target.value)}
                        placeholder="Name on card"
                        className="w-full h-14 bg-gray-50 border-2 border-gray-100 rounded-[18px] px-5 text-[14px] font-bold text-gray-900 focus:outline-none focus:border-blue-300 transition-all placeholder:text-gray-300"
                      />
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={e => setCardExpiry(e.target.value)}
                        placeholder="MM / YY"
                        className="w-full h-14 bg-gray-50 border-2 border-gray-100 rounded-[18px] px-5 text-[14px] font-bold text-gray-900 focus:outline-none focus:border-blue-300 transition-all placeholder:text-gray-300"
                      />
                    </div>
                  )}

                  {selected && (
                    <button
                      onClick={handleAdd}
                      disabled={isSubmitting || !canSubmit}
                      className={`w-full h-14 rounded-[22px] font-black text-[14px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 ${
                        isSubmitting || !canSubmit ? 'bg-gray-100 text-gray-300' : 'bg-gray-900 text-white shadow-xl'
                      }`}
                    >
                      {isSubmitting ? 'Adding...' : <><Plus size={18} strokeWidth={3} /> Add Method</>}
                    </button>
                  )}
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PaymentSettings;
