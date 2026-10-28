/**
 * Seed script: put the website's current Terms / Privacy text plus short starting About / Refund / Cancellation
 * texts into the admin-managed legal documents (collection of LegalDocument). Safe to run twice: a document that
 * already exists is never touched, so text edited in the admin panel is never overwritten.
 *
 * The old company name ("Appzeto 24 Trawler" / "Appzeto 24") is replaced with "Rentol". Have the final wording
 * confirmed by the client / legal before the documents are relied on.
 *
 * Usage (from Backend/): node scripts/seedLegalDocuments.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGODB_DB_NAME || 'appzeto_taxi';
const CONTENT_DIR = path.resolve(__dirname, '../../frontend/src/modules/shared/content');

if (!MONGO_URI) {
  console.error('MONGODB_URI is not set in .env');
  process.exit(1);
}

const { LegalDocument } = await import('../src/modules/taxi/admin/models/LegalDocument.js');
const { cleanLegalText } = await import('../src/modules/taxi/services/legalContentService.js');

export const renameCompany = (text) =>
  String(text)
    .replace(/https?:\/\/Appzeto\s*24\.com/gi, 'https://rentol.in')
    .replace(/Appzeto\s+24\s+Trawler/gi, 'Rentol')
    .replace(/Appzeto\s+24(?!\w)/gi, 'Rentol');

const readContent = (file) => renameCompany(fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8'));

const ABOUT_BODY = `Rentol is a transportation and logistics platform dedicated to providing safe, reliable and affordable mobility solutions for everyone.

OUR MISSION
Our mission is to transform the way people move by connecting them with professional drivers and efficient services. We believe that transportation should be seamless, secure and accessible to all.

Whether you need a quick city ride, a comfortable outstation trip or fast parcel delivery, our technology-driven approach is built to make every journey a great experience.

WHAT WE STAND FOR
Reliability: always on time, every time you ride.
Safety first: verified drivers and secure tracking.
Community: empowering riders and drivers alike.
Excellence: top-tier service quality.`;

const REFUND_BODY = `Rentol reviews refund requests on a case-by-case basis to confirm whether the booking was completed, cancelled before service, cancelled after dispatch, or affected by a technical or payment issue. Approved refunds are returned only after internal verification of ride logs, payment status and service records.

WHEN REFUNDS MAY BE APPROVED
- Duplicate payment or verified overcharge.
- Booking cancelled by the platform or partner after confirmation.
- Service could not be fulfilled and the customer was not at fault.
- Cancellation made within the free cancellation period, where applicable.

CASES WHERE REFUNDS MAY BE PARTIAL
- A driver or service partner has already been assigned and operational costs have started.
- A vehicle was reserved for a scheduled booking and cancelled late by the customer.
- Waiting charges, toll blocking, convenience fees or zone-specific service costs have already been incurred.
- The service was partly delivered before the booking was cancelled or interrupted.

CASES WHERE REFUNDS ARE USUALLY NOT ALLOWED
- Incorrect pickup or drop details entered by the user that caused service failure.
- Customer no-show after the partner reaches or waits at the pickup point.
- Cancellations made after the trip, rental, dispatch or service has already started.
- Fraudulent transactions, chargeback misuse or policy abuse under investigation.

REFUND TIMELINES
- UPI or wallet refunds are usually credited within 1 to 3 business days after approval.
- Card, bank or gateway refunds are usually credited within 5 to 10 business days after approval.
- If a banking partner delays settlement, the final credit timeline may depend on the payment provider.

HOW TO REQUEST A REFUND
Raise the issue through the support team with your booking ID, payment details and the reason for the request, as early as possible after the cancelled or affected booking. Rentol may ask for screenshots, transaction references or additional verification before approval.`;

const CANCELLATION_BODY = `This policy summarizes how cancellations are handled across Rentol booking categories.

GENERAL POLICY
- Free cancellation may be available during a short grace period.
- Charges may apply after partner assignment, dispatch or service start.
- Refundability depends on timing, service state and payment verification.

PARCEL (GOODS) BOOKINGS
An advance is taken when a parcel booking is confirmed. If the rider cancels after paying the advance, a share of the fare is kept as a cancellation charge and the rest of the advance is refunded. The exact amounts are shown on the cancel screen before you confirm. If the booking is cancelled by the driver or the platform, or no driver is found, the whole advance is refunded.`;

const DOCUMENTS = [
  { type: 'terms', audience: 'user', title: 'Terms & Conditions', body: () => readContent('terms-content.txt') },
  { type: 'privacy', audience: 'all', title: 'Privacy Policy', body: () => readContent('privacy-content.txt') },
  { type: 'about', audience: 'all', title: 'About Us', body: () => ABOUT_BODY },
  { type: 'refund', audience: 'all', title: 'Refund Policy', body: () => REFUND_BODY },
  { type: 'cancellation', audience: 'all', title: 'Cancellation Policy', body: () => CANCELLATION_BODY },
];

await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });

for (const doc of DOCUMENTS) {
  const key = { type: doc.type, audience: doc.audience, language_code: 'en' };

  if (await LegalDocument.exists(key)) {
    console.log(`skip    ${doc.type} / ${doc.audience} / en (already exists)`);
    continue;
  }

  const text = cleanLegalText({ title: doc.title, body: doc.body() });
  const leftovers = (text.body.match(/Appzeto/gi) || []).length;
  await LegalDocument.create({
    ...key,
    title: text.title,
    body: text.body,
    status: 'published',
    version: 1,
    published_at: new Date(),
  });
  console.log(`created ${doc.type} / ${doc.audience} / en (${Math.round(text.body.length / 1024)} KB)${leftovers ? `, still mentions "Appzeto" ${leftovers}x` : ''}`);
}

await mongoose.disconnect();
