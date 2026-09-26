// Which schema-defined indexes are missing from the live database?
//
// Production connects with autoIndex:false, so mongoose never builds indexes on
// its own. An index added to a schema silently does not exist in production
// until something creates it -- and a hot query without its index is a full
// collection scan, which is invisible until load makes it fatal.
//
//   node scripts/auditIndexes.js         report only
//   node scripts/auditIndexes.js --fix   build the missing ones
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const collectModelFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return collectModelFiles(full);
  return name.endsWith('.js') && full.includes(`${path.sep}models${path.sep}`) ? [full] : [];
});

const run = async () => {
  const shouldFix = process.argv.includes('--fix');
  const files = collectModelFiles(path.resolve(scriptDir, '../src'));

  for (const file of files) {
    await import(pathToFileURL(file).href);
  }

  await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false });
  console.log(`${files.length} model files -> ${mongoose.modelNames().length} registered models\n`);

  let missing = 0;
  let failed = 0;

  for (const name of mongoose.modelNames().sort()) {
    const model = mongoose.model(name);

    let diff;
    try {
      diff = await model.diffIndexes();
    } catch (error) {
      console.log(`  ?? ${name}: ${error.message}`);
      continue;
    }

    if (!diff.toCreate.length) continue;

    missing += diff.toCreate.length;
    console.log(`MISSING  ${name}  (${model.collection.name})`);
    for (const spec of diff.toCreate) console.log(`         ${JSON.stringify(spec)}`);

    if (shouldFix) {
      // One model failing (name clash with a hand-built index, a duplicate key)
      // must not hide the rest of the report.
      try {
        await model.createIndexes();
        console.log('         -> built');
      } catch (error) {
        failed += 1;
        console.log(`         -> FAILED: ${String(error.message).slice(0, 120)}`);
      }
    }
  }

  if (missing === 0) {
    console.log('\nAll schema indexes exist in the database.');
  } else if (!shouldFix) {
    console.log(`\n${missing} missing index(es). Re-run with --fix to build them.`);
  } else {
    console.log(`\n${missing - failed} of ${missing} index(es) built, ${failed} failed.`);
  }

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
