import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';
import { FAQSupportHelper } from '@/components/ui/FAQSupportHelper';

const FaqPage = () => {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState(0);

  const faqs = [
    { q: "How do I book a ride?", a: "You can book a ride by logging into our app, entering your pickup and drop-off locations, selecting your vehicle type, and confirming the ride." },
    { q: "Are your drivers verified?", a: "Yes, all our drivers undergo a strict background check, vehicle inspection, and training before they start driving with us." },
    { q: "How does parcel delivery work?", a: "You can select the Parcel Delivery option, enter the recipient details, and a delivery partner will pick up the package from your location." },
    { q: "What payment methods do you accept?", a: "We accept credit/debit cards, mobile wallets, and cash payments for your convenience." },
    { q: "Can I schedule a ride in advance?", a: "Absolutely. Our 'Later' feature allows you to schedule a ride hours or even days in advance so you never miss an important appointment." },
    { q: "How is the pricing calculated?", a: "Fares are calculated based on base fare, distance, estimated time, and current demand. You'll always see an estimated price before you confirm the booking." }
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 bg-yellow-50/90 backdrop-blur-md z-50 border-b border-yellow-100/80 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
              <ArrowLeft size={20} />
            </button>
            <span className="font-bold text-sm uppercase tracking-widest text-gray-800">Support Center</span>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-[#1a1a1a] text-white pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-6">
                Frequently Asked <span className="text-[#FFB300]">Questions</span>
            </h1>
            <p className="text-xl text-gray-400 leading-relaxed max-w-2xl mx-auto">
                Find quick answers to common questions about our services, bookings, and payments.
            </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-16 -mt-10 relative z-10">
        <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10 border border-gray-100">
            <div className="space-y-4">
                {faqs.map((faq, index) => (
                    <div 
                        key={index} 
                        className={`border rounded-2xl overflow-hidden transition-all duration-300 ${openIndex === index ? 'border-[#FFB300] bg-yellow-50/30' : 'border-gray-100 bg-white hover:border-gray-300'}`}
                    >
                        <button 
                            className="w-full text-left px-6 py-5 flex items-center justify-between gap-4"
                            onClick={() => setOpenIndex(openIndex === index ? -1 : index)}
                        >
                            <h3 className={`font-bold text-lg pr-8 ${openIndex === index ? 'text-[#1a1a1a]' : 'text-gray-700'}`}>{faq.q}</h3>
                            <ChevronDown className={`flex-shrink-0 transition-transform duration-300 ${openIndex === index ? 'rotate-180 text-[#FFB300]' : 'text-gray-400'}`} size={20} />
                        </button>
                        <div className={`px-6 overflow-hidden transition-all duration-300 ${openIndex === index ? 'pb-5 max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                            <p className="text-gray-600 leading-relaxed">{faq.a}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Scroll Animation Section */}
        <div className="bg-white rounded-3xl border border-gray-100 py-16 mt-10">
          <ContainerScroll
            titleComponent={
              <div className="mb-8">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none text-center">
                  Have more questions? <br />
                  <span className="text-4xl md:text-5xl font-black text-[#FFB300] mt-2 block leading-none">
                    We've got answers
                  </span>
                </h2>
              </div>
            }
          >
            <FAQSupportHelper />
          </ContainerScroll>
        </div>
      </div>
    </div>
  );
};

export default FaqPage;
