/*
  Bootstrap script: set the first admin custom claim.

  Usage:
    1) Download a Firebase service account JSON key (DO NOT COMMIT IT)
    2) Set env var:
         set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\serviceAccountKey.json
    3) Run:
         node tools\setAdminClaim.js <USER_UID>

  This sets: { role: "admin" }
*/

const admin = require('firebase-admin');

async function main() {
  const uid = process.argv[2];
  if (!uid) {
    console.error('Usage: node tools\\setAdminClaim.js <USER_UID>');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp();
  }

  await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
  console.log(`✅ Set role=admin for uid: ${uid}`);
  console.log('Note: user must sign out/in to refresh token claims.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
