import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SetPrice } from './src/modules/taxi/admin/models/SetPrice.js';
import { Zone } from './src/modules/taxi/driver/models/Zone.js';
import { Vehicle } from './src/modules/taxi/admin/models/Vehicle.js';
import { ServiceLocation } from './src/modules/taxi/admin/models/ServiceLocation.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'appzeto_taxi';

if (!MONGODB_URI) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
}

const data = [
    {
        "id": "0d0eb898-75c4-4022-9600-cd59e13ad68e",
        "zone_id": "8d426929-591a-4bb7-bc60-256abb196363",
        "type_id": "c2d55b76-00c6-4bd5-8364-d0bf740d32cc",
        "bill_status": 1,
        "transport_type": "both",
        "order_number": 1,
        "payment_type": "cash,online,wallet",
        "enable_shared_ride": 0,
        "admin_commission_type_for_owner": 1,
        "admin_commission_for_owner": 5,
        "admin_commision_type": 1,
        "admin_commision": 5,
        "service_tax": 5,
        "admin_commission_type_from_driver": 1,
        "admin_commission_from_driver": 5,
        "active": 1,
        "zone_name": "India",
        "vehicle_type_name": "Premium Car"
    },
    {
        "id": "7e52e165-65d4-43ea-b78e-b8f53f3888fd",
        "zone_id": "8d426929-591a-4bb7-bc60-256abb196363",
        "type_id": "d23ca682-c1c1-492d-9c8d-c3b8cad9b709",
        "bill_status": 1,
        "transport_type": "both",
        "order_number": 2,
        "payment_type": "cash,online,wallet",
        "enable_shared_ride": 0,
        "admin_commission_type_for_owner": 1,
        "admin_commission_for_owner": 2,
        "admin_commision_type": 1,
        "admin_commision": 2,
        "service_tax": 2,
        "admin_commission_type_from_driver": 1,
        "admin_commission_from_driver": 2,
        "active": 1,
        "zone_name": "India",
        "vehicle_type_name": "Bike"
    },
    {
        "id": "982d7ca6-bcfe-4615-a945-22c3113cfaf5",
        "zone_id": "8d426929-591a-4bb7-bc60-256abb196363",
        "type_id": "a5589c4f-3c18-48b4-9446-60ce066a1ad7",
        "bill_status": 1,
        "transport_type": "both",
        "order_number": 2,
        "payment_type": "cash,online,wallet",
        "enable_shared_ride": 0,
        "admin_commission_type_for_owner": 1,
        "admin_commission_for_owner": 2,
        "admin_commision_type": 1,
        "admin_commision": 2,
        "service_tax": 2,
        "admin_commission_type_from_driver": 1,
        "admin_commission_from_driver": 2,
        "active": 1,
        "zone_name": "India",
        "vehicle_type_name": "Auto"
    },
    {
        "id": "b3112204-4767-4811-8f3f-798ea8790b02",
        "zone_id": "8d426929-591a-4bb7-bc60-256abb196363",
        "type_id": "46a994f3-d8d7-4629-92e1-572d3b4531d4",
        "bill_status": 1,
        "transport_type": "both",
        "order_number": 2,
        "payment_type": "cash,online,wallet",
        "enable_shared_ride": 0,
        "admin_commission_type_for_owner": 1,
        "admin_commission_for_owner": 1,
        "admin_commision_type": 1,
        "admin_commision": 2,
        "service_tax": 2,
        "admin_commission_type_from_driver": 1,
        "admin_commission_from_driver": 2,
        "active": 1,
        "zone_name": "India",
        "vehicle_type_name": "Taxi"
    },
    {
        "id": "3c5e6e51-f31f-4edd-b215-934bae0d601f",
        "zone_id": "8d426929-591a-4bb7-bc60-256abb196363",
        "type_id": "e52b54c8-c3c0-47b0-8cff-e43b09797474",
        "bill_status": 1,
        "transport_type": "taxi",
        "order_number": 5,
        "payment_type": "cash,online,wallet",
        "enable_shared_ride": 0,
        "admin_commission_type_for_owner": 1,
        "admin_commission_for_owner": 6,
        "admin_commision_type": 1,
        "admin_commision": 9,
        "service_tax": 4,
        "admin_commission_type_from_driver": 1,
        "admin_commission_from_driver": 9,
        "active": 0,
        "zone_name": "India",
        "vehicle_type_name": "eRickshaw"
    }
];

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI, {
            dbName: MONGODB_DB_NAME
        });
        console.log(`Connected to MongoDB database: ${MONGODB_DB_NAME}`);

        // 1. Get or create India Service Location
        let serviceLocation = await ServiceLocation.findOne({ name: 'India' });
        if (!serviceLocation) {
            serviceLocation = await ServiceLocation.create({
                name: 'India',
                service_location_name: 'India',
                currency_name: 'Indian rupee',
                currency_code: 'INR',
                currency_symbol: '₹',
                timezone: 'Asia/Kolkata',
                active: true
            });
            console.log('Created ServiceLocation: India');
        }

        // 2. Get or create India Zone
        let zone = await Zone.findOne({ name: 'India' });
        if (!zone) {
            zone = await Zone.create({
                name: 'India',
                service_location_id: serviceLocation._id,
                active: true,
                unit: 'km',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [75.8577, 22.7196],
                        [85.8577, 22.7196],
                        [85.8577, 32.7196],
                        [75.8577, 32.7196],
                        [75.8577, 22.7196]
                    ]]
                }
            });
            console.log('Created Zone: India');
        }

        for (const item of data) {
            let vehicle = await Vehicle.findOne({ name: item.vehicle_type_name });
            if (!vehicle) {
                vehicle = await Vehicle.create({
                    name: item.vehicle_type_name,
                    transport_type: 'taxi',
                    capacity: item.capacity || 4,
                    active: 1,
                    dispatch_type: 'both'
                });
                console.log(`Created Vehicle: ${item.vehicle_type_name}`);
            }

            // Upsert the Set Price
            const filter = { 
                zone_id: zone._id, 
                vehicle_type: vehicle._id,
                transport_type: item.transport_type
            };
            
            const update = {
                service_location_id: serviceLocation._id,
                payment_type: item.payment_type.split(','),
                admin_commision_type: item.admin_commision_type,
                admin_commision: item.admin_commision,
                admin_commission_type_for_owner: item.admin_commission_type_for_owner,
                admin_commission_for_owner: item.admin_commission_for_owner,
                admin_commission_type_from_driver: item.admin_commission_type_from_driver,
                admin_commission_from_driver: item.admin_commission_from_driver,
                service_tax: item.service_tax,
                order_number: item.order_number,
                bill_status: item.bill_status,
                active: item.active,
                status: item.active ? 'active' : 'inactive'
            };

            await SetPrice.findOneAndUpdate(filter, update, { upsert: true, new: true });
            console.log(`Ensured SetPrice for ${item.vehicle_type_name}`);
        }

        console.log('Seeding completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
}

seed();
