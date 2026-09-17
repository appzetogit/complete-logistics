import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SOURCE_URI = String(process.env.MONGODB_URI || '').trim();
const SOURCE_DB = String(process.env.MONGODB_DB_NAME || 'appzeto_taxi').trim() || 'appzeto_taxi';
const TARGET_URI = String(process.argv[2] || '').trim();
const TARGET_DB = String(process.argv[3] || SOURCE_DB).trim() || SOURCE_DB;
const REQUESTED_COLLECTIONS = process.argv.slice(4)
  .map((name) => String(name || '').trim())
  .filter(Boolean);
const BATCH_SIZE = 500;

if (!SOURCE_URI) {
  throw new Error('Missing source MONGODB_URI in Backend/.env');
}

if (!TARGET_URI) {
  throw new Error('Usage: node scripts/copyMongoDb.js <targetMongoUri> [targetDbName] [collectionName ...]');
}

const connect = async (uri, dbName) =>
  mongoose.createConnection(uri, {
    dbName,
    serverSelectionTimeoutMS: 30000,
  }).asPromise();

const shouldSkipCollection = (name) =>
  !name
  || name.startsWith('system.')
  || name === 'startup_log';

const copyIndexes = async (sourceCollection, targetCollection) => {
  const indexes = await sourceCollection.indexes();

  for (const index of indexes) {
    if (!index?.name || index.name === '_id_') {
      continue;
    }

    const { key, name, ns, v, background, ...options } = index;
    try {
      await targetCollection.createIndex(key, { ...options, name });
    } catch (error) {
      if (error?.code === 85 || error?.code === 86) {
        console.warn(`   Skipping existing/conflicting index ${name}`);
        continue;
      }
      throw error;
    }
  }
};

const copyCollection = async (sourceDb, targetDb, collectionName) => {
  const sourceCollection = sourceDb.collection(collectionName);
  const targetCollection = targetDb.collection(collectionName);

  await copyIndexes(sourceCollection, targetCollection);

  const totalDocuments = await sourceCollection.countDocuments();
  let copiedDocuments = 0;
  let batch = [];

  const flush = async () => {
    if (!batch.length) {
      return;
    }

    await targetCollection.bulkWrite(
      batch.map((document) => ({
        replaceOne: {
          filter: { _id: document._id },
          replacement: document,
          upsert: true,
        },
      })),
      { ordered: false },
    );

    copiedDocuments += batch.length;
    console.log(`   Copied ${copiedDocuments}/${totalDocuments}`);
    batch = [];
  };

  const cursor = sourceCollection.find({});

  for await (const document of cursor) {
    batch.push(document);

    if (batch.length >= BATCH_SIZE) {
      await flush();
    }
  }

  await flush();
  return totalDocuments;
};

const main = async () => {
  let sourceConnection;
  let targetConnection;

  try {
    console.log(`Connecting to source DB: ${SOURCE_DB}`);
    sourceConnection = await connect(SOURCE_URI, SOURCE_DB);

    console.log(`Connecting to target DB: ${TARGET_DB}`);
    targetConnection = await connect(TARGET_URI, TARGET_DB);

    const sourceDb = sourceConnection.db;
    const targetDb = targetConnection.db;

    const collections = await sourceDb.listCollections().toArray();
    const availableCollectionNames = collections
      .map((collection) => collection.name)
      .filter((name) => !shouldSkipCollection(name));
    const collectionNames = REQUESTED_COLLECTIONS.length > 0
      ? REQUESTED_COLLECTIONS.filter((name) => availableCollectionNames.includes(name))
      : availableCollectionNames;

    const missingCollections = REQUESTED_COLLECTIONS.filter(
      (name) => !availableCollectionNames.includes(name),
    );

    if (missingCollections.length > 0) {
      console.warn(`Skipping missing collections: ${missingCollections.join(', ')}`);
    }

    console.log(`Found ${collectionNames.length} collections to copy.`);

    for (const collectionName of collectionNames) {
      console.log(`\nCopying ${collectionName}...`);
      const count = await copyCollection(sourceDb, targetDb, collectionName);
      console.log(`Finished ${collectionName} (${count} docs).`);
    }

    console.log(`\nCopy complete from ${SOURCE_DB} to ${TARGET_DB}.`);
  } finally {
    await Promise.allSettled([
      sourceConnection?.close(),
      targetConnection?.close(),
    ]);
  }
};

main().catch((error) => {
  console.error('\nCopy failed:', error);
  process.exitCode = 1;
});
