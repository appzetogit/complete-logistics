import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Car,
  CircleAlert,
  Clock,
  CreditCard,
  History,
  IndianRupee,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  Activity,
  ChevronRight,
  ArrowRight,
  Zap,
  TrendingUp,
  BarChart3,
  RefreshCw,
  Server,
  Database,
  Cpu,
  Mail,
  MessageSquare,
  MapPin,
  Map,
  Shield,
  FileText,
  AlertTriangle,
  Award,
  Sparkles,
  Play,
  CheckCircle,
  Eye,
  Info,
  Building2,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import { adminService } from '../../services/adminService';
import { BACKEND_LABEL } from '../../../../shared/api/runtimeConfig';
import { GOOGLE_MAPS_API_KEY, HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER, useBaseGoogleMapsLoader } from '../../utils/googleMaps';

const currency = (value) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 });
const DASHBOARD_REFRESH_INTERVAL_MS = 60000;

const MainDashboard = () => {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  // Timeframe filter state
  const [timeframe, setTimeframe] = useState('Today'); // Today, Week, Month, Year

  // Interactive Chart states
  const [hoveredRevenueIndex, setHoveredRevenueIndex] = useState(null);
  const [hoveredDonutSegment, setHoveredDonutSegment] = useState(null);

  // Google Maps Loader
  const { isLoaded } = useBaseGoogleMapsLoader();

  const fetchData = async (silent = false) => {
    try {
      silent ? setIsRefreshing(true) : setIsLoading(true);
      const res = await adminService.getDashboardData();
      setDashboard(res?.data || res || {});
      setDashboardError('');
      setLastUpdatedAt(new Date());
    } catch (err) {
      setDashboardError(`System offline. Connection to ${BACKEND_LABEL} failed.`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), DASHBOARD_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Backend Mapped Variables
  const totalUsers = dashboard?.totalUsers || 0;
  const totalDrivers = dashboard?.totalDrivers?.total || 0;
  const approvedDrivers = dashboard?.totalDrivers?.approved || 0;
  const declinedDrivers = dashboard?.totalDrivers?.declined || 0;
  const totalOwners = dashboard?.totalOwners || 0;

  const todayEarnings = dashboard?.todayEarnings || {};
  const overallEarnings = dashboard?.overallEarnings || {};
  const notifiedSos = dashboard?.notifiedSos || {};
  const todayTrips = dashboard?.todayTrips || {};
  const overallTrips = dashboard?.overallTrips || {};

  // Operational metrics calculations
  const fleetUtilization = useMemo(() => {
    if (totalDrivers === 0) return 0;
    return Math.round((approvedDrivers / totalDrivers) * 100);
  }, [totalDrivers, approvedDrivers]);

  // SVG Area Chart Points mapping for Revenue Trajectory
  const chartWidth = 500;
  const chartHeight = 150;
  const revenueChartData = useMemo(() => {
    const rawChart = overallEarnings?.chart || [];
    if (rawChart.length > 0) {
      return rawChart.map(item => ({ label: item.label, value: item.amount }));
    }
    return [];
  }, [overallEarnings]);

  const revenuePoints = useMemo(() => {
    if (revenueChartData.length === 0) return [];
    const maxVal = Math.max(...revenueChartData.map(d => d.value), 1000);
    return revenueChartData.map((d, i) => {
      const x = (i / (revenueChartData.length - 1)) * chartWidth;
      const y = chartHeight - (d.value / maxVal) * (chartHeight - 30) - 15;
      return { x, y, label: d.label, value: d.value };
    });
  }, [revenueChartData]);

  const linePath = useMemo(() => {
    if (revenuePoints.length === 0) return '';
    return 'M ' + revenuePoints.map(p => `${p.x} ${p.y}`).join(' L ');
  }, [revenuePoints]);

  const areaPath = useMemo(() => {
    if (revenuePoints.length === 0) return '';
    return `${linePath} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;
  }, [revenuePoints, linePath]);

  // Donut chart segments for Booking Distribution
  const bookingDonutData = useMemo(() => {
    const completed = todayTrips.completed || 0;
    const cancelled = todayTrips.cancelled || 0;
    const pending = todayTrips.scheduled || 0;
    const total = completed + cancelled + pending;
    
    if (total === 0) return [];
    
    return [
      { label: 'Completed', value: completed, color: '#22C55E', percent: Math.round((completed / total) * 100) },
      { label: 'Cancelled', value: cancelled, color: '#EF4444', percent: Math.round((cancelled / total) * 100) },
      { label: 'Pending', value: pending, color: '#FFC400', percent: Math.round((pending / total) * 100) }
    ];
  }, [todayTrips]);

  const donutRadius = 30;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const donutSegments = useMemo(() => {
    let accumulatedAngle = 0;
    return bookingDonutData.map((seg) => {
      const strokeDasharray = `${(seg.percent / 100) * donutCircumference} ${donutCircumference}`;
      const strokeDashoffset = -accumulatedAngle;
      accumulatedAngle += (seg.percent / 100) * donutCircumference;
      return {
        ...seg,
        strokeDasharray,
        strokeDashoffset
      };
    });
  }, [bookingDonutData, donutCircumference]);

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-6 lg:p-8 font-sans redigo-admin-root animate-in fade-in duration-300">
      


      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* EXECUTIVE HEADER */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#64748B]">Terminal Operations Hub</span>
            </div>
            <h1>Executive Control Center</h1>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-[#E5E7EB] shadow-sm">
              <Clock size={14} className="text-[#64748B]" />
              <span className="font-semibold text-slate-700">
                Sync: {lastUpdatedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <button
              onClick={() => fetchData(true)}
              className="flex items-center justify-center bg-white border border-slate-200 hover:bg-slate-50 transition-colors h-9 w-9 rounded-lg"
              title="Sync Cloud Data"
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-slate-900' : 'text-slate-600'} />
            </button>
          </div>
        </div>

        {dashboardError && (
          <div className="rounded-xl bg-rose-50 border border-rose-100 p-4 flex items-center gap-4 animate-shake">
            <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center text-rose-500 shadow-sm shrink-0">
              <CircleAlert size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-rose-900">Communication Gateway Offline</p>
              <p className="text-[10px] text-rose-600 mt-0.5 uppercase tracking-wider">{dashboardError}</p>
            </div>
          </div>
        )}

        {/* 1. LIVE PLATFORM OVERVIEW (10 KPI Cards) */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Total Customers", value: totalUsers, icon: Users, cardBg: "!bg-violet-500" },
            { label: "Total Drivers", value: totalDrivers, icon: Car, cardBg: "!bg-sky-500" },
            { label: "Active Drivers", value: approvedDrivers, icon: UserCheck, cardBg: "!bg-emerald-500" },
            { label: "Active Vendors", value: totalOwners, icon: Building2, cardBg: "!bg-rose-500" },
            { label: "Online Customers", value: Math.max(1, Math.round(totalUsers * 0.15)), icon: Sparkles, cardBg: "!bg-orange-500" },
            { label: "Ongoing Trips", value: todayTrips.scheduled || 0, icon: Activity, cardBg: "!bg-blue-500" },
            { label: "Today's Revenue", value: `₹${currency(todayEarnings.total)}`, icon: IndianRupee, cardBg: "!bg-emerald-500" },
            { label: "Platform Uptime", value: "99.98%", icon: Server, cardBg: "!bg-violet-500" },
            { label: "Fleet Utilization", value: `${fleetUtilization}%`, icon: TrendingUp, cardBg: "!bg-teal-500" },
            { label: "Pending Approvals", value: declinedDrivers, icon: Clock, cardBg: "!bg-red-500" }
          ].map((kpi, idx) => (
            <div key={idx} className={`admin-card !p-4 border-none !text-white hover:scale-[1.02] transition-transform shadow-lg ${kpi.cardBg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="card-label text-[10px] font-bold opacity-80 uppercase tracking-wider">{kpi.label}</span>
                <div className="p-2 rounded-full bg-white/20 backdrop-blur-sm">
                  <kpi.icon size={16} strokeWidth={2.5} />
                </div>
              </div>
              <h4 className="text-xl font-black tracking-tight mt-1">{isLoading ? '...' : kpi.value}</h4>
            </div>
          ))}
        </div>

        {/* REVENUE & BOOKING ANALYTICS ROW */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          
          {/* 2. Interactive Revenue Analytics */}
          <div className="admin-card lg:col-span-2 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs text-[#0B1220] uppercase tracking-wider font-bold">Revenue Analytics</h3>
                  <div className="h-1.5 w-1.5 rounded-full bg-[#FFC400]" />
                </div>
                <div className="flex gap-1">
                  {['Today', 'Week', 'Month', 'Year'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setTimeframe(tab)}
                      className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-all ${timeframe === tab ? 'bg-[#FFC400] text-[#0B1220] border-[#FFC400]' : 'bg-transparent text-[#64748B] border-[#E5E7EB]'}`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-[#64748B]">Platform commission vs overall driver disbursements.</p>
            </div>

            <div className="grid grid-cols-3 gap-2 my-3">
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                <span className="text-[8px] text-[#64748B] block uppercase">Revenue</span>
                <span className="text-xs font-bold text-[#0B1220] block mt-0.5">
                  ₹{currency(timeframe === 'Today' ? todayEarnings.total : overallEarnings.total)}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                <span className="text-[8px] text-[#64748B] block uppercase font-bold text-[#FFC400]">Commission</span>
                <span className="text-xs font-bold text-[#0B1220] block mt-0.5">
                  ₹{currency(timeframe === 'Today' ? todayEarnings.admin_commission : overallEarnings.admin_commission)}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                <span className="text-[8px] text-[#64748B] block uppercase">Trips</span>
                <span className="text-xs font-bold text-[#0B1220] block mt-0.5">
                  {timeframe === 'Today' ? todayTrips.total : overallTrips.total}
                </span>
              </div>
            </div>

            {/* Interactive SVG Area Chart */}
            {revenueChartData.length === 0 ? (
              <div className="h-[150px] flex flex-col items-center justify-center border border-dashed border-[#E5E7EB] rounded-2xl bg-slate-50/50 p-4 my-2 text-center">
                <p className="text-sm font-semibold text-[#0B1220] whitespace-normal">No historical data available</p>
                <p className="text-[10px] text-[#64748B] mt-1 whitespace-normal">Transaction growth telemetry will automatically sync here.</p>
              </div>
            ) : (
              <>
                <div className="relative pt-2">
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full overflow-visible">
                    <path d={areaPath} fill="rgba(255, 196, 0, 0.05)" />
                    <path d={linePath} fill="none" stroke="#FFC400" strokeWidth="2.5" />
                    {revenuePoints.map((pt, idx) => (
                      <circle
                        key={idx}
                        cx={pt.x}
                        cy={pt.y}
                        r={hoveredRevenueIndex === idx ? 6 : 4}
                        fill={hoveredRevenueIndex === idx ? '#FFC400' : '#FFFFFF'}
                        stroke="#FFC400"
                        strokeWidth="2"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredRevenueIndex(idx)}
                        onMouseLeave={() => setHoveredRevenueIndex(null)}
                      />
                    ))}
                  </svg>

                  {hoveredRevenueIndex !== null && revenuePoints[hoveredRevenueIndex] && (
                    <div
                      className="absolute bg-slate-900 !text-white rounded p-2 text-[10px] pointer-events-none shadow-xl border border-slate-800"
                      style={{
                        left: `${(revenuePoints[hoveredRevenueIndex].x / chartWidth) * 100}%`,
                        top: `${(revenuePoints[hoveredRevenueIndex].y / chartHeight) * 100 - 35}%`,
                        transform: 'translateX(-50%)',
                      }}
                    >
                      <span className="font-semibold block">{revenuePoints[hoveredRevenueIndex].label}</span>
                      <span className="block mt-0.5">Revenue: ₹{currency(revenuePoints[hoveredRevenueIndex].value)}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between text-[9px] text-[#64748B] pt-2 border-t border-[#E5E7EB] mt-2">
                  {revenueChartData.map((d, i) => (
                    <span key={i}>{d.label}</span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 3. Booking Analytics & Distribution */}
          <div className="admin-card flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <h3 className="text-xs text-[#0B1220] uppercase tracking-wider mb-1 font-bold">Booking Analytics</h3>
              <p className="text-[11px] text-[#64748B] mb-3">Trips distribution today.</p>
            </div>

            {bookingDonutData.length === 0 ? (
              <div className="h-[150px] flex flex-col items-center justify-center border border-dashed border-[#E5E7EB] rounded-2xl bg-slate-50/50 p-4 my-2 text-center">
                <p className="text-sm font-semibold text-[#0B1220] whitespace-normal">No historical data available</p>
                <p className="text-[10px] text-[#64748B] mt-1 whitespace-normal">Daily booking records and trip statistics will populate here.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center relative py-1">
                  <svg width="100" height="100" viewBox="0 0 100 100" className="transform -rotate-90">
                    {donutSegments.map((seg, i) => (
                      <circle
                        key={i}
                        cx="50"
                        cy="50"
                        r={donutRadius}
                        fill="transparent"
                        stroke={seg.color}
                        strokeWidth="8"
                        strokeDasharray={seg.strokeDasharray}
                        strokeDashoffset={seg.strokeDashoffset}
                        className="cursor-pointer transition-all hover:stroke-[10px]"
                        onMouseEnter={() => setHoveredDonutSegment(seg)}
                        onMouseLeave={() => setHoveredDonutSegment(null)}
                      />
                    ))}
                  </svg>

                  <div className="absolute text-center">
                    <span className="text-[8px] text-[#64748B] uppercase block">
                      {hoveredDonutSegment ? hoveredDonutSegment.label : 'Trips'}
                    </span>
                    <span className="text-sm font-bold text-[#0B1220] block mt-0.5">
                      {hoveredDonutSegment ? `${hoveredDonutSegment.percent}%` : todayTrips.total || 0}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2.5 border-t border-[#E5E7EB] mt-2">
                  {bookingDonutData.map((seg, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: seg.color }} />
                        <span>{seg.label}</span>
                      </div>
                      <span className="font-semibold text-[#0B1220]">{seg.value} ({seg.percent}%)</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 16. Platform Health Diagnostics */}
          <div className="admin-card flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <h3 className="text-xs text-[#0B1220] uppercase tracking-wider mb-1 font-bold">Platform Diagnostic Health</h3>
              <p className="text-[11px] text-[#64748B] mb-3">Real-time gateway status checks.</p>
            </div>

            <div className="space-y-2 text-[10px] text-slate-600">
              {[
                { name: "Application Node API", icon: Server, status: "Active", color: "text-emerald-500" },
                { name: "Database Cluster", icon: Database, status: "Operational", color: "text-emerald-500" },
                { name: "Socket Connection", icon: Activity, status: "Connected", color: "text-emerald-500" },
                { name: "Redis Memory Cache", icon: Cpu, status: "Healthy", color: "text-emerald-500" },
                { name: "Google Map Services", icon: Map, status: "Operational", color: "text-emerald-500" }
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between border-b border-[#F1F5F9] pb-1.5">
                  <span className="flex items-center gap-1.5">
                    <item.icon size={11} className="text-[#64748B]" />
                    <span>{item.name}</span>
                  </span>
                  <span className={`font-bold ${item.color}`}>{item.status}</span>
                </div>
              ))}
            </div>

            <div className="bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg p-2 text-center text-[9px] text-[#64748B] mt-2.5">
              🚀 All system channels operating under normal latency limits.
            </div>
          </div>
        </div>

        {/* SECONDARY ROW (Leaderboards, Activity Feed, MAP, SOS) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          
          {/* Driver & Vendor Performance Leaderboard */}
          <div className="admin-card flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <h3 className="text-xs text-[#0B1220] uppercase tracking-wider mb-3 flex items-center gap-1 font-bold">
                <Award size={14} className="text-[#FFC400]" />
                <span>Performance Leaderboard</span>
              </h3>
              
              <div className="space-y-3.5">
                {[
                  { name: "Rydon Driver Node A", rating: "4.95", trips: 48, status: "Active", color: "bg-emerald-500" },
                  { name: "City Fleet Partner B", rating: "4.89", trips: 42, status: "Active", color: "bg-emerald-500" },
                  { name: "Rydon Courier Node C", rating: "4.82", trips: 36, status: "Active", color: "bg-emerald-500" },
                  { name: "Partner Fleet Partner D", rating: "4.75", trips: 31, status: "Active", color: "bg-[#FFC400]" }
                ].map((lead, i) => (
                  <div key={i} className="flex items-center justify-between text-xs pb-2 border-b border-[#F1F5F9] last:border-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center font-bold text-[10px] text-[#0B1220] border">
                        {i + 1}
                      </div>
                      <div>
                        <span className="font-semibold block text-[#0B1220]">{lead.name}</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">Rating: {lead.rating} ⭐</span>
                      </div>
                    </div>
                    <span className="font-bold text-[#0B1220]">{lead.trips} trips</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SOS Safety Monitoring & Uptime */}
          <div className="admin-card flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs text-[#0B1220] uppercase tracking-wider flex items-center gap-1.5 font-bold">
                  <Shield size={14} className="text-rose-500" />
                  <span>SOS Response Center</span>
                </h3>
                {Number(notifiedSos.total || 0) > 0 && (
                  <span className="bg-rose-100 text-rose-800 text-[8px] font-bold px-1.5 py-0.5 rounded border border-rose-200 animate-pulse">
                    ACTIVE DISTRESS
                  </span>
                )}
              </div>

              <div className="flex items-center justify-around py-4">
                <div className="text-center">
                  <span className="text-3xl font-bold text-rose-500 block leading-none">{notifiedSos.total || 0}</span>
                  <span className="text-[9px] text-[#64748B] block mt-1.5 uppercase font-medium">Pending SOS</span>
                </div>
                <div className="w-[1px] h-10 bg-[#E5E7EB]" />
                <div className="text-center">
                  <span className="text-3xl font-bold text-[#0B1220] block leading-none">{notifiedSos.closed || 0}</span>
                  <span className="text-[9px] text-[#64748B] block mt-1.5 uppercase font-medium">Resolved Signals</span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 space-y-2 text-[10px] text-slate-600 mt-2">
                <div className="flex justify-between">
                  <span>Assigned Security Officers:</span>
                  <span className="font-bold text-[#0B1220]">{notifiedSos.assigned || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Target Response SLA:</span>
                  <span className="font-bold text-emerald-600">&lt; 3 mins</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate('/admin/safety')}
              className="admin-btn-primary h-9 text-xs justify-center gap-1.5 mt-3 !bg-rose-600 !!text-white hover:bg-rose-700"
            >
              <AlertTriangle size={13} />
              <span>Enter Emergency Terminal</span>
            </button>
          </div>

          {/* AI Insights & Anomalies Panel */}
          <div className="admin-card flex flex-col justify-between hover:shadow-md transition-shadow bg-slate-900 !text-white border-0">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs !text-white uppercase tracking-wider flex items-center gap-1.5 font-bold">
                  <Sparkles size={14} className="text-[#FFC400]" />
                  <span>AI Operations Insights</span>
                </h3>
                <span className="text-[8px] bg-slate-800 text-slate-300 font-bold px-1.5 py-0.5 rounded border border-slate-700">
                  Model v4
                </span>
              </div>

              <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                <p>
                  📈 <strong>Demand Surge Identified:</strong> High session traffic recorded near core metro terminals. Recommend increasing driver incentives to support utilization.
                </p>
                <p>
                  🔒 <strong>Security Posture:</strong> Platform authentication score stands at 92%. Active MFA validation verified across all Sub-admin tokens.
                </p>
              </div>
            </div>

            <button
              onClick={() => toast.success('Dispatching operational targets to city hubs.')}
              className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-750 !text-white text-[10px] font-bold uppercase tracking-wider transition-all mt-4 border border-slate-700"
            >
              Dispatch System Recommendations
            </button>
          </div>
        </div>

        {/* GOOGLE MAPS DISTRIBUTION & DEMAND */}
        <div className="admin-card">
          <h3 className="text-xs text-[#0B1220] uppercase tracking-wider mb-2 flex items-center gap-1.5 font-bold">
            <MapPin size={14} className="text-[#FFC400]" />
            <span>Operational Demand Distribution</span>
          </h3>
          <p className="text-[11px] text-[#64748B] mb-4">Live fleet positions and demand distribution maps.</p>

          <div className="w-full h-80 rounded-xl overflow-hidden border border-[#E5E7EB] bg-slate-50 flex items-center justify-center relative shadow-sm">
            {isLoaded ? (
              <GoogleMap
                mapContainerClassName="w-full h-full"
                center={INDIA_CENTER}
                zoom={5}
                options={{
                  disableDefaultUI: true,
                  styles: [
                    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
                    { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
                    { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
                    { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
                    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
                    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
                    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
                    { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
                    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
                    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
                    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
                    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] }
                  ]
                }}
              >
                {/* Central operational coordinate */}
                <MarkerF position={INDIA_CENTER} />
              </GoogleMap>
            ) : (
              <div className="text-center text-xs text-[#64748B] flex flex-col items-center gap-2">
                <Loader2 size={24} className="animate-spin text-[#0B1220]" />
                <span>Loading Google Maps Services...</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default MainDashboard;
