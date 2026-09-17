import React from 'react';
import { ArrowLeft, FileText, IndianRupee, Mail, Phone, ReceiptText, Scale, ScrollText, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SUPPORT_INFO } from '../content/supportInfo';
import termsRawText from '../content/terms-content.txt?raw';
import privacyRawText from '../content/privacy-content.txt?raw';

const ownerContact = {
  phone: SUPPORT_INFO.phone,
  email: SUPPORT_INFO.email,
};

const vehiclePricing = [
  { type: 'Bike', capacity: 'Up to 2 riders', price: 'Starts at Rs 49', cancellationCut: 'Admin cut up to Rs 10', note: 'Best for quick solo rides and short-distance travel.' },
  { type: 'Auto', capacity: 'Up to 3 riders', price: 'Starts at Rs 79', cancellationCut: 'Admin cut up to Rs 15', note: 'Suitable for city commutes and local market travel.' },
  { type: 'Taxi', capacity: 'Up to 4 riders', price: 'Starts at Rs 129', cancellationCut: 'Admin cut up to Rs 25', note: 'Standard cab option for everyday point-to-point trips.' },
  { type: 'Premium Car', capacity: 'Up to 7 riders', price: 'Starts at Rs 249', cancellationCut: 'Admin cut up to Rs 40', note: 'Extra comfort and larger seating for family or business travel.' },
  { type: 'eRickshaw', capacity: 'Up to 3 riders', price: 'Starts at Rs 69', cancellationCut: 'Admin cut up to Rs 12', note: 'May be available in selected operating zones only.' },
];

const legalContent = {
  terms: {
    label: 'Terms & Conditions',
    title: 'Terms & Conditions',
    icon: ScrollText,
    intro:
      'These terms are shown from the latest legal document provided for Appzeto 24 users and include the applicable bike, package, auto, and cab clauses.',
    rawText: termsRawText,
  },
  privacy: {
    label: 'Privacy Policy',
    title: 'Privacy Policy',
    icon: ShieldCheck,
    intro:
      'This privacy policy is shown from the latest legal document provided for Appzeto 24 users and explains how information is collected, used, processed, stored, and protected.',
    rawText: privacyRawText,
  },
  refund: {
    label: 'Refund Policy',
    title: 'Refund & Cancellation Policy',
    icon: ReceiptText,
    intro:
      'This page explains refund eligibility, cancellation timelines, and indicative prices for the main vehicle types available on the Appzeto 24  Trawler platform. Refunds are reviewed based on service status, time of cancellation, and payment mode.',
    sections: [
      {
        title: 'When refunds may be approved',
        bullets: [
          'Duplicate payment or verified overcharge.',
          'Booking cancelled by the platform or partner after confirmation.',
          'Service could not be fulfilled and the customer was not at fault.',
          'Cancellation made within the free cancellation period, where applicable.',
        ],
      },
      {
        title: 'Refund policy overview',
        body:
          'Appzeto 24  Trawler reviews refund requests on a case-by-case basis to confirm whether the booking was completed, cancelled before service, cancelled after dispatch, or affected by a technical or payment issue. Approved refunds are returned only after internal verification of ride logs, payment status, and service records.',
      },
      {
        title: 'Cancellation rules',
        bullets: [
          'Bike and Auto bookings: free cancellation usually applies before partner assignment or within a short grace window after booking.',
          'Taxi bookings: a cancellation fee may apply once a driver is assigned, the driver is close to pickup, or the vehicle has already started toward the user.',
          'Premium Car bookings: because these block a larger-capacity vehicle, late cancellation may attract a higher convenience or blocking fee.',
          'Parcel or service-center linked vehicle bookings: once pickup, dispatch, or service preparation begins, the booking may become partially refundable or non-refundable.',
          'No-show cases, repeated misuse, or cancellations after service start are generally non-refundable.',
        ],
      },
      {
        title: 'Cases where refunds may be partial',
        bullets: [
          'If a driver or service partner has already been assigned and operational costs have started.',
          'If a vehicle was reserved for a scheduled booking and cancelled late by the customer.',
          'If waiting charges, toll blocking, convenience fees, or zone-specific service costs have already been incurred.',
          'If the service was partly delivered before the booking was cancelled or interrupted.',
        ],
      },
      {
        title: 'Cases where refunds are usually not allowed',
        bullets: [
          'Incorrect pickup or drop details entered by the user that caused service failure.',
          'Customer no-show after the partner reaches or waits at the pickup point.',
          'Cancellations made after the trip, rental, dispatch, or service has already started.',
          'Fraudulent transactions, chargeback misuse, or policy abuse under investigation.',
          'Complaints raised without enough booking or payment proof where service records show successful completion.',
        ],
      },
      {
        title: 'Refund timelines',
        bullets: [
          'UPI or wallet refunds are usually credited within 1 to 3 business days after approval.',
          'Card, bank, or gateway refunds are usually credited within 5 to 10 business days after approval.',
          'If a banking partner delays settlement, the final credit timeline may depend on the payment provider.',
        ],
      },
      {
        title: 'Refund eligibility',
        body:
          'Eligible refunds will be credited within 5 to 10 business days to the original payment method, subject to banking timelines.',
      },
      {
        title: 'How to request a refund',
        bullets: [
          'Raise the issue through the support team with your booking ID, payment details, and reason for the request.',
          'Submit the request as early as possible after the cancelled or affected booking.',
          'Appzeto 24   Trawler may ask for screenshots, transaction references, or additional verification before approval.',
        ],
      },
      {
        title: 'Indicative vehicle pricing',
        table: vehiclePricing,
      },
      {
        title: 'Important pricing note',
        body:
          'The prices and admin cancellation cuts listed above are indicative website references only. Actual booking fares and cancellation deductions can change based on city, route, timing, service zone, partner assignment stage, tolls, waiting time, demand, and service availability.',
      },
    ],
  },
  cancellation: {
    label: 'Cancellation Policy',
    title: 'Cancellation Policy',
    icon: Scale,
    intro:
      'This page summarizes how cancellations are handled across Appzeto 24  Trawler booking categories.',
    sections: [
      {
        title: 'General policy',
        bullets: [
          'Free cancellation may be available during a short grace period.',
          'Charges may apply after partner assignment, dispatch, or service start.',
          'Refundability depends on timing, service state, and payment verification.',
        ],
      },
    ],
  },
};

