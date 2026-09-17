import mongoose from 'mongoose';
import { AdminAppSetting } from './src/modules/taxi/admin/models/AdminAppSetting.js';
import dotenv from 'dotenv';

dotenv.config();

const check = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const settings = await AdminAppSetting.findOne({ scope: 'default' });
    console.log('App Modules in DB:', JSON.stringify(settings?.app_modules || [], null, 2));
    process.exit(0);
};
check();
