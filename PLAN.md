# Fix preview crash: invalid FileSystem API & native module import

## What's being fixed

Two issues were found that cause the preview server to fail before your phone can even load the app:

**Features (fixes):**
- [x] Fix an invalid audio download call in the audio manager — `FileSystem.File.downloadFileAsync` doesn't exist; replaced with the correct `File.downloadFileAsync(url, destination)` static method pattern
- [x] Wrap the `react-native-view-shot` import in `session.tsx` with a safe dynamic require and platform guard, since it's a native-only module that can crash the bundler in the preview environment
- [x] Prevent Supabase auth/session lookups from crashing the app when network fetches fail, and fall back cleanly to local state
- [x] Continue with Feature 5 after the fetch failure is resolved
- [x] Continue settings work by wiring the existing settings UI into a routed screen
- [x] Remove light mode and keep a working theme selector in Settings
- [x] Add the original base palette back into the theme selector under a more playful name
- [x] Replace beveled primary buttons with a cleaner, more modern button style
- [x] Remove remaining beveled and embossed treatments still visible across shared components and screens
- [x] Scaffold Supabase Edge Function for Google TTS proxy
- [x] Scaffold Supabase Edge Function for RevenueCat webhook entitlement sync
- [x] Scaffold Supabase Edge Function for account deletion
- [x] Add shared Supabase Edge Function utilities and local function config scaffolding
- [x] Harden web security headers and CSP in Expo web config
- [x] Tighten browser feature permissions and cross-origin isolation headers baseline
- [x] Mirror CSP/security policy in `app/+html.tsx` for static web rendering
- Both fixes keep all existing functionality intact — audio caching and session sharing still work the same way

## Edge Function scaffolding

**New scaffolding:**
- [x] Add `supabase/functions/google-tts-proxy` with request validation, CORS, and Google TTS proxy flow
- [x] Add `supabase/functions/revenuecat-webhook` with webhook auth scaffold, event parsing, and entitlement sync placeholders
- [x] Add `supabase/functions/delete-account` with authenticated user verification and admin deletion flow
- [x] Add shared helpers for CORS, JSON responses, auth, and service-role clients
- [x] Add local `supabase/config.toml` and `.env.example` scaffolding for function secrets
- [x] Lock down client writes to subscription entitlement columns in `journey_stats`
- [x] Strengthen RevenueCat webhook authentication to use configured Authorization header validation only
- [x] Add Google TTS abuse controls with rate limiting, input caps, and voice allowlisting
- [x] Require recent authentication plus explicit confirmation for account deletion
- [x] Reduce sensitive backend error detail leakage in Edge Function responses and logs
