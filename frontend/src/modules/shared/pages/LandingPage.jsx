import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';
import {
  ArrowRight,
  ArrowUp,
  Bell,
  ChevronDown,
  Clock3,
  Share2,
  Siren,
  BadgeCheck,
  BadgeIndianRupee,
  Briefcase,
  CheckCircle2,
  Gauge,
  Headphones,
  KeyRound,
  LifeBuoy,
  Mail,
  MapPin,
  Menu,
  Navigation,
  Package,
  Phone,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import './LandingPage.css';
import { SUPPORT_INFO } from '../content/supportInfo';
import { userService } from '../../user/services/userService';
import { normalizeAssetUrl } from '../../../shared/context/SettingsContext';

import heroImg from '@/assets/landing/hero-bg.png';
import cityRideImg from '@/assets/3d images/AutoCab/taxi.png';
import airportImg from '@/assets/3d images/AutoCab/airoplan.png';
import outstationImg from '@/assets/3d images/AutoCab/one way.png';
import busImg from '@/assets/3d images/AutoCab/bus.png';
import parcelImg from '@/assets/user-app/parcel.png';
import bikeImg from '@/assets/icons/premium_bike.png';
import autoImg from '@/assets/icons/premium_auto.png';
import sedanImg from '@/assets/icons/premium_car.png';
import miniImg from '@/assets/landing/ride.png';
import parcelBikeImg from '@/assets/images/delivery/bike.png';
import truckImg from '@/assets/images/delivery/trucks.png';
import moversImg from '@/assets/images/delivery/movers.png';
import qrImg from '@/assets/check_us_out.jpg';
import carSideImg from '@/assets/landing/car-side.webp';
import cityLifeImg from '@/assets/landing/journey-commute.webp';
import getawayImg from '@/assets/landing/journey-getaway.webp';
import courierImg from '@/assets/landing/journey-parcel.webp';
import shiftingImg from '@/assets/landing/journey-movers.webp';
import nightTaxiImg from '@/assets/user-app/yellow-taxi.jpg';
// White-lettering version of the logo: every place it appears on this page is dark
import logoHorizontal from '@/assets/brand/rentol-horizontal-light.png';

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin, SplitText, useGSAP);

// ------------------------------------------------------------------------------------------------ content
// A brochure page: no login or booking from here. The only backend call is the public list of services
// (App Modules in the admin panel), so the services shown here always match what admin has turned on.

const APP_NAME = 'Rentol';

const NAV_LINKS = [
  { label: 'Home', href: '#home' },
  { label: 'Services', href: '#services' },
  { label: 'Fleet', href: '#fleet' },
  { label: 'Safety', href: '#safety' },
  { label: 'Drive', href: '#drive' },
  { label: 'About Us', href: '/about' },
  { label: 'Contact Us', href: '/contact' },
];

const TRUST = [
  { icon: ShieldCheck, label: 'Verified Drivers' },
  { icon: Navigation, label: 'Live Tracking' },
  { icon: Headphones, label: '24x7 Support' },
  { icon: Wallet, label: 'Secure Payments' },
];

const HERO_RIDES = [
  { image: bikeImg, title: 'Bike', text: 'Beat the traffic' },
  { image: autoImg, title: 'Auto', text: 'Quick & affordable' },
  { image: sedanImg, title: 'Cab', text: 'Comfort for 4' },
  { image: truckImg, title: 'Truck', text: 'Goods & shifting' },
];

// Shown after the admin services in the yellow band
const MARQUEE_EXTRAS = ['Verified Drivers', 'Live Tracking', '24x7 Support'];

// Used only if the services list cannot be loaded
const FALLBACK_SERVICES = [
  { image: cityRideImg, title: 'City Rides', text: 'Bike, auto & cab' },
  { image: outstationImg, title: 'Outstation', text: 'One way & round trip' },
  { image: parcelImg, title: 'Parcel Delivery', text: 'Send anything, anywhere' },
  { image: busImg, title: 'Bus', text: 'Buses & mini buses' },
];

const SERVICE_TEXT = {
  outstation: 'One way & round trip',
  rental: 'Hourly & daily rentals',
  bid: 'Offer your own fare',
  pooling: 'Share the ride, split the fare',
  bus: 'Book your bus seat',
};

/** Picture for an admin service that has no icon uploaded. */
const fallbackServiceImage = (module) => {
  const text = `${module.name} ${module.service_type} ${module.transport_type}`.toLowerCase();
  if (/bus/.test(text)) return busImg;
  if (/outstation|intercity|one way/.test(text)) return outstationImg;
  if (/airport|flight/.test(text)) return airportImg;
  if (/parcel|delivery|courier|send/.test(text)) return parcelImg;
  if (/truck|goods|mover|shift/.test(text)) return truckImg;
  if (/auto|rickshaw/.test(text)) return autoImg;
  if (/bike|scooty|scooter|two/.test(text)) return bikeImg;
  return cityRideImg;
};

const TRANSPORT_TEXT = {
  taxi: 'Book a ride in minutes',
  delivery: 'Goods & parcel delivery',
  both: 'Rides & deliveries',
  pooling: 'Share the ride, split the fare',
};

// Equal admin order numbers: rides first, then deliveries
const TRANSPORT_RANK = { taxi: 0, both: 1, pooling: 2, delivery: 3 };

const isActiveModule = (module) => [1, true, '1', 'true'].includes(module?.active);

/** One line under the service name; skips an admin description that only repeats the name. */
const serviceText = (module, title) => {
  const description = String(module.short_description || '').trim();
  if (description && description.toLowerCase() !== title.toLowerCase()) return description;
  return SERVICE_TEXT[module.service_type] || TRANSPORT_TEXT[module.transport_type] || 'Book in the app';
};

