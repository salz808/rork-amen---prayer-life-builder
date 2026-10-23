#!/usr/bin/env node
/**
 * extract.mjs — derive every spoken unit in TRIAD from the app's own
 * content sources (expo/mocks/*.ts), replicating app/session.tsx's
 * buildPhases / buildMovements / spoken-text composition EXACTLY.
 *
 * Output: tools/narration/units.json — [{ key, surface, track, day,
 * unit, text, speed, provisional }]
 *
 * Foundations Day 10's approved rewrite landed in commit 66c9662 and the
 * 2026-10-22 verbiage pass (findings 1.0–5.5) has been applied on top.
 * Day 10 units stay flagged provisional until Kai's text-freeze ruling
 * releases the bake; render.mjs defers provisional units.
 *
 * Narration-layer spoken forms (verbiage-check Group 5):
 *  - SPOKEN_OVERRIDES below replace a field's text wherever it would be
 *    READ ALOUD, when the on-screen form must not be spoken verbatim
 *    (finding 5.2: Foundations Day 4 thank-you blanks stay on screen;
 *    the narration speaks the proposed spoken form instead).
 *  - expandVerseRange() rewrites ranged citations in the day-verse line
 *    Night Selah reads ("Proverbs 3:5-6" → "Proverbs chapter 3, verses
 *    5 to 6") so TTS doesn't mangle the range (finding 5.5). Screen text
 *    is untouched — this transform exists only in this script.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const EXPO = path.join(REPO_ROOT, 'expo');
const BUILD = path.join(HERE, '.build');
const VOICE = 'avocado_v2:MAI_03';

const SPEED_SESSION = 92;
const SPEED_SELAH = 75;

const pad2 = (n) => String(n).padStart(2, '0');
export const textHash = (text, speed) =>
  createHash('sha256').update(`${VOICE}|${speed}|${text}`).digest('hex');

// ── Compile the content mocks to plain JS ─────────────────────────────
// tsc exits non-zero on type errors but still emits (noEmitOnError:false);
// the emitted JS is what matters, so tolerate the exit code and verify
// the outputs exist below.
try {
  execFileSync(path.join(EXPO, 'node_modules', '.bin', 'tsc'), ['-p', path.join(HERE, 'tsconfig.extract.json')], {
    stdio: 'pipe',
  });
} catch (e) {
  const out = e.stdout?.toString() ?? '';
  const errors = out.split('\n').filter((l) => l.includes('error TS')).slice(0, 5);
  console.warn(`[extract] tsc reported ${out.split('error TS').length - 1} type error(s) (emit continues):`);
  for (const line of errors) console.warn('  ', line.trim());
  if (!existsSync(path.join(BUILD, 'mocks', 'content.js'))) throw e;
}
await writeFile(path.join(BUILD, 'package.json'), JSON.stringify({ type: 'module' }));
const { DAYS } = await import(pathToFileURL(path.join(BUILD, 'mocks', 'content.js')).href);
const { FREEDOM_DAYS } = await import(pathToFileURL(path.join(BUILD, 'mocks', 'freedom.js')).href);
const { DECLARATIONS } = await import(pathToFileURL(path.join(BUILD, 'mocks', 'declarations.js')).href);

// ── Exact replicas of session.tsx composition ─────────────────────────
const PHASE_DEFS = [
  { id: 'thank', name: 'Thank & Praise', sub: "Start with what's true", sc: (d) => d.thank, pr: (d) => d.thankPrompt },
  { id: 'repent', name: 'Repent & Forgive', sub: 'Honesty that brings freedom', sc: (d) => d.repent, pr: (d) => d.repentPrompt },
  { id: 'invite', name: 'Invite Holy Spirit', sub: 'Into your spirit, soul & body', sc: (d) => d.invite, pr: (d) => d.invitePrompt },
  { id: 'ask', name: 'Ask & Receive', sub: 'A loving Father', sc: (d) => d.ask, pr: (d) => d.askPrompt },
  { id: 'declare', name: 'Declare', sub: 'Your identity in Christ', sc: (d) => d.declare, pr: (d) => d.declarePrompt },
];

function buildPhases(d) {
  const phases = [];
  for (const p of PHASE_DEFS) {
    const sc = p.sc(d);
    const pr = p.pr(d);
    if (sc) phases.push({ id: p.id, name: p.name, sub: p.sub, content: sc, isPrompt: false });
    else if (pr) phases.push({ id: p.id, name: p.name, sub: p.sub, content: pr, isPrompt: true });
  }
  return phases;
}

// Finding 5.2 — spoken forms for fields whose screen text contains
// fill-in blanks. Keyed `${track}/${day}/${phaseId}`; applied to the
// phase content before movements are built, so voiceover, immersive
// narration, and Night Selah lines all speak the spoken form.
const SPOKEN_OVERRIDES = {
  'foundations/4/thank': '"Father God, I thank You." Now name three gifts out loud, one by one, and thank Him for each.',
};

// Finding 5.5 — expand a ranged citation at the start of a verse string
// ("Lamentations 3:22–23 — …") into words a TTS engine reads correctly.
function expandVerseRange(verse) {
  return verse.replace(
    /^((?:\d\s)?[A-Za-z]+(?:\s[A-Za-z]+)*)\s(\d+):(\d+)[–-](\d+)/,
    '$1 chapter $2, verses $3 to $4',
  );
}

function buildMovements(d, phases) {
  const movements = [
    { id: 'settle', kicker: "Let's Pray", sub: 'There is no rush. Father God is already here.', body: d.settle, kind: 'settle' },
  ];
  for (const p of phases) {
    movements.push({
      id: p.id,
      kicker: p.name,
      sub: p.sub,
      body: p.content,
      kind: p.id === 'ask' ? 'ask' : p.id === 'declare' ? 'declare' : 'triad',
    });
  }
  movements.push({ id: 'selah', kicker: 'Selah', sub: 'Listen — He responds', body: d.silenceTxt, kind: 'selah' });
  if (d.act) {
    movements.push({ id: 'act', kicker: 'Live It', sub: 'Carry it into your day', body: d.act, kind: 'act' });
  }
  movements.push({ id: 'closing', kicker: 'Closing', sub: 'Go in peace', body: null, kind: 'closing' });
  return movements;
}

// ── Unit derivation ───────────────────────────────────────────────────
const units = [];
const anomalies = [];

function addUnit(u) {
  units.push({ ...u, hash: textHash(u.text, u.speed) });
}

function dayUnits(track, dayNum, d) {
  const provisional = track === 'foundations' && dayNum === 10;
  const base = `${track}/d${pad2(dayNum)}`;
  const phases = buildPhases(d);
  for (const p of phases) {
    const spoken = SPOKEN_OVERRIDES[`${track}/${dayNum}/${p.id}`];
    if (spoken) p.content = spoken;
  }
  const movements = buildMovements(d, phases);

  if (phases.length !== 5) {
    anomalies.push(`${base}: only ${phases.length}/5 phases present (${phases.map((p) => p.id).join(',')})`);
  }

  // 1 · Session voiceover (Google composition today)
  for (const m of movements) {
    let text = '';
    if (m.kind === 'settle') text = "Let's Pray. " + d.focus;
    else if (m.kind === 'selah') text = 'Selah. ' + d.silenceTxt;
    else if (m.body) text = `${m.kicker}. ${m.sub}. ${m.body}`;
    if (!text) continue;
    addUnit({ key: `${base}/voiceover/${m.id}`, surface: 'voiceover', track, day: dayNum, unit: m.id, text, speed: SPEED_SESSION, provisional });
  }

  // 2 · Immersive narration (expo-speech composition today)
  for (const m of movements) {
    if (m.kind === 'selah' || m.kind === 'closing') continue;
    if (!m.body) continue;
    addUnit({ key: `${base}/narration/${m.id}`, surface: 'narration', track, day: dayNum, unit: m.id, text: `${m.kicker}. ${m.body}`, speed: SPEED_SESSION, provisional });
  }

  // 3 · Night Selah sleep-loop lines (assembled per day by render.mjs)
  const lines = [
    d.identity,
    expandVerseRange(d.verse),
    ...movements.filter((m) => m.kind !== 'closing' && m.kind !== 'selah').map((m) => m.body),
  ].filter((line) => typeof line === 'string' && line.trim().length > 0);
  lines.forEach((text, i) => {
    addUnit({ key: `${base}/selah-lines/${i}`, surface: 'selah-line', track, day: dayNum, unit: `line-${i}`, text, speed: SPEED_SELAH, provisional, selahGroup: `${base}/selah`, lineIndex: i });
  });

  // 4 · Declare SPEAK button
  const declareText = d.declare || 'I am a beloved child of God.';
  if (!d.declare) anomalies.push(`${base}: declare field empty — button uses the app fallback line`);
  addUnit({ key: `${base}/declare-button`, surface: 'declare-button', track, day: dayNum, unit: 'declare-button', text: declareText, speed: SPEED_SESSION, provisional });
}

for (const [i, d] of DAYS.entries()) dayUnits('foundations', i + 1, d);
for (const [i, d] of FREEDOM_DAYS.entries()) dayUnits('freedom', i + 1, d);

for (const item of DECLARATIONS) {
  addUnit({ key: `declarations/${item.id}`, surface: 'declaration', track: null, day: null, unit: item.id, text: item.text, speed: SPEED_SESSION, provisional: false });
}

// ── Report + write ────────────────────────────────────────────────────
const bySurface = {};
for (const u of units) bySurface[u.surface] = (bySurface[u.surface] ?? 0) + 1;
const totalChars = units.reduce((s, u) => s + u.text.length, 0);
const underscore = units.filter((u) => u.text.includes('_')).length;
const maxLen = Math.max(...units.map((u) => u.text.length));

await mkdir(HERE, { recursive: true });
await writeFile(path.join(HERE, 'units.json'), JSON.stringify({ voice: VOICE, generatedAt: new Date().toISOString(), units }, null, 2));

console.log(`days: foundations=${DAYS.length} freedom=${FREEDOM_DAYS.length} declarations=${DECLARATIONS.length}`);
console.log('units by surface:', JSON.stringify(bySurface));
console.log(`total units: ${units.length} · total chars: ${totalChars} · max unit chars: ${maxLen} · texts containing '_': ${underscore}`);
console.log(`provisional units (foundations d10): ${units.filter((u) => u.provisional).length}`);
if (anomalies.length) {
  console.log('ANOMALIES:');
  for (const a of anomalies) console.log(' -', a);
} else console.log('anomalies: none');
if (!existsSync(path.join(BUILD, 'mocks', 'content.js'))) throw new Error('compile output missing');