const getDocumentType = (pathname = '') => {
  const value = pathname.toLowerCase();
  if (value.includes('privacy-policy') || value.includes('privacy')) return 'privacy';
  if (value.includes('terms-and-conditions') || value.includes('terms')) return 'terms';
  if (value.includes('refund')) return 'refund';
  if (value.includes('cancellation')) return 'cancellation';
  return 'terms';
};

const isLegalHeadingLine = (line = '') => {
  const value = String(line || '').trim();
  if (!value) return false;
  if (/^[A-Z\s&()/-]{6,}$/.test(value)) return true;
  if (/^[A-Z]\.\s+[A-Z]/.test(value)) return true;
  if (/^[IVXLCDM]+\.\s+[A-Z]/.test(value)) return true;
  if (/^\([A-Za-z&\s]+\)$/.test(value)) return true;
  return false;
};

const LegalPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const content = legalContent[getDocumentType(location.pathname)];
  const Icon = content.icon || FileText;
  const rawParagraphs = content.rawText
    ? content.rawText
      .split(/\r?\n\r?\n/)
      .map((block) => block.trim())
      .filter(Boolean)
    : [];

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-yellow-100/80 bg-yellow-50/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 transition-all hover:bg-stone-100"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-sm font-bold uppercase tracking-[0.3em] text-stone-500">
            {content.label}
          </span>
        </div>
      </div>

      <section className="bg-[#171717] px-6 pb-16 pt-28 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex h-18 w-18 items-center justify-center rounded-[28px] bg-[#f4b400] text-black shadow-lg shadow-black/20">
            <Icon size={30} />
          </div>
          <h1 className="max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
            {content.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-stone-300">
            {content.intro}
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
            <a
              href={`tel:${ownerContact.phone}`}
              className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
            >
              <Phone size={18} className="text-[#f4b400]" />
              <span>{ownerContact.phone}</span>
            </a>
            <a
              href={`mailto:${ownerContact.email}`}
              className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
            >
              <Mail size={18} className="text-[#f4b400]" />
              <span>{ownerContact.email}</span>
            </a>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl space-y-8">
          {content.rawText ? (
            <div className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
              <div className="space-y-5 text-sm leading-8 text-slate-700 md:text-base">
                {rawParagraphs.map((paragraph, index) => (
                  <div key={`${index}-${paragraph.slice(0, 24)}`} className="space-y-2">
                    {paragraph.split(/\r?\n/).filter(Boolean).map((line, lineIndex) => (
                      <p
                        key={`${index}-${lineIndex}-${line.slice(0, 16)}`}
                        className={`break-words whitespace-pre-wrap ${isLegalHeadingLine(line)
                            ? 'text-lg font-black tracking-tight text-slate-900'
                            : 'text-sm font-medium leading-8 text-slate-700 md:text-base'
                          }`}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : content.sections.map((section) => (
            <div key={section.title} className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-black tracking-tight text-slate-900 md:text-2xl">
                {section.title}
              </h2>

              {section.body ? (
                <p className="mt-4 text-base leading-8 text-slate-600">{section.body}</p>
              ) : null}

              {section.bullets ? (
                <ul className="mt-4 space-y-3 text-base leading-7 text-slate-600">
                  {section.bullets.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-2 h-2 w-2 rounded-full bg-[#f4b400]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {section.table ? (
                <div className="mt-6 overflow-hidden rounded-[24px] border border-stone-200">
                  <div className="grid grid-cols-1 gap-px bg-stone-200 md:grid-cols-5">
                    <div className="bg-stone-100 px-5 py-4 text-xs font-black uppercase tracking-[0.25em] text-stone-500">Vehicle Type</div>
                    <div className="bg-stone-100 px-5 py-4 text-xs font-black uppercase tracking-[0.25em] text-stone-500">Capacity</div>
                    <div className="bg-stone-100 px-5 py-4 text-xs font-black uppercase tracking-[0.25em] text-stone-500">Starting Price</div>
                    <div className="bg-stone-100 px-5 py-4 text-xs font-black uppercase tracking-[0.25em] text-stone-500">Cancellation Cut</div>
                    <div className="bg-stone-100 px-5 py-4 text-xs font-black uppercase tracking-[0.25em] text-stone-500">Use Case</div>
                  </div>

                  {section.table.map((row) => (
                    <div key={row.type} className="grid grid-cols-1 gap-px border-t border-stone-200 bg-stone-200 md:grid-cols-5">
                      <div className="bg-white px-5 py-5">
                        <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                          <IndianRupee size={16} className="text-[#f4b400]" />
                          {row.type}
                        </div>
                      </div>
                      <div className="bg-white px-5 py-5 text-sm text-slate-600">{row.capacity}</div>
                      <div className="bg-white px-5 py-5 text-sm font-bold text-slate-900">{row.price}</div>
                      <div className="bg-white px-5 py-5 text-sm font-bold text-slate-900">{row.cancellationCut}</div>
                      <div className="bg-white px-5 py-5 text-sm text-slate-600">{row.note}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default LegalPage;