/** Admin "App Modules" (public endpoint) as landing-page service cards, in the admin's order. */
const toServices = (modules) =>
  modules
    .filter((module) => isActiveModule(module) && String(module?.name || '').trim())
    .map((module, index) => ({ module, index }))
    .sort(
      (a, b) =>
        (Number(a.module.order_by) || 0) - (Number(b.module.order_by) || 0) ||
        (TRANSPORT_RANK[a.module.transport_type] ?? 9) - (TRANSPORT_RANK[b.module.transport_type] ?? 9) ||
        a.index - b.index,
    )
    .map(({ module }) => {
      const title = String(module.name).trim();
      return {
        title,
        text: serviceText(module, title),
        image: normalizeAssetUrl(module.mobile_menu_icon || '') || fallbackServiceImage(module),
        fallbackImage: fallbackServiceImage(module),
      };
    });

const WHY = [
  { icon: BadgeCheck, title: 'Verified & Trained Drivers', text: 'Document-checked before their first trip, rated after every ride.' },
  { icon: Navigation, title: 'Live Tracking & SOS', text: 'Follow every trip on the map, with an SOS button inside the ride.' },
  { icon: BadgeIndianRupee, title: 'Upfront Pricing', text: 'See the fare before you book. No hidden charges.' },
  { icon: KeyRound, title: 'OTP-Secured Pickup', text: 'Your trip starts only when the right driver has your code.' },
  { icon: Headphones, title: '24x7 Customer Support', text: 'Call or chat with us, any time of the day.' },
];

const FLEET = [
  { tag: 'Bike', name: 'Bike Taxi', image: bikeImg, icon: Users, spec: '1 rider' },
  { tag: 'Auto', name: 'Auto Rickshaw', image: autoImg, icon: Users, spec: '3 seats' },
  { tag: 'Mini', name: 'Everyday Cab', image: miniImg, icon: Users, spec: '4 seats' },
  { tag: 'Sedan', name: 'Comfort Sedan', image: sedanImg, icon: Users, spec: '4 seats' },
  { tag: 'Parcel', name: 'Parcel Bike', image: parcelBikeImg, icon: Package, spec: 'Small parcels' },
  { tag: 'Truck', name: 'Mini Truck', image: truckImg, icon: Package, spec: 'Shop & bulk loads' },
  { tag: 'Shifting', name: 'Packers & Movers', image: moversImg, icon: Package, spec: 'Home & office' },
];

const DRIVE = [
  {
    icon: Sparkles,
    badge: 'Flexible',
    title: 'Work your way',
    text: 'Go online when it suits you. Take rides, parcels or both.',
    points: ['Bike, auto, cab or truck', 'Your hours, your area'],
  },
  {
    icon: Wallet,
    badge: 'Earnings',
    title: 'Wallet & withdrawals',
    text: 'Every trip lands in your wallet. Withdraw your earnings to your bank.',
    points: ['Cash & online trips', 'Clear trip-by-trip history'],
  },
  {
    icon: Gauge,
    badge: 'Bonus',
    title: 'Incentives',
    text: 'Earn extra for completing more trips and staying online at busy hours.',
    points: ['Daily & weekly targets', 'Shown in the driver app'],
  },
  {
    icon: LifeBuoy,
    badge: '24x7',
    title: 'On-road support',
    text: 'A support team that picks up whenever you are on the road.',
    points: ['In-app help & SOS', 'Fast issue resolution'],
  },
];

const STEPS = [
  { icon: MapPin, title: 'Set pickup & drop', text: 'Use your live location or search any address.' },
  { icon: Gauge, title: 'Pick a ride, see the fare', text: 'Compare bikes, cabs and trucks with the price shown upfront.' },
  { icon: Smartphone, title: 'Track live & pay your way', text: 'Follow your driver on the map and pay by cash, UPI or wallet.' },
];

const HERO_WORDS = ['Bike Taxi', 'Auto', 'Cab', 'Parcel', 'Truck'];

const JOURNEYS = [
  { image: cityLifeImg, kicker: 'Daily commute', title: 'Office, college, back home.', text: 'Quick bikes and autos that beat the traffic, at the fare you saw when you booked.' },
  { image: nightTaxiImg, kicker: 'Late nights', title: 'Safe rides after dark.', text: 'Verified drivers, OTP pickup, live trip sharing and SOS, whatever the hour.' },
  { image: getawayImg, kicker: 'Weekend getaways', title: 'Outstation, one way or round trip.', text: 'Comfortable cabs for long drives, with the route and fare clear from the start.' },
  { image: courierImg, kicker: 'Send a parcel', title: 'Across town in hours.', text: 'Documents, gifts or groceries, picked up and delivered with live tracking.' },
  { image: shiftingImg, kicker: 'Shifting', title: 'Move a home or an office.', text: 'The right truck and helping hands for every load, booked from the same app.' },
];

const STATS = [
  { to: 8, suffix: '+', label: 'Ride & delivery types' },
  { to: 24, suffix: 'x7', label: 'Customer support' },
  { to: 100, suffix: '%', label: 'Trips tracked live' },
  { to: 4, suffix: '', label: 'Ways to pay' },
];

const SAFETY = [
  { icon: Navigation, title: 'Live trip tracking', text: 'See your driver arrive and follow the whole route on the map.' },
  { icon: Share2, title: 'Share your ride', text: 'Send your live trip to family so they know when you reach.' },
  { icon: Siren, title: 'SOS in one tap', text: 'Alert your emergency contacts and our team from inside the trip.' },
  { icon: Bell, title: 'Every update, instantly', text: 'Driver assigned, arriving, started, reached: you always know.' },
];

const FAQS = [
  {
    q: `What can I book on ${APP_NAME}?`,
    a: 'Bike taxis, autos and cabs for city rides, outstation and airport trips, plus parcel delivery, trucks and packers & movers, all in one app.',
  },
  {
    q: 'Will I know the fare before I book?',
    a: 'Yes. The fare is shown before you confirm, so there are no surprises at the end of the trip.',
  },
  {
    q: 'How do I pay?',
    a: 'Pay by cash, UPI, card or the in-app wallet. You can even switch a cash ride to online payment at the drop.',
  },
  {
    q: 'How are drivers verified?',
    a: `Every ${APP_NAME} driver's documents are checked before their first trip, and riders rate them after every ride. Your trip starts only with your OTP.`,
  },
  {
    q: `How do I become a ${APP_NAME} driver?`,
    a: 'Download the driver app, add your vehicle and documents, and start taking rides or deliveries once you are approved.',
  },
];

