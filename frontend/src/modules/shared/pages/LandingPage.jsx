import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, Mail, LogIn, MapPin, Gift, Clock, Shield, ArrowRight, Menu, X
} from 'lucide-react';
import './LandingPage.css';
import { useSettings } from '../../../shared/context/SettingsContext';

// Using the existing project images
import rideImg from '@/assets/landing/ride.png';
import parcelImg from '@/assets/landing/parcel.png';
import bikeImg from '@/assets/landing/bike.png';
import newHeroTaxiImg from '@/assets/ride-removebg-preview.png';
import checkUsOutImg from '@/assets/check_us_out.jpg';

// Custom Brand SVG Icons
const YoutubeIcon = ({ size = 24, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...props}>
    <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.507a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.507 9.388.507 9.388.507s7.517 0 9.388-.507a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const LinkedinIcon = ({ size = 24, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...props}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const InstagramIcon = ({ size = 24, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const FacebookIcon = ({ size = 24, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...props}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

function LandingPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'Appzeto 24';
  const [activeTab, setActiveTab] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleRedirect = (path, tabName) => (e) => {
    e?.preventDefault();
    if (tabName) setActiveTab(tabName);
    setIsMobileMenuOpen(false);
    if (path.startsWith('#')) {
      const element = document.querySelector(path);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      navigate(path);
    }
  };

  const renderLogo = () => {
    const nameStr = appName.toString();
    if (nameStr.toLowerCase() === 'easytaxi' || nameStr.length > 4) {
      const mid = Math.floor(nameStr.length / 2);
      return (
        <>
          {nameStr.substring(0, mid)}
          <span className="logo-accent">{nameStr.substring(mid)}</span>
        </>
      );
    }
    return nameStr;
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
    }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  return (
    <div className="landing-page">
      {/* Background Neon Vector Decorative Graphics */}
      <div className="neon-glow-line-container">
        <svg className="neon-glow-svg" viewBox="0 0 1440 3200" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <path
            d="M 1200 -50 C 950 250, 450 350, 450 750 C 450 1150, 1150 1200, 1150 1600 C 1150 2000, 300 2150, 300 2550 C 300 2950, 1050 3000, 1050 3350"
            stroke="rgba(249, 211, 6, 0.08)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <motion.path
            className="neon-glow-line-active"
            d="M 1200 -50 C 950 250, 450 350, 450 750 C 450 1150, 1150 1200, 1150 1600 C 1150 2000, 300 2150, 300 2550 C 300 2950, 1050 3000, 1050 3350"
            stroke="#F9D306"
            strokeWidth="3.5"
            strokeLinecap="round"
            initial={{ strokeDasharray: "0 1000" }}
            animate={{ strokeDasharray: ["0 1000", "1000 0", "0 1000"] }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          />
        </svg>
      </div>

      {/* Header & Navigation */}
      <header className={`nav-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-container">
          <Link to="/" className="logo-link" onClick={() => setActiveTab('home')}>
            {renderLogo()}
          </Link>

          <nav className="hidden-mobile">
            <ul className="nav-links">
              <li>
                <a href="#home" className={`nav-link ${activeTab === 'home' ? 'active' : ''}`} onClick={handleRedirect('#home', 'home')}>
                  HOME
                </a>
              </li>
              <li>
                <Link to="/about" className="nav-link" onClick={() => setActiveTab('about')}>
                  COMPANY
                </Link>
              </li>
              <li>
                <a href="#services" className="nav-link" onClick={handleRedirect('#services', 'services')}>
                  SERVICES
                </a>
              </li>
              <li>
                <Link to="/faq" className="nav-link" onClick={() => setActiveTab('faq')}>
                  FAQS
                </Link>
              </li>
              <li>
                <Link to="/blog" className="nav-link" onClick={() => setActiveTab('blog')}>
                  BLOG
                </Link>
              </li>
            </ul>
          </nav>

          <div className="nav-ctas">
            <button className="btn-login-text" onClick={() => navigate('/login')}>
              LOGIN
            </button>
            <button className="btn-book-now" onClick={() => navigate('/login')}>
              BOOK NOW
            </button>
            <button className="mobile-toggle" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.ul
              className="mobile-nav-menu"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <li><a href="#home" className="mobile-nav-link" onClick={handleRedirect('#home', 'home')}>HOME</a></li>
              <li><Link to="/about" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>COMPANY</Link></li>
              <li><a href="#services" className="mobile-nav-link" onClick={handleRedirect('#services', 'services')}>SERVICES</a></li>
              <li><Link to="/faq" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>FAQS</Link></li>
              <li><Link to="/blog" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>BLOG</Link></li>
              <li className="mobile-ctas">
                <button className="btn-login-text" onClick={() => { setIsMobileMenuOpen(false); navigate('/login'); }}>LOGIN</button>
                <button className="btn-book-now" onClick={() => { setIsMobileMenuOpen(false); navigate('/login'); }}>BOOK NOW</button>
              </li>
            </motion.ul>
          )}
        </AnimatePresence>
      </header>

      {/* Hero Section */}
      <section id="home" className="hero-section">
        <motion.div
          className="hero-left"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeInUp}
        >
          <div className="badge-outline">
            <span className="badge-dot"></span>
            <span>TRAVEL SECURELY WITH US!</span>
          </div>

          <h1 className="hero-title">
            Book your taxi<br />
            from <span className="italic-serif">anywhere</span><br />
            <span className="highlight-today">today!</span>
          </h1>

          <p className="hero-desc">
            Everything your taxi business needs is already here! Appzeto  made for premium taxi service companies seeking excellence.
          </p>

          <div className="hero-ctas">
            <button className="btn-hero-capsule" onClick={() => navigate('/login')}>
              <span>BOOK YOUR RIDE</span>
              <ArrowRight size={16} />
            </button>
            <button className="btn-hero-capsule-outline" onClick={() => navigate('/login')}>
              <LogIn size={16} />
              <span>LOGIN</span>
            </button>
          </div>
        </motion.div>

        {/* Hero Right: 3D Unbound Parallax Drive-In Layer */}
        <div className="hero-right">
          <div className="hero-car-card">
            {/* Background Base Frame Card holds layout depth structure */}
          </div>

          <div className="viewport-car-track">
            <motion.img
              src={newHeroTaxiImg}
              alt="Appzeto  Taxi Model"
              className="hero-car-standalone-asset"
              loading="eager"
              initial={{ x: "120vw", scale: 0.95, opacity: 0 }}
              animate={{ x: 0, scale: 1, opacity: 1 }}
              transition={{
                duration: 1.6,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.1
              }}
              onAnimationComplete={() => {
                document.getElementById('Appzeto -car-engine')?.classList.add('animate-engine-idle');
              }}
              id="Appzeto -car-engine"
            />
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="services-section">
        <h2 className="section-title-serif">OUR SERVICES</h2>
        <div className="section-underline"></div>

        <motion.div
          className="services-grid"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          <motion.div className="service-card" variants={fadeInUp}>
            <div className="service-img-wrapper">
              <img src={rideImg} alt="City Taxi Service" />
            </div>
            <h3>TAXI SERVICE</h3>
            <p>Comfortable and safe city rides to any destination you want to go with our professional drivers.</p>
          </motion.div>

          <motion.div className="service-card" variants={fadeInUp}>
            <div className="service-img-wrapper">
              <img src={bikeImg} alt="Quick Bike Rides" />
            </div>
            <h3>BIKE RIDE</h3>
            <p>Beat the traffic and reach your destination faster with our quick and affordable bike taxi service.</p>
          </motion.div>

          <motion.div className="service-card" variants={fadeInUp}>
            <div className="service-img-wrapper">
              <img src={parcelImg} alt="Secure Parcel Delivery" />
            </div>
            <h3>PARCEL DELIVERY</h3>
            <p>Fast and reliable parcel delivery services to send packages across the city securely.</p>
          </motion.div>
        </motion.div>
      </section>

      {/* Benefits Section */}
      <section className="benefits-sec-yellow">
        <h2 className="section-title-serif">SOME BENEFITS</h2>
        <div className="section-underline"></div>

        <motion.div
          className="benefits-grid"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          <motion.div className="benefit-item" variants={fadeInUp}>
            <div className="benefit-icon-box"><MapPin size={24} /></div>
            <div className="benefit-content">
              <h3>HOME PICKUP</h3>
              <p>We run do home pickup to serve you more better and to your convenience</p>
            </div>
          </motion.div>

          <motion.div className="benefit-item" variants={fadeInUp}>
            <div className="benefit-icon-box"><Gift size={24} /></div>
            <div className="benefit-content">
              <h3>BONUSES FOR RIDE</h3>
              <p>When you book us frequently we give you different bonuses that can put a smile on your face</p>
            </div>
          </motion.div>

          <motion.div className="benefit-item" variants={fadeInUp}>
            <div className="benefit-icon-box"><Clock size={24} /></div>
            <div className="benefit-content">
              <h3>FAST BOOKING</h3>
              <p>Our book method is very fast and easy. It won't stress you.</p>
            </div>
          </motion.div>

          <motion.div className="benefit-item" variants={fadeInUp}>
            <div className="benefit-icon-box"><Shield size={24} /></div>
            <div className="benefit-content">
              <h3>GPS SEARCHING</h3>
              <p>We run GPS searching incase you aren't sure of your destination. So you don't have to worry.</p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Login Dashboard Callout */}
      <section className="login-showcase-section">
        <motion.div
          className="login-card-layout"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeInUp}
        >
          <div className="login-text-content">
            <h2>
              LOGIN TO<br />
              MANAGE <span className="italic-yellow-serif">RIDES</span><br />
              AND SUPPORT<br />
              REQUESTS.
            </h2>
            <div className="login-actions-row">
              <button className="btn-hero-capsule" onClick={() => navigate('/login')}>GO TO LOGIN</button>
              <button className="btn-hero-capsule-outline" onClick={() => navigate('/signup')}>CREATE ACCOUNT</button>
            </div>
          </div>

          <div className="login-graphic-content">
            <div className="browser-mockup">
              <div className="browser-header">
                <span className="browser-dot red"></span>
                <span className="browser-dot yellow"></span>
                <span className="browser-dot green"></span>
              </div>
              <div className="browser-content">
                <div className="mock-dash-header">
                  <span className="mock-dash-title">ACCOUNT MANAGEMENT</span>
                  <span className="mock-dash-badge">● ONLINE</span>
                </div>
                <div className="mock-dash-grid">
                  <div className="mock-dash-card">
                    <span className="mock-card-label">TOTAL BOOKINGS</span>
                    <span className="mock-card-value">24 Rides</span>
                  </div>
                  <div className="mock-dash-card">
                    <span className="mock-card-label">ACTIVE WALLET</span>
                    <span className="mock-card-value">₹850.40</span>
                  </div>
                </div>
                <div className="mock-dash-card" style={{ borderStyle: 'dashed' }}>
                  <span className="mock-card-label">LAST TRANSACTIONS</span>
                  <span className="mock-card-value" style={{ fontSize: '0.9rem' }}>City Cab (Complete) - ₹120</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Community & QR Download App */}
      <section className="community-section">
        <motion.div
          className="community-card"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeInUp}
        >
          <div className="community-left">
            <h2>JOIN THE Appzeto 24<br /><span className="italic-serif">COMMUNITY</span></h2>
            <p>Follow us on social media for exclusive updates, promo codes, and ride-hailing tips from our global community.</p>
            <div className="socials-row">
              <a href="https://www.facebook.com/people/Appzeto 24/61590718764212" target="_blank" rel="noopener noreferrer" className="social-square-btn" aria-label="Facebook"><FacebookIcon size={22} /></a>
              <a href="https://www.instagram.com/Appzeto 24official?igsh=MWQ3cWoxazJ1ZGV1OQ%3D%3D" target="_blank" rel="noopener noreferrer" className="social-square-btn" aria-label="Instagram"><InstagramIcon size={22} /></a>
              <a href="https://youtube.com/@Appzeto 24official?si=RfVhOYUay--g9BhB" target="_blank" rel="noopener noreferrer" className="social-square-btn" aria-label="YouTube"><YoutubeIcon size={22} /></a>
              <a href="https://www.linkedin.com/company/124914072/admin/dashboard/" target="_blank" rel="noopener noreferrer" className="social-square-btn" aria-label="LinkedIn"><LinkedinIcon size={22} /></a>
            </div>
          </div>

          <div className="community-right">
            <div className="qr-download-card">
              <h3 className="qr-title">SCAN TO DOWNLOAD</h3>
              <div className="qr-box"><img src={checkUsOutImg} alt="Download App QR Code" /></div>
              <p className="qr-desc">Get the app now for the best experience on the go.</p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Modern Footer Section */}
      <footer className="modern-footer">
        <div className="footer-container">
          <div className="footer-grid">
            <div className="footer-brand">
              <h2 style={{ color: 'var(--primary-yellow)' }}>Appzeto <span style={{ color: '#fff' }}>24</span></h2>
              <p>Redefining urban mobility with kinetic efficiency and premium service.</p>
            </div>
            <div className="footer-col">
              <h3>COMPANY</h3>
              <ul>
                <li><Link to="/about">About Us</Link></li>
                <li><Link to="/careers">Careers</Link></li>
                <li><Link to="/blog">Press</Link></li>
              </ul>
            </div>
            <div className="footer-col">
              <h3>SERVICES</h3>
              <ul>
                <li><Link to="/login">Ride</Link></li>
                <li><Link to="/login">Drive</Link></li>
                <li><Link to="/login">Deliver</Link></li>
              </ul>
            </div>
            <div className="footer-col">
              <h3>SUPPORT</h3>
              <ul>
                <li><Link to="/contact">Business</Link></li>
                <li><Link to="/faq">Sustainability</Link></li>
                <li><Link to="/faq">Safety</Link></li>
              </ul>
            </div>
            <div className="footer-col">
              <h3>LEGAL</h3>
              <ul>
                <li><Link to="/terms">Terms</Link></li>
                <li><Link to="/privacy">Privacy</Link></li>
                <li><Link to="/privacy">Cookies</Link></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-copyright">Copyright 2026 © All Rights Reserved | Appzeto 24</div>
            <div className="footer-contacts">
              <div className="footer-contact-item"><Phone size={14} /><span>91-93-911-911</span></div>
              <div className="footer-contact-item"><Mail size={14} /><span>customercare@Appzeto 24.com</span></div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;