# Fix preview crash: invalid FileSystem API & native module import


## What's being fixed

Two issues were found that cause the preview server to fail before your phone can even load the app:

**Features (fixes):**
- Fix an invalid audio download call in the audio manager — `FileSystem.File.downloadFileAsync` doesn't exist; replaced with the correct `file.downloadAsync(url)` pattern
- Wrap the `react-native-view-shot` import in `session.tsx` with a safe dynamic require and platform guard, since it's a native-only module that can crash the bundler in the preview environment
- Both fixes keep all existing functionality intact — audio caching and session sharing still work the same way
