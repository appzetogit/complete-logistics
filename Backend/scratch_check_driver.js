import mongoose from 'mongoose';
import { Vehicle } from './src/modules/taxi/admin/models/Vehicle.js';
import dotenv from 'dotenv';

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const doc = await Vehicle.findById('69dcb5faba63a3e24641c45d').lean();
    console.log('--- Taxi Vehicle Fields ---');
    console.log('ID:', doc._id);
    console.log('Name:', doc.name);
    console.log('transport_type:', doc.transport_type);
    console.log('is_taxi:', doc.is_taxi);
    console.log('active:', doc.active);
    console.log('status:', doc.status);
    console.log('icon_types:', doc.icon_types);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

run();
