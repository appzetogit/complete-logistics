import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Clock3, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { SUPPORT_INFO } from '../../shared/content/supportInfo';

const PortalSupportPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isOwnerPortal = location.pathname.startsWith('/taxi/owner');
  const routePrefix = isOwnerPortal ? '/taxi/owner' : '/taxi/driver';
  const portalLabel = isOwnerPortal ? 'Owner' : 'Driver';

  const quickCards = [
    {
      title: `${portalLabel} care number`,
      value: SUPPORT_INFO.phone,
      href: `tel:${SUPPORT_INFO.phoneHref}`,
      helper: 'Call for onboarding, verification, payouts, trips, or account help',
      Icon: Phone,
    },
    {
      title: `${portalLabel} support email`,
      value: SUPPORT_INFO.email,
      href: `mailto:${SUPPORT_INFO.email}`,
      helper: SUPPORT_INFO.responseTime,
      Icon: Mail,
    },
  ];

  const detailCards = [
    {
      title: 'Owner name',
      value: SUPPORT_INFO.ownerName,
      helper: `Primary contact for ${SUPPORT_INFO.companyName}`,
      Icon: Building2,
    },
    {
      title: `${portalLabel} help scope`,
      value: SUPPORT_INFO.companyName,
      helper: 'Registration, approval, vehicle setup, driver account help, and support requests',
      Icon: ShieldCheck,
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
      helper: 'Business communication and document follow-ups',
      Icon: MapPin,
    },
  ];

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <div className="fixed left-0 right-0 top-0 z-50 border-b border-stone-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 transition-all hover:bg-stone-100"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-sm font-bold uppercase tracking-[0.3em] text-stone-500">
            {portalLabel} Support
          </span>
        </div>
      </div>

      <section className="bg-[#171717] px-6 pb-16 pt-28 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex h-18 w-18 items-center justify-center rounded-[28px] bg-[#f4b400] text-black shadow-lg shadow-black/20">
            <ShieldCheck size={30} />
          </div>
          <h1 className="max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
            {portalLabel} <span className="text-[#f4b400]">Support</span>
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-stone-300">
            Reach the support team for onboarding help, approval status, payout questions, trip issues,
            document follow-ups, or account assistance.
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

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate(`${routePrefix}/terms`)}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Terms
            </button>
            <button
              type="button"
              onClick={() => navigate(`${routePrefix}/privacy`)}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => navigate(`${routePrefix}/login`)}
              className="rounded-2xl border border-[#f4b400]/40 bg-[#f4b400] px-5 py-3 text-sm font-black text-slate-900 transition hover:brightness-95"
            >
              Back to Login
            </button>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2">
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
    </div>
  );
};

export default PortalSupportPage;
