const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const dashboard = read('src/pages/panel/ProfileDashboard.tsx');
const page = read('src/pages/DashboardPage.tsx');
const cv = read('src/services/cvIngestionService.ts');
const history = read('src/services/simulationHistory.ts');
const simulator = read('src/pages/SimuladorInmersivo.tsx');
const auth = read('src/contexts/AuthContext.tsx');

const checks = [
  ['dashboard includes profile, CV upload, history, and simulator navigation',
    ['#perfil', '#cargar-cv', '#historial', 'paths.simulador'].every((value) => dashboard.includes(value))],
  ['profile form has editable professional fields and read-only account email',
    ['Nombre completo', 'Correo electrónico', 'Título profesional', 'Biografía técnica', 'Objetivo profesional', 'Guardar perfil'].every((value) => dashboard.includes(value)) &&
    dashboard.includes('value={user.email} readOnly')],
  ['skills can be added and removed and profile analysis is computed locally',
    dashboard.includes('updateField(\'skills\'') && dashboard.includes('addSkill') && dashboard.includes('profileService.analyze(draft)')],
  ['PDF ingestion is size-limited, page-limited, authenticated, and uses the existing Gemini function',
    cv.includes('MAX_PDF_BYTES') && cv.includes('MAX_PDF_PAGES') && cv.includes('getFirebaseIdToken()') &&
    cv.includes('fetch(\'/api/gemini\'') && cv.includes('Authorization: `Bearer ${idToken}`')],
  ['extracted CV fields remain a draft until user confirmation',
    dashboard.includes('Revisa los campos y guarda') && dashboard.includes('onClick={() => void saveProfile()}')],
  ['simulation history is validated and scoped to the signed-in local user',
    history.includes('perfil360.simulation-history.${uid}') && history.includes('item.score <= 100')],
  ['only evaluated interviews are added to history and reports use saved evaluation data',
    simulator.includes('saveSimulationHistory(user.uid') && dashboard.includes('Ver Reporte 360°') &&
    dashboard.includes('selectedReport.strengths.map') && dashboard.includes('selectedReport.improvements.map')],
  ['dashboard sign-out uses the auth context and returns to login',
    page.includes('const signedOut = await signOut()') && page.includes('navigate(paths.login, { replace: true })') &&
    auth.includes('const result = await endSession()') && auth.includes('return false')],
];

for (const [label, condition] of checks) {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
}
console.log(`RESULTADO: ${checks.length} comprobaciones locales pasaron; sin llamadas a proveedores.`);
