import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, Star, Search, ShieldCheck, HeartHandshake, Headset, 
  Send, Compass, HelpCircle, CheckCircle, RefreshCw
} from 'lucide-react';

const categories = [
  { id: 'booking', label: 'Ride Bookings', icon: Compass, color: 'text-amber-400 bg-amber-400/10' },
  { id: 'payment', label: 'Refunds & Payments', icon: RefreshCw, color: 'text-blue-400 bg-blue-400/10' },
  { id: 'safety', label: 'Safety & Help', icon: ShieldCheck, color: 'text-emerald-400 bg-emerald-400/10' },
];

const categoryAnswers = {
  booking: [
    { sender: 'user', text: 'How do I cancel my active cab booking?' },
    { sender: 'agent', text: 'You can tap "Cancel Ride" directly on your active trip screen. If the driver is not yet assigned or was assigned less than 5 minutes ago, cancellation is completely free!' }
  ],
  payment: [
    { sender: 'user', text: 'I was charged twice. How to request a refund?' },
    { sender: 'agent', text: 'No worries! Go to your Wallet & Activity tab, select the transaction, and click "Dispute/Refund". Our automated system will review it and refund duplicate charges within 3-5 business days.' }
  ],
  safety: [
    { sender: 'user', text: 'What security measures do you have for solo riders?' },
    { sender: 'agent', text: 'Every trip is GPS-tracked 24/7. We have a live "SOS Button" in the user app to instantly share your location with emergency contacts and our dedicated safety response team.' }
  ]
};

const incomingTickets = [
  { id: 101, user: 'Rahul S.', category: 'Refund', status: 'Resolved', text: 'Duplicate charge refunded successfully', time: 'Just now' },
  { id: 102, user: 'Amit K.', category: 'Booking', status: 'Active', text: 'Driver not arriving - matched with replacement', time: '2m ago' },
  { id: 103, user: 'Priya M.', category: 'Account', status: 'Resolved', text: 'Phone number updated successfully', time: '4m ago' },
];

const ticketTemplates = [
  { user: 'Vikram J.', category: 'Safety', status: 'Resolved', text: 'SOS contact list configured successfully' },
  { user: 'Sneha P.', category: 'Promo', status: 'Active', text: 'Applying welcome coupon code issue resolved' },
  { user: 'Rohit B.', category: 'Ride', status: 'Resolved', text: 'Route verification ticket closed' },
  { user: 'Karan L.', category: 'Payment', status: 'Resolved', text: 'Wallet balance auto-added successfully' },
];