// ------------------------------------------------------------------------------------------------ helpers

const SectionHead = ({ index, kicker, title, children, light = false }) => (
  <div className={`lp-head ${light ? 'is-light' : ''}`}>
    <p className="lp-kicker lp-reveal">
      <span className="lp-kicker-num">{index}</span>
      <span className="lp-kicker-text">{kicker}</span>
      <span className="lp-kicker-line" />
    </p>
    <h2 className="lp-title">{title}</h2>
    {children}
  </div>
);

/** Card that tilts toward the cursor in 3D (mouse only). */
const TiltCard = ({ className = '', children }) => {
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(y, [0, 1], [10, -10]), { stiffness: 220, damping: 18 });
  const rotateY = useSpring(useTransform(x, [0, 1], [-10, 10]), { stiffness: 220, damping: 18 });

  const handleMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width);
    y.set((event.clientY - rect.top) / rect.height);
    event.currentTarget.style.setProperty('--gx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
    event.currentTarget.style.setProperty('--gy', `${((event.clientY - rect.top) / rect.height) * 100}%`);
  };
  const reset = () => {
    x.set(0.5);
    y.set(0.5);
  };

  return (
    <motion.article
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      whileHover={{ y: -8 }}
    >
      {children}
    </motion.article>
  );
};

const FaqItem = ({ q, a, open, onToggle }) => (
  <div className={`lp-faq-item ${open ? 'is-open' : ''}`}>
    <button type="button" className="lp-faq-q" aria-expanded={open} onClick={onToggle}>
      <span>{q}</span>
      <motion.span className="lp-faq-icon" animate={{ rotate: open ? 180 : 0 }}><ChevronDown size={18} /></motion.span>
    </button>
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="lp-faq-a"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <p>{a}</p>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

/** Floating back-to-top button whose ring fills with scroll progress. */
const BackToTop = ({ progress, visible, onClick }) => {
  const dash = useTransform(progress, (value) => 113 - value * 113);
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          className="lp-top"
          aria-label="Back to top"
          onClick={onClick}
          initial={{ opacity: 0, scale: 0.6, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 20 }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.9 }}
        >
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" />
            <motion.circle cx="20" cy="20" r="18" className="is-fill" style={{ strokeDashoffset: dash }} />
          </svg>
          <ArrowUp size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  );
};

/** Rotating word in a pill: "Book a Bike Taxi / Auto / Cab ..." */
function WordRotator({ words, paused }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (paused) return undefined;
    const timer = setInterval(() => setIndex((current) => (current + 1) % words.length), 2200);
    return () => clearInterval(timer);
  }, [paused, words.length]);

  return (
    <span className="lp-rotator" aria-live="off">
      <AnimatePresence initial={false}>
        <motion.span
          key={words[index]}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Desktop-only cursor: a yellow dot with a ring that grows over links and buttons. */
function Cursor() {
  const [enabled] = useState(() => window.matchMedia?.('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches);
  const [hovering, setHovering] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 350, damping: 30, mass: 0.5 });
  const ringY = useSpring(y, { stiffness: 350, damping: 30, mass: 0.5 });

  useEffect(() => {
    if (!enabled) return undefined;
    const move = (event) => {
      x.set(event.clientX);
      y.set(event.clientY);
      setHovering(Boolean(event.target.closest?.('a, button, .lp-svc, .lp-car, .lp-journey')));
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [enabled, x, y]);

  if (!enabled) return null;
  return (
    <>
      <motion.span className="lp-cursor-dot" style={{ x, y }} aria-hidden="true" />
      <motion.span
        className={`lp-cursor-ring ${hovering ? 'is-hover' : ''}`}
        style={{ x: ringX, y: ringY }}
        aria-hidden="true"
      />
    </>
  );
}

/** Brand intro: the logo and a counter to 100, shown once per visit. */
function Loader({ onDone }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const counter = { value: 0 };
    const tween = gsap.to(counter, {
      value: 100,
      duration: 1.3,
      ease: 'power2.inOut',
      onUpdate: () => setCount(Math.round(counter.value)),
      onComplete: () => setTimeout(onDone, 180),
    });
    // Animation frames pause in background tabs: never keep the page behind the intro for long.
    const fallback = setTimeout(onDone, 2600);
    return () => {
      tween.kill();
      clearTimeout(fallback);
    };
  }, [onDone]);

  return (
    <motion.div
      className="lp-loader"
      initial={{ opacity: 1 }}
      exit={{ yPercent: -100, transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1] } }}
    >
      <motion.div
        className="lp-loader-brand"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <span className="lp-logo-pill is-lg"><img src={logoHorizontal} alt={APP_NAME} /></span>
      </motion.div>
      <div className="lp-loader-bar">
        <span style={{ transform: `scaleX(${count / 100})` }} />
        <em>{count}</em>
      </div>
    </motion.div>
  );
}

const seenIntro = () => {
  try {
    return sessionStorage.getItem('lp-intro') === '1';
  } catch {
    return false;
  }
};

// ------------------------------------------------------------------------------------------------ page

