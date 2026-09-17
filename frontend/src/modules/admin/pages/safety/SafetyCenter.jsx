import React, { useEffect, useMemo, useState, useRef } from 'react';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import {
  AlertCircle, CheckCircle2, CheckCheck, Clock, Globe, History,
  MapPin, PhoneCall, ShieldAlert, Paperclip, Mic, User as UserIcon, Send,
  Activity, Shield, Car, RefreshCw, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { socketService } from '../../../../shared/api/socket';
import { adminService } from '../../services/adminService';
import { HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER, useBaseGoogleMapsLoader } from '../../utils/googleMaps';
import { getChatSession } from '../../../shared/chat/chatIdentity';

const mapContainerStyle = { width: '100%', height: '100%' };

const formatRelativeTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Just now';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '--';

  return date.toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getParticipantTitle = (alert) =>
  alert?.sourceApp === 'driver'
    ? alert?.driverName || 'Driver'
    : alert?.riderName || 'Passenger';

const getMapCenter = (alert) =>
  Number.isFinite(Number(alert?.location?.lat)) && Number.isFinite(Number(alert?.location?.lng))
    ? { lat: Number(alert.location.lat), lng: Number(alert.location.lng) }
    : INDIA_CENTER;

// -------------- SUB-COMPONENTS -------------- //

const StatCard = ({ title, value, icon, alertMode }) => (
  <div className={`bg-white p-3 rounded-xl border ${alertMode ? 'border-red-200' : 'border-gray-200'} shadow-sm flex items-center justify-between`}>
    <div>
      <p className="text-[11px] font-semibold text-gray-500 mb-0.5">{title}</p>
      <div className={`text-lg font-bold ${alertMode && value > 0 ? 'text-red-600 animate-pulse' : 'text-gray-900'}`}>{value}</div>
    </div>
    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${alertMode && value > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
      {icon}
    </div>
  </div>
);

const IncidentCard = ({ alert, isActive, onClick }) => (
  <div
    onClick={onClick}
    className={`p-2.5 rounded-xl border transition-colors cursor-pointer relative ${
      isActive 
        ? 'bg-yellow-50 border-yellow-300 shadow-sm' 
        : 'bg-white border-gray-200 hover:border-yellow-200'
    }`}
  >
    <div className="flex justify-between items-start mb-2">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-100 text-gray-500'}`}>
          <UserIcon size={16} />
        </div>
        <div>
          <div className="text-[13px] font-bold text-gray-900 leading-none mb-1">
            {getParticipantTitle(alert)}
          </div>
          <p className="text-[10px] font-medium text-gray-500 leading-none">
            ID: {alert?.driverId?.slice(-6) || alert?.userId?.slice(-6) || 'Unknown'}
          </p>
        </div>
      </div>
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700">
        Prio-1
      </span>
    </div>

    <div className="grid grid-cols-2 gap-2 mb-2 text-[11px]">
      <div className="bg-gray-50/80 p-1.5 rounded-lg border border-gray-100">
        <span className="block text-[9px] text-gray-500 font-semibold mb-0.5">Vehicle</span>
        <span className="font-bold text-gray-800">{alert?.vehicleLabel || 'N/A'}</span>
      </div>
      <div className="bg-gray-50/80 p-1.5 rounded-lg border border-gray-100 overflow-hidden">
        <span className="block text-[9px] text-gray-500 font-semibold mb-0.5">Passenger</span>
        <span className="font-bold text-gray-800 truncate block">{alert?.riderName || 'None'}</span>
      </div>
    </div>

    <div className="flex flex-col gap-1 pt-2 border-t border-gray-100">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-600 font-medium">
        <Clock size={12} className="text-gray-400 shrink-0" /> 
        <span>{formatRelativeTime(alert?.createdAt)}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-gray-600 font-medium">
        <MapPin size={12} className="text-red-500 shrink-0" />
        <span className="truncate">{alert?.locationLabel || alert?.pickupAddress || 'Locating...'}</span>
      </div>
    </div>
  </div>
);

const AdminSosChat = ({ alert }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    setMessages([
      { id: '1', text: 'Distress signal received. Open communication channel established.', sender: 'system', time: new Date() }
    ]);
  }, [alert]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    // Disabled as per no API requirement. Handled by button disabled state.
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col h-[320px] shadow-sm">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl">
        <div>
          <div className="text-xs font-bold text-gray-900">Live Support Chat</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            <span className="text-[10px] font-semibold text-gray-500">{getParticipantTitle(alert)} Online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-gray-50/30">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.sender === 'admin' ? 'items-end' : msg.sender === 'system' ? 'items-center' : 'items-start'}`}>
            {msg.sender === 'system' ? (
              <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">{msg.text}</span>
            ) : (
              <div className={`max-w-[85%] rounded-xl p-2.5 text-[11px] ${msg.sender === 'admin' ? 'bg-yellow-400 text-black rounded-tr-none' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm'}`}>
                <p className="font-medium leading-relaxed">{msg.text}</p>
                <div className={`flex items-center gap-1 mt-1 text-[9px] font-bold ${msg.sender === 'admin' ? 'text-black/60 justify-end' : 'text-gray-400'}`}>
                  {msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {msg.sender === 'admin' && <CheckCheck size={10} className="text-black" />}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-gray-100 bg-white flex items-center gap-2 rounded-b-xl">
        <button disabled className="p-1.5 text-gray-300 rounded-lg cursor-not-allowed">
          <Paperclip size={16} />
        </button>
        <input 
          type="text" 
          placeholder="Chat API unavailable..." 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled
          className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px] outline-none text-gray-500 cursor-not-allowed"
        />
        <button disabled className="p-1.5 text-gray-300 rounded-lg cursor-not-allowed">
          <Mic size={16} />
        </button>
        <button 
          disabled
          title="Chat API Unavailable"
          onClick={handleSend} 
          className="p-1.5 bg-gray-100 text-gray-400 rounded-lg shadow-sm cursor-not-allowed"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

// -------------- MAIN COMPONENT -------------- //

const SafetyCenter = () => {
  const { isLoaded, loadError } = useBaseGoogleMapsLoader();
  const [alerts, setAlerts] = useState([]);
  const [selectedAlertId, setSelectedAlertId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState(false);
  const [dashboardStats, setDashboardStats] = useState({ resolved: 0, escalated: 0, connectedAgents: 1 });

  const selectedAlert = useMemo(
    () => alerts.find((entry) => entry.id === selectedAlertId) || alerts[0] || null,
    [alerts, selectedAlertId],
  );

  const adminSession = useMemo(() => getChatSession('admin'), []);

  const loadAlerts = async () => {
    setIsLoading(true);
    try {
      const response = await adminService.getSafetyAlerts({ status: 'active', limit: 50 });
      const results = response?.data?.data?.results || response?.data?.results || [];
      setAlerts(results);
      setSelectedAlertId((current) => current || results[0]?.id || '');
      
      adminService.getDashboardData().then(dashRes => {
         if (dashRes?.data?.notifiedSos) {
            setDashboardStats(prev => ({...prev, resolved: dashRes.data.notifiedSos.closed || 0}));
         }
      }).catch(() => {});

    } catch (error) {
      console.error('Failed to load safety alerts:', error);
      toast.error(error?.message || 'Terminal: SOS Sync Failed');
      setAlerts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  useEffect(() => {
    const handleNewAlert = (payload = {}) => {
      setAlerts((current) => [payload, ...current.filter((item) => item.id !== payload.id)]);
      setSelectedAlertId((current) => current || payload.id || '');
      toast.error(`Emergency: ${getParticipantTitle(payload)} triggered SOS`, { 
        duration: 5000,
        style: { background: '#ef4444', color: '#fff', fontWeight: 'bold' } 
      });
    };

    const handleUpdatedAlert = (payload = {}) => {
      setAlerts((current) =>
        current
          .map((item) => (item.id === payload.id ? payload : item))
          .filter((item) => String(item.status || '').toLowerCase() !== 'resolved'),
      );
      setSelectedAlertId((current) => (current === payload.id ? '' : current));
    };

    socketService.on('new_sos', handleNewAlert);
    socketService.on('safety:alert:new', handleNewAlert);
    socketService.on('safety:alert:updated', handleUpdatedAlert);

    return () => {
      socketService.off('new_sos', handleNewAlert);
      socketService.off('safety:alert:new', handleNewAlert);
      socketService.off('safety:alert:updated', handleUpdatedAlert);
    };
  }, []);

  const handleResolve = async () => {
    if (!selectedAlert?.id) return;
    setIsResolving(true);
    try {
      await adminService.resolveSafetyAlert(selectedAlert.id, 'Resolved via terminal');
      setAlerts((current) => current.filter((item) => item.id !== selectedAlert.id));
      setSelectedAlertId('');
      setDashboardStats(prev => ({...prev, resolved: prev.resolved + 1}));
      toast.success('Incident closed successfully');
    } catch (error) {
      console.error('Failed to resolve safety alert:', error);
      toast.error(error?.message || 'Resolution failed');
    } finally {
      setIsResolving(false);
    }
  };

  const mapMarkers = useMemo(() => {
    if (!selectedAlert) return [];
    return [
       { id: 'incident', pos: getMapCenter(selectedAlert), type: 'Incident Location', color: '#E11D48', icon: Car },
    ];
  }, [selectedAlert]);

  const timeline = useMemo(() => {
     if (!selectedAlert) return [];
     return [
        { time: new Date(selectedAlert.createdAt), label: 'SOS Signal Triggered' }
     ];
  }, [selectedAlert]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Top Dashboard Row */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 shadow-sm z-10 shrink-0">
         <StatCard title="Active SOS" value={alerts.length} icon={<AlertCircle size={16} />} alertMode={true} />
         <StatCard title="Resolved Today" value={dashboardStats.resolved} icon={<CheckCircle2 size={16} />} />
         <StatCard title="High Priority" value={alerts.length} icon={<ShieldAlert size={16} />} alertMode={true} />
         <StatCard title="Escalated" value={dashboardStats.escalated} icon={<History size={16} />} />
         <StatCard title="Avg Response" value="< 30s" icon={<Activity size={16} />} />
         <StatCard title="Agents" value={dashboardStats.connectedAgents} icon={<UserIcon size={16} />} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
         
         {/* Left Sidebar: Incident List */}
         <div className="w-full lg:w-72 h-[450px] lg:h-auto flex-shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
               <div className="text-sm font-bold text-gray-900">Active Incidents</div>
               <div className="flex items-center gap-2">
                 <button onClick={loadAlerts} className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors" title="Refresh">
                    <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                 </button>
                 <span className="bg-red-100 text-red-700 font-bold text-[10px] px-2 py-0.5 rounded-md">{alerts.length}</span>
               </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
               {isLoading ? (
                  <div className="flex justify-center p-8">
                     <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
               ) : alerts.length === 0 ? (
                  <div className="text-center p-8">
                     <Shield className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                     <p className="text-xs font-bold text-gray-900">All Clear</p>
                     <p className="text-[10px] font-medium text-gray-500 mt-1">No active distress signals.</p>
                  </div>
               ) : (
                  alerts.map((alert) => (
                     <IncidentCard 
                        key={alert.id} 
                        alert={alert} 
                        isActive={selectedAlert?.id === alert.id}
                        onClick={() => setSelectedAlertId(alert.id)}
                     />
                  ))
               )}
            </div>
         </div>

         {/* Right Area: Incident Details */}
         {selectedAlert ? (
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto lg:pr-2 no-scrollbar">
               
               {/* Header Actions */}
               <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                     <div className="text-lg font-bold text-gray-900 mb-1.5">
                        SOS Details
                     </div>
                     <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                           <Clock size={12} className="text-gray-400" />
                           {formatDateTime(selectedAlert.createdAt)}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                           <MapPin size={12} className="text-red-500" />
                           {selectedAlert.locationLabel || selectedAlert.pickupAddress || 'GPS Active'}
                        </div>
                     </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                     <button 
                        onClick={() => window.open('tel:100', '_self')}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-700 transition-colors shadow-sm"
                     >
                        <PhoneCall size={14} /> Emergency
                     </button>
                     <button 
                        onClick={handleResolve}
                        disabled={isResolving}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-yellow-400 text-black px-4 py-2 rounded-lg text-xs font-bold hover:bg-yellow-500 transition-colors shadow-sm disabled:opacity-50"
                     >
                        <CheckCircle2 size={14} /> {isResolving ? 'Closing...' : 'Close Incident'}
                     </button>
                  </div>
               </div>

               {/* Grid Layout for Panels */}
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-[400px]">
                  
                  {/* Map Panel */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm h-64 lg:h-auto relative">
                     {loadError ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-gray-50 p-6">
                           <Globe size={24} className="text-gray-300 mb-2" />
                           <p className="text-xs font-bold text-gray-900">Map Unavailable</p>
                        </div>
                     ) : HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
                        <GoogleMap
                           mapContainerStyle={mapContainerStyle}
                           center={getMapCenter(selectedAlert)}
                           zoom={15}
                           options={{
                              disableDefaultUI: true,
                              zoomControl: true,
                              styles: [
                                 { "elementType": "geometry", "stylers": [{ "color": "#f9fafb" }] },
                                 { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }] }
                              ]
                           }}
                        >
                           {mapMarkers.map(m => (
                              <MarkerF 
                                 key={m.id}
                                 position={m.pos}
                                 icon={{
                                    path: window.google.maps.SymbolPath.CIRCLE,
                                    scale: 10,
                                    fillColor: m.color,
                                    fillOpacity: 1,
                                    strokeColor: '#ffffff',
                                    strokeWeight: 2,
                                 }}
                              />
                           ))}
                        </GoogleMap>
                     ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-xs font-bold text-gray-500">Loading Map...</div>
                     )}
                  </div>

                  {/* Context & Timeline Panel */}
                  <div className="flex flex-col gap-4">
                     
                     {/* Distress Context */}
                     <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div className="text-xs font-bold text-gray-900 mb-3 border-b border-gray-100 pb-2">Distress Context</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                           <div>
                              <p className="text-[9px] font-semibold text-gray-500 mb-0.5">Driver ID</p>
                              <p className="text-[11px] font-bold text-gray-900">{selectedAlert?.driverId?.slice(-8) || 'N/A'}</p>
                           </div>
                           <div>
                              <p className="text-[9px] font-semibold text-gray-500 mb-0.5">User ID</p>
                              <p className="text-[11px] font-bold text-gray-900">{selectedAlert?.userId?.slice(-8) || 'N/A'}</p>
                           </div>
                           <div>
                              <p className="text-[9px] font-semibold text-gray-500 mb-0.5">Ride ID</p>
                              <p className="text-[11px] font-bold text-gray-900">{selectedAlert?.rideId?.slice(-8) || selectedAlert?.tripCode || 'N/A'}</p>
                           </div>
                           <div>
                              <p className="text-[9px] font-semibold text-gray-500 mb-0.5">Contact</p>
                              <p className="text-[11px] font-bold text-gray-900">{selectedAlert?.emergencyContact || 'Unavailable'}</p>
                           </div>
                        </div>
                     </div>

                     {/* Live Chat */}
                     <AdminSosChat alert={selectedAlert} />
                  </div>
               </div>

               {/* Live Activity Timeline */}
               <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm mb-4 lg:mb-0">
                  <div className="text-xs font-bold text-gray-900 mb-3 border-b border-gray-100 pb-2">Activity Log</div>
                  <div className="space-y-3">
                     {timeline.map((event, idx) => (
                        <div key={idx} className="flex gap-3">
                           <div className="flex flex-col items-center">
                              <div className={`w-2.5 h-2.5 rounded-full border-2 ${idx === 0 ? 'bg-red-500 border-red-200' : 'bg-gray-400 border-gray-200'}`}></div>
                              {idx !== timeline.length - 1 && <div className="w-px flex-1 bg-gray-100 my-1"></div>}
                           </div>
                           <div className="pb-2">
                              <p className="text-[11px] font-bold text-gray-900">{event.label}</p>
                              <p className="text-[9px] font-medium text-gray-500">{formatDateTime(event.time)}</p>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>

            </div>
         ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-gray-200">
               <ShieldAlert size={40} className="text-gray-300 mb-3" />
               <div className="text-base font-bold text-gray-900">System Standby</div>
               <p className="text-[11px] font-medium text-gray-500 max-w-xs mt-1.5">
                  Waiting for emergency distress signals. Select an incident from the sidebar to view details.
               </p>
            </div>
         )}
      </div>
    </div>
  );
};

export default SafetyCenter;
