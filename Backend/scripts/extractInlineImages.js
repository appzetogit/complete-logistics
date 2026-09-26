// Move base64 images out of Mongo documents and onto the uploads volume.
//
// Documents that inline images grow without bound: a vehicle icon saved as a
// data URL is copied into every ride booked with that vehicle, so a handful of
// icons turned 342 rides into 48 MB. This rewrites every data: URL it finds to
// a file reference. Files are content-addressed, so duplicates collapse.
//
//   node scripts/extractInlineImages.js           report only
//   node scripts/extractInlineImages.js --apply   rewrite the documents
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { storeDataUrlImage, isDataUrl } from '../src/utils/localImageStore.js';

const MAX_DEPTH = 4;

// Every data: URL in a document, as dotted paths $set understands.
const findInlineImages = (value, path, found, depth = 0) => {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return found;

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;

    if (isDataUrl(child)) found.push({ path: childPath, value: child });
    else if (child && typeof child === 'object') findInlineImages(child, childPath, found, depth + 1);
  }

  return found;
};

const run = async () => {
  const shouldApply = process.argv.includes('--apply');

  await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false });
  const { db } = mongoose.connection;

  console.log(`${shouldApply ? 'APPLY' : 'DRY RUN'}  ->  ${env.uploads.dir}\n`);

  let bytesFreed = 0;
  let docsChanged = 0;
  const filesWritten = new Set();

  for (const { name } of await db.listCollections().toArray()) {
    const collection = db.collection(name);
    const operations = [];
    let collectionBytes = 0;

    for await (const doc of collection.find({})) {
      const inlineImages = findInlineImages(doc, '', []);
      if (!inlineImages.length) continue;

      const updates = {};

      for (const { path, value } of inlineImages) {
        // Content-addressed: the same icon across 200 rides writes one file.
        const url = await storeDataUrlImage(value, name.replace(/^taxi/, ''));
        if (!url || isDataUrl(url)) continue;

        filesWritten.add(url);
        updates[path] = url;
        collectionBytes += value.length - url.length;
      }

      if (!Object.keys(updates).length) continue;

      operations.push({ updateOne: { filter: { _id: doc._id }, update: { $set: updates } } });
      docsChanged += 1;
    }

    if (!operations.length) continue;

    bytesFreed += collectionBytes;
    console.log(`  ${name.padEnd(30)} ${String(operations.length).padStart(5)} docs   ${(collectionBytes / 1048576).toFixed(1).padStart(7)} MB`);

    if (shouldApply) await collection.bulkWrite(operations, { ordered: false });
  }

  console.log(`\n${docsChanged} documents, ${filesWritten.size} distinct files, ${(bytesFreed / 1048576).toFixed(1)} MB removed from Mongo`);
  if (!shouldApply) console.log('Nothing written. Re-run with --apply.');

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
