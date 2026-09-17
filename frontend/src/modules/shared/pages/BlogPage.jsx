import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Calendar, Clock, User, MessageSquare } from 'lucide-react';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';
import { BlogInsightsHelper } from '@/components/ui/BlogInsightsHelper';

const BlogPage = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [activePost, setActivePost] = useState(null);

  const categories = [
    "All",
    "City Rides",
    "Group Travel",
    "Executive",
    "Quick Commutes",
    "Logistics",
    "Safety"
  ];

  const blogPosts = [
    {
      id: 1,
      title: "Affordable City Commuting: Why Hatchbacks and Sedans Remain King",
      excerpt: "Navigating daily city commutes doesn't have to break the bank. Explore the economy, comfort, and efficiency of our standard Hatchback and Sedan rides.",
      content: [
        "In the fast-paced environment of modern cities, commuting efficiently is essential. While there are many modes of transport, our standard Hatchback and Sedan rides remain the most popular choices for daily travel. They offer a perfect balance of size, fuel economy, and comfort.",
        "Ideal for solo travellers, couples, or groups of up to four passengers, Hatchback and Sedan rides are compact enough to navigate through heavy traffic and narrow streets, ensuring you reach your destination faster than larger vehicles. They also have a lower carbon footprint and use less fuel, translating directly to lower fare rates for you.",
        "With upfront pricing and transparent route options, booking a standard ride with Appzeto 24 takes the guesswork out of daily travel. Whether it is a quick trip to the local market or your daily office commute, these vehicles provide a cozy, air-conditioned space to relax or work while our professional driver partner handles the road."
      ],
      author: "Admin",
      date: "April 28, 2026",
      readTime: "3 min read",
      category: "City Rides",
      image: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80",
      vehicleType: "Hatchback & Sedan"
    },
    {
      id: 2,
      title: "Group Travel Made Easy: The Rise of SUV and Multi-Seater Cab Options",
      excerpt: "Planning a weekend getaway or a family outing? Learn why booking a spacious SUV or 7-seater is the ultimate stress-free choice for groups.",
      content: [
        "Planning a family outing, a trip with friends, or airport transfers with heavy luggage? Group travel can quickly turn stressful if you have to coordinate multiple separate cabs. Different arrival times, double booking fees, and split communication are common headaches.",
        "Our SUV and 7-seater categories are designed to eliminate these exact problems. With three rows of comfortable seating, generous legroom, and ample cargo space, these vehicles let everyone travel together. No one gets left behind, and the fun starts as soon as you step inside.",
        "Beyond the social benefits of group travel in a single vehicle, booking an SUV is highly cost-effective. A single SUV ride is often significantly cheaper than booking two standard cabs. It also reduces traffic congestion and emissions, making it a smarter choice for both your wallet and the planet."
      ],
      author: "Logistics Team",
      date: "April 25, 2026",
      readTime: "4 min read",
      category: "Group Travel",
      image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80",
      vehicleType: "SUV & 7-Seater"
    },
    {
      id: 3,
      title: "Redefining Executive Travel: Experience First-Class Luxury on the Road",
      excerpt: "Elevate your travel experience. Learn how our Premium and Luxury ride categories turn simple transit into a premium executive experience.",
      content: [
        "Sometimes a ride is more than just transportation; it is an extension of your workspace or a way to celebrate a special milestone. For business meetings, client pick-ups, or simply when you want to pamper yourself, our Premium and Luxury tiers offer a first-class travel experience on the road.",
        "These vehicles are handpicked premium sedans and luxury SUVs from top manufacturers, ensuring the highest standards of safety, styling, and ride quality. Step into leather-appointed seats, enjoy zone-specific climate control, and experience a whisper-quiet cabin perfect for preparing for a presentation or unwinding after a long flight.",
        "Our luxury class is operated by top-rated, professional driver partners who undergo specialized hospitality training. From helping with your luggage to providing charging ports and fresh bottled water, every detail is curated to give you peace of mind and an exceptional journey."
      ],
      author: "Executive Desk",
      date: "April 20, 2026",
      readTime: "5 min read",
      category: "Executive",
      image: "https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80",
      vehicleType: "Premium & Luxury"
    },
    {
      id: 4,
      title: "Beating the Gridlock: Why Bikes and Autos are the Secrets to Urban Speed",
      excerpt: "Stuck in peak hour traffic? Discover how our Auto-Rickshaw and Bike Taxi options slash commute times and get you there faster.",
      content: [
        "Urban gridlock is one of the most frustrating aspects of city living. During rush hours, major arterial roads turn into slow-moving parking lots. When you are running late for a train, class, or meeting, sitting in a four-wheeled vehicle is often the last place you want to be.",
        "Enter our Bike Taxi, Scooty, and Auto-Rickshaw services. Designed specifically for high agility, these two- and three-wheel options can zip through gaps, bypass blockages, and take alternative paths that are inaccessible to standard cars.",
        "Bike Taxis are ideal for solo commuters who need the absolute fastest transit time. Fitted with certified helmets and operated by vetted riders, they offer a thrilling and secure shortcut. For small groups of up to three, the classic open-air Auto-Rickshaw provides a nostalgic, breeze-cooled ride that remains one of the most nimble ways to conquer short distances at a fraction of the price."
      ],
      author: "Traffic Ops",
      date: "April 15, 2026",
      readTime: "3 min read",
      category: "Quick Commutes",
      image: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=800&q=80",
      vehicleType: "Auto & Bike"
    },
    {
      id: 5,
      title: "Moving Goods with Confidence: How Appzeto 24 Has Transformed Logistics",
      excerpt: "From small packages to full house relocations, explore our versatile fleet of LCVs, Trucks, and delivery vehicles designed to move anything.",
      content: [
        "Logistics and shipping have historically been plagued by unreliable pricing, delays, and poor communication. Whether you are a small business owner trying to deliver orders to clients, or a homeowner relocating to a new apartment, transporting physical goods can be a major headache.",
        "Appzeto 24 is transforming this landscape by integrating logistics directly into our booking platform. We offer a full range of commercial options, from lightweight parcel delivery bikes to Light Commercial Vehicles (LCVs), mini trucks, and heavy-duty cargo trucks (HCVs/EHCVs).",
        "Booking a logistics vehicle is as easy as requesting a standard passenger cab. You get transparent, upfront quotes based on cargo weight and distance, eliminating the need to bargain with independent transporters. With real-time GPS tracking and dedicated delivery support, you can monitor your goods every step of the way, ensuring safe and timely delivery."
      ],
      author: "Logistics Admin",
      date: "April 10, 2026",
      readTime: "4 min read",
      category: "Logistics",
      image: "https://images.unsplash.com/photo-1516576885502-d463d1498b5b?auto=format&fit=crop&w=800&q=80",
      vehicleType: "LCV & Cargo Truck"
    },
    {
      id: 6,
      title: "Safety First: Behind Our Comprehensive Driver Screening Process",
      excerpt: "Your peace of mind is our utmost priority. Learn about the background checks, vehicle inspections, and safety features in every Appzeto 24 ride.",
      content: [
        "When you step into a ride-hailing vehicle, you are placing your trust in the hands of the driver and the platform. We take this responsibility extremely seriously. Safety is not a marketing tagline; it is the fundamental core of how our platform is designed and operated.",
        "Every driver partner wishing to join the Appzeto 24 network must pass a multi-stage vetting process. This includes complete background checks, validation of commercial driving licenses, verification of identity documents, and checking historical driving records. Furthermore, we mandate a rigorous vehicle health inspection to check brakes, tires, lights, and seatbelts.",
        "During the ride, both the driver and the passenger are protected by active digital safeguards. Our app includes real-time GPS trip tracking, an in-app emergency SOS button linked directly to local authorities, and a trip-sharing feature that lets your loved ones see your exact path. We continuously review feedback to ensure that only the highest-performing, most professional drivers remain on our network."
      ],
      author: "Safety Board",
      date: "April 05, 2026",
      readTime: "4 min read",
      category: "Safety",
      image: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=800&q=80",
      vehicleType: "Verified Fleet"
    }
  ];

  const filteredPosts = selectedCategory === "All"
    ? blogPosts
    : blogPosts.filter(post => post.category === selectedCategory);

  return (
    <div className="min-h-screen bg-[#0d0d0d] font-sans text-gray-100 selection:bg-[#FFB300] selection:text-black">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 bg-[#0d0d0d]/80 backdrop-blur-md z-50 border-b border-zinc-800/80 shadow-lg">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-white hover:bg-zinc-800/60 rounded-full transition-all">
              <ArrowLeft size={20} />
            </button>
            <span className="font-bold text-xs uppercase tracking-widest text-[#FFB300]">Appzeto 24 Insight</span>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white transition-colors"
          >
            Home
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-b from-zinc-900 to-[#0d0d0d] pt-32 pb-16 px-6 border-b border-zinc-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,179,0,0.08),transparent_50%)] pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <span className="inline-block bg-[#FFB300]/10 text-[#FFB300] border border-[#FFB300]/25 text-[10px] font-bold uppercase px-3 py-1 rounded-full tracking-widest mb-6">
            Publications
          </span>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-6 text-white leading-tight">
            Latest <span className="text-[#FFB300]">Insights & Mobility</span> News
          </h1>
          <p className="text-md md:text-lg text-gray-400 leading-relaxed max-w-2xl mx-auto">
            Stay updated with transport trends, smart-city logistics, and expert guides for navigating your daily journeys.
          </p>
        </div>
      </div>

      {/* Categories & Filter Bar */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-4">
        <div className="flex items-center justify-start gap-2 overflow-x-auto pb-4 scrollbar-none">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-300 border ${selectedCategory === category
                  ? "bg-[#FFB300] text-black border-[#FFB300] shadow-lg shadow-[#FFB300]/10 scale-102"
                  : "bg-zinc-900/60 text-gray-400 border-zinc-800/80 hover:text-white hover:border-zinc-700"
                }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/20 rounded-3xl border border-zinc-800/40">
            <p className="text-gray-500 font-bold">No articles found in this category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className="bg-zinc-900/40 rounded-3xl overflow-hidden shadow-md border border-zinc-800/40 group hover:border-zinc-700/80 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col cursor-pointer"
                onClick={() => setActivePost(post)}
              >
                <div className="relative h-52 overflow-hidden">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md border border-zinc-700/50 text-[#FFB300] text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wide">
                    {post.category}
                  </div>
                </div>
                <div className="p-6 flex flex-col flex-1 justify-between bg-zinc-950/40">
                  <div>
                    <div className="flex items-center gap-4 text-[11px] text-gray-500 mb-3 font-semibold uppercase tracking-wider">
                      <span className="flex items-center gap-1"><Calendar size={12} /> {post.date}</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {post.readTime}</span>
                    </div>
                    <h3 className="font-bold text-lg mb-2 text-white group-hover:text-[#FFB300] transition-colors line-clamp-2 leading-snug">
                      {post.title}
                    </h3>
                    <p className="text-gray-400 text-xs leading-relaxed mb-4 line-clamp-3">
                      {post.excerpt}
                    </p>
                  </div>
                  <button className="flex items-center gap-2 text-xs font-bold text-[#FFB300] hover:text-[#ffd666] transition-colors mt-2 self-start">
                    Read Article <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Blog Scroll Animation Section */}
      <div className="bg-[#1a1a1a] text-white py-16">
        <ContainerScroll
          titleComponent={
            <div className="mb-8">
              <h2 className="text-3xl font-extrabold text-white tracking-tight leading-none text-center">
                Stay updated with the <br />
                <span className="text-4xl md:text-5xl font-black text-[#FFB300] mt-2 block leading-none">
                  Latest Insights
                </span>
              </h2>
            </div>
          }
        >
          <BlogInsightsHelper />
        </ContainerScroll>
      </div>

      {/* Article Detail Modal */}
      <AnimatePresence>
        {activePost && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActivePost(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="bg-zinc-950 border border-zinc-800 rounded-[32px] overflow-hidden max-w-4xl w-full max-h-[85vh] flex flex-col md:flex-row shadow-2xl relative z-10"
            >
              {/* Close Button */}
              <button
                onClick={() => setActivePost(null)}
                className="absolute top-4 right-4 z-20 p-2 bg-black/60 hover:bg-black/80 text-gray-300 hover:text-white rounded-full transition-all border border-zinc-700/40 backdrop-blur-sm"
              >
                <X size={18} />
              </button>

              {/* Left Column: Image & Overlay */}
              <div className="w-full md:w-1/2 h-48 md:h-auto min-h-[220px] md:min-h-0 relative bg-zinc-900 flex-shrink-0">
                <img
                  src={activePost.image}
                  alt={activePost.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-black/80 via-black/20 to-transparent pointer-events-none" />

                {/* Floating Vehicle Category badge on image */}
                <div className="absolute bottom-6 left-6 right-6 text-left">
                  <span className="bg-[#FFB300] text-black text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider mb-2 inline-block">
                    {activePost.category}
                  </span>
                  <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mt-1">
                    Featured Vehicle Class:
                  </p>
                  <p className="text-white text-lg font-black tracking-tight">
                    {activePost.vehicleType}
                  </p>
                </div>
              </div>

              {/* Right Column: Scrollable text content */}
              <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col justify-between overflow-y-auto max-h-[50vh] md:max-h-[85vh]">
                <div>
                  {/* Article Metadata */}
                  <div className="flex items-center gap-4 text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-4">
                    <span className="flex items-center gap-1"><Calendar size={11} /> {activePost.date}</span>
                    <span className="flex items-center gap-1"><Clock size={11} /> {activePost.readTime}</span>
                    <span className="flex items-center gap-1"><User size={11} /> {activePost.author}</span>
                  </div>

                  {/* Title */}
                  <h2 className="text-xl md:text-2xl font-black text-white mb-6 leading-tight">
                    {activePost.title}
                  </h2>

                  {/* Paragraphs */}
                  <div className="space-y-4 text-gray-400 text-xs md:text-sm leading-relaxed mb-8">
                    {activePost.content.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                </div>

                {/* Footer / Call to Action */}
                <div className="pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto">
                  <div className="text-center sm:text-left">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Ready to go?</p>
                    <p className="text-white font-bold text-xs">Book a {activePost.vehicleType} ride today</p>
                  </div>
                  <button
                    onClick={() => {
                      setActivePost(null);
                      navigate('/');
                    }}
                    className="w-full sm:w-auto bg-[#FFB300] hover:bg-[#e6a100] text-black font-extrabold text-xs uppercase tracking-wider py-3 px-6 rounded-full transition-all duration-300 transform hover:scale-102 flex items-center justify-center gap-2"
                  >
                    Book Ride <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BlogPage;
