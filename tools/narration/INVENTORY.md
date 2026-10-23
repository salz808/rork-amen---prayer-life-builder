# TRIAD Narration Bake — Phase 1 Inventory (2026-10-22)

Voice: **Helio** (`avocado_v2:MAI_03`, via `/opt/hatch/bin/tts`).
Speeds (Kai's ruling): session surfaces **92**, Selah **75**.
Content truth = the integrated code on `main` (`mocks/content.ts`,
`mocks/freedom.ts`, `mocks/declarations.ts`) — never the markdown docs.

## What the app speaks today, and the bake decision per surface

All session text is a deterministic function of one day's `HtmlDayData`
(`buildPhases`/`buildMovements` in `app/session.tsx`). Scripted field
(`thank`, …) wins when non-null, else the `*Prompt` field is used — in the
partially-guided days the app speaks the prompt text verbatim, and the bake
mirrors that exactly (nothing added, nothing removed).

| # | Surface | Spoken text (exact composition) | Today | Bake |
|---|---------|----------------------------------|-------|------|
| 1 | Session voiceover (Settings toggle; tier ≥ MISSIONS) | settle: `Let's Pray. {focus}` (movement renamed from "Settle", verbiage finding 1.0) · selah movement: `Selah. {silenceTxt}` · other movements: `{kicker}. {sub}. {body}` · closing: never spoken. Narration-layer spoken forms (findings 5.2/5.5) are applied in extract.mjs: SPOKEN_OVERRIDES for blank fields, expandVerseRange() for the Selah verse line | Google TTS (`services/tts.ts`, en-US-Studio-Q @0.92) | **BAKE @92**, wire at `services/tts.ts` boundary, live-Google fallback |
| 2 | Immersive narration (in-session toggle; tier ≥ MISSIONS) | per movement except selah/closing: `{kicker}. {body}` | expo-speech (device voice) | **BAKE @92** (same units family, `narration/`), wire narration effect to baked player, Speech fallback |
| 3 | Night Selah sleep loop (mode=sleep + narration on, Selah movement) | lines in order: `identity`, `verse`, settle body, phase bodies (thank→declare), act body — filtered non-empty; 1.2s gaps, 4s pause, looped over the soundbed (ducked to 0.08 per line) | expo-speech loop | **BAKE @75**: one file per day (lines joined with 1.2s silence + 4s tail), player loops it, soundbed ducked while it plays; Speech loop remains as fallback |
| 4 | Declare "SPEAK" button (session) | `dayData.declare` or fallback `I am a beloved child of God.` | expo-speech | **BAKE @92** per day (`declare-button`), button plays baked file, Speech fallback |
| 5 | Declarations tab speak buttons | `DeclarationItem.text` (bank in `mocks/declarations.ts`) | expo-speech | **BAKE @92** per declaration id, baked player, Speech fallback |
| 6 | Library (LibraryView / Journeys) | — no audio surface exists; entries open sessions or show text | — | **Not baked** (nothing is spoken) |
| 7 | Today's Truth widget / Verse of the Day rotation | displayed only; never spoken by any path (the Selah loop speaks the *day's* verse field, covered in #3) | — | **Not baked** |
| 8 | BLOCKER_OPENERS (Day-1 card), explainers, encouragements, CarryPrayerSection | displayed text only; no code path speaks them | — | **Not baked** |

Notes:
- The two coming-soon tracks (Hearing God, Intercession) have `days: []` —
  nothing to render; their content will bake when it ships, by re-running
  the pipeline (manifest keys are content-derived).
- The legacy Google-TTS on-device cache key (`{activeDay}-{movement.id}`)
  collides across tracks; baked keys are namespaced
  `{track}/d{NN}/{surface}/{unit}` and declarations use the declaration id.
- Hosting: rendered MP3s are staged in the goal's `hidden_files/
  narration-audio/`; the app resolves deterministic public URLs under a
  Supabase Storage bucket `narration` (see `services/narration.ts`).
  Total library ≈ 10+ hours / ~300 MB — far too large to bundle.
