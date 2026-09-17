import React from 'react';
import { 
    Car, 
    Bike, 
    Truck, 
    Package, 
    MapPin, 
    Zap, 
    Shield, 
    Clock, 
    IndianRupee,
    Briefcase,
    Milestone,
    Settings
} from 'lucide-react';

/**
 * Maps semantic icon identifiers to Lucide-react components.
 * This ensures no emojis are rendered in the UI regardless of the data source.
 */
export const getLucideIcon = (iconName, size = 20, className = "") => {
    const icons = {
        // Service & Vehicle Icons
        'taxi_icon': <Car size={size} className={className} />,
        'bike_icon': <Bike size={size} className={className} />,
        'auto_icon': <Zap size={size} className={className} />, // Using Zap for Auto (modern look)
        'cab_icon': <Car size={size} className={className} />,
        'delivery_icon': <Package size={size} className={className} />,
        'truck_icon': <Truck size={size} className={className} />,
        
        // General UI Icons (if needed for mapping)
        'location_icon': <MapPin size={size} className={className} />,
        'time_icon': <Clock size={size} className={className} />,
        'payment_icon': <IndianRupee size={size} className={className} />,
        'corporate_icon': <Briefcase size={size} className={className} />,
        'route_icon': <Milestone size={size} className={className} />,
        'settings_icon': <Settings size={size} className={className} />,
    };

    return icons[iconName] || <Car size={size} className={className} />; // Fallback to Car
};
