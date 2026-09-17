import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getLocalUserToken } from '../services/authService';

const SplashScreen = () => {
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  // Toggle body scroll class
  useEffect(() => {
    document.body.classList.add('splash-active');
    return () => {
      document.body.classList.remove('splash-active');
    };
  }, []);

  // Background map lines and moving car dots animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    // Pre-defined road paths across the screen
    const paths = [
      {
        points: [
          { x: -50, y: height * 0.2 },
          { x: width * 0.4, y: height * 0.35 },
          { x: width * 0.6, y: height * 0.65 },
          { x: width + 50, y: height * 0.8 },
        ],
        cars: [
          { progress: 0, speed: 0.0015, color: '#FFC400' },
          { progress: 0.5, speed: 0.0012, color: '#FFC400' }
        ]
      },
      {
        points: [
          { x: -50, y: height * 0.75 },
          { x: width * 0.3, y: height * 0.6 },
          { x: width * 0.7, y: height * 0.3 },
          { x: width + 50, y: height * 0.15 },
        ],
        cars: [
          { progress: 0.2, speed: 0.0018, color: '#FFD740' },
          { progress: 0.8, speed: 0.0014, color: '#FFC400' }
        ]
      },
      {
        points: [
          { x: width * 0.1, y: height + 50 },
          { x: width * 0.25, y: height * 0.7 },
          { x: width * 0.75, y: height * 0.4 },
          { x: width * 0.9, y: -50 },
        ],
        cars: [
          { progress: 0.35, speed: 0.0016, color: '#FFC400' }
        ]
      }
    ];

    const getPointOnPath = (points, t) => {
      if (points.length === 0) return { x: 0, y: 0 };
      if (points.length === 1) return points[0];

      const segmentCount = points.length - 1;
      const scaledT = t * segmentCount;
      const index = Math.min(Math.floor(scaledT), segmentCount - 1);
      const segmentT = scaledT - index;

      const p0 = points[index];
      const p1 = points[index + 1];

      return {
        x: p0.x + (p1.x - p0.x) * segmentT,
        y: p0.y + (p1.y - p0.y) * segmentT,
      };
    };

    const render = () => {
      ctx.fillStyle = '#05070D';
      ctx.fillRect(0, 0, width, height);

      // Draw faint map grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw road paths
      paths.forEach((path) => {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        path.points.forEach((pt, index) => {
          if (index === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();

        path.cars.forEach((car) => {
          car.progress = (car.progress + car.speed) % 1;
          const pos = getPointOnPath(path.points, car.progress);

          // Outer Glow
          ctx.shadowColor = car.color;
          ctx.shadowBlur = 12;
          ctx.fillStyle = car.color;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
          ctx.fill();

          // Inner solid core
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        });
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Automatic routing redirect logic after 2.5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      sessionStorage.setItem('Appzeto 24_splash_seen', 'true');
      const token = getLocalUserToken();
      if (token) {
        navigate('/taxi/user', { replace: true });
      } else {
        navigate('/taxi/user/login', { replace: true });
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="splash-screen font-sans">
      {/* Animated background canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block pointer-events-none z-0" />

      {/* Subtle yellow glow behind logo/text */}
      <div className="absolute w-[280px] h-[280px] rounded-full bg-[#FFC400]/10 blur-[80px] pointer-events-none z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

      {/* Centered Content */}
      <div className="flex flex-col items-center justify-center text-center z-20 relative flex-1">
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="flex flex-col items-center"
        >
          {/* Clean text logo */}
          <h1 className="text-[32px] font-[900] tracking-wider text-white mb-2 leading-none uppercase">
            Appzeto
          </h1>

          {/* Subtitle */}
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[#FFC400] uppercase leading-none opacity-90">
            Your trusted journey partner
          </p>
        </motion.div>
      </div>

      {/* Loading Progress Bar Dots at Bottom */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex justify-center items-center z-20">
        <div className="flex gap-2">
          <motion.div
            animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
            className="w-2 h-2 rounded-full bg-[#FFC400]"
          />
          <motion.div
            animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
            className="w-2 h-2 rounded-full bg-[#FFC400]"
          />
          <motion.div
            animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}
            className="w-2 h-2 rounded-full bg-[#FFC400]"
          />
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
