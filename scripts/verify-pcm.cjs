/**
 * Verificación local del pipeline de audio PCM 24 kHz para LiveAvatar.
 *
 * No realiza ninguna petición de red, no usa credenciales y no consume créditos.
 * Solo comprueba la conversión, la codificación y la fragmentación con audio sintético.
 *
 * Uso: npm run verify:pcm
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.tmp-pcm');

let failures = 0;
function check(label, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` → ${detail}` : ''}`);
}

try {
  // 1) Compilar el módulo puro a CommonJS (sin red, sin dependencias externas).
  //    TypeScript 7 requiere --ignoreConfig al pasar archivos por línea de comandos,
  //    y --lib dom porque el módulo usa AudioBuffer/btoa/atob.
  execFileSync(
    'npx',
    [
      'tsc',
      'src/services/ai/pcmAudio.ts',
      '--ignoreConfig',
      '--outDir',
      '.tmp-pcm',
      '--module',
      'commonjs',
      '--target',
      'es2022',
      '--lib',
      'es2022,dom',
      '--skipLibCheck',
    ],
    { cwd: root, stdio: 'pipe', shell: true },
  );

  // El package.json raíz declara "type": "module"; marcamos el directorio temporal
  // como CommonJS para poder usar require() sin renombrar el archivo compilado.
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));

  const pcm = require(path.join(outDir, 'pcmAudio.js'));

  console.log('--- Formato declarado ---');
  check('frecuencia 24000 Hz', pcm.PCM_SAMPLE_RATE === 24000, String(pcm.PCM_SAMPLE_RATE));
  check('16 bits por muestra', pcm.PCM_BITS_PER_SAMPLE === 16, String(pcm.PCM_BITS_PER_SAMPLE));
  check('mono', pcm.PCM_CHANNELS === 1, String(pcm.PCM_CHANNELS));
  check('2 bytes por muestra', pcm.PCM_BYTES_PER_SAMPLE === 2, String(pcm.PCM_BYTES_PER_SAMPLE));

  console.log('\n--- Conversión Float32 → PCM16 ---');
  const float = new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]);
  const pcm16 = pcm.floatToPcm16(float);
  check('cero → 0', pcm16[0] === 0, String(pcm16[0]));
  check('0.5 → ~16384', Math.abs(pcm16[1] - 16384) <= 1, String(pcm16[1]));
  check('-0.5 → ~-16384', Math.abs(pcm16[2] + 16384) <= 1, String(pcm16[2]));
  check('saturación a +1 → 32767', pcm16[3] === 32767, String(pcm16[3]));
  check('saturación a -1 → -32768', pcm16[4] === -32768, String(pcm16[4]));
  check('valor > 1 se recorta', pcm16[5] === 32767, String(pcm16[5]));
  check('valor < -1 se recorta', pcm16[6] === -32768, String(pcm16[6]));

  console.log('\n--- Little-endian ---');
  const bytes = pcm.pcm16ToBytes(new Int16Array([1, -1]));
  check('muestra 1 → 0x01 0x00 (LE)', bytes[0] === 0x01 && bytes[1] === 0x00, `${bytes[0]},${bytes[1]}`);
  check('muestra -1 → 0xFF 0xFF (LE)', bytes[2] === 0xff && bytes[3] === 0xff, `${bytes[2]},${bytes[3]}`);

  console.log('\n--- Base64 y duración (1000 ms) ---');
  const oneSecond = pcm.generateToneBase64(1000);
  const expectedBytes = 24000 * 2; // 48 000
  const expectedBase64Len = Math.ceil(expectedBytes / 3) * 4; // 64 000
  check('longitud Base64 esperada', oneSecond.length === expectedBase64Len, `${oneSecond.length} vs ${expectedBase64Len}`);
  const validation = pcm.validateBase64Pcm24k(oneSecond);
  check('validación correcta', validation.ok === true, validation.reason ?? '');
  check('duración ≈ 1000 ms', Math.abs(validation.durationMs - 1000) < 1, `${validation.durationMs?.toFixed(2)} ms`);

  console.log('\n--- Round-trip Base64 → bytes → Int16 ---');
  const back = pcm.base64ToBytes(oneSecond);
  check('mismos bytes', back.length === expectedBytes, `${back.length}`);
  const view = new DataView(back.buffer, back.byteOffset, back.byteLength);
  const firstSample = view.getInt16(0, true);
  check('primera muestra legible', Number.isInteger(firstSample), String(firstSample));

  console.log('\n--- Fragmentación (mismo algoritmo que el SDK) ---');
  const twoSeconds = pcm.generateToneBase64(2000); // 128 000 chars
  check('longitud 2000 ms', twoSeconds.length === 128000, String(twoSeconds.length));
  const chunks = pcm.splitPcm24kBase64ToChunks(twoSeconds);
  check('4 fragmentos', chunks.length === 4, String(chunks.length));
  check('1.º = 19 200 chars (400 ms)', chunks[0].length === 19200, String(chunks[0].length));
  check('2.º = 48 000 chars (1 s)', chunks[1].length === 48000, String(chunks[1].length));
  check('3.º = 48 000 chars (1 s)', chunks[2].length === 48000, String(chunks[2].length));
  check('4.º = resto (12 800)', chunks[3].length === 12800, String(chunks[3].length));
  check('la suma reconstruye el audio', chunks.join('') === twoSeconds);

  console.log('\n--- Entradas inválidas ---');
  check('cadena vacía rechazada', pcm.validateBase64Pcm24k('').ok === false);
  check('Base64 inválido rechazado', pcm.validateBase64Pcm24k('no-es-base64!!').ok === false);
  check('bytes impares rechazados', pcm.validateBase64Pcm24k('QQ==').ok === false, '1 byte no es múltiplo de 2');
  check('audio demasiado largo rechazado', pcm.validateBase64Pcm24k(pcm.generateToneBase64(3000), 2000).ok === false);

  console.log('\n--- Fragmentación vacía ---');
  check('sin audio → sin fragmentos', pcm.splitPcm24kBase64ToChunks('').length === 0);

  console.log('\n--- WAV (cabecera) → PCM sin cabecera ---');
  const rawPcm = pcm.floatToPcm16(new Float32Array(pcm.base64ToPcm16 ? [] : []));
  void rawPcm;
  const tonePcm = pcm.base64ToPcm16(pcm.generateToneBase64(500));
  check('tono decodificado a Int16', tonePcm.length === 12000, String(tonePcm.length));

  const wavBase64 = pcm.buildWavFromPcm16Mono(tonePcm, 24000);
  check('WAV generado es más largo que el PCM', wavBase64.length > pcm.pcm16ToBase64(tonePcm).length);

  const wavInfo = pcm.extractWavPcm(wavBase64);
  check('WAV reconocido (RIFF/WAVE)', wavInfo !== null);
  check('frecuencia leída del WAV = 24000', wavInfo && wavInfo.sampleRate === 24000, String(wavInfo && wavInfo.sampleRate));
  check('canales leídos del WAV = 1', wavInfo && wavInfo.channels === 1, String(wavInfo && wavInfo.channels));
  check('bits leídos del WAV = 16', wavInfo && wavInfo.bitsPerSample === 16, String(wavInfo && wavInfo.bitsPerSample));
  check('PCM extraído idéntico al original', wavInfo && wavInfo.pcmBase64 === pcm.pcm16ToBase64(tonePcm));

  console.log('\n--- Normalización a formato LiveAvatar (24 kHz mono 16-bit) ---');
  const normalized = pcm.toLiveAvatarPcm24k(wavBase64);
  check('normalización de WAV correcta', normalized.ok === true, normalized.reason ?? '');
  check('duración preservada (~500 ms)', Math.abs(normalized.durationMs - 500) < 2, `${normalized.durationMs?.toFixed(2)} ms`);
  check('PCM normalizado sin cabecera', normalized.pcmBase64 === pcm.pcm16ToBase64(tonePcm));

  const rawPass = pcm.toLiveAvatarPcm24k(pcm.generateToneBase64(500));
  check('PCM crudo pasa sin cambios', rawPass.ok && rawPass.pcmBase64 === pcm.generateToneBase64(500));

  console.log('\n--- Remuestreo 16 kHz → 24 kHz ---');
  const pcm16k = pcm.floatToPcm16(new Float32Array(16000).fill(0.1));
  const resampled = pcm.resamplePcm16Mono(pcm16k, 16000, 24000);
  check('muestras 16k → 24k proporcional', Math.abs(resampled.length - 24000) <= 1, String(resampled.length));

  console.log('\n--- WAV no soportado ---');
  const stereoLikeHeader = (() => {
    const p = pcm.floatToPcm16(new Float32Array(1000).fill(0.1));
    const w = pcm.buildWavFromPcm16Mono(p, 24000);
    const bytes = pcm.base64ToBytes(w);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint16(22, 2, true); // canales = 2
    view.setUint16(34, 8, true); // bits = 8
    return pcm.bytesToBase64(bytes);
  })();
  const badWav = pcm.toLiveAvatarPcm24k(stereoLikeHeader);
  check('WAV no-16bit/no-mono rechazado', badWav.ok === false, badWav.reason ?? '');

  console.log(`\nRESULTADO: ${failures === 0 ? 'TODAS LAS COMPROBACIONES PASARON' : `${failures} COMPROBACIÓN(ES) FALLARON`}`);
} catch (error) {
  failures += 1;
  console.error('ERROR en la verificación:', error instanceof Error ? error.message : String(error));
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
