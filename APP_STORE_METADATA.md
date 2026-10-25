# App Store Metadata — TRIAD Prayer (v1.0.0)

Ready to paste into App Store Connect (en-US). Character limits verified.

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

TRIAD Prayer walks you through a 30-day Foundations journey of daily prayer sessions in three gentle movements: **Adoration** — remembering who God is; **Ask & Receive** — bringing what you're carrying; and **Listen** — a quiet moment to hear Him. Each session takes about ten minutes, at the pace your day allows.

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

> RECONCILIATION NOTE (pre-launch lane C, 2026-10-25): this Description
> still LACKS the live ASC ending sentence about the full library, all
> 4 soundscapes, the Monastic theme, and adjustable playback speed
> (live baseline ends "…adjustable playback speed, and helps Tears &
> Oil keep building tools that lead people to wholeness."). Do NOT
> paste this file over live ASC — the live sentence is the one to
> reconcile against, and it needs a Partner qualifier check first:
> the full library, all 4 soundscapes, the Monastic theme, and the
> full playback-speed range are Partner-gated (count/range-gated for
> soundscapes and playback), so if the live sentence presents them
> unqualified, free users hit locks. Reconciling the two texts and
> any ASC edit is a parent follow-up; this note only records the
> divergence.

> URLs match the links already shown on the in-app paywall, Give tab, and Settings sheet (verified in code 2026-10-25). The old iammadewhole.com/privacy + /terms URLs in this file were wrong.

## Reviewer Notes (paste into App Review Information)
- Sign-in is via Apple or Google only; there is no email/password demo account.
- Reviewers can also use the app without an account: the daily journey works locally and the prayer wall works via an anonymous session (tapping "Amen" creates one). The 13+ age attestation gate applies at account-creating sign-in (Apple/Google) only; it does not gate the anonymous/local path. No rating change — 13+ stands on the wall content, not on verification.
- User-generated content (the prayer wall) supports reporting (long-press a request → Report), blocking an author, and deleting your own posts, per Guideline 1.2.
- Subscriptions use RevenueCat with a 7-day free trial on the annual plan only (monthly has no trial).

## Privacy Nutrition Labels (declare in App Store Connect)
- **Contact Info** — name (optional display name), email (from Apple/Google sign-in)
- **User Content** — prayer requests, journal entries, reflections (stored in Supabase, encrypted in transit/at rest, deletable via in-app account deletion)
- **User Content — Customer Support** — bug-report form submissions ("Report a problem", build 7): user-written description + app version/build/platform/OS, Linked to You (user_id), App Functionality, dashboard-only triage (no client read path), deleted on account delete via ON DELETE CASCADE. Declare this line in ASC before submission — omitting it is pre-launch Blocker PL-B1; do NOT strip user_id to dodge the label (the form promises follow-up). Optionally also declare Diagnostics → Other Diagnostic Data (Linked, App Functionality) for the version/OS fields as belt-and-braces, never instead of Customer Support.
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
