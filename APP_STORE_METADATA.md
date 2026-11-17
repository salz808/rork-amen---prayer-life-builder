# App Store Metadata — TRIAD Prayer (v1.0.0)

**DRAFT — reconcile against live App Store Connect before use.** This file is a paste source only, not the ASC record itself. Do NOT paste over live ASC without re-verifying each field against the live record and reconciling the Description ending sentence (see note below) — the live ASC text for that sentence has not been supplied to this file and must come from the owner's live-ASC eyeball.

> GPT-6 items 15 + 17, 2026-11-16 (docs only; live ASC NOT touched):
> (1) Header changed from "Ready to paste" to the draft warning above.
> (2) Description duration corrected from "about ten minutes" to "about three minutes" — measured Day 1 (lib/sessionDuration.ts: 213 words read aloud ~98s + 60s Selah + transitions ≈ 3 min; corroborated by 75.3s of Day-1 voiceover). Caveat, not hidden: later days run longer as the silence timer grows (2 min days 3–7, up to 5 min days 22–29), so week-3 sessions are ~5–6 minutes. The 3-minute figure is a judgment call from measured code, open to the owner's correction.
> (3) Reviewer Notes corrected to the actual flow: the daily journey works without signing in; guests browse the Wall and Amen after a 13+ attestation; posting a request or testimony requires a verified signed-in identity; anonymous users are prompted for 13+ attestation before their first Wall write; signed-in users have an account-level attestation flow. The old "age gate covers account creation only / does not gate the anonymous path" wording was wrong.
> (4) User-generated-content line corrected: reporting (long-press → Report, with a reason), muting authors, deleting your own posts; there is NO "block a user" feature. The moderator queue now shows every unreviewed report.
> (5) Customer Support label: the old "pre-launch Blocker PL-B1 — declare before submission" wording is REMOVED. The owner's settled decision (2026-11-09, verified live in ASC) stands: Apple offers no "Customer Support" purpose, and App Functionality covers customer support. Adding a Customer Support purpose is an owner ASC-eyeball step, not a blocker and not implemented by this file. The bug-report facts underneath (what is sent, linked user ID) are unchanged and verified against the repo.
> (6) Description-reconciliation note updated: the live ASC ending sentence (full library, all 4 soundscapes, Monastic theme, adjustable playback speed) needs Partner qualifiers — all four are Partner-gated — and the live sentence text itself still needs the owner's live-ASC copy, which this file does not have.

> Audit round 4, lane 5 (G-M5) corrections, 2026-10-25: this file was
> stale on age rating, legal URLs, trial length, journey length, and
> circles. The corrections below align it with the LIVE App Store
> Connect state verified 2026-10-24/25 — but this file is still only a
> paste source, not the ASC record itself: re-verify each field against
> ASC before pasting. Circles stay OUT of this copy until Kai lifts
> Posture C (hidden for launch); do not re-add the PRIVATE CIRCLES
> section without that decision.
>
> Pre-launch lane C (docs only), 2026-10-25: (1) grace-day sentence
> softened — the monthly grace day is dead code (round-3 J-S11), the
> streak is unconditionally forgiving; (2) Customer Support line added
> to Privacy Nutrition Labels (bug_reports); (3) reviewer-notes wording
> corrected — the age gate covers account creation only, the wall
> works via an anonymous session; (4) description-reconciliation note
> added — this file still lacks the live ASC ending sentence, do NOT
> paste over live ASC without reconciling; (5) Support URL updated to
> the now-live https://iammadewhole.com/support (supersedes the old
> 404 note). Live ASC itself was NOT touched — all ASC edits remain a
> parent follow-up.

## Name
TRIAD Prayer

## Subtitle (30 max)
`Daily prayer, never alone`

## Keywords (100 max, no duplicates of name words)
`prayer,daily devotional,prayer journal,prayer wall,devotional,streak,bible,christian,faith,amen`

## Promotional Text (170 max, editable anytime without a new build)
`Never pray alone. Join a gentle community for daily prayer and a journal of answered prayers.`

## Description

Never pray alone.

TRIAD Prayer walks you through a 30-day Foundations journey of daily prayer sessions in three gentle movements: **Adoration** — remembering who God is; **Ask & Receive** — bringing what you're carrying; and **Listen** — a quiet moment to hear Him. Each session takes about three minutes to start — later sessions run a little longer as the quiet time grows.

**A WALL THAT PRAYS WITH YOU**
Share a request on the community prayer wall and watch "amens" arrive in real time — real people stopping to pray for you. Tap to pray for someone else and carry their request into your own session.

**STREAKS BUILT ON GRACE**
Show up daily and your streak grows — but a missed day is met with a warm welcome back, never guilt, because faithfulness isn't a scorecard.

**A JOURNAL OF FAITHFULNESS**
Record what God has already done. Answered prayers are kept as stones of remembrance — dated proof you can return to when faith feels far. Weekly reflection prompts and a simple "how connected do you feel?" check-in help you notice what's shifting.

**SPEAK THE WORD**
A library of scripture-rooted declarations you can read aloud or hear spoken, with favorites saved for the days you need them most.

**MADE FOR QUIET**
A dark, reverent design with warm candlelight tones, optional ambient sound, and an evening reminder that adapts to your schedule.

TRIAD Prayer is free to start. Subscribe to unlock the full journey and premium features. Payment is charged to your Apple ID account; subscriptions renew automatically unless canceled at least 24 hours before the end of the current period. Manage or cancel anytime in your App Store settings.

Terms of Use: https://tearsandoil.com/triadterms
Privacy Policy: https://tearsandoil.com/triadprivacy

