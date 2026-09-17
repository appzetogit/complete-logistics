import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Zone } from './src/modules/taxi/driver/models/Zone.js';
import { ServiceLocation } from './src/modules/taxi/admin/models/ServiceLocation.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'appzeto_taxi';

if (!MONGODB_URI) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
}

const cities = [
  { name: "Mumbai", lat: 19.0760, lng: 72.8777 },
  { name: "Delhi", lat: 28.7041, lng: 77.1025 },
  { name: "Bangalore", lat: 12.9716, lng: 77.5946 },
  { name: "Hyderabad", lat: 17.3850, lng: 78.4867 },
  { name: "Ahmedabad", lat: 23.0225, lng: 72.5714 },
  { name: "Chennai", lat: 13.0827, lng: 80.2707 },
  { name: "Kolkata", lat: 22.5726, lng: 88.3639 },
  { name: "Surat", lat: 21.1702, lng: 72.8311 },
  { name: "Pune", lat: 18.5204, lng: 73.8567 },
  { name: "Jaipur", lat: 26.9124, lng: 75.7873 },
  { name: "Lucknow", lat: 26.8467, lng: 80.9462 },
  { name: "Kanpur", lat: 26.4499, lng: 80.3319 },
  { name: "Nagpur", lat: 21.1458, lng: 79.0882 },
  { name: "Indore", lat: 22.7196, lng: 75.8577 },
  { name: "Thane", lat: 19.2183, lng: 72.9781 },
  { name: "Bhopal", lat: 23.2599, lng: 77.4126 },
  { name: "Visakhapatnam", lat: 17.6868, lng: 83.2185 },
  { name: "Pimpri-Chinchwad", lat: 18.6298, lng: 73.7997 },
  { name: "Patna", lat: 25.5941, lng: 85.1376 },
  { name: "Vadodara", lat: 22.3072, lng: 73.1812 },
  { name: "Ghaziabad", lat: 28.6692, lng: 77.4538 },
  { name: "Ludhiana", lat: 30.9010, lng: 75.8573 },
  { name: "Agra", lat: 27.1767, lng: 78.0081 },
  { name: "Nashik", lat: 19.9975, lng: 73.7898 },
  { name: "Faridabad", lat: 28.4089, lng: 77.3178 },
  { name: "Meerut", lat: 28.9845, lng: 77.7064 },
  { name: "Rajkot", lat: 22.3039, lng: 70.8022 },
  { name: "Kalyan-Dombivli", lat: 19.2403, lng: 73.1305 },
  { name: "Vasai-Virar", lat: 19.3919, lng: 72.8397 },
  { name: "Varanasi", lat: 25.3176, lng: 82.9739 },
  { name: "Srinagar", lat: 34.0837, lng: 74.7973 },
  { name: "Aurangabad", lat: 19.8762, lng: 75.3433 },
  { name: "Dhanbad", lat: 23.7957, lng: 86.4304 },
  { name: "Amritsar", lat: 31.6340, lng: 74.8723 },
  { name: "Navi Mumbai", lat: 19.0330, lng: 73.0297 },
  { name: "Allahabad", lat: 25.4358, lng: 81.8463 },
  { name: "Howrah", lat: 22.5958, lng: 88.2636 },
  { name: "Gwalior", lat: 26.2183, lng: 78.1828 },
  { name: "Jabalpur", lat: 23.1815, lng: 79.9864 },
  { name: "Coimbatore", lat: 11.0168, lng: 76.9558 },
  { name: "Vijayawada", lat: 16.5062, lng: 80.6480 },
  { name: "Jodhpur", lat: 26.2389, lng: 73.0243 },
  { name: "Madurai", lat: 9.9252, lng: 78.1198 },
  { name: "Raipur", lat: 21.2514, lng: 81.6296 },
  { name: "Kota", lat: 25.2138, lng: 75.8648 },
  { name: "Guwahati", lat: 26.1445, lng: 91.7362 },
  { name: "Chandigarh", lat: 30.7333, lng: 76.7794 },
  { name: "Solapur", lat: 17.6599, lng: 75.9064 },
  { name: "Hubli-Dharwad", lat: 15.3647, lng: 75.1240 },
  { name: "Bareilly", lat: 28.3670, lng: 79.4304 },
  { name: "Moradabad", lat: 28.8386, lng: 78.7733 },
  { name: "Mysore", lat: 12.2958, lng: 76.6394 },
  { name: "Gurgaon", lat: 28.4595, lng: 77.0266 },
  { name: "Aligarh", lat: 27.8974, lng: 78.0880 },
  { name: "Jalandhar", lat: 31.3260, lng: 75.5762 },
  { name: "Tiruchirappalli", lat: 10.7905, lng: 78.7047 },
  { name: "Bhubaneswar", lat: 20.2961, lng: 85.8245 },
  { name: "Salem", lat: 11.6643, lng: 78.1460 },
  { name: "Mira-Bhayandar", lat: 19.2904, lng: 72.8500 },
  { name: "Warangal", lat: 17.9689, lng: 79.5941 },
  { name: "Guntur", lat: 16.3067, lng: 80.4365 },
  { name: "Bhiwandi", lat: 19.2813, lng: 73.0483 },
  { name: "Saharanpur", lat: 29.9640, lng: 77.5460 },
  { name: "Gorakhpur", lat: 26.7606, lng: 83.3731 },
  { name: "Bikaner", lat: 28.0166, lng: 73.3119 },
  { name: "Amravati", lat: 20.9374, lng: 77.7796 },
  { name: "Noida", lat: 28.5355, lng: 77.3910 },
  { name: "Jamshedpur", lat: 22.8046, lng: 86.2029 },
  { name: "Bhilai", lat: 21.1938, lng: 81.3509 },
  { name: "Cuttack", lat: 20.4625, lng: 85.8830 },
  { name: "Firozabad", lat: 27.1513, lng: 78.3957 },
  { name: "Kochi", lat: 9.9312, lng: 76.2673 },
  { name: "Nellore", lat: 14.4426, lng: 79.9865 },
  { name: "Bhavnagar", lat: 21.7645, lng: 72.1519 },
  { name: "Dehradun", lat: 30.3165, lng: 78.0322 },
  { name: "Durgapur", lat: 23.5204, lng: 87.3119 },
  { name: "Asansol", lat: 23.6740, lng: 86.9520 },
  { name: "Rourkela", lat: 22.2604, lng: 84.8536 },
  { name: "Nanded", lat: 19.1383, lng: 77.3210 },
  { name: "Kolhapur", lat: 16.7050, lng: 74.2433 },
  { name: "Ajmer", lat: 26.4498, lng: 74.6399 },
  { name: "Akola", lat: 20.7002, lng: 77.0082 },
  { name: "Gulbarga", lat: 17.3297, lng: 76.8343 },
  { name: "Jamnagar", lat: 22.4707, lng: 70.0577 },
  { name: "Ujjain", lat: 23.1760, lng: 75.7885 },
  { name: "Loni", lat: 28.7513, lng: 77.2913 },
  { name: "Jhansi", lat: 25.4484, lng: 78.5685 },
  { name: "Siliguri", lat: 26.7271, lng: 88.3953 },
  { name: "Jammu", lat: 32.7266, lng: 74.8570 },
  { name: "Mangalore", lat: 12.9141, lng: 74.8560 },
  { name: "Belgaum", lat: 15.8497, lng: 74.4977 },
  { name: "Tirunelveli", lat: 8.7139, lng: 77.7567 },
  { name: "Malegaon", lat: 20.5522, lng: 74.5307 },
  { name: "Gaya", lat: 24.7914, lng: 85.0002 },
  { name: "Ambattur", lat: 13.1143, lng: 80.1548 },
  { name: "Jalgaon", lat: 21.0077, lng: 75.5626 },
  { name: "Udaipur", lat: 24.5854, lng: 73.7125 },
  { name: "Karawal Nagar", lat: 28.7300, lng: 77.2700 },
  { name: "Tiruppur", lat: 11.1085, lng: 77.3411 }
];

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI, {
            dbName: MONGODB_DB_NAME
        });
        console.log(`Connected to MongoDB: ${MONGODB_DB_NAME}`);

        let slCount = 0;
        let zoneCount = 0;

        for (const city of cities) {
            // 1. Find or create ServiceLocation
            let serviceLocation = await ServiceLocation.findOne({ name: city.name });
            if (!serviceLocation) {
                serviceLocation = await ServiceLocation.create({
                    name: city.name,
                    service_location_name: city.name,
                    currency_name: 'Indian Rupee',
                    currency_code: 'INR',
                    currency_symbol: '₹',
                    timezone: 'Asia/Kolkata',
                    latitude: city.lat,
                    longitude: city.lng,
                    location: {
                        type: 'Point',
                        coordinates: [city.lng, city.lat]
                    },
                    active: true,
                    status: 'active'
                });
                slCount++;
            }

            // 2. Find or create Zone
            let zone = await Zone.findOne({ name: city.name });
            if (!zone) {
                // Generate a small square polygon (0.1 deg side) around the city coordinates
                const delta = 0.05;
                await Zone.create({
                    name: city.name,
                    service_location_id: serviceLocation._id,
                    active: true,
                    status: 'active',
                    unit: 'km',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [[
                            [city.lng - delta, city.lat - delta],
                            [city.lng + delta, city.lat - delta],
                            [city.lng + delta, city.lat + delta],
                            [city.lng - delta, city.lat + delta],
                            [city.lng - delta, city.lat - delta]
                        ]]
                    }
                });
                zoneCount++;
            }
        }

        console.log(`Successfully seeded top 100 cities of India!`);
        console.log(`Created ${slCount} new Service Locations.`);
        console.log(`Created ${zoneCount} new Zones.`);
        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
}

seed();
