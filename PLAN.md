# Connect subscriptions and make the paywall work

**Features**
- [x] Connect the project to RevenueCat so purchases can be managed from one place.
- [x] Set up the existing monthly and annual subscription choices already shown in the app.
- [ ] Configure the Test Store for preview/testing and iOS App Store for launch.
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
- [ ] In RevenueCat/App Store Connect, create or verify these six product IDs in the active offering: triad_support_monthly, triad_support_annual, triad_missions_monthly, triad_missions_annual, triad_partner_monthly, triad_partner_annual.
- [x] I’ll validate the app afterward to confirm the subscription integration compiles cleanly.

**Pre-launch polish**
- [x] Show a 3-day free trial on annual tiers (paywall and giving screens), driven by the live store introductory offer when available.
- [x] One-time “rate us” prompt after Day 7 (activates once the App Store ID is set at publish time).
- [x] Crash and error reporting to a private error_reports table (insert-only, rate-limited).
- [ ] Set a 3-day free trial introductory offer on the three annual products in App Store Connect when creating them.

**Growth features**
- [x] Evening prayer reminder default (8:00 PM), scheduled immediately after onboarding instead of waiting for the first completed day.
- [x] Shareable answered-prayer card: branded image card exported to the system share sheet (text fallback on web).
- [x] App Store first screenshot featuring the community prayer wall (“Never pray alone.”).

**Deepening features**
- [x] Wall ↔ session: carry a community prayer request into the daily “Ask & Receive” phase; carried prayers are remembered on the wall.
- [x] Grace over guilt: warm “Welcome back” card when a streak breaks, on top of the existing monthly grace day.
- [x] Self-measurement: one honest 1–5 “How connected do you feel?” check-in every few days, charted over the journey in the journal.

**Launch-readiness audit**
- [x] Preserve local progress as the source of truth during startup/cloud merging.
- [x] Complete native Google OAuth, preserve deep links, and configure Sign in with Apple.
- [x] Prevent annual selections from purchasing monthly products; map RevenueCat packages by store product ID.
- [x] Remove unverified paywall testimonials/counts and only show trials confirmed by the store.
- [x] Roll back failed Amen actions and preserve failed prayer-wall drafts for retry.
- [x] Protect Daily Prayer and future-day routes at the destination screen.
- [x] Respect ambient mute, restore active session position safely, and confirm journey resets.
- [x] Make account deletion await completion and clear the complete local cache.
- [ ] Apply the new community security migration to production after the Supabase ownership transfer is complete.
- [ ] Set `EXPO_PUBLIC_APP_STORE_ID` after the App Store listing is created.