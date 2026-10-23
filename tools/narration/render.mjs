#!/usr/bin/env node
/**
 * render.mjs — resumable Helio narration renderer.
 *
 * Reads units.json (from extract.mjs), renders each unit with
 * /opt/hatch/bin/tts (voice avocado_v2:MAI_03 — asserted on EVERY file;
 * a substituted voice fails the unit, never silently passes), assembles
 * per-day Selah loop files with ffmpeg (1.2s between lines, 4s tail),
 * and maintains manifest.json (unit key → file, text hash, duration,
 * bytes). Units whose text hash is unchanged and whose file exists are
 * skipped, so re-runs only re-render what changed.
 *
 * Usage:
 *   node render.mjs --pilot        Foundations Day 1 only
 *   node render.mjs --all          everything except provisional units
 *   node render.mjs --keys foundations/d03,declarations/identity-1
 * Options: --concurrency N (default 4) · --include-provisional
 *
 * Audio is staged in the goal's hidden_files/narration-audio/ tree,
 * keyed by unit path (<key>.mp3).
 */
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const STAGING = '/home/hatch/workspace/goals/triad-prayer-app-app-store-launch-readiness/hidden_files/narration-audio';
const MANIFEST_PATH = path.join(HERE, 'manifest.json');
const TTS = '/opt/hatch/bin/tts';
const VOICE = 'avocado_v2:MAI_03';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const PILOT = args.includes('--pilot');
const INCLUDE_PROVISIONAL = args.includes('--include-provisional');
const CONCURRENCY = parseInt(opt('--concurrency', '4'), 10);
const KEYS = opt('--keys', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const unitsDoc = JSON.parse(await readFile(path.join(HERE, 'units.json'), 'utf8'));
let units = unitsDoc.units;
if (PILOT) units = units.filter((u) => u.track === 'foundations' && u.day === 1);
if (KEYS.length) units = units.filter((u) => KEYS.some((k) => u.key === k || u.key.startsWith(k + '/') || u.key.startsWith(k)));
const deferred = units.filter((u) => u.provisional && !INCLUDE_PROVISIONAL);
units = units.filter((u) => !u.provisional || INCLUDE_PROVISIONAL);

let manifest = { voice: VOICE, generatedAt: null, units: {}, selahGroups: {}, deferred: [] };
if (existsSync(MANIFEST_PATH)) manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
manifest.units ??= {};
manifest.selahGroups ??= {};

const logLine = async (obj) => {
  await appendFile(path.join(STAGING, 'render.log'), JSON.stringify({ t: new Date().toISOString(), ...obj }) + '\n').catch(() => {});
};

async function probeDuration(file) {
  const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file]);
  return parseFloat(JSON.parse(stdout).format.duration);
}

async function renderOne(unit) {
  const rel = `${unit.key}.mp3`;
  const out = path.join(STAGING, rel);
  const existing = manifest.units[unit.key];
  if (existing && existing.hash === unit.hash && existsSync(out)) {
    return { key: unit.key, status: 'skip' };
  }
  await mkdir(path.dirname(out), { recursive: true });
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { stdout } = await execFileP(TTS, ['speak', '--voice', VOICE, '--speed', String(unit.speed), '--output', out, '--text-stdin'], {
        input: unit.text,
        timeout: 180000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const res = JSON.parse(stdout.trim().split('\n').at(-1));
      if (!res.ok) throw new Error(`tts not ok: ${stdout.slice(0, 200)}`);
      if (res.voice !== VOICE) throw new Error(`VOICE SUBSTITUTION: requested ${VOICE}, got ${res.voice}`);
      const [durationSec, st] = await Promise.all([probeDuration(out), stat(out)]);
      manifest.units[unit.key] = {
        file: rel,
        hash: unit.hash,
        speed: unit.speed,
        voice: res.voice,
        durationSec: Math.round(durationSec * 10) / 10,
        bytes: st.size,
        provisional: unit.provisional || undefined,
      };
      await logLine({ key: unit.key, status: 'rendered', attempt, durationSec: manifest.units[unit.key].durationSec });
      return { key: unit.key, status: 'rendered' };
    } catch (e) {
      lastErr = e;
      const detail = [e.message, e.stderr?.toString(), e.stdout?.toString()].filter(Boolean).join(' | ');
      await logLine({ key: unit.key, status: 'attempt-failed', attempt, error: detail.slice(0, 600) });
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt === 1 ? 5000 : 20000));
    }
  }
  return { key: unit.key, status: 'FAILED', error: String(lastErr?.message ?? lastErr).slice(0, 300) };
}

