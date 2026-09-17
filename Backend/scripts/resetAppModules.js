import mongoose from 'mongoose';
import { AdminAppSetting } from '../src/modules/taxi/admin/models/AdminAppSetting.js';
import { createDefaultAppSettings } from '../src/modules/taxi/admin/data/defaultAppSettings.js';
import dotenv from 'dotenv';

dotenv.config();

const resetAppModules = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Database connected');

        // Get existing settings or create new ones
        let settings = await AdminAppSetting.findOne({ scope: 'default' });
        
        const defaultData = createDefaultAppSettings();
        
        if (!settings) {
            console.log('No settings found, creating default settings with app modules...');
            settings = await AdminAppSetting.create(defaultData);
        } else {
            console.log('Updating app_modules in AdminAppSetting...');
            // We overwrite the nested array with the fresh defaults
            settings.app_modules = defaultData.app_modules.map(m => ({
                ...m,
                _id: new mongoose.Types.ObjectId().toString() // Ensure fresh IDs
            }));
            settings.markModified('app_modules');
            await settings.save();
        }

        console.log('Successfully resetted and seeded app modules inside AdminAppSetting');
        process.exit(0);
    } catch (error) {
        console.error('Error resetting app modules:', error);
        process.exit(1);
    }
};

resetAppModules();
