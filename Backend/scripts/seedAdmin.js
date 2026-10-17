/**
 * Seed script: create a superadmin, or set its password if it already exists.
 * Usage: SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='a long password' node scripts/seedAdmin.js
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Load .env ────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI    = process.env.MONGODB_URI;
const MONGO_DB     = process.env.MONGODB_DB_NAME || 'appzeto_taxi';

if (!MONGO_URI) {
  console.error('❌  MONGODB_URI is not set in .env');
  process.exit(1);
}

// ── Admin credentials (from the environment, never hardcoded) ────────────────
const ADMIN_EMAIL = String(process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASS  = String(process.env.SEED_ADMIN_PASSWORD || '');
const ADMIN_NAME  = 'Super Admin';

if (!ADMIN_EMAIL || ADMIN_PASS.length < 10) {
  console.error('❌  Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (at least 10 characters)');
  process.exit(1);
}

// ── Mongoose schema (mirrors Admin.js) ───────────────────────────────────────
const adminSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    email:       { type: String, lowercase: true, trim: true, unique: true },
    phone:       { type: String, trim: true },
    password:    { type: String, required: true, minlength: 5, select: false },
    role:        { type: String, default: 'superadmin' },
    admin_type:  { type: String, default: 'superadmin' },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true },
);

const Admin = mongoose.models.TaxiAdmin || mongoose.model('TaxiAdmin', adminSchema);

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });
    console.log(`✅  Connected to MongoDB (${MONGO_DB})`);

    const hashedPassword = await bcrypt.hash(ADMIN_PASS, 10);

    const existing = await Admin.findOne({ email: ADMIN_EMAIL });

    if (existing) {
      // Update password in case it changed
      await Admin.updateOne(
        { email: ADMIN_EMAIL },
        {
          $set: {
            password: hashedPassword,
            name: ADMIN_NAME,
            role: 'superadmin',
            admin_type: 'superadmin',
            permissions: ['*'],
          },
        },
      );
      console.log(`🔄  Admin already exists — password updated.`);
    } else {
      await Admin.create({
        name:        ADMIN_NAME,
        email:       ADMIN_EMAIL,
        password:    hashedPassword,
        role:        'superadmin',
        admin_type:  'superadmin',
        permissions: ['*'],
      });
      console.log(`🎉  Admin created successfully!`);
    }

    console.log(`\n  Email   : ${ADMIN_EMAIL}`);
    console.log(`  Role    : superadmin\n`);
  } catch (err) {
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋  Disconnected from MongoDB.');
  }
})();
