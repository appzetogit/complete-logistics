import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  console.log('Collections in database:', collections.map(c => c.name));
  process.exit(0);
}

main().catch(console.error);
