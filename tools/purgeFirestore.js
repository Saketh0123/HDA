/*
  Purge Firestore test data.

  Prerequisites:
    - Download a Firebase service account JSON key (DO NOT COMMIT IT)
    - Set env var:
        set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\serviceAccountKey.json

  Usage examples:
    node tools\purgeFirestore.js
    node tools\purgeFirestore.js --collections students,fees
    node tools\purgeFirestore.js --admin
    node tools\purgeFirestore.js --admin --yes
    node tools\purgeFirestore.js --admin --dry-run

  Notes:
    - This deletes top-level documents in the selected collections.
    - This does NOT delete Firebase Auth users.
*/

const admin = require('firebase-admin');
const readline = require('readline');

function parseArgs(argv) {
  const out = { flags: new Set(), values: new Map() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;

    const [k, v] = a.split('=');
    const key = k.replace(/^--/, '').trim();
    if (!key) continue;

    if (typeof v === 'string') {
      out.values.set(key, v);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out.values.set(key, next);
      i++;
    } else {
      out.flags.add(key);
    }
  }
  return out;
}

function flag(args, name) {
  return args.flags.has(name);
}

function value(args, name, fallback = null) {
  return args.values.has(name) ? args.values.get(name) : fallback;
}

function csvList(input) {
  return String(input || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function promptConfirm(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(message, resolve));
  rl.close();
  return String(answer || '').trim();
}

async function getCollectionCount(db, name) {
  try {
    const snap = await db.collection(name).count().get();
    const c = snap?.data()?.count;
    return typeof c === 'number' ? c : null;
  } catch {
    return null;
  }
}

async function deleteCollection(db, name, { batchSize = 400 } = {}) {
  const coll = db.collection(name);
  let deleted = 0;

  // Use a deterministic order to safely page.
  const orderField = admin.firestore.FieldPath.documentId();

  while (true) {
    const snap = await coll.orderBy(orderField).limit(batchSize).get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();

    deleted += snap.size;

    // Small progress indicator.
    process.stdout.write(`Deleted ${deleted} docs from ${name}...\n`);

    // If we deleted less than batch size, the collection is exhausted.
    if (snap.size < batchSize) break;
  }

  return deleted;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const adminMode = flag(args, 'admin') || flag(args, 'include-admin');
  const dryRun = flag(args, 'dry-run') || flag(args, 'dryRun');
  const yes = flag(args, 'yes') || flag(args, 'y');

  const baseCollections = csvList(value(args, 'collections', 'students,fees'));

  const adminCollections = [
    'logs',
    'statistics',
    'firstLoginCodes',
    'passwordResetCodes',
    'passwordResetEmailCodes',
    'emailVerificationCodes',
  ];

  const collections = Array.from(
    new Set([...(Array.isArray(baseCollections) ? baseCollections : []), ...(adminMode ? adminCollections : [])])
  );

  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();

  const projectId =
    admin.app().options.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_CONFIG ||
    '(unknown-project)';

  const specialDocs = adminMode
    ? [
        { col: 'accounts', doc: 'summary' },
        { col: 'counters', doc: 'admissions' },
      ]
    : [];

  console.log('=== Firestore Purge ===');
  console.log('Project:', projectId);
  console.log('Collections:', collections.length ? collections.join(', ') : '(none)');
  if (specialDocs.length) {
    console.log('Special docs:', specialDocs.map((d) => `${d.col}/${d.doc}`).join(', '));
  }
  console.log('Mode:', dryRun ? 'DRY RUN (no deletes)' : 'DELETE');

  if (!collections.length && !specialDocs.length) {
    console.log('Nothing to do.');
    return;
  }

  if (dryRun) {
    for (const c of collections) {
      const count = await getCollectionCount(db, c);
      console.log(`${c}:`, count == null ? '(count unavailable)' : count);
    }
    console.log('Dry run complete.');
    return;
  }

  if (!yes) {
    const typed = await promptConfirm(
      `\nThis will PERMANENTLY delete the listed data from project ${projectId}.\nType DELETE to continue: `
    );
    if (typed !== 'DELETE') {
      console.log('Cancelled.');
      process.exit(1);
    }
  }

  // Delete collections first.
  for (const c of collections) {
    const n = await deleteCollection(db, c, { batchSize: 400 });
    console.log(`✅ ${c}: deleted ${n} docs`);
  }

  // Then delete special docs.
  for (const d of specialDocs) {
    await db.collection(d.col).doc(d.doc).delete();
    console.log(`✅ deleted ${d.col}/${d.doc}`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
