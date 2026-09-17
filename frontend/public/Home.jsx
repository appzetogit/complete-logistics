import React from 'react';
import HeaderGreeting from '../components/HeaderGreeting';
import ServiceGrid from '../components/ServiceGrid';
import LocationMapSection from '../components/LocationMapSection';
import ActionsSection from '../components/ActionsSection';
import PromoBanners from '../components/PromoBanners';
import ExplorerSection from '../components/ExplorerSection';
import BottomNavbar from '../components/BottomNavbar';

const Home = () => {
  const footerIllustrationBg = {
    backgroundImage: 'url(/home_footer_gemini.png)',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center calc(100% + 65px)',
    backgroundSize: 'cover',
  };

  const footerIllustrationFadeMask = {
    WebkitMaskImage:
      'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 22%, rgba(0,0,0,1) 88%, rgba(0,0,0,0) 100%)',
    maskImage:
      'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 22%, rgba(0,0,0,1) 88%, rgba(0,0,0,0) 100%)',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
  };

  const footerIllustrationEdgeBlurMask = {
    WebkitMaskImage:
      'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 16%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 100%)',
    maskImage:
      'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 16%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 100%)',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] pb-24 max-w-lg mx-auto relative overflow-hidden font-sans no-scrollbar">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-orange-100/60 blur-3xl pointer-events-none" />
      <div className="absolute top-52 left-[-60px] h-52 w-52 rounded-full bg-emerald-100/60 blur-3xl pointer-events-none" />
      <div className="absolute bottom-28 right-[-40px] h-40 w-40 rounded-full bg-blue-100/60 blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-4 pb-6">
        <HeaderGreeting />
        <ServiceGrid />
        <LocationMapSection />
        <ActionsSection />
        <PromoBanners />
        <ExplorerSection />
        <div
          className="relative w-full"
          style={{
            height: 360,
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              filter: 'grayscale(1) contrast(1.08)',
              ...footerIllustrationFadeMask,
            }}
          >
            <div className="absolute inset-0" style={footerIllustrationBg} />
            <div
              className="absolute inset-0 opacity-55"
              style={{
                ...footerIllustrationBg,
                filter: 'blur(3px)',
                ...footerIllustrationEdgeBlurMask,
              }}
            />
          </div>

          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-white/80 via-white/35 to-transparent" />
            <div className="relative z-10 flex h-full items-center justify-center px-6 pt-16 text-left">
              <div className="flex max-w-[340px] flex-col items-start px-2 py-2 -translate-x-6 translate-y-12">
                <div className="text-[30px] font-serif font-extrabold tracking-[0.28em] text-slate-600 drop-shadow-[0_2px_10px_rgba(255,255,255,0.85)]">
                  #Appzeto 24
                </div>
                <div className="mt-1 text-[12px] font-sans italic font-semibold tracking-wide text-slate-600 drop-shadow-[0_1px_8px_rgba(255,255,255,0.8)]">
                  Redefining Your Indore Journey
                </div>
                <div className="mt-2 text-[10px] font-sans font-semibold tracking-[0.22em] text-slate-500 drop-shadow-[0_1px_8px_rgba(255,255,255,0.8)]">
                  Made For Malwa, Crafted For The Cleanest City.
                  <img
                    src="/flag-in.svg"
                    alt="India"
                    className="ml-0.5 inline-block h-[2.2em] w-[1.2em] align-[-0.88em]"
                    draggable={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-24 left-0 right-0 h-24 opacity-[0.08] pointer-events-none">
        <img src="/city_skyline_footer.png" alt="City" className="w-full h-full object-bottom" />
      </div>

      <BottomNavbar />
    </div>
  );
};

export default Home;
