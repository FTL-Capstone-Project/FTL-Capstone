# components/ — SHARED UI only

Components used by **more than one feature** live here. Anything specific to a single feature lives
in that feature's folder instead (`features/<name>/`).

| File | What it is | Used by |
|---|---|---|
| `AppShell.jsx` | Sidebar + top bar; wraps every signed-in page | all |
| `OrboAvatar.jsx` | The Orbo mascot (size variants) | check-link, home |
| `StatusBadge.jsx` | Verdict badge — icon + word + color (never color alone) | check-link, reports |
| `NotificationBell.jsx` | Bell + unread count in the top bar | app shell |