> RECONCILIATION NOTE (pre-launch lane C, 2026-10-25; updated 2026-11-16): this Description
> still LACKS the live ASC ending sentence about the full library, all
> 4 soundscapes, the Monastic theme, and adjustable playback speed
> (live baseline ends "…adjustable playback speed, and helps Tears &
> Oil keep building tools that lead people to wholeness."). Do NOT
> paste this file over live ASC — the live sentence is the one to
> reconcile against, and it needs a Partner qualifier check first:
> the full library, all 4 soundscapes, the Monastic theme, and the
> full playback-speed range are Partner-gated (give/index.tsx Partner
> list; paywall/Settings lock sheets), so if the live sentence presents them
> unqualified, free users hit locks. The live sentence's exact wording
> is still not in this file — it needs the owner's live-ASC text,
> supplied from his own ASC eyeball, before any reconcile or paste.
> Duration caveat: the "about three minutes" line above is the
> measured Day-1 session (lib/sessionDuration.ts); later days run
> longer as the silence timer grows (week 3 ≈ 5–6 min). If the owner
> prefers a range or the mid-arc number, change the constant and
> this line together. Reconciling the two texts and
> any ASC edit is a parent follow-up; this note only records the
> divergence.

> URLs match the links already shown on the in-app paywall, Give tab, and Settings sheet (verified in code 2026-10-25). The old iammadewhole.com/privacy + /terms URLs in this file were wrong.

## Reviewer Notes (paste into App Review Information)
- Sign-in is via Apple, Google, or email/password. Demo accounts (email/password sign-in; passwords are on file with App Review and are NOT stored in this repo): mauisalzer+triad-reviewer@gmail.com (active Partner) and mauisalzer+triad-reviewer-expired@gmail.com (expired Partner, for the locked experience).
- Reviewers can also use the app without an account: the daily journey works locally with no sign-in, and guests can browse the Prayer Wall and tap "Amen." Before their first Wall write (an Amen or any other Wall interaction), anonymous users are prompted to confirm they are 13 or older; that attestation is recorded for their anonymous session (device-local map, keyed by the anonymous user ID). Signed-in users go through an account-level 13+ attestation flow at sign-in, recorded server-side via the record_age_attestation RPC. Posting a request or testimony requires a verified signed-in identity — anonymous sessions may Amen but cannot post. The 13+ rating stands on the Wall being a public user-generated-content feed.
- User-generated content (the prayer wall) supports reporting (long-press a request or testimony → Report, then choose a reason: harassment or bullying, personal information, self-harm, threat of harm, spam or scam, inappropriate content, or something else), muting an author (their posts are hidden from your Wall), and deleting your own posts, per Guideline 1.2. There is no "block a user" feature — muting is the hide path. The moderator queue shows every unreviewed report, and the team reviews every report.
- Subscriptions use RevenueCat with a 7-day free trial on the annual plan only (monthly has no trial).

## Privacy Nutrition Labels (declare in App Store Connect)
- **Contact Info** — name (optional display name), email (from Apple/Google sign-in)
- **User Content** — prayer requests, journal entries, reflections (stored in Supabase, encrypted in transit/at rest, deletable via in-app account deletion)
- **User Content — Customer Support** — bug-report form submissions ("Report a problem", build 7): user-written description + app version/build/platform/OS, Linked to You (user_id), App Functionality, dashboard-only triage (no client read path — the client only inserts, `expo/lib/database.ts` `submitBugReport`), deleted on account delete via ON DELETE CASCADE (migration 20261025000016). **SETTLED DECISION — NOT A BLOCKER (2026-11-09, owner-verified live in ASC): Apple offers no "Customer Support" purpose in App Store Connect, and App Functionality covers customer support.** The old "declare this line in ASC before submission — omitting it is pre-launch Blocker PL-B1" wording is withdrawn: there is nothing to declare that ASC does not offer, and nothing in this file authorizes an ASC edit. Whether to add any purpose at all is the owner's ASC-eyeball step at submission time, not a pre-launch blocker. Do NOT strip user_id to dodge a label (the form promises follow-up). Optionally also declare Diagnostics → Other Diagnostic Data (Linked, App Functionality) for the version/OS fields as belt-and-braces, never instead of Customer Support — same owner-eyeball caveat applies.
- **Identifiers** — user ID (Supabase auth); device/purchase identifiers via RevenueCat (subscription infrastructure, not an ad tracker; no IDFA)
- **Purchases** — purchase history (RevenueCat)
- **Usage Data / Diagnostics** — crash reports in a private, rate-limited error table, explicitly unlinked from accounts (user_id NULL)
- **Data NOT collected**: location, contacts, health data, advertising ID, tracking across apps. No third-party ad SDKs.
- **Processors to name in the privacy policy (not label types)**: Supabase (account/content/progress), RevenueCat (subscriptions), Google Text-to-Speech (voiceover synthesis), Google Drive (soundscape audio). Push/notification providers must NOT be named — the app schedules local notifications only and registers no push token.

## Other listing fields
- **Category**: Lifestyle (primary) · Spirituality (secondary)
- **Age rating questionnaire**: 13+ (16+ Australia/Vietnam, A16 Brazil, 15+ Korea) — the prayer wall is a public social feed with user-generated content, moderated per above. The old "4+" in this file was wrong.
- **Copyright**: © 2026 iammadewhole
- **Bundle ID**: com.iammadewhole.triad (note: Android package differs — com.iammadewhole.amen — harmless, but keep consistent if unifying later)
- **Support URL / Marketing URL**: https://iammadewhole.com/support (dedicated Support & Help page, verified live 2026-10-25 — this supersedes the old note that a /support page returned 404; confirm the live ASC Support URL matches before submission)
