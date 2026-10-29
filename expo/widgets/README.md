# Today's Truth widget — signing shape

Display-only iOS widget (`TodayTruth`, systemSmall + systemMedium),
built by the `expo-widgets` plugin at prebuild. There is no native
widget target checked into this repo and no Android widget. The
plugin generates the `ExpoWidgetsTarget` extension, its
entitlements, and the EAS `appExtensions` entry at prebuild time —
none of that is committed, so do not hand-edit generated output.

## Pinned App Group

`expo/app.json` pins the plugin's `groupIdentifier` explicitly to
`group.com.iammadewhole.triad` (top-level `expo-widgets` plugin prop,
sibling of `widgets`), and `ios.appleTeamId` is set there too. Do not
remove the pin: the plugin's implicit fallback (`group.` + main
bundle ID) produces the same string today, but the pin keeps
prebuild entitlements deterministic for both targets.

## Local signing needs per-target profiles (documentation only)

Local (`credentialsSource: local`) signing of a build with the
widget needs TWO provisioning profiles in `expo/credentials.json`,
sharing the single distribution certificate:

- main app target — bundle ID `com.iammadewhole.triad`
- widget target `ExpoWidgetsTarget` — bundle ID
  `com.iammadewhole.triad.ExpoWidgetsTarget`

Mirror rule: BOTH profiles must carry the App Group
`group.com.iammadewhole.triad`. If either side lacks it, shared
data silently fails and the widget falls back to bundled data,
looking fine while broken. A profile that comes back with an empty
application-groups list is the known failure mode here — Apple's
public API cannot assign an app-group container, so the group must
be checked on both App IDs and both profiles regenerated in the
Apple Developer portal (a browser/portal step, not a repo step).

No certificate, profile path, password, or profile UUID is recorded
in this repo on purpose — this note documents the SHAPE only.
