import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import RentalLocationTracker from '../modules/user/components/RentalLocationTracker';
import ScrollToTop from '../components/app/ScrollToTop';
import UserAccountInvalidationListener from '../components/app/UserAccountInvalidationListener';
import UserUpcomingRideReminderBootstrap from '../components/app/UserUpcomingRideReminderBootstrap';
import { useUserTheme } from '../shared/context/UserThemeContext';

const MainLayout = ({ children }) => {
  const location = useLocation();
  const { theme } = useUserTheme();
  const staticPages = [
    '/',
    '/about',
    '/contact',
    '/support',
    '/faq',
    '/services',
    '/privacy',
    '/privacy-policy',
    '/terms',
    '/terms-and-conditions',
    '/refund',
    '/cancellation',
    '/blog',
    '/links',
    '/careers',
  ];
  const isStaticPath = staticPages.includes(location.pathname);
  const isAdminPath =
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/user-import') ||
    location.pathname.startsWith('/driver-import') ||
    location.pathname.startsWith('/owner');

  const isUserPath = !isAdminPath && !isStaticPath;
  const isSplashPath = location.pathname === '/taxi/user/splash';
  const isAuthPath = 
    location.pathname === '/taxi/user/login' ||
    location.pathname === '/taxi/user/signup' ||
    location.pathname === '/taxi/user/verify-otp' ||
    location.pathname === '/login';

  if (isSplashPath || isAuthPath) {
    return (
      <>
        <RentalLocationTracker />
        <ScrollToTop />
        <UserAccountInvalidationListener />
        <UserUpcomingRideReminderBootstrap />
        {children}
      </>
    );
  }

  const content = isAdminPath ? (
    <div className="redigo-admin-root h-screen bg-gray-50 overflow-hidden">{children}</div>
  ) : isStaticPath ? (
    <div className="redigo-landing-root min-h-screen bg-white">
      <main className="min-h-screen">{children}</main>
    </div>
  ) : (
    <div className={`redigo-app min-h-screen transition-colors duration-300 ${isUserPath ? (theme === 'dark' ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900') : 'bg-gray-50/50'} ${isUserPath ? 'user-app-theme ' + theme : ''}`}>
      <main className={`w-full max-w-lg md:max-w-7xl mx-auto shadow-2xl min-h-screen relative overflow-x-hidden transition-colors duration-300 ${isUserPath ? (theme === 'dark' ? 'bg-slate-900 text-white border-x border-slate-800/80' : 'bg-white text-slate-900 border-x border-slate-200') : 'bg-white'}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: [0.21, 1.02, 0.43, 1.01] }}
            className="w-full min-h-screen flex flex-col"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );

  return (
    <>
      <RentalLocationTracker />
      <ScrollToTop />
      <UserAccountInvalidationListener />
      <UserUpcomingRideReminderBootstrap />
      {content}
    </>
  );
};

export default MainLayout;
