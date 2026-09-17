import mongoose from 'mongoose';
import { AdminAppSetting } from '../models/AdminAppSetting.js';
import { createDefaultAppSettings } from '../data/defaultAppSettings.js';

/**
 * Legacy script updated to work with unified AdminAppSetting model
 */
export const seedAppSettings = async () => {
    try {
        console.log('Seeding Application Settings and Modules...');
        
        let settings = await AdminAppSetting.findOne({ scope: 'default' });
        const defaults = createDefaultAppSettings();

        if (!settings) {
            await AdminAppSetting.create(defaults);
            console.log('Created new AdminAppSetting with default modules');
        } else {
            // Update existing but keep other fields
            settings.app_modules = defaults.app_modules;
            settings.markModified('app_modules');
            await settings.save();
            console.log('Updated existing AdminAppSetting modules');
        }
        
        return true;
    } catch (error) {
        console.error('Seed App Settings Error:', error);
        throw error;
    }
};
