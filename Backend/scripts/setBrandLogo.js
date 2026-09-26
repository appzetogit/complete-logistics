import mongoose from 'mongoose';
import { AdminBusinessSetting } from '../src/modules/taxi/admin/models/AdminBusinessSetting.js';
import { createDefaultBusinessSettings } from '../src/modules/taxi/admin/data/defaultBusinessSettings.js';
import { connectDatabase } from '../src/config/database.js';

const LOGO_PATH = '/uploads/branding/logo.png';

const run = async () => {
  try {
    await connectDatabase();
    console.log('Connected to database...');

    let doc = await AdminBusinessSetting.findOne({ scope: 'default' });
    if (!doc) {
      doc = await AdminBusinessSetting.create(createDefaultBusinessSettings());
      console.log('No business settings document existed — created one with defaults.');
    }

    doc.general = {
      ...(doc.general || {}),
      logo: LOGO_PATH,
      favicon: LOGO_PATH,
    };
    doc.markModified('general');
    await doc.save();

    console.log('Brand logo set to', LOGO_PATH);
    process.exit(0);
  } catch (error) {
    console.error('Failed to set brand logo:', error);
    process.exit(1);
  }
};

run();