function LandingPage() {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef(null);
  const fleetLoop = useRef(null);

  const [loading, setLoading] = useState(
    () => !seenIntro() && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [navSolid, setNavSolid] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [activeId, setActiveId] = useState('home');
  // Services from the admin panel; null until loaded (the scroll animations wait for it, so they measure the final layout)
  const [services, setServices] = useState(null);

  useEffect(() => {
    let alive = true;
    userService
      .getAppModules({ limit: 100 })
      .then((response) => {
        const list = response?.data?.data?.results || response?.data?.results || [];
        const fromAdmin = toServices(Array.isArray(list) ? list : []);
        if (alive) setServices(fromAdmin.length ? fromAdmin : FALLBACK_SERVICES);
      })
      .catch(() => alive && setServices(FALLBACK_SERVICES));
    return () => {
      alive = false;
    };
  }, []);

  const servicesReady = services !== null;
  const serviceList = services || FALLBACK_SERVICES;
  const bandItems = [...serviceList.map((service) => service.title), ...MARQUEE_EXTRAS];

  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.3 });
  useMotionValueEvent(scrollY, 'change', (latest) => {
    setNavSolid(latest > 30);
    setShowTop(latest > 900);
  });

  // Hero: a soft yellow light follows the cursor
  const handleHeroMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--hx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--hy', `${event.clientY - rect.top}px`);
  };

  useEffect(() => {
    document.body.style.overflow = menuOpen || loading ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen, loading]);

  const finishIntro = React.useCallback(() => {
    try {
      sessionStorage.setItem('lp-intro', '1');
    } catch {
      /* private mode: the intro simply shows again next time */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready?.then(refresh);
    window.addEventListener('load', refresh);
    return () => window.removeEventListener('load', refresh);
  }, []);

  const goTo = (href) => (event) => {
    if (!href.startsWith('#')) return;
    event.preventDefault();
    setMenuOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  // ---------------------------------------------------------------------------------------------- GSAP
  useGSAP(
    () => {
      if (loading || !servicesReady) return undefined;
      const mm = gsap.matchMedia();

      // Journeys: pinned horizontal scroll on large screens; swipe on small ones.
      // Created first: the pin adds scroll length, and every trigger below it must be measured after that.
      mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        const track = document.querySelector('.lp-journey-track');
        if (!track) return;
        const distance = () => Math.max(0, track.scrollWidth - track.parentElement.clientWidth);
        const slide = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: '.lp-journeys',
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.8,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });
        gsap.to('.lp-journey-progress span', {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: { trigger: '.lp-journeys', start: 'top top', end: () => `+=${distance()}`, scrub: true, invalidateOnRefresh: true },
        });
        gsap.utils.toArray('.lp-journey img').forEach((img) => {
          gsap.fromTo(
            img,
            { xPercent: -10, scale: 1.2 },
            {
              xPercent: 10,
              scale: 1.2,
              ease: 'none',
              scrollTrigger: { trigger: img.closest('.lp-journey'), containerAnimation: slide, start: 'left right', end: 'right left', scrub: true },
            },
          );
        });
      });

      // Highlight the nav link of the section on screen (all devices)
      ['home', 'services', 'fleet', 'journeys', 'safety', 'drive'].forEach((id) => {
        ScrollTrigger.create({
          trigger: `#${id}`,
          start: 'top 45%',
          end: 'bottom 45%',
          onToggle: (self) => setActiveId((current) => (self.isActive ? id : current === id ? '' : current)),
        });
      });

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Section titles: words slide up out of a mask
        gsap.utils.toArray('.lp-title').forEach((title) => {
          SplitText.create(title, {
            type: 'words',
            mask: 'words',
            autoSplit: true,
            onSplit: (split) =>
              gsap.from(split.words, {
                yPercent: 110,
                duration: 0.9,
                ease: 'expo.out',
                stagger: 0.06,
                scrollTrigger: { trigger: title, start: 'top 88%', once: true },
              }),
          });
        });

        // Giant words: two endless marquees in opposite directions; scrolling speeds them up
        // (and scrolling up reverses them)
        const giantLoops = gsap.utils.toArray('.lp-giant-row').map((row, index) =>
          gsap.fromTo(
            row,
            { xPercent: index % 2 ? -50 : 0 },
            { xPercent: index % 2 ? 0 : -50, ease: 'none', duration: index % 2 ? 26 : 22, repeat: -1 },
          ),
        );
        ScrollTrigger.create({
          trigger: '.lp-giant',
          start: 'top bottom',
          end: 'bottom top',
          onUpdate: (self) => {
            const boost = Math.min(Math.abs(self.getVelocity()) / 120, 8);
            giantLoops.forEach((loop) => {
              gsap.to(loop, { timeScale: self.direction * (1 + boost), duration: 0.2, overwrite: true });
              gsap.to(loop, { timeScale: self.direction, duration: 1.2, delay: 0.2, overwrite: false });
            });
          },
        });

        // Footer wordmark rises
        gsap.from('.lp-wordmark span', {
          yPercent: 100,
          ease: 'expo.out',
          duration: 1.2,
          stagger: 0.05,
          scrollTrigger: { trigger: '.lp-wordmark', start: 'top 95%', once: true },
        });
        // Hero intro
        gsap
          .timeline({ defaults: { ease: 'expo.out' } })
          .from('.lp-hero-bg img', { scale: 1.25, duration: 2.2, ease: 'power3.out' })
          .from('.lp-hero-title .lp-line > span', { yPercent: 110, duration: 1.1, stagger: 0.12 }, 0.1)
          .from('.lp-eyebrow, .lp-hero-sub, .lp-hero-ctas, .lp-trust', { y: 24, autoAlpha: 0, duration: 0.9, stagger: 0.1 }, 0.45)
          .from('.lp-hero-panel', { y: 50, autoAlpha: 0, duration: 1.1 }, 0.5)
          .from('.lp-hero-ride', { y: 20, autoAlpha: 0, duration: 0.7, stagger: 0.08 }, 0.8);

        // Hero parallax
        gsap.to('.lp-hero-bg img', {
          yPercent: 14,
          ease: 'none',
          scrollTrigger: { trigger: '.lp-hero', start: 'top top', end: 'bottom top', scrub: true },
        });

        // Kicker lines draw, section content rises in
        gsap.utils.toArray('.lp-kicker-line').forEach((line) => {
          gsap.from(line, { scaleX: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: line, start: 'top 90%' } });
        });
        gsap.set('.lp-reveal', { y: 36, autoAlpha: 0 });
        ScrollTrigger.batch('.lp-reveal', {
          start: 'top 90%',
          once: true,
          onEnter: (batch) => gsap.to(batch, { y: 0, autoAlpha: 1, duration: 0.8, ease: 'power3.out', stagger: 0.08 }),
        });

        // Marquee band: loops, and speeds up / reverses with scroll
        const band = gsap.to('.lp-band-track', { xPercent: -50, ease: 'none', duration: 28, repeat: -1 });
        ScrollTrigger.create({
          trigger: '.lp-band',
          start: 'top bottom',
          end: 'bottom top',
          onUpdate: (self) => {
            const boost = Math.min(Math.abs(self.getVelocity()) / 300, 4);
            gsap.to(band, { timeScale: self.direction * (1 + boost), duration: 0.2, overwrite: true });
            gsap.to(band, { timeScale: self.direction, duration: 1, delay: 0.2, overwrite: false });
          },
        });

        // Service cards pop in
        gsap.from('.lp-svc', {
          y: 50,
          autoAlpha: 0,
          duration: 0.8,
          ease: 'back.out(1.4)',
          stagger: 0.08,
          scrollTrigger: { trigger: '.lp-svc-grid', start: 'top 85%' },
        });

        // Why section: the glow drifts with scroll, items stagger in
        gsap.to('.lp-why-glow', {
          xPercent: 40,
          ease: 'none',
          scrollTrigger: { trigger: '.lp-why', start: 'top bottom', end: 'bottom top', scrub: true },
        });
        gsap.from('.lp-why-item', {
          y: 40,
          autoAlpha: 0,
          duration: 0.8,
          ease: 'power3.out',
          stagger: 0.1,
          scrollTrigger: { trigger: '.lp-why-grid', start: 'top 85%' },
        });

        // Drive cards
        gsap.from('.lp-drive-card', {
          y: 60,
          autoAlpha: 0,
          duration: 0.9,
          ease: 'power3.out',
          stagger: 0.1,
          scrollTrigger: { trigger: '.lp-drive-grid', start: 'top 85%' },
        });

        // Hero: a taxi keeps driving along the dashed road
        gsap.fromTo(
          '.lp-hero-car',
          { xPercent: -120, left: '0%' },
          { xPercent: 0, left: '100%', duration: 9, ease: 'none', repeat: -1, delay: 1.2 },
        );

        // Stats count up
        gsap.utils.toArray('.lp-stat-num').forEach((node) => {
          const counter = { value: 0 };
          gsap.to(counter, {
            value: Number(node.dataset.to || 0),
            duration: 1.8,
            ease: 'power2.out',
            scrollTrigger: { trigger: node, start: 'top 92%', once: true },
            onUpdate: () => {
              node.textContent = Math.round(counter.value);
            },
          });
        });

        // Safety: the trip route draws on the phone map and the car follows it, ETA counts down
        const trip = gsap.timeline({
          repeat: -1,
          repeatDelay: 1.2,
          scrollTrigger: { trigger: '.lp-safety', start: 'top 75%', toggleActions: 'play pause resume pause' },
        });
        const tripPath = document.querySelector('.lp-map-route');
        if (tripPath) {
          const length = tripPath.getTotalLength();
          const eta = { value: 12 };
          const etaNode = document.querySelector('.lp-eta-num');
          trip
            .set(tripPath, { strokeDasharray: length, strokeDashoffset: length })
            .set(eta, { value: 12 })
            .to(tripPath, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' })
            .from('.lp-map-pin', { scale: 0, transformOrigin: '50% 100%', duration: 0.4, ease: 'back.out(2)', stagger: 0.2 }, '-=0.4')
            .to('.lp-map-car', {
              motionPath: { path: tripPath, align: tripPath, alignOrigin: [0.5, 0.5], autoRotate: true },
              duration: 5,
              ease: 'power1.inOut',
            })
            .to(eta, {
              value: 0,
              duration: 5,
              ease: 'power1.inOut',
              onUpdate: () => {
                if (etaNode) etaNode.textContent = Math.round(eta.value);
              },
            }, '<');
        }
        gsap.from('.lp-safety-item', {
          y: 30,
          autoAlpha: 0,
          duration: 0.8,
          ease: 'power3.out',
          stagger: 0.12,
          clearProps: 'transform',
          scrollTrigger: { trigger: '.lp-safety-list', start: 'top 88%', once: true },
        });

        // How it works: the road draws itself and a taxi drives along it as you scroll
        const road = document.querySelector('.lp-road-path');
        if (road) {
          const length = road.getTotalLength();
          gsap.set(road, { strokeDasharray: length, strokeDashoffset: length });
          const roadScroll = { trigger: '.lp-steps', start: 'top 80%', end: 'bottom 55%', scrub: 0.8 };
          gsap.to(road, { strokeDashoffset: 0, ease: 'none', scrollTrigger: roadScroll });
          // The car rides on the road: it waits at the start until you scroll here, then drives to the end
          gsap.fromTo(
            '.lp-road-car',
            { motionPath: { path: road, align: road, alignOrigin: [0.5, 0.7], autoRotate: true, start: 0, end: 0 } },
            {
              motionPath: { path: road, align: road, alignOrigin: [0.5, 0.7], autoRotate: true, start: 0, end: 1 },
              ease: 'none',
              immediateRender: true,
              scrollTrigger: roadScroll,
            },
          );
        }
        gsap.utils.toArray('.lp-step').forEach((step) => {
          ScrollTrigger.create({ trigger: step, start: 'top 70%', toggleClass: { targets: step, className: 'is-active' } });
        });

        // App card grows into place, phone floats up
        gsap.from('.lp-app-card', {
          scale: 0.92,
          y: 50,
          ease: 'none',
          scrollTrigger: { trigger: '.lp-app', start: 'top bottom', end: 'top 45%', scrub: true },
        });
        gsap.from('.lp-phone', {
          yPercent: 30,
          rotate: 6,
          ease: 'none',
          scrollTrigger: { trigger: '.lp-app', start: 'top bottom', end: 'center center', scrub: true },
        });
      });

      // Fleet carousel loops on every device (slower when reduced motion is asked for)
      fleetLoop.current = gsap.to('.lp-fleet-track', {
        xPercent: -50,
        ease: 'none',
        duration: reduceMotion ? 120 : 40,
        repeat: -1,
      });

      ScrollTrigger.refresh();

      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [loading, servicesReady] },
  );

  const pauseFleet = () => fleetLoop.current?.pause();
  const playFleet = () => fleetLoop.current?.play();

  // ---------------------------------------------------------------------------------------------- render
  return (
    <div className="lp" ref={rootRef}>
      <AnimatePresence>{loading && <Loader onDone={finishIntro} />}</AnimatePresence>

      <motion.div className="lp-progress" style={{ scaleX: progress }} aria-hidden="true" />

      {/* ------------------------------------------------------------------------------------ nav */}
      <header className={`lp-nav ${navSolid ? 'is-solid' : ''}`}>
        <div className="lp-container lp-nav-inner">
          <a href="#home" className="lp-brand" onClick={goTo('#home')} aria-label={`${APP_NAME} home`}>
            <span className="lp-logo-pill"><img src={logoHorizontal} alt={APP_NAME} width="150" height="36" /></span>
          </a>

          <nav className="lp-nav-links" aria-label="Main">
            {NAV_LINKS.map((link) =>
              link.href.startsWith('#') ? (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={goTo(link.href)}
                  className={activeId === link.href.slice(1) ? 'is-active' : ''}
                  aria-current={activeId === link.href.slice(1) ? 'true' : undefined}
                >
                  {link.label}
                </a>
              ) : (
                <Link key={link.href} to={link.href}>{link.label}</Link>
              ),
            )}
          </nav>

          <div className="lp-nav-actions">
            <motion.a
              href="#app"
              className="lp-btn lp-btn-primary lp-nav-cta"
              onClick={goTo('#app')}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
            >
              Get the App
            </motion.a>
            <button
              type="button"
              className="lp-burger"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="lp-menu"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {NAV_LINKS.map((link, index) => (
              <motion.div
                key={link.href}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * index }}
              >
                {link.href.startsWith('#') ? (
                  <a href={link.href} onClick={goTo(link.href)}>{link.label}</a>
                ) : (
                  <Link to={link.href} onClick={() => setMenuOpen(false)}>{link.label}</Link>
                )}
              </motion.div>
            ))}
            <a href="#app" className="lp-btn lp-btn-primary" onClick={goTo('#app')}>Get the App</a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------------------------ hero */}
      <section id="home" className="lp-hero" onPointerMove={handleHeroMove}>
        <div className="lp-hero-bg" aria-hidden="true"><img src={heroImg} alt="" fetchPriority="high" /></div>
        <div className="lp-hero-shade" aria-hidden="true" />
        <div className="lp-hero-glow" aria-hidden="true" />
        <div className="lp-hero-orb is-one" aria-hidden="true" />
        <div className="lp-hero-orb is-two" aria-hidden="true" />

        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">
              <span className="lp-live-dot" /> Now booking <WordRotator words={HERO_WORDS} paused={reduceMotion} />
            </p>
            <h1 className="lp-hero-title">
              <span className="lp-line"><span>Go anywhere.</span></span>
              <span className="lp-line"><span className="lp-yellow">Send anything.</span></span>
            </h1>
            <p className="lp-hero-sub">
              Fair fares, verified drivers and round-the-clock support. Bikes, autos, cabs and trucks for
              city rides, outstation trips, airport transfers and deliveries.
            </p>
            <div className="lp-hero-ctas">
              <motion.a href="#services" className="lp-btn lp-btn-primary" onClick={goTo('#services')} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
                Explore Services <ArrowRight size={18} />
              </motion.a>
              <motion.a href="#app" className="lp-btn lp-btn-ghost" onClick={goTo('#app')} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
                <Smartphone size={18} /> Download App
              </motion.a>
            </div>
            <ul className="lp-trust">
              {TRUST.map(({ icon: Icon, label }) => (
                <li key={label}><Icon size={16} /> {label}</li>
              ))}
            </ul>
          </div>

          <aside className="lp-hero-panel" aria-label="Ways to ride with Rentol">
            <motion.span
              className="lp-float-chip is-top"
              animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <KeyRound size={14} /> OTP-secured pickup
            </motion.span>
            <motion.span
              className="lp-float-chip is-bottom"
              animate={reduceMotion ? undefined : { y: [0, 8, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
            >
              <span className="lp-live-dot" /> Live tracking on
            </motion.span>
            <p className="lp-panel-title">One app. Every ride.</p>
            <ul>
              {HERO_RIDES.map(({ image, title, text }) => (
                <li className="lp-hero-ride" key={title}>
                  <span className="lp-ride-thumb"><img src={image} alt="" loading="eager" /></span>
                  <span className="lp-ride-text"><strong>{title}</strong><small>{text}</small></span>
                  <CheckCircle2 size={18} className="lp-ride-check" />
                </li>
              ))}
            </ul>
            <p className="lp-panel-foot"><ShieldCheck size={15} /> Fare shown before you book</p>
          </aside>
        </div>
        <div className="lp-dashes" aria-hidden="true">
          <img className="lp-hero-car" src={carSideImg} alt="" />
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------ band */}
      <div className="lp-band" aria-hidden="true">
        <div className="lp-band-track">
          {[0, 1].map((copy) => (
            <div className="lp-band-group" key={copy}>
              {bandItems.map((item) => (
                <span key={`${copy}-${item}`}>{item}<i>◆</i></span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------------------------ stats */}
      <section className="lp-stats" aria-label={`${APP_NAME} in numbers`}>
        <div className="lp-container lp-stats-grid">
          {STATS.map(({ to, suffix, label }) => (
            <div className="lp-stat lp-reveal" key={label}>
              <div className="lp-stat-value">
                <span className="lp-stat-num" data-to={to}>{to}</span>
                <span className="lp-stat-suffix">{suffix}</span>
              </div>
              <p>{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------ services */}
      <section id="services" className="lp-section lp-services">
        <div className="lp-container">
          <SectionHead index="01" kicker="What we move" title="Our Services" />
          <div className="lp-svc-grid">
            {serviceList.map(({ image, fallbackImage, title, text }) => (
              <TiltCard key={title} className="lp-svc">
                <span className="lp-svc-shine" aria-hidden="true" />
                <span className="lp-svc-img">
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      // an icon path that no longer exists on the server: show our own picture instead
                      if (fallbackImage && !event.currentTarget.src.endsWith(fallbackImage)) event.currentTarget.src = fallbackImage;
                    }}
                  />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------ why */}
      <section id="why" className="lp-section lp-why">
        <div className="lp-why-glow" aria-hidden="true" />
        <div className="lp-container">
          <SectionHead index="02" kicker="The difference" title={<>Why Choose {APP_NAME}?</>} light />
          <div className="lp-why-grid">
            {WHY.map(({ icon: Icon, title, text }) => (
              <div className="lp-why-item" key={title}>
                <span className="lp-why-icon"><Icon size={20} /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------ fleet */}
      <section id="fleet" className="lp-section lp-fleet">
        <div className="lp-container">
          <SectionHead index="03" kicker="The fleet" title="Popular Vehicles" />
        </div>
        <div className="lp-fleet-viewport" onMouseEnter={pauseFleet} onMouseLeave={playFleet}>
          <div className="lp-fleet-track">
            {[0, 1].map((copy) => (
              <div className="lp-fleet-group" key={copy} aria-hidden={copy === 1 ? 'true' : undefined}>
                {FLEET.map(({ tag, name, image, icon: Icon, spec }) => (
                  <motion.article key={`${copy}-${name}`} className="lp-car" whileHover={{ y: -8 }}>
                    <div className="lp-car-img">
                      <img src={image} alt={copy === 0 ? name : ''} loading="lazy" />
                      <span className="lp-car-tag">{tag}</span>
                    </div>
                    <div className="lp-car-body">
                      <h3>{name}</h3>
                      <p><Icon size={14} /> {spec}</p>
                      <div className="lp-car-foot">
                        <span className="lp-car-note">Upfront fare</span>
                        <span className="lp-car-chip">In the app</span>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------ journeys */}
      <section id="journeys" className="lp-journeys">
        <div className="lp-container lp-journeys-head">
          <SectionHead index="04" kicker="Every journey" title={<>One app for every <span className="lp-yellow">moment.</span></>} light />
          <p className="lp-lead lp-journeys-lead">From the morning commute to shifting homes, {APP_NAME} has a ride for it.</p>
        </div>
        <div className="lp-journey-viewport">
          <div className="lp-journey-track">
            {JOURNEYS.map(({ image, kicker, title, text }, index) => (
              <article className="lp-journey" key={title}>
                <div className="lp-journey-media"><img src={image} alt="" loading="lazy" /></div>
                <div className="lp-journey-shade" />
                <span className="lp-journey-num">{String(index + 1).padStart(2, '0')} / {String(JOURNEYS.length).padStart(2, '0')}</span>
                <div className="lp-journey-body">
                  <span className="lp-journey-kicker">{kicker}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="lp-container">
          <div className="lp-journey-progress" aria-hidden="true"><span /></div>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------ safety */}
      <section id="safety" className="lp-section lp-safety">
        <div className="lp-container lp-safety-grid">
          <div>
            <SectionHead index="05" kicker="Safety first" title={<>Every trip, <span className="lp-yellow-dark">live on the map.</span></>}>
              <p className="lp-lead lp-reveal">
                From the moment your driver is assigned until you reach, you and your family can see exactly
                where you are.
              </p>
            </SectionHead>
            <ul className="lp-safety-list">
              {SAFETY.map(({ icon: Icon, title, text }) => (
                <li className="lp-safety-item" key={title}>
                  <span className="lp-safety-icon"><Icon size={20} /></span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="lp-track" aria-hidden="true">
            <div className="lp-track-phone">
              <div className="lp-track-screen">
                <svg className="lp-map" viewBox="0 0 300 420">
                  <rect width="300" height="420" className="lp-map-bg" />
                  <path className="lp-map-block" d="M0 70 H300 M0 170 H300 M0 280 H300 M0 360 H300 M60 0 V420 M150 0 V420 M240 0 V420" />
                  <rect x="70" y="80" width="70" height="80" rx="8" className="lp-map-park" />
                  <rect x="160" y="290" width="70" height="60" rx="8" className="lp-map-park" />
                  <path className="lp-map-route-base" d="M60 380 V280 H150 V170 H240 V70" />
                  <path className="lp-map-route" d="M60 380 V280 H150 V170 H240 V70" />
                  <g className="lp-map-pin">
                    <circle cx="60" cy="380" r="9" className="lp-pin-start" />
                  </g>
                  <g className="lp-map-pin">
                    <path d="M240 46 c-9 0 -15 7 -15 15 c0 11 15 24 15 24 s15 -13 15 -24 c0 -8 -6 -15 -15 -15z" className="lp-pin-end" />
                    <circle cx="240" cy="61" r="5" fill="#fff" />
                  </g>
                  <g className="lp-map-car">
                    <rect x="-11" y="-7" width="22" height="14" rx="4" className="lp-car-shape" />
                    <rect x="2" y="-5" width="6" height="10" rx="2" fill="#0b0d12" opacity="0.55" />
                  </g>
                </svg>
                <span className="lp-eta"><Clock3 size={13} /> Arriving in <b className="lp-eta-num">12</b> min</span>
                <div className="lp-track-card">
                  <span className="lp-track-avatar"><BadgeCheck size={18} /></span>
                  <div>
                    <strong>Your driver is on the way</strong>
                    <small>Verified · OTP pickup</small>
                  </div>
                </div>
              </div>
            </div>
            <motion.span
              className="lp-track-chip is-share"
              animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Share2 size={14} /> Trip shared with family
            </motion.span>
            <motion.span
              className="lp-track-chip is-sos"
              animate={reduceMotion ? undefined : { y: [0, 10, 0] }}
              transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            >
              <Siren size={14} /> SOS ready
            </motion.span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------ drive */}
      <section id="drive" className="lp-section lp-drive">
        <div className="lp-container">
          <div className="lp-drive-head">
            <SectionHead index="06" kicker="Who drives you" title={<>Drive with {APP_NAME}</>} light>
              <p className="lp-lead lp-reveal">
                Every {APP_NAME} captain is document-verified before their first trip and rated by real riders.
                Bring your bike, auto, cab or truck and earn on your own schedule.
              </p>
            </SectionHead>
          </div>
          <div className="lp-drive-grid">
            {DRIVE.map(({ icon: Icon, badge, title, text, points }) => (
              <motion.article key={title} className="lp-drive-card" whileHover={{ y: -6 }}>
                <div className="lp-drive-top">
                  <span className="lp-drive-avatar"><Icon size={22} /></span>
                  <span className="lp-drive-badge"><BadgeCheck size={12} /> {badge}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
                <ul>
                  {points.map((point) => (
                    <li key={point}><CheckCircle2 size={14} /> {point}</li>
                  ))}
                </ul>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------ how it works */}
      <section id="how" className="lp-section lp-how">
        <div className="lp-container">
          <SectionHead index="07" kicker="How it works" title="Book in three steps" />
          <div className="lp-steps">
            <svg className="lp-road" viewBox="0 0 1000 120" aria-hidden="true">
              <path className="lp-road-base" d="M40 70 C 200 0, 330 130, 500 60 S 800 0, 960 60" />
              <path className="lp-road-path" d="M40 70 C 200 0, 330 130, 500 60 S 800 0, 960 60" />
              <image className="lp-road-car" href={carSideImg} width="104" height="33" x="0" y="0" />
            </svg>
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <div className="lp-step lp-reveal" key={title}>
                <span className="lp-step-icon"><Icon size={22} /></span>
                <span className="lp-step-num">Step {index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------ faq */}
      <section id="faq" className="lp-section lp-faq">
        <div className="lp-container lp-faq-grid">
          <SectionHead index="08" kicker="Questions" title="Frequently asked">
            <p className="lp-lead lp-reveal">
              Everything you need to know about riding, sending and driving with {APP_NAME}.
            </p>
          </SectionHead>
          <div className="lp-faq-list lp-reveal">
            {FAQS.map(({ q, a }, index) => (
              <FaqItem
                key={q}
                q={q}
                a={a}
                open={openFaq === index}
                onToggle={() => setOpenFaq((current) => (current === index ? -1 : index))}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------ business */}
      <section className="lp-biz">
        <div className="lp-container lp-biz-inner">
          <div>
            <span className="lp-biz-chip"><Briefcase size={13} /> For businesses</span>
            <h2>Logistics with {APP_NAME}</h2>
            <p>
              Mini trucks to large carriers for shop stock, bulk orders and long hauls, plus packers & movers
              for home and office shifting.
            </p>
          </div>
          <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
            <Link to="/contact" className="lp-btn lp-btn-primary">Talk to us <ArrowRight size={18} /></Link>
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------ giant words */}
      <div className="lp-giant" aria-hidden="true">
        {/* each row holds its text twice, so sliding it by half loops without a seam */}
        <div className="lp-giant-row">
          {[0, 1].map((copy) => <span key={copy}>Ride · Send · Move · Ride · Send · Move ·&nbsp;</span>)}
        </div>
        <div className="lp-giant-row is-solid">
          {[0, 1].map((copy) => <span key={copy}>{APP_NAME} · {APP_NAME} · {APP_NAME} · {APP_NAME} ·&nbsp;</span>)}
        </div>
      </div>

      {/* ------------------------------------------------------------------------------------ app */}
      <section id="app" className="lp-app">
        <div className="lp-container">
          <div className="lp-app-card">
            <div className="lp-app-copy">
              <h2>Download the {APP_NAME} App</h2>
              <p>Book rides, send parcels and track every trip live, anytime, anywhere.</p>
              <div className="lp-app-qr">
                <img src={qrImg} alt={`QR code to find ${APP_NAME} on Google`} loading="lazy" />
                <span>Scan to<br />find us</span>
              </div>
            </div>
            <div className="lp-phone" aria-hidden="true">
              <div className="lp-phone-screen">
                <span className="lp-logo-pill"><img src={logoHorizontal} alt="" /></span>
                <p>Go anywhere. Send anything.</p>
                <span className="lp-phone-btn">Book a Ride</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------------------------ footer */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <span className="lp-logo-pill"><img src={logoHorizontal} alt={APP_NAME} loading="lazy" /></span>
              <p>
                {APP_NAME} is a ride, delivery and logistics platform with verified drivers, upfront fares and
                24x7 support.
              </p>
              <ul className="lp-footer-contact">
                <li><Phone size={15} /> <a href={`tel:${SUPPORT_INFO.phoneHref}`}>{SUPPORT_INFO.phone}</a></li>
                <li><Mail size={15} /> <a href={`mailto:${SUPPORT_INFO.email}`}>{SUPPORT_INFO.email}</a></li>
                <li><MapPin size={15} /> <span>{SUPPORT_INFO.officeAddress}</span></li>
              </ul>
            </div>

            <div>
              <h4>Quick Links</h4>
              <a href="#home" onClick={goTo('#home')}>Home</a>
              <Link to="/about">About Us</Link>
              <a href="#services" onClick={goTo('#services')}>Our Services</a>
              <a href="#drive" onClick={goTo('#drive')}>Drive with Us</a>
              <a href="#faq" onClick={goTo('#faq')}>FAQs</a>
              <Link to="/contact">Contact Us</Link>
            </div>

            <div>
              <h4>Services</h4>
              {serviceList.map(({ title }) => (
                <a key={title} href="#services" onClick={goTo('#services')}>{title}</a>
              ))}
            </div>

            <div>
              <h4>Get the App</h4>
              <p>Book rides in seconds, track drivers live and pay your way with the {APP_NAME} app.</p>
              <div className="lp-footer-badges">
                <span><ShieldCheck size={13} /> Verified Drivers</span>
                <span><Headphones size={13} /> 24x7 Support</span>
              </div>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <span>© {new Date().getFullYear()} {APP_NAME}. All Rights Reserved.</span>
            <nav aria-label="Legal">
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
            </nav>
          </div>
        </div>
        <div className="lp-wordmark" aria-hidden="true">
          {APP_NAME.split('').map((letter, index) => <span key={`${letter}-${index}`}>{letter}</span>)}
        </div>
      </footer>

      <Cursor />
      <BackToTop
        progress={progress}
        visible={showTop}
        onClick={() => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })}
      />
    </div>
  );
}

export default LandingPage;
