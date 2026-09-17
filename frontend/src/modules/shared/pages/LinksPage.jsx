import React from 'react';
import { Download, ExternalLink, Shield, Zap, Star } from 'lucide-react';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';
import './LinksPage.css';
import bannerImg from '@/assets/images/links-banner.png';

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

const LinksPage = () => {
  const links = [
    {
      id: 'user',
      title: 'Appzeto 24 - User app',
      subtitle: 'Book rides, send parcels, and more.',
      description: 'Get where you need to go with ease. Request a ride or send packages across the city in minutes.',
      url: 'https://play.google.com/store/apps/details?id=com.Appzeto 24.user',
      type: 'Customer App',
      icon: <Zap className="link-icon" />,
      color: '#FFB300'
    },
    {
      id: 'driver',
      title: 'Appzeto 24 Driver',
      subtitle: 'Drive and earn with Appzeto 24.',
      description: 'Join our fleet of professional drivers. Flexible hours, great earnings, and a supportive community.',
      url: 'https://play.google.com/store/apps/details?id=com.Appzeto 24.driver',
      type: 'Partner App',
      icon: <Shield className="link-icon" />,
      color: '#2563EB'
    }
  ];
  return (
    <div className="links-page-container">
      <nav className="links-nav">
        <div className="nav-container">
          <a href="/" className="nav-logo">
            <span className="logo-Appzeto ">Appzeto </span><span className="logo-24">24</span>
          </a>
          <a href="/" className="back-home">Back to Home</a>
        </div>
      </nav>

      <div className="links-banner">
        <img src={bannerImg} alt="Appzeto 24 Banner" className="banner-image" />
        <div className="banner-gradient"></div>
      </div>

      <div className="links-content-wrapper">
        <header className="links-header">
          <h1 className="links-title">Download <span className="highlight">Appzeto 24</span></h1>
          <p className="links-tagline">Choose the app that's right for you and start your journey today.</p>
        </header>


        <div className="links-grid">
          {links.map((link) => (
            <div key={link.id} className="link-card" style={{ '--accent-color': link.color }}>
              <div className="card-badge">{link.type}</div>
              <div className="card-icon-wrapper">
                {link.icon}
              </div>
              <h2 className="card-title">{link.title}</h2>
              <p className="card-subtitle">{link.subtitle}</p>
              <p className="card-description">{link.description}</p>

              <div className="card-features">
                <div className="feature">
                  <Star size={16} fill="currentColor" />
                  <span>Premium Service</span>
                </div>
                <div className="feature">
                  <Shield size={16} />
                  <span>Secure & Safe</span>
                </div>
              </div>

              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="download-button"
              >
                <Download size={20} />
                <span>Download on Play Store</span>
                <ExternalLink size={16} className="ext-icon" />
              </a>
            </div>
          ))}
        </div>

        <div className="social-links-section">
          <h2 className="social-title">Connect With Us</h2>
          <p className="social-subtitle font-medium">Follow us on our social media platforms for the latest updates, stories, and offers.</p>
          <div className="social-links-grid">
            <a
              href="https://www.facebook.com/people/Appzeto 24/61590718764212"
              target="_blank"
              rel="noopener noreferrer"
              className="social-card facebook"
            >
              <div className="social-icon-wrapper">
                <FacebookIcon size={24} />
              </div>
              <div className="social-card-info">
                <span className="social-name">Facebook</span>
                <span className="social-handle">Appzeto 24</span>
              </div>
              <ExternalLink size={16} className="social-ext" />
            </a>

            <a
              href="https://youtube.com/@Appzeto 24official?si=RfVhOYUay--g9BhB"
              target="_blank"
              rel="noopener noreferrer"
              className="social-card youtube"
            >
              <div className="social-icon-wrapper">
                <YoutubeIcon size={24} />
              </div>
              <div className="social-card-info">
                <span className="social-name">YouTube</span>
                <span className="social-handle">@Appzeto 24official</span>
              </div>
              <ExternalLink size={16} className="social-ext" />
            </a>

            <a
              href="https://www.instagram.com/Appzeto 24official?igsh=MWQ3cWoxazJ1ZGV1OQ%3D%3D"
              target="_blank"
              rel="noopener noreferrer"
              className="social-card instagram"
            >
              <div className="social-icon-wrapper">
                <InstagramIcon size={24} />
              </div>
              <div className="social-card-info">
                <span className="social-name">Instagram</span>
                <span className="social-handle">@Appzeto 24official</span>
              </div>
              <ExternalLink size={16} className="social-ext" />
            </a>

            <a
              href="https://www.linkedin.com/company/124914072/admin/dashboard/"
              target="_blank"
              rel="noopener noreferrer"
              className="social-card linkedin"
            >
              <div className="social-icon-wrapper">
                <LinkedinIcon size={24} />
              </div>
              <div className="social-card-info">
                <span className="social-name">LinkedIn</span>
                <span className="social-handle">Appzeto 24</span>
              </div>
              <ExternalLink size={16} className="social-ext" />
            </a>
          </div>
        </div>

        {/* Scroll Animation Section */}
        <div className="bg-zinc-900 text-white rounded-[32px] py-10 my-10 overflow-hidden">
          <ContainerScroll
            titleComponent={
              <div className="mb-6">
                <h2 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-none text-center">
                  Quick Access to All <br />
                  <span className="text-3xl md:text-5xl font-black text-[#FFB300] mt-2 block leading-none">
                    Appzeto 24 Platforms
                  </span>
                </h2>
              </div>
            }
          >
            <img
              src="https://ui.aceternity.com/_next/image?url=%2Flinear.webp&w=3840&q=75"
              alt="Appzeto  platforms overview"
              className="mx-auto rounded-2xl object-cover h-full object-left-top w-full"
              draggable={false}
            />
          </ContainerScroll>
        </div>

        <footer className="links-footer">
          <p>© 2026 Appzeto 24. All rights reserved.</p>
          <div className="footer-links">
            <a href="https://Appzeto 24.com" target="_blank" rel="noopener noreferrer">Visit Website</a>
            <span className="dot"></span>
            <a href="/support">Support</a>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LinksPage;
