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
      'src/services/ai/scenarioParser.ts',
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

    const { parseScenariosResponse } = require(path.join(outDir, 'scenarioParser.js'));

    // Test 1: pure JSON
    const pureJson = JSON.stringify({
      scenarios: [
        { id: 'sc_1', title: 'Entrevista técnica', description: 'Preguntas de arquitectura', difficulty: 'dificil' },
        { id: 'sc_2', title: 'Cultura y fit', description: 'Trabajo en equipo', difficulty: 'medio' },
      ],
    });
    const parsedPure = parseScenariosResponse(pureJson);
    check('scenario parser extracts pure JSON', parsedPure.length === 2 && parsedPure[0].id === 'sc_1');

    // Test 2: markdown fenced JSON with ```json
    const markdownFencedJson = `Aquí tienes los escenarios sugeridos:
\`\`\`json
{
  "scenarios": [
    {
      "id": "scenario_1",
      "title": "Liderazgo de equipo",
      "description": "Resolución de conflictos en el equipo",
      "difficulty": "medio"
    }
  ]
}
\`\`\`
¡Éxitos en tu preparación!`;
    const parsedMarkdown = parseScenariosResponse(markdownFencedJson);
    check('scenario parser extracts JSON enclosed in markdown code fences', parsedMarkdown.length === 1 && parsedMarkdown[0].title === 'Liderazgo de equipo');

    // Test 3: markdown fenced JSON without json language tag (``` ... ```)
    const plainFencedJson = `\`\`\`
{
  "scenarios": [
    {
      "id": "s_a",
      "title": "Caso de negocio",
      "description": "Análisis de mercado",
      "difficulty": "facil"
    }
  ]
}
\`\`\``;
    const parsedPlainFenced = parseScenariosResponse(plainFencedJson);
    check('scenario parser extracts JSON from plain markdown code fences', parsedPlainFenced.length === 1 && parsedPlainFenced[0].difficulty === 'facil');

    // Test 4: Real response observed: Difficulty: medio. Title: Backend Developer & AI
    const realObserved1 = `\`\`\`json
{
  "scenarios": [
    {
      "id": "scenario_1",
      "title": "Backend Developer & AI",
      "description": "Desarrollo de microservicios con modelos generativos",
      "difficulty": "medio"
    }
  ]
}
\`\`\``;
    const parsedReal1 = parseScenariosResponse(realObserved1);
    check('scenario parser handles real observed "Backend Developer & AI" scenario',
      parsedReal1.length === 1 &&
      parsedReal1[0].title === 'Backend Developer & AI' &&
      parsedReal1[0].difficulty === 'medio');

    // Test 5: Real response observed: Scenario 3: AI App Developer / Fullstack Entry-Level
    const realObserved2 = `\`\`\`json
{
  "scenarios": [
    {
      "id": "scenario_3",
      "title": "AI App Developer / Fullstack Entry-Level",
      "description": "Integración frontend y backend de APIs de IA para usuarios finales",
      "difficulty": "facil"
    }
  ]
}
\`\`\``;
    const parsedReal2 = parseScenariosResponse(realObserved2);
    check('scenario parser handles real observed "AI App Developer / Fullstack Entry-Level" scenario',
      parsedReal2.length === 1 &&
      parsedReal2[0].title === 'AI App Developer / Fullstack Entry-Level' &&
      parsedReal2[0].id === 'scenario_3');

    // Test 6: Truncated JSON inside markdown block returns controlled error
    const truncatedMarkdownJson = `\`\`\`json
{
  "scenarios": [
    {
      "id": "scenario_1",
      "title": "Incompleto",
      "description": "Corte de stream`;
    assert.throws(
      () => parseScenariosResponse(truncatedMarkdownJson),
      /No se encontró JSON válido en la respuesta del generador de escenarios/,
    );
    checks += 1;
    console.log('PASS  scenario parser rejects truncated JSON inside markdown code fence');

    // Test 7: Valid JSON with introductory and trailing conversational text
    const textWithSurroundings = `¡Hola! Aquí preparé 2 escenarios a medida para tu perfil profesional:

{
  "scenarios": [
    {
      "id": "scen_1",
      "title": "Entrevista de arquitectura",
      "description": "Escalabilidad en la nube",
      "difficulty": "medio"
    }
  ]
}

Espero que te sean de utilidad para practicar.`;
    const parsedSurroundings = parseScenariosResponse(textWithSurroundings);
    check('scenario parser extracts valid JSON with introductory and trailing conversational text',
      parsedSurroundings.length === 1 && parsedSurroundings[0].title === 'Entrevista de arquitectura');

    // Test 8: Accents in difficulty ("fácil", "medio", "difícil") normalized to "facil", "medio", "dificil"
    const accentedDifficulties = JSON.stringify({
      scenarios: [
        { id: '1', title: 'A', description: 'Desc A', difficulty: 'FÁCIL' },
        { id: '2', title: 'B', description: 'Desc B', difficulty: 'medio' },
        { id: '3', title: 'C', description: 'Desc C', difficulty: 'difícil' },
      ],
    });
    const parsedAccents = parseScenariosResponse(accentedDifficulties);
    check('scenario parser normalizes accented difficulties (fácil, difícil) to canonical values',
      parsedAccents[0].difficulty === 'facil' &&
      parsedAccents[1].difficulty === 'medio' &&
      parsedAccents[2].difficulty === 'dificil');

    // Test 9: Duplicate IDs are re-assigned uniquely without fabricating content
    const duplicateIds = JSON.stringify({
      scenarios: [
        { id: 'scenario_1', title: 'Primer caso', description: 'Desc 1', difficulty: 'medio' },
        { id: 'scenario_1', title: 'Segundo caso', description: 'Desc 2', difficulty: 'medio' },
      ],
    });
    const parsedDuplicates = parseScenariosResponse(duplicateIds);
    const uniqueIds = new Set(parsedDuplicates.map((s) => s.id));
    check('scenario parser ensures unique identifiers when duplicates are present',
      parsedDuplicates.length === 2 && uniqueIds.size === 2 && parsedDuplicates[0].id !== parsedDuplicates[1].id);

    // Test 10: Partially invalid scenario items (e.g. missing title/description) are rejected strictly
    const partiallyInvalid = JSON.stringify({
      scenarios: [
        { id: '1', title: 'Válido', description: 'Desc válida', difficulty: 'medio' },
        { id: '2', title: '', description: 'Sin título', difficulty: 'facil' },
      ],
    });
    assert.throws(
      () => parseScenariosResponse(partiallyInvalid),
      /El escenario en la posición 2 no tiene un título válido/,
    );
    checks += 1;
    console.log('PASS  scenario parser strictly rejects responses with partially invalid items instead of silent acceptance');

    // Test 11: Non-JSON response returns controlled helpful error
    assert.throws(
      () => parseScenariosResponse('Lo siento, no pude procesar los datos.'),
      /No se encontró JSON válido en la respuesta del generador de escenarios/,
    );
    checks += 1;
    console.log('PASS  scenario parser throws controlled error when no valid JSON is found');

    // Test 12: Response missing 'scenarios' array returns controlled error
    assert.throws(
      () => parseScenariosResponse(JSON.stringify({ status: 'ok', data: [] })),
      /La respuesta no incluye la lista de escenarios requerida/,
    );
    checks += 1;
    console.log('PASS  scenario parser throws controlled error when scenarios array is missing');

    // Test 13: Response with non-object format returns controlled error
    assert.throws(
      () => parseScenariosResponse(JSON.stringify(["scenario_1", "scenario_2"])),
      /La respuesta del generador de escenarios tiene un formato no válido/,
    );
    checks += 1;
    console.log('PASS  scenario parser throws controlled error when root is not an object');

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
      ['fullName', 'headline', 'bio', 'goal', 'education', 'skills', 'yearsOfExperience', 'updatedAt']
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

    // --- Verificaciones de Respaldo y Flujo de Escenarios en GeminiService ---
    const geminiServiceCode = source('src/services/ai/geminiService.ts');
    check('geminiService uses parseScenariosResponse as sole scenario parser',
      geminiServiceCode.includes('parseScenariosResponse(result.value)') &&
      !geminiServiceCode.includes('retryResult') &&
      !geminiServiceCode.includes('function parseScenarios('));

    check('geminiService includes profile details in prompt',
      geminiServiceCode.includes('userProfile.skills?.join') &&
      geminiServiceCode.includes('userProfile.yearsOfExperience') &&
      geminiServiceCode.includes('userProfile.headline') &&
      geminiServiceCode.includes('userProfile.bio') &&
      geminiServiceCode.includes('userProfile.education'));

    check('geminiService uses local scenarios for malformed responses without retrying or hiding auth errors',
      geminiServiceCode.includes('getFallbackScenarios(firstCode') &&
      geminiServiceCode.includes('isFallback: true') &&
      geminiServiceCode.includes("firstCode === 'UNAUTHENTICATED' || firstCode === 'PERMISSION_DENIED'") &&
      !geminiServiceCode.includes('generateContent(buildPrompt(true)'));

    check('SimuladorInmersivo marks fallback scenarios distinct from AI-generated ones',
      simulator.includes('scenario.isFallback') &&
      simulator.includes('Predefinido') &&
      simulator.includes('Personalizado'));

    console.log(`RESULTADO: ${checks} comprobaciones locales pasaron; cero llamadas externas.`);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
