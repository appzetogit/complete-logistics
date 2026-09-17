import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const vehicles = await db.collection('taxipoolingvehicles').find({}).toArray();
  console.log('--- ALL POOLING VEHICLES (RAW) ---');
  vehicles.forEach(v => {
    console.log(`ID: ${v._id}, Name: ${v.name}, Model: ${v.vehicleModel}, Number: ${v.vehicleNumber}, Admin%: ${v.adminCommissionPercentage}, Owner%: ${v.ownerCommissionPercentage}, ServiceTax%: ${v.serviceTaxPercentage}`);
  });

  const routes = await db.collection('taxipoolingroutes').find({}).toArray();
  console.log('--- ALL POOLING ROUTES (RAW) ---');
  routes.forEach(r => {
    console.log(`ID: ${r._id}, Name: ${r.routeName}, Vehicles: ${JSON.stringify(r.assignedVehicleTypeIds)}`);
  });

  process.exit(0);
}

main().catch(console.error);