async function ensureSilence(seconds, name) {
  const dir = path.join(STAGING, '_silence');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  if (!existsSync(file)) {
    await execFileP('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(seconds), '-c:a', 'libmp3lame', '-b:a', '64k', file]);
  }
  return file;
}

async function assembleSelah(groupKey, lineUnits) {
  const linesReady = lineUnits.every((u) => manifest.units[u.key] && manifest.units[u.key].hash === u.hash);
  const rel = `${groupKey}.mp3`;
  const out = path.join(STAGING, rel);
  const groupHash = createHash('sha256').update(lineUnits.map((u) => u.hash).join('|')).digest('hex');
  const existing = manifest.selahGroups[groupKey];
  if (!linesReady) return { key: groupKey, status: 'waiting-on-lines' };
  if (existing && existing.hash === groupHash && existsSync(out)) return { key: groupKey, status: 'skip' };
  const sil12 = await ensureSilence(1.2, 'gap-1.2.mp3');
  const sil40 = await ensureSilence(4.0, 'tail-4.0.mp3');
  const parts = [];
  lineUnits.forEach((u, i) => {
    parts.push(path.join(STAGING, `${u.key}.mp3`));
    parts.push(i < lineUnits.length - 1 ? sil12 : sil40);
  });
  const listFile = path.join(STAGING, '_silence', `concat-${groupKey.replace(/\//g, '_')}.txt`);
  await writeFile(listFile, parts.map((p) => `file '${p}'`).join('\n'));
  await execFileP('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'libmp3lame', '-b:a', '64k', '-ar', '24000', '-ac', '1', out]);
  const [durationSec, st] = await Promise.all([probeDuration(out), stat(out)]);
  manifest.selahGroups[groupKey] = {
    file: rel,
    hash: groupHash,
    lines: lineUnits.length,
    durationSec: Math.round(durationSec * 10) / 10,
    bytes: st.size,
  };
  await logLine({ key: groupKey, status: 'assembled', durationSec: manifest.selahGroups[groupKey].durationSec });
  return { key: groupKey, status: 'assembled' };
}

// ── run ───────────────────────────────────────────────────────────────
await mkdir(STAGING, { recursive: true });
const started = Date.now();
const results = [];
let cursor = 0;
async function worker() {
  while (cursor < units.length) {
    const unit = units[cursor++];
    results.push(await renderOne(unit));
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Selah assembly for every group touched by this run's unit set
const groups = new Map();
for (const u of unitsDoc.units) {
  if (u.surface !== 'selah-line') continue;
  if (u.provisional && !INCLUDE_PROVISIONAL) continue;
  if (PILOT && !(u.track === 'foundations' && u.day === 1)) continue;
  if (KEYS.length && !units.some((x) => x.selahGroup === u.selahGroup)) continue;
  if (!groups.has(u.selahGroup)) groups.set(u.selahGroup, []);
  groups.get(u.selahGroup).push(u);
}
const groupResults = [];
for (const [gk, lineUnits] of [...groups.entries()].sort()) {
  lineUnits.sort((a, b) => a.lineIndex - b.lineIndex);
  groupResults.push(await assembleSelah(gk, lineUnits));
}

manifest.generatedAt = new Date().toISOString();
manifest.deferred = unitsDoc.units
  .filter((u) => u.provisional)
  .map((u) => ({ key: u.key, reason: 'Foundations Day 10 text provisional — owner revision in flight (2026-10-22); re-render when final text lands' }));
const tmp = MANIFEST_PATH + '.tmp';
await writeFile(tmp, JSON.stringify(manifest, null, 2));
await rename(tmp, MANIFEST_PATH);
await copyFile(MANIFEST_PATH, path.join(STAGING, 'manifest.json')).catch(() => {});

const count = (arr, s) => arr.filter((r) => r.status === s).length;
const failures = results.filter((r) => r.status === 'FAILED');
const allUnits = Object.values(manifest.units);
const allGroups = Object.values(manifest.selahGroups);
console.log(`units: rendered=${count(results, 'rendered')} skipped=${count(results, 'skip')} FAILED=${failures.length} · selah groups: assembled=${count(groupResults, 'assembled')} skipped=${count(groupResults, 'skip')} waiting=${count(groupResults, 'waiting-on-lines')}`);
console.log(`deferred (provisional, not rendered): ${deferred.length} units`);
console.log(`manifest totals: ${allUnits.length} unit files (${(allUnits.reduce((s, u) => s + u.durationSec, 0) / 60).toFixed(1)} min, ${(allUnits.reduce((s, u) => s + u.bytes, 0) / 1048576).toFixed(1)} MB) · ${allGroups.length} selah files (${(allGroups.reduce((s, g) => s + g.durationSec, 0) / 60).toFixed(1)} min, ${(allGroups.reduce((s, g) => s + g.bytes, 0) / 1048576).toFixed(1)} MB)`);
console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(0)}s`);
if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures) console.log(' -', f.key, '::', f.error);
  process.exit(1);
}
