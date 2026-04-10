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
- Both fixes keep all existing functionality intact — audio caching and session sharing still work the same way
