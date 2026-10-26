const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const markerPattern = /^(?:PEGA_.*|CHANGE_ME|YOUR_.*|<.*>)$/i;

function readEnvFile(filename) {
  const filePath = path.join(root, filename);
  if (!fs.existsSync(filePath)) return null;

  const values = new Map();
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values.set(match[1], value);
  }
  return values;
}

function state(values, name) {
  if (!values) return 'archivo no existe';
  if (!values.has(name)) return 'variable no existe';
  const value = values.get(name);
  if (!value) return 'vacía';
  if (markerPattern.test(value)) return 'marcador pendiente';
  return 'configurada';
}

function isConfigured(values, name) {
  return state(values, name) === 'configurada';
}

function normalizeAvatarId(value) {
  const normalized = value.trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

const frontend = readEnvFile('.env.local');
const backend = readEnvFile('.env');
let failures = 0;

function report(filename, values, name, required = false) {
  const result = state(values, name);
  const okay = !required || isConfigured(values, name);
  if (!okay) failures += 1;
  console.log(`${okay ? 'PASS' : 'PENDIENTE'} ${filename} ${name}: ${result}${required ? ' (requerida)' : ' (opcional)'}`);
}

console.log('Configuración local de HeyGen (no se muestran valores):');
const enabled = frontend?.get('VITE_HEYGEN_ENABLED') === 'true';
if (!enabled) failures += 1;
console.log(`${enabled ? 'PASS' : 'PENDIENTE'} .env.local VITE_HEYGEN_ENABLED: ${enabled ? 'activada' : state(frontend, 'VITE_HEYGEN_ENABLED') === 'configurada' ? 'desactivada' : state(frontend, 'VITE_HEYGEN_ENABLED')} (debe ser true)`);
const ttsEnabled = frontend?.get('VITE_INTERVIEWER_TTS_ENABLED') === 'true';
const ttsStatus = ttsEnabled
  ? 'activada'
  : frontend?.get('VITE_INTERVIEWER_TTS_ENABLED') === undefined
    ? state(frontend, 'VITE_INTERVIEWER_TTS_ENABLED')
    : frontend.get('VITE_INTERVIEWER_TTS_ENABLED').trim()
      ? 'desactivada'
      : 'vacía';
console.log(`INFO .env.local VITE_INTERVIEWER_TTS_ENABLED: ${ttsStatus} (opcional; si se activa requiere GEMINI_API_KEY en backend)`);
report('.env', backend, 'HEYGEN_API_KEY', true);
report('.env', backend, 'HEYGEN_ALLOWED_AVATARS', true);
report('.env', backend, 'HEYGEN_SANDBOX');
report('.env', backend, 'FIREBASE_SERVICE_ACCOUNT', true);
report('.env', backend, 'GEMINI_API_KEY', ttsEnabled);

const allowedRaw = backend?.get('HEYGEN_ALLOWED_AVATARS') ?? '';
const allowedEntries = allowedRaw.split(',').map(normalizeAvatarId);
const allowedListValid = allowedEntries.length > 0 && allowedEntries.every(Boolean);
const allowed = allowedListValid ? allowedEntries : [];
if (isConfigured(backend, 'HEYGEN_ALLOWED_AVATARS') && !allowedListValid) {
  failures += 1;
  console.log('PENDIENTE HEYGEN_ALLOWED_AVATARS: la lista tiene un formato inválido.');
}
const interviewerSourcePath = path.join(root, 'src', 'services', 'ai', 'interviewers.ts');
const interviewerSource = fs.existsSync(interviewerSourcePath)
  ? fs.readFileSync(interviewerSourcePath, 'utf8')
  : '';

for (const interviewer of [
  { id: 'james', label: 'James' },
  { id: 'olivia', label: 'Olivia' },
  { id: 'mateo', label: 'Mateo' },
]) {
  const match = interviewerSource.match(
    new RegExp(`id:\\s*'${interviewer.id}'[\\s\\S]*?liveAvatarId:\\s*'([^']+)'`),
  );
  const configuredId = match ? normalizeAvatarId(match[1]) : null;
  const allowedAvatar = Boolean(configuredId && allowed.includes(configuredId));
  if (!match || !allowedAvatar) failures += 1;
  console.log(`${allowedAvatar ? 'PASS' : 'PENDIENTE'} ${interviewer.label}: ${!match ? 'falta su ID en la configuración tipada' : allowedAvatar ? 'ID incluido en HEYGEN_ALLOWED_AVATARS' : 'añade su ID a HEYGEN_ALLOWED_AVATARS'}.`);
}

const hasExactlyThreeUniqueAvatars =
  allowedListValid &&
  allowed.length === 3 &&
  new Set(allowed).size === 3;
if (!hasExactlyThreeUniqueAvatars) failures += 1;
console.log(`${hasExactlyThreeUniqueAvatars ? 'PASS' : 'PENDIENTE'} HEYGEN_ALLOWED_AVATARS: ${hasExactlyThreeUniqueAvatars ? 'exactamente tres IDs únicos, sin mostrar sus valores' : 'se requieren exactamente tres IDs válidos y únicos'}.`);

console.log('NOTA HEYGEN_SANDBOX solo añade is_sandbox:true a la petición; esta comprobación no confirma elegibilidad ni ausencia de cargos.');
console.log(failures === 0
  ? 'RESULTADO: las variables requeridas están presentes; no se comprobó ninguna conexión.'
  : `RESULTADO: faltan ${failures} requisito(s); no se comprobó ninguna conexión.`);
process.exitCode = failures === 0 ? 0 : 1;
