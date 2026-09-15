# Connect subscriptions and make the paywall work

**Features**
- [x] Connect the project to RevenueCat so purchases can be managed from one place.
- [x] Set up the existing monthly and annual subscription choices already shown in the app.
- [x] Configure the Test Store for preview/testing and iOS App Store for launch. (Connected via Rork's RevenueCat integration: six Test Store products created with matching prices, attached to the current 'default' offering and the premium entitlement; iOS App Store app linked with all six products verified.)
- [x] Keep the current premium access behavior, so existing locked features unlock after purchase.
- [x] Make Restore Purchases work for returning subscribers.
- [x] Keep the support tiers and savings labels aligned so Support is the smallest annual discount and Partner is the best value.

**Subscription tiers**
- [x] Support Development with monthly and annual options.
- [x] Missions with monthly and annual options.
- [x] Partner with monthly and annual options.
- [x] Each tier will connect to the matching purchase button already visible in the app.

**Design**
- [x] Preserve the current TRIAD Prayer paywall design and wording.
- [x] Use the live store prices when available, with the existing displayed prices as fallbacks.
- [x] Show friendly messages for successful purchase, canceled purchase, failed purchase, and restore.

**Screens**
- [x] The main subscription screen will load real available plans from RevenueCat.
- [x] The giving/support screen will continue to show its existing support options if already configured.
- [x] Premium/locked areas will recognize the active subscription after purchase or restore.

**Setup notes**
- [x] In RevenueCat/App Store Connect, create or verify these six product IDs in the active offering: triad_support_monthly, triad_support_annual, triad_missions_monthly, triad_missions_annual, triad_partner_monthly, triad_partner_annual. (Verified in ASC via API key: all six exist in the 'Triad Prayer Support Plans' group, prices match the paywall fallbacks ($1.99/$19.99, $4.99/$39.99, $9.99/$69.99), metadata repaired, review screenshot uploaded to each — all six READY_TO_SUBMIT with 0 blocking validation errors.)
- [x] I’ll validate the app afterward to confirm the subscription integration compiles cleanly.

**Pre-launch polish**
- [x] Show a 3-day free trial on annual tiers (paywall and giving screens), driven by the live store introductory offer when available.
- [x] One-time “rate us” prompt after Day 7 (activates once the App Store ID is set at publish time).
- [x] Crash and error reporting to a private error_reports table (insert-only, rate-limited).
- [x] Set a 3-day free trial introductory offer on the three annual products in App Store Connect when creating them. (FREE_TRIAL THREE_DAYS offers created on all three annual products via the ASC API.)

**Growth features**
- [x] Evening prayer reminder default (8:00 PM), scheduled immediately after onboarding instead of waiting for the first completed day.
- [x] Shareable answered-prayer card: branded image card exported to the system share sheet (text fallback on web).
- [x] App Store first screenshot featuring the community prayer wall (“Never pray alone.”).

**Deepening features**
- [x] Wall ↔ session: carry a community prayer request into the daily “Ask & Receive” phase; carried prayers are remembered on the wall.
- [x] Grace over guilt: warm “Welcome back” card when a streak breaks, on top of the existing monthly grace day.
- [x] Self-measurement: one honest 1–5 “How connected do you feel?” check-in every few days, charted over the journey in the journal.

**Prayer circles & profile**
- [x] Private prayer circles: create, join by 6-character invite code, leave, and owner-delete (Supabase migration with member-only RLS and SECURITY DEFINER RPCs).
- [x] Shareable invite links: `amen-app://circle/join/<code>` deep link opens an invite landing screen with circle preview and one-tap join; share-sheet message includes the link plus a manual code fallback.
- [x] Wall scope switcher: switch the prayer wall between Everyone and private circles; requests can be posted to the public wall or a chosen circle, and circle posts never appear publicly.
- [x] Profile screen: prayer statistics (days, streaks, time in prayer, answered prayers, amens given), editable display name synced to the cloud profile, and linked Apple/Google account management with safe unlinking.
- [x] Free tier: 1 circle of up to 15 members; subscribers: 5 circles of up to 50 (hard DB caps at 10 circles / 50 members).
- [x] Apply the prayer-circles migration to production Supabase once the ownership transfer is complete. (Applied via Management API after restoring the paused project; fixed an index-before-column ordering bug in the migration file.)

**Launch-readiness audit**
- [x] Preserve local progress as the source of truth during startup/cloud merging.
- [x] Complete native Google OAuth, preserve deep links, and configure Sign in with Apple.
- [x] Prevent annual selections from purchasing monthly products; map RevenueCat packages by store product ID.
- [x] Remove unverified paywall testimonials/counts and only show trials confirmed by the store.
- [x] Roll back failed Amen actions and preserve failed prayer-wall drafts for retry.
- [x] Prayer wall moderation: report a request, hide an author's requests, and delete your own (App Store UGC Guideline 1.2).
- [x] Identity fix: guest amens are owned by an on-demand anonymous account, and Apple/Google sign-in links the identity to that account (upgrade in place) instead of creating a new user and orphaning wall activity.
- [x] Enable anonymous sign-ins in the Supabase dashboard (Authentication → Providers → Anonymous) so guest amen activity gets a persistent owner. (Enabled via Management API — `external_anonymous_users_enabled: true`.)
- [x] Protect Daily Prayer and future-day routes at the destination screen.
- [x] Respect ambient mute, restore active session position safely, and confirm journey resets.
- [x] Make account deletion await completion and clear the complete local cache.
- [x] Apply the community security, prayer circles, and wall moderation migrations to production after the Supabase ownership transfer is complete. (All verified live: tables, circle RPCs, public wall API; leftover E2E test echo removed.)
- [x] Set `EXPO_PUBLIC_APP_STORE_ID` after the App Store listing is created. (Set to 6767898619 in expo/.env — activates the one-time rate-us prompt after Day 7.)