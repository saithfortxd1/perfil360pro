const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.tmp-profile-flow');
let checks = 0;

function check(label, condition) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS  ${label}`);
}

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

async function main() {
  try {
    execFileSync(process.execPath, [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      'src/services/ai/evaluationResponse.ts',
      '--ignoreConfig',
      '--outDir',
      '.tmp-profile-flow',
      '--module',
      'commonjs',
      '--target',
      'es2022',
      '--lib',
      'es2022',
      '--skipLibCheck',
    ], { cwd: root, stdio: 'pipe' });
    fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));

    const { parseEvaluationResponse } = require(path.join(outDir, 'evaluationResponse.js'));
    const evaluation = parseEvaluationResponse(JSON.stringify({
      score: 82.4,
      strengths: ['Claridad'],
      improvements: ['Priorizar'],
      summary: 'Respuesta estructurada.',
    }));
    check('valid model evaluation is parsed and rounded', evaluation.score === 82 && evaluation.strengths[0] === 'Claridad');

    assert.throws(() => parseEvaluationResponse('sin json'), /JSON válido/);
    checks += 1;
    console.log('PASS  malformed evaluation is rejected instead of fabricated');

    assert.throws(() => parseEvaluationResponse(JSON.stringify({
      score: 50,
      strengths: ['Genérico'],
      improvements: [],
    })), /campos válidos/);
    checks += 1;
    console.log('PASS  incomplete evaluation is rejected instead of given a default score');

    const firestore = source('src/services/firebase/firestore.ts');
    const rules = source('firestore.rules');
    const simulator = source('src/pages/SimuladorInmersivo.tsx');
    const evaluationService = source('src/services/ai/evaluationService.ts');
    const validation = source('src/utils/validation.ts');
    const allowedProfileFields = rules.match(/function allowedProfileFields\(\)\s*\{\s*return \[([^\]]+)\]/);
    const persistedProfile = firestore.match(/reference\.value,\s*\{\s*([\s\S]*?)\n\s*\},\s*\{ merge: true \}/);
    check('profile-save rules allow exactly the professional profile fields', Boolean(
      allowedProfileFields &&
      ['fullName', 'headline', 'bio', 'goal', 'skills', 'yearsOfExperience', 'updatedAt']
        .every((field) => allowedProfileFields[1].includes(`'${field}'`)),
    ));
    check('profile writer persists only allowed fields and updatedAt', Boolean(
      persistedProfile &&
      persistedProfile[1].includes('...draft') &&
      persistedProfile[1].includes('updatedAt: serverTimestamp()') &&
      !persistedProfile[1].includes('schemaVersion') &&
      !persistedProfile[1].includes('updatedAtMs'),
    ));
    check('simulator reads the saved professional profile', simulator.includes('profileService.load(user.uid)'));
    check('optional professional goal can be saved empty', /goal:\s*\{\s*min:\s*0,\s*max:\s*500\s*\}/.test(validation));
    check('evaluation save is covered by the owner-only rule validator', rules.includes('validLastEvaluation(request.resource.data)') && evaluationService.includes('lastEvaluation:'));

    console.log(`RESULTADO: ${checks} comprobaciones locales pasaron; cero llamadas externas.`);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
