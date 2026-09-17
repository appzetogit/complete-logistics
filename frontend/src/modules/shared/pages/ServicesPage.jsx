import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';
import {
  ArrowLeft,
  Car,
  Plane,
  MapPin,
  Package,
  Bike,
  Headphones,
  ChevronRight
} from 'lucide-react';
import servicesHeroImg from '../../../assets/services_hero.png';

const ServicesPage = () => {
  const navigate = useNavigate();

  const services = [
    { title: "City Rides", desc: "Comfortable and safe city rides to any destination.", icon: <Car className="text-[#E85D04]" size={26} /> },
    { title: "Airport Transfers", desc: "Punctual drops and pickups from the airport.", icon: <Plane className="text-[#E85D04]" size={26} /> },
    { title: "Outstation Trips", desc: "Long-distance rides for your weekend getaways.", icon: <MapPin className="text-[#E85D04]" size={26} /> },
    { title: "Parcel Delivery", desc: "Fast and reliable parcel delivery services.", icon: <Package className="text-[#E85D04]" size={26} /> },
    { title: "Bike Taxi", desc: "Beat the traffic with our quick bike taxi service.", icon: <Bike className="text-[#E85D04]" size={26} /> },
    { title: "24/7 Support", desc: "We are always here to help you, anytime.", icon: <Headphones className="text-[#E85D04]" size={26} /> }
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 bg-yellow-50/90 backdrop-blur-md z-50 border-b border-yellow-100/80 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-yellow-100/50 rounded-full transition-all">
              <ArrowLeft size={20} />
            </button>
            <span className="font-bold text-sm uppercase tracking-widest text-gray-800">Our Services</span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="text-xs font-bold uppercase tracking-wider text-gray-700 hover:text-gray-900 transition-colors px-4 py-2 rounded-xl bg-gray-100 border border-gray-200 hover:bg-gray-200"
          >
            Login
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-[#1a1a1a] text-white pt-24 pb-12 sm:pt-32 sm:pb-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">

          {/* Hero Left: Copy & Actions */}
          <div className="text-left">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight mb-4 sm:mb-6 leading-[1.1]">
              Premium <span className="text-[#FFB300]">Services</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-gray-400 leading-relaxed mb-6 sm:mb-8 max-w-xl">
              Discover a wide range of transportation and logistics solutions tailored to meet your everyday needs with comfort, speed, and safety.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <button
                onClick={() => window.open('https://play.google.com/store/apps/details?id=com.Appzeto 24.user', '_blank')}
                className="px-6 py-3.5 rounded-xl bg-[#FFB300] hover:bg-[#e09e00] text-gray-900 font-bold uppercase tracking-wider text-xs transition-colors text-center"
              >
                Book Your Ride
              </button>
              <button
                onClick={() => navigate('/about')}
                className="px-6 py-3.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold uppercase tracking-wider text-xs transition-colors text-center"
              >
                About Us
              </button>
            </div>
          </div>

          {/* Hero Right: Clean Graphic Display */}
          <div className="relative w-full max-w-md lg:max-w-none mx-auto">
            <div className="rounded-3xl border border-gray-800 bg-gray-900 p-2 shadow-2xl overflow-hidden">
              <div className="aspect-[16/10] w-full rounded-2xl overflow-hidden bg-slate-900">
                <img
                  src={servicesHeroImg}
                  alt="Appzeto 24 Premium Transport Services"
                  className="w-full h-full object-cover opacity-95"
                />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {services.map((svc, index) => (
            <div
              key={index}
              className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100 group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                {/* Refined Icon Block: Soft ambient rounded square with brand colored icon */}
                <div className="w-12 h-12 bg-amber-50/70 border border-amber-100/50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  {svc.icon}
                </div>
                <h3 className="font-bold text-xl sm:text-2xl mb-3 text-gray-900">{svc.title}</h3>
                <p className="text-gray-500 leading-relaxed mb-6 text-sm sm:text-base">{svc.desc}</p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="flex items-center gap-2 text-sm font-bold text-[#1a1a1a] group-hover:text-[#FFB300] transition-colors mt-4 self-start"
              >
                Learn More <ChevronRight size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll Animation Showcase */}
      <div className="bg-[#1a1a1a] text-white py-16">
        <ContainerScroll
          titleComponent={
            <div className="mb-8">
              <h2 className="text-3xl font-extrabold text-white tracking-tight leading-none text-center">
                Uncompromising service, <br />
                <span className="text-4xl md:text-5xl font-black text-[#FFB300] mt-2 block leading-none">
                  Tailored to you
                </span>
              </h2>
            </div>
          }
        >
          <img
            src="https://ui.aceternity.com/_next/image?url=%2Flinear.webp&w=3840&q=75"
            alt="Appzeto  premium services dashboard"
            className="mx-auto rounded-2xl object-cover h-full object-left-top w-full"
            draggable={false}
          />
        </ContainerScroll>
      </div>
    </div>
  );
};

export default ServicesPage;
