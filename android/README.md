# Android — Expo-managed, unbuilt (round-3 B-L4)

This directory is a stub: it contains only a launcher icon asset
(`drawable-xxxhdpi/ic_launcher_foreground.png`). There is NO native
Android project here — no manifest, no Gradle files, no native code —
and `expo/eas.json` has no Android build or submit profile (submit →
production → iOS only). All Android configuration lives in
`expo/app.json` (package `com.iammadewhole.amen`, adaptive icon,
`permissions: []`).

Do NOT treat this directory as a prebuild output, and do NOT start an
Android prebuild as part of the iOS launch. If/when Android ships,
either run a real prebuild here or delete this stub and document the
managed-workflow decision instead.
