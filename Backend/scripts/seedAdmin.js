/**
 * Seed script: create or update the default admin account.
 * Usage: node scripts/seedAdmin.js
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

// ── Admin credentials ────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASS  = '123456';
const ADMIN_NAME  = 'Super Admin';

// ── Mongoose schema (mirrors Admin.js) ───────────────────────────────────────
const adminSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    email:       { type: String, lowercase: true, trim: true, unique: true },
    phone:       { type: String, trim: true },
    password:    { type: String, required: true, minlength: 5, select: false },
    role:        { type: String, default: 'admin' },
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
        { $set: { password: hashedPassword, name: ADMIN_NAME, role: 'admin' } },
      );
      console.log(`🔄  Admin already exists — password updated.`);
    } else {
      await Admin.create({
        name:     ADMIN_NAME,
        email:    ADMIN_EMAIL,
        password: hashedPassword,
        role:     'admin',
      });
      console.log(`🎉  Admin created successfully!`);
    }

    console.log(`\n  Email   : ${ADMIN_EMAIL}`);
    console.log(`  Password: ${ADMIN_PASS}`);
    console.log(`  Role    : admin\n`);
  } catch (err) {
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋  Disconnected from MongoDB.');
  }
})();
