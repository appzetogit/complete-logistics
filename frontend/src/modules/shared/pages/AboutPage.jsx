import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Target, Award, Users, ShieldCheck } from 'lucide-react';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';
import { GlobalCommunitiesDashboard } from '@/components/ui/GlobalCommunitiesDashboard';

const AboutPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 bg-yellow-50/90 backdrop-blur-md z-50 border-b border-yellow-100/80 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
            <ArrowLeft size={20} />
          </button>
          <span className="font-bold text-sm uppercase tracking-widest text-gray-800">About Us</span>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-[#1a1a1a] text-white pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-6">
            Driving the <span className="text-[#FFB300]">Future</span> of Mobility
          </h1>
          <p className="text-xl text-gray-400 leading-relaxed max-w-2xl mx-auto">
            Appzeto 24 is a leading transportation and logistics platform dedicated to providing safe, reliable, and affordable mobility solutions for everyone.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-6">Our Mission</h2>
            <p className="text-lg text-gray-600 leading-relaxed mb-6">
              Our mission is to transform the way people move by connecting them with professional drivers and efficient services. We believe that transportation should be seamless, secure, and accessible to all.
            </p>
            <p className="text-lg text-gray-600 leading-relaxed">
              Whether you need a quick city ride, a comfortable outstation trip, or fast parcel delivery, our technology-driven approach ensures every journey is a great experience.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-yellow-50 p-6 rounded-2xl shadow-sm border border-yellow-100">
              <Target className="text-[#FFB300] mb-4" size={32} />
              <h3 className="font-bold text-lg mb-2">Reliability</h3>
              <p className="text-gray-500 text-sm">Always on time, every time you ride.</p>
            </div>
            <div className="bg-yellow-50 p-6 rounded-2xl shadow-sm border border-yellow-100">
              <ShieldCheck className="text-[#FFB300] mb-4" size={32} />
              <h3 className="font-bold text-lg mb-2">Safety First</h3>
              <p className="text-gray-500 text-sm">Verified drivers and secure tracking.</p>
            </div>
            <div className="bg-yellow-50 p-6 rounded-2xl shadow-sm border border-yellow-100">
              <Users className="text-[#FFB300] mb-4" size={32} />
              <h3 className="font-bold text-lg mb-2">Community</h3>
              <p className="text-gray-500 text-sm">Empowering riders and drivers alike.</p>
            </div>
            <div className="bg-yellow-50 p-6 rounded-2xl shadow-sm border border-yellow-100">
              <Award className="text-[#FFB300] mb-4" size={32} />
              <h3 className="font-bold text-lg mb-2">Excellence</h3>
              <p className="text-gray-500 text-sm">Top-tier service quality guaranteed.</p>
            </div>
          </div>
        </div>

        {/* Scroll Animation Section */}
        <div className="bg-gray-100 py-16 mt-10">
          <ContainerScroll
            titleComponent={
              <div className="mb-8">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none text-center">
                  Dedicated to serving <br />
                  <span className="text-4xl md:text-5xl font-black text-[#FFB300] mt-2 block leading-none">
                    Global Communities
                  </span>
                </h2>
              </div>
            }
          >
            <GlobalCommunitiesDashboard />
          </ContainerScroll>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
