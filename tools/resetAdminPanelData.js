/*
  Reset Admin Panel finance/test data to zero.

  Use this if you already deleted all students, but Accounts/Statistics
  still show old totals.

  What it clears:
    - accounts/summary (deleted)
    - statistics collection (all docs deleted)
    - counters/admissions reset to { next: 1, released: [] }

  Prerequisites:
    - Download a Firebase service account JSON key (DO NOT COMMIT IT)
    - Set env var:
        set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\serviceAccountKey.json

  Usage:
    node tools\resetAdminPanelData.js --dry-run
    node tools\resetAdminPanelData.js
    node tools\resetAdminPanelData.js --yes
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

async function promptConfirm(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(message, resolve));
  rl.close();
  return String(answer || '').trim();
}

async function deleteCollection(db, name, { batchSize = 400 } = {}) {
  const coll = db.collection(name);
  let deleted = 0;
  const orderField = admin.firestore.FieldPath.documentId();

  while (true) {
    const snap = await coll.orderBy(orderField).limit(batchSize).get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();

    deleted += snap.size;
    if (snap.size < batchSize) break;
  }

  return deleted;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = flag(args, 'dry-run') || flag(args, 'dryRun');
  const yes = flag(args, 'yes') || flag(args, 'y');

  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  console.log('=== Reset Admin Panel Data ===');
  console.log('Mode:', dryRun ? 'DRY RUN' : 'WRITE');

  const accountsSnap = await db.collection('accounts').doc('summary').get();
  const statsCountSnap = await db.collection('statistics').count().get().catch(() => null);
  const statsCount = statsCountSnap ? Number(statsCountSnap.data().count || 0) : null;

  console.log('accounts/summary exists:', accountsSnap.exists);
  console.log('statistics docs:', statsCount == null ? '(count unavailable)' : statsCount);

  if (dryRun) {
    console.log('Dry run complete.');
    return;
  }

  if (!yes) {
    const typed = await promptConfirm('\nType RESET to clear accounts/statistics/counter: ');
    if (typed !== 'RESET') {
      console.log('Cancelled.');
      process.exit(1);
    }
  }

  await db.collection('accounts').doc('summary').delete();
  const deletedStats = await deleteCollection(db, 'statistics', { batchSize: 400 });
  await db
    .collection('counters')
    .doc('admissions')
    .set({ next: 1, released: [], updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  console.log('✅ Deleted accounts/summary');
  console.log(`✅ Deleted statistics docs: ${deletedStats}`);
  console.log('✅ Reset counters/admissions to next=1');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
