import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Clock3, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { SUPPORT_INFO } from '../content/supportInfo';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';

const quickCards = [
  {
    title: 'Client care number',
    value: SUPPORT_INFO.phone,
    href: `tel:${SUPPORT_INFO.phoneHref}`,
    helper: 'Call for booking, ride, parcel, or account help',
    Icon: Phone,
  },
  {
    title: 'Client support email',
    value: SUPPORT_INFO.email,
    href: `mailto:${SUPPORT_INFO.email}`,
    helper: SUPPORT_INFO.responseTime,
    Icon: Mail,
  },
];

const detailCards = [
  {
    title: 'Client info',
    value: SUPPORT_INFO.companyName,
    helper: `Owner: ${SUPPORT_INFO.ownerName} · ${SUPPORT_INFO.serviceArea}`,
    Icon: Building2,
  },
  {
    title: 'Availability',
    value: SUPPORT_INFO.availability,
    helper: SUPPORT_INFO.supportLabel,
    Icon: Clock3,
  },
  {
    title: 'Office address',
    value: SUPPORT_INFO.officeAddress,
    helper: 'Use this for business communication and document follow-ups',
    Icon: MapPin,
  },
];

const SupportPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <div className="fixed left-0 right-0 top-0 z-50 border-b border-yellow-100/80 bg-yellow-50/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 transition-all hover:bg-yellow-100/50"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-sm font-bold uppercase tracking-[0.3em] text-stone-500">
            Support
          </span>
        </div>
      </div>

      <section className="bg-[#171717] px-6 pb-16 pt-28 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex h-18 w-18 items-center justify-center rounded-[28px] bg-[#f4b400] text-black shadow-lg shadow-black/20">
            <ShieldCheck size={30} />
          </div>
          <h1 className="max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
            Talk to <span className="text-[#f4b400]">Support</span>
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-stone-300">
            Reach the client support team for ride issues, parcel help, payment questions, account updates,
            or business follow-ups.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {quickCards.map((item) => (
              <a
                key={item.title}
                href={item.href}
                className="flex items-center gap-4 rounded-[26px] border border-white/10 bg-white/5 px-5 py-5 transition hover:bg-white/10"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-[#f4b400]">
                  <item.Icon size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-stone-400">
                    {item.title}
                  </p>
                  <p className="mt-1 truncate text-xl font-black text-white md:text-[1.9rem]">
                    {item.value}
                  </p>
                  <p className="mt-1 text-sm font-bold text-stone-300">
                    {item.helper}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {detailCards.map((card) => (
            <div
              key={card.title}
              className="rounded-[28px] border border-stone-200 bg-white p-7 shadow-sm"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-slate-900">
                <card.Icon size={22} />
              </div>
              <p className="mt-5 text-[11px] font-black uppercase tracking-[0.24em] text-stone-400">
                {card.title}
              </p>
              <p className="mt-2 text-xl font-black leading-tight text-slate-900">
                {card.value}
              </p>
              <p className="mt-3 text-sm font-bold leading-6 text-slate-500">
                {card.helper}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Support Scroll Animation Section */}
      <div className="bg-stone-100 py-16">
        <ContainerScroll
          titleComponent={
            <div className="mb-8">
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none text-center">
                Need more assistance? <br />
                <span className="text-4xl md:text-5xl font-black text-[#FFB300] mt-2 block leading-none">
                  We've got you covered
                </span>
              </h2>
            </div>
          }
        >
          <img
            src="https://ui.aceternity.com/_next/image?url=%2Flinear.webp&w=3840&q=75"
            alt="Appzeto  client support dashboard"
            className="mx-auto rounded-2xl object-cover h-full object-left-top w-full"
            draggable={false}
          />
        </ContainerScroll>
      </div>
    </div>
  );
};

export default SupportPage;
