import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Defer scrolling using requestAnimationFrame to avoid page transition layout thrashing
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      if (document.documentElement) {
        document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
      if (document.body) {
        document.body.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }

      // Reset internal scroll container scroll heights
      const scrollableContainers = document.querySelectorAll('.overflow-y-auto, [class*="overflow-y-auto"], .overflow-y-scroll, .no-scrollbar');
      scrollableContainers.forEach((container) => {
        container.scrollTop = 0;
      });
    };

    // Trigger on next frame representation
    requestAnimationFrame(resetScroll);
  }, [pathname]);

  return null;
};

export default ScrollToTop;
