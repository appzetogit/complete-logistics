import mongoose from 'mongoose';
import { AdminBusinessSetting } from '../models/AdminBusinessSetting.js';
import { createDefaultBusinessSettings } from '../data/defaultBusinessSettings.js';
import { connectDatabase } from '../../../../config/database.js';

const seed = async () => {
  try {
    await connectDatabase();
    console.log('Connected to database...');

    const defaults = createDefaultBusinessSettings();
    
    // We update or create the document
    const result = await AdminBusinessSetting.findOneAndUpdate(
      { scope: 'default' },
      { $set: defaults },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    console.log('Business settings seeded successfully:', result.scope);
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed business settings:', error);
    process.exit(1);
  }
};

seed();
