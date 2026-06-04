/*
  Rebuild the admission counter state based on existing students.

  Why this exists:
    If you created/deleted students during testing (especially from Firebase console)
    the counter `counters/admissions.next` can get ahead and you may not reuse
    gaps (e.g. delete HDA0013 but next becomes HDA0014).

  What it does:
    - Scans `students` collection
    - Extracts admission sequences from `admissionSequence` (preferred)
      or parses from `admissionNumber` like HDA0013
    - Sets:
        counters/admissions.next = maxSequence + 1 (or 1 if none)
        counters/admissions.released = all missing sequences from 1..maxSequence

  Prerequisites:
    - Download a Firebase service account JSON key (DO NOT COMMIT IT)
    - Set env var:
        set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\serviceAccountKey.json

  Usage:
    node tools\rebuildAdmissionCounter.js --dry-run
    node tools\rebuildAdmissionCounter.js
    node tools\rebuildAdmissionCounter.js --yes
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

function parseAdmissionSequenceFromAdmissionNumber(admissionNumber) {
  const v = String(admissionNumber || '').trim().toUpperCase();
  const m = v.match(/^HDA0*(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = flag(args, 'dry-run') || flag(args, 'dryRun');
  const yes = flag(args, 'yes') || flag(args, 'y');

  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  const counterRef = db.collection('counters').doc('admissions');

  console.log('=== Rebuild Admission Counter ===');
  console.log('Mode:', dryRun ? 'DRY RUN (no writes)' : 'WRITE');

  const snap = await db.collection('students').get();
  const sequences = new Set();

  for (const d of snap.docs) {
    const data = d.data() || {};
    const seq = Number(data.admissionSequence);
    if (Number.isInteger(seq) && seq > 0) {
      sequences.add(seq);
      continue;
    }

    const parsed = parseAdmissionSequenceFromAdmissionNumber(data.admissionNumber);
    if (parsed) sequences.add(parsed);
  }

  const seqArr = Array.from(sequences).sort((a, b) => a - b);
  const maxSeq = seqArr.length ? seqArr[seqArr.length - 1] : 0;

  const released = [];
  for (let i = 1; i <= maxSeq; i++) {
    if (!sequences.has(i)) released.push(i);
  }

  const next = maxSeq > 0 ? maxSeq + 1 : 1;

  console.log('Students scanned:', snap.size);
  console.log('Max sequence found:', maxSeq);
  console.log('Next will be set to:', next);
  console.log('Released (reusable) count:', released.length);
  console.log('First released:', released.slice(0, 20).join(', ') || '(none)');

  if (dryRun) {
    console.log('Dry run complete.');
    return;
  }

  if (!yes) {
    const typed = await promptConfirm('\nType REBUILD to update counters/admissions: ');
    if (typed !== 'REBUILD') {
      console.log('Cancelled.');
      process.exit(1);
    }
  }

  await counterRef.set(
    {
      next,
      released,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log('✅ Updated counters/admissions');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
