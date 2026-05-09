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
- [ ] In RevenueCat/App Store Connect, create or verify these six product IDs in the active offering: triad_support_monthly, triad_support_annual_v2, triad_missions_monthly, triad_missions_annual, triad_partner_monthly, triad_partner_annual.
- [x] I’ll validate the app afterward to confirm the subscription integration compiles cleanly.