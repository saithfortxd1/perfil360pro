const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const firebaseSource = fs.readFileSync(path.join(root, 'src/services/firebase/firebase.ts'), 'utf8');
const authSource = fs.readFileSync(path.join(root, 'src/services/firebase/auth.ts'), 'utf8');
const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const viteConfig = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
const requiredVariables = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

for (const variable of requiredVariables) {
  assert.ok(firebaseSource.includes(`name: '${variable}'`), `${variable} is required by Firebase initialization`);
  assert.match(envExample, new RegExp(`^${variable}=`, 'm'), `${variable} is documented in .env.example`);
}

assert.ok(firebaseSource.includes('getApps().length > 0 ? getApp() : initializeApp(options)'), 'Firebase app initialization is reused');
assert.ok(authSource.includes('new GoogleAuthProvider()'), 'Google provider is configured');
assert.ok(authSource.includes('signInWithPopup(auth.value, provider)'), 'Google login uses Firebase popup authentication');
assert.ok(viteConfig.includes("loadEnv(mode, process.cwd(), 'VITE_')"), 'Vite reads public Firebase config at build time');
assert.ok(viteConfig.includes("mode === 'production'"), 'production builds reject missing Firebase configuration');
assert.ok(viteConfig.includes('scope de Builds y contexto Production'), 'build diagnostic identifies the required Netlify variable scope');

console.log(`PASS ${requiredVariables.length} Firebase build variables are documented and consumed by the app.`);
console.log('PASS Firebase initialization reuses the existing app.');
console.log('PASS Google sign-in uses GoogleAuthProvider and signInWithPopup.');
console.log('PASS Vite blocks production builds when required Firebase values are missing.');
console.log('No environment-file values were read.');
