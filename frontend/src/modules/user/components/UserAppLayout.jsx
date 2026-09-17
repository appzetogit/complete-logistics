import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNavbar from './BottomNavbar';

const UserAppLayout = () => {
  const location = useLocation();

  return (
    <div className="relative min-h-[100dvh] bg-gray-50 flex justify-center items-start w-full">
      <div className="w-full max-w-7xl mx-auto bg-white min-h-[100dvh] relative shadow-[0_0_40px_rgba(0,0,0,0.08)] flex flex-col overflow-x-hidden border-x border-gray-100">
        {/* Route Outlet wrapped in page transitions */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="w-full min-h-[100dvh] flex flex-col flex-1 pb-20"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>

        {/* Fixed bottom navigation */}
        <BottomNavbar />
      </div>
    </div>
  );
};

export default UserAppLayout;
