# Local release-candidate validation

- Node 24.19.0: npm ci --ignore-scripts, JavaScript syntax/CSS brace checks, and
  6 focused offline tests passed.
- The package loaded with its own CSS in a disposable MagicMirror 2.38.0 server
  and headless Chromium. No finished-dashboard stylesheet was used.
- The shared smoke run checked all six extracted modules, actual
  NodeHelper/socket delivery, separate data files for duplicate birthday
  instances, both Upcoming modes, four weather hours and three forecast days,
  and zero page errors.
- Screenshot docs/preview.png contains synthetic data only. Weather and
  scripture APIs were mocked; no private feeds, real provider calls or device
  access occurred.
- Source/docs were scanned for personal names, deployment paths, credentials and
  source-account references. Real local data, cache, Git history and
  dependencies are excluded from the release archive.

The four actual ICS/browser pipeline cases also passed: winter and spring DST,
UTC misconfiguration reproduction, aligned server/display timezone behavior,
exclusive all-day end preservation after MonthlyCalendar mutation, expired-event
exclusion, and immediate plus real minute-timer redraws. The suite lives under
tests/integration.

## Limits

Other MagicMirror versions, physical displays, Electron, Docker startup,
assistive technology and prolonged unattended use remain unverified. Dense
calendar fitting is outside these custom packages. Live provider availability,
current usage quotas and content terms were not verified; see ATTRIBUTION.md
where applicable. At the time of local preparation, no public repository,
announcement, release, production change or device restart was made. Publication does not change the verification limits above.
