/**
 * First-session duration — the number behind "about three minutes a day"
 * (onboarding splash) and the "About 3 minutes · Day X of 30" line on Home.
 *
 * MEASURED, not picked (GPT-6 item 10, 2026-11-16). Day 1 of Foundations
 * ("You Are Already Found") is the first session every new user prays:
 *
 * - 9 movements: settle, Thank, Repent, Invite, Ask, Declare, Selah,
 *   Live It, closing (buildMovements in app/session.tsx).
 * - On-screen text: 213 words total (settle 58, focus 17, thank 20,
 *   repent 16, invite 12, ask 19, declare 11, silence prompt 25, act 16,
 *   identity 7, verse 12 — mocks/content.ts DAYS[0]). The app tells Days
 *   1–7 users to "read each prayer aloud slowly": 213 words at ~130 wpm
 *   ≈ 98 seconds.
 * - The only enforced timer: the Selah silence, 1 minute on Day 1
 *   (dayData.silence, scaledSilence in app/session.tsx; the timer is
 *   manual-start and skippable, so this is the designed path, not a floor).
 * - Corroboration: the re-recorded Helio voiceover for Day 1 totals
 *   75.3s across its 8 spoken units (tools/narration/manifest.json,
 *   foundations/d01/voiceover/*, 0.92 speed). Voiceover defaults OFF for
 *   new users (voiceoverEnabled: false, Partner-gated), so the default
 *   first session is read, not listened — but both paths converge: read
 *   aloud (98s) + full Selah minute (60s) + page turns and closing
 *   (~15s) ≈ 173s; voiceover (75s) + settle read (~27s, the voiceover
 *   speaks only the focus line) + Selah minute + closing ≈ 182s.
 *
 * Both paths land at ~3 minutes. The old "five honest minutes" overstated
 * the first session by ~65%; App Store copy said "about ten minutes"
 * (~3x over — APP_STORE_METADATA.md is aligned separately, not here).
 *
 * JUDGMENT CALL, open to the owner's correction: this number is Day 1.
 * Later days run longer as the silence timer grows (2 min days 3–7,
 * 3 min days 8–14, 4 min days 15–21, 5 min days 22–29 — see
 * mocks/content.ts `silence`), so by week 3 a designed-path session is
 * ~5–6 minutes. If the owner would rather promise the mid-arc number or
 * a range, change this constant — onboarding and Home both read it — and
 * update the test in __tests__/firstSessionDuration.test.ts, which pins
 * the Day 1 measurement band.
 */
export const FIRST_SESSION_MINUTES = 3;