export const FAQSupportHelper = () => {
  const [selectedCat, setSelectedCat] = useState('booking');
  const [chatHistory, setChatHistory] = useState(categoryAnswers.booking);
  const [typing, setTyping] = useState(false);
  const [tickets, setTickets] = useState(incomingTickets);
  
  // Handle Category click to simulate conversational FAQ lookup
  const handleCategorySelect = (catId) => {
    if (catId === selectedCat) return;
    setSelectedCat(catId);
    setTyping(true);
    // Clear chat first to simulate typing delay
    setChatHistory([]);
    
    setTimeout(() => {
      // First show user question
      setChatHistory([categoryAnswers[catId][0]]);
      
      setTimeout(() => {
        // Show agent response
        setChatHistory(categoryAnswers[catId]);
        setTyping(false);
      }, 1200);
    }, 400);
  };

  // Simulate incoming live support ticket updates
  useEffect(() => {
    const ticketInterval = setInterval(() => {
      const randomTkt = ticketTemplates[Math.floor(Math.random() * ticketTemplates.length)];
      const newTkt = {
        id: Date.now(),
        ...randomTkt,
        time: 'Just now'
      };

      setTickets(prev => {
        const updated = [newTkt, ...prev.slice(0, 2)];
        return updated.map((t, idx) => {
          if (idx === 0) return t;
          return {
            ...t,
            time: t.time === 'Just now' ? '1m ago' : `${idx + 1}m ago`
          };
        });
      });
    }, 6000);

    return () => clearInterval(ticketInterval);
  }, []);

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col font-sans p-4 md:p-6 overflow-hidden select-none">
      
      {/* Top HUD Header */}
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-400/10 text-amber-400 rounded-xl">
            <Headset size={18} />
          </div>
          <div>
            <h3 className="font-extrabold text-[15px] tracking-wide text-white uppercase">Automated Help Desk</h3>
            <p className="text-[10px] text-slate-400 font-medium">Virtual Assistant & Operations Dispatcher Help center</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1 text-xs">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></div>
          <span className="text-[11px] font-bold text-slate-300">Support Center Online</span>
        </div>
      </div>

      {/* Main split grid: Interactive Help (Left) + Performance Stats (Right) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 overflow-hidden">
        
        {/* Left Column: Interactive Assistant simulator */}
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col overflow-hidden">
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 mb-2">Select a FAQ category to ask:</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const Icon = cat.icon;
                const isSelected = selectedCat === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition duration-300 active:scale-95 ${
                      isSelected 
                        ? 'bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-400/10' 
                        : 'bg-slate-950/50 hover:bg-slate-950 border border-slate-800 text-slate-300'
                    }`}
                  >
                    <Icon size={14} className={isSelected ? 'text-slate-950' : cat.color.split(' ')[0]} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Chat Panel Mock */}
          <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between overflow-hidden">
            {/* Chat Messages Log */}
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1 mb-2">
              <AnimatePresence>
                {chatHistory.map((msg, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[11px] font-medium leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-slate-800 text-slate-100 rounded-tr-none'
                        : 'bg-[#FFB300] text-slate-950 font-semibold rounded-tl-none'
                    }`}>
                      <p>{msg.text}</p>
                    </div>
                  </motion.div>
                ))}

                {typing && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-start items-center gap-1.5 bg-slate-900 border border-slate-800/80 px-4 py-2.5 rounded-2xl rounded-tl-none self-start"
                  >
                    <span className="text-[10px] text-slate-400 font-bold">Assistant is typing</span>
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="h-1.5 w-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="h-1.5 w-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Simulated Input Row */}
            <div className="border-t border-slate-800/80 pt-3 flex items-center gap-2">
              <div className="flex-1 bg-slate-900/50 border border-slate-850 px-3.5 py-2 rounded-xl text-[11px] text-slate-500 font-bold flex items-center justify-between">
                <span>Ask about anything...</span>
                <Search size={14} className="text-slate-400" />
              </div>
              <button className="p-2.5 bg-amber-400 text-slate-950 rounded-xl active:scale-95 transition">
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: HUD stats & live logs */}
        <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden">
          
          {/* Support performance stats */}
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5 mb-3">
              <Star size={12} className="text-amber-400" /> Live Response SLA
            </span>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
                <p className="text-[9px] text-slate-400 font-bold">Avg Answer Speed</p>
                <p className="text-lg font-black text-white">42 sec</p>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
                <p className="text-[9px] text-slate-400 font-bold">Satisfaction Score</p>
                <p className="text-lg font-black text-amber-400 flex items-center justify-center gap-1">
                  4.9 <Star size={12} fill="currentColor" />
                </p>
              </div>
            </div>
          </div>

          {/* Live Support ticket dispatch list */}
          <div className="flex-1 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col overflow-hidden min-h-[160px]">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/50 pb-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5">
                <MessageSquare size={12} className="text-rose-400" /> Ticket Queue
              </span>
              <span className="text-[9px] text-slate-500 font-bold">Auto-dispatcher active</span>
            </div>

            <div className="flex-1 flex flex-col gap-2 overflow-hidden">
              <AnimatePresence initial={false}>
                {tickets.map((tkt) => (
                  <motion.div
                    key={tkt.id}
                    initial={{ opacity: 0, x: 20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="bg-slate-950/70 border border-slate-850 p-2.5 rounded-xl flex items-start gap-2.5 hover:border-slate-850 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-black text-slate-200">{tkt.user}</span>
                        <span className="text-[8px] text-slate-500 font-bold uppercase">{tkt.time}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium truncate mb-1">{tkt.text}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 uppercase tracking-wider font-bold">
                          {tkt.category}
                        </span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-black flex items-center gap-1 ${
                          tkt.status === 'Resolved' 
                            ? 'bg-emerald-500/10 text-emerald-400' 
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          <CheckCircle size={8} /> {tkt.status}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
