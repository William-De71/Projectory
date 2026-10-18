<div align="center">

# 🗂️ Projectory

**Track all your dev projects in one place: GitHub / GitLab / Gitea, CI, versions, bugs reported on forums, roadmap, specs, notes and time spent.**

[![CI](https://github.com/William-De71/projectory/actions/workflows/ci.yml/badge.svg)](https://github.com/William-De71/projectory/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/William-De71/projectory?sort=semver)](https://github.com/William-De71/projectory/releases)

Self-hosted (Docker), single-user, all data in one SQLite file.

[Français](README.md) · **English**

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/dashboard-dark.png">
  <img src="docs/screenshots/dashboard.png" alt="Projectory dashboard: key figures, failing CI, pinned projects, what's new and high-priority tasks">
</picture>


---

## Features

| | |
|---|---|
| **Projects grouped by category** | Freelance, Personal, Organisation (e.g. Gladys), Other — editable categories with colours. Status (idea, active, maintenance, paused, archived), client, tags, links, pinning. |
| **GitHub, GitLab, Gitea / Forgejo** | Each project points to a repository on github.com, gitlab.com or a self-hosted instance (GitLab, Gitea, Forgejo). One token per instance in **Settings → Forges and tokens**. |
| **Bulk repository import** | Lists the repositories of a user, organisation or group (filter, forks, archived) and creates the projects in one go, with category, status and release tracking. Repositories already tracked are skipped. |
| **Repository tracking** | Open issues and PRs / MRs, stars, last activity. **New** ones land in the inbox; a "Track" button adds them to your bugs & tasks. |
| **Create an issue from a bug** | A bug reported on a forum becomes an issue on the repository (title, description, forum link, target version, label). Linked both ways: when the issue is closed, the bug is marked as done. |
| **CI status** | GitHub Actions (latest run of each workflow), GitLab pipelines, Gitea/Forgejo commit statuses (Actions, Woodpecker, Drone) on the default branch: green/red badge, dashboard alert, notification when CI breaks and when it is green again. |
| **Personal GitHub notifications** | Review requests, mentions, assignments, replies on your issues/PRs (e.g. to GladysAssistant/Gladys), attached to the matching tracked project. Requires a classic token with the `notifications` scope. |
| **Versions & changelog** | **Versions** tab per project: milestones (1.2.0, 1.3.0…) with due date, progress, planned and unplanned items. **Publishing** a version generates its Markdown changelog (features / fixes / other) to copy, download or keep as a note, and can directly create the **release on GitHub, GitLab or Gitea / Forgejo** (tag, draft, pre-release) with that changelog as description; full project changelog in one click. |
| **ntfy push notifications** | What's new is pushed to your phone through [ntfy](https://ntfy.sh) (public or self-hosted server, token supported), choice of events, grouped above 3 entries, per-project mute. |
| **Upstream version watch** | Latest release/tag of the repository (any forge), of another GitHub repository, of an npm package or a Docker Hub image, compared with the version *you* use/deploy → "update available" badge and notification. |
| **Bugs reported on forums** | **Discourse** forums (e.g. the [Gladys forum](https://community.gladysassistant.com): category, tag or search) and **RSS/Atom feeds** (keyword filter). One click turns a topic into a tracked bug. |
| **"Today" view** | Pick 3 to 5 bugs or tasks for the day (☀ in the lists, or from the view) and tick them off as you go; unfinished ones carry over to the next day. Alongside: overdue or due today items, GitHub review requests, suggestions (in progress, high priority), failing CI, time spent. |
| **Screenshots and attachments** | Paste (<kbd>Ctrl</kbd>+<kbd>V</kbd>) or drop a screenshot or a file into a bug description, a note or a spec: it is stored in `data/uploads/` and inserted as Markdown (images shown inline, other files linked). 25 MB maximum per file. |
| **Manual bugs & tasks** | Bug / feature / task / question, priority, status, due date, target version, external link. List or Kanban board (drag and drop). |
| **Specifications** | Markdown documents per project with a pre-filled template (context, goals, acceptance criteria…) and draft / in review / approved status. |
| **Notes** | Markdown notes per project or global, "Quick note" button everywhere in the app. |
| **Time tracking** | Quick entry per project, monthly and per-project totals (handy for freelance invoicing). |
| **Inbox** | Everything new since the last sync, read/unread, filters by source and project. |
| **Dashboard** | Key figures, what's new, high priority / upcoming due dates, available updates, recent PRs, sync errors. |
| **Stale issues and PRs** | Issues without a reply for N days, PRs / MRs without activity for N days (adjustable thresholds): flagged on the dashboard and in the repository tab. |
| **Weekly digest** | One ntfy notification a week (day and time of your choice): failing CI, waiting PRs, unanswered issues, high priority items, due dates in the next 14 days, updates, time spent. Preview and send now from the settings. |
| **Statistics** | **Statistics** tab per project over 3, 6 or 12 months: commits, issues and PRs / MRs opened and closed per week, median resolution time, bugs & tasks, time spent — charts or table. |
| **Calendar (ICS)** | Subscription link for Google Calendar, Apple Calendar, Thunderbird…: due dates of bugs & tasks, planned and released versions. Secret link, can be regenerated. |
| **Command palette** | <kbd>Ctrl</kbd>+<kbd>K</kbd> (<kbd>⌘</kbd>+<kbd>K</kbd> on Mac): go to a page or a project, search, create a bug, a note, a spec, sync, switch theme or language. |
| **Installable app (PWA)** | "Install" from Chrome / Edge, or "Add to Home Screen" on iPhone: icon, full screen, shortcuts. |
| **Automatic backups** | Daily copy of the database (without stopping the app), 7 days + 4 weeks rotation, downloadable from the settings. |
| **Global search** | Projects, bugs, specs, notes, repository issues and PRs. |
| **Export** | Full JSON export in one click, or copy the `data/projectory.db` file. |

Light/dark theme, **English or French** user interface (FR / EN switch at the top right; changelogs, notifications and messages follow the chosen language), mobile friendly.

### Screenshots

| | |
|---|---|
| ![Projects by category, with issues, PRs, CI status and versions](docs/screenshots/projects.png) | ![Project page: description, links, repository, CI and versions to update](docs/screenshots/project.png) |
| **Projects** — categories, counters, CI, available updates | **Project page** — repository, CI, used / published versions |
| ![Bugs and tasks of every project on a Kanban board](docs/screenshots/board.png) | ![Inbox: forum topics, failing CI, review request, new versions](docs/screenshots/inbox.png) |
| **Bugs & tasks** — list or Kanban, across all projects | **Inbox** — forums, repositories, CI, versions, personal notifications |
| ![Versions tab: milestones with progress and planned items](docs/screenshots/versions.png) | ![Markdown changelog generated for a version](docs/screenshots/changelog.png) |
| **Versions** — milestones, progress, unplanned items | **Changelog** — generated on publish, to copy or download |

<sub>Screenshots taken with demo data.</sub>

> 💡 The **first** sync of a source records what already exists as read: only what appears afterwards shows up as unread.

---

## Getting started with Docker (recommended)

Images are published on GitHub Container Registry for `amd64` and `arm64` (Raspberry Pi, NAS…):

| Tag | Content |
|---|---|
| `latest` | latest release |
| `1.2.3`, `1.2`, `1` | a specific release / the latest of a version line |
| `dev`, `dev-<sha>` | latest commit on `main` (development images) |

```bash
mkdir projectory && cd projectory
curl -O https://raw.githubusercontent.com/William-De71/projectory/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/William-De71/projectory/main/.env.example   # then edit it
docker compose up -d
```

Open http://localhost:3001. Data lives in `./data/projectory.db`.

- Update: `docker compose pull && docker compose up -d`
- Try the development build: `PROJECTORY_TAG=dev` in `.env`
- Build from source: `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`

### Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | — | GitHub token (accounts entered in **Settings → Forges and tokens** take precedence). Without a token: 60 requests/hour and public repositories only. *Fine-grained*: Metadata, Contents, Pull requests, Actions read + Issues write. For personal notifications: a **classic** token with the `repo` and `notifications` scopes. |
| `GITLAB_TOKEN` | — | Default GitLab token (`api` scope, or `read_api` without issue creation). |
| `GITEA_URL`, `GITEA_TOKEN` | — | Default Gitea / Forgejo instance and its token (repository + issue permissions). |
| `PROJECTORY_TAG` | `latest` | Docker image tag used by `docker-compose.yml`. |
| `SYNC_INTERVAL_MINUTES` | `30` | Automatic sync (0 = only with the 🔄 button). |
| `APP_PASSWORD` | — | Enables HTTP basic authentication (any username). Set it if the app is reachable outside your network. |
| `PROJECTORY_PORT` | `3001` | Port exposed on the host. |
| `NTFY_SERVER`, `NTFY_TOPIC`, `NTFY_TOKEN` | `https://ntfy.sh`, —, — | Notification defaults; usually set in **Settings → Push notifications**. |
| `APP_URL` | — | Projectory's address (e.g. `http://192.168.1.10:3001`), used for links in notifications. |
| `APP_LANG` | `fr` | Default server language (`fr` or `en`) until one is chosen in the UI. |
| `UPLOADS_DIR` | `/data/uploads` | Folder for screenshots and attachments. |
| `BACKUP_DIR` | `/data/backups` | Folder for automatic backups (e.g. a NAS share mounted in the container). |
| `LOG_LEVEL` | `info` | Log level. |

### Backup

Projectory makes a daily copy of the database in `data/backups/` (attachments are copied to `data/backups/uploads/`) (time and retention in **Settings → Automatic backups**, "Back up now" button). To restore: stop the container, replace `data/projectory.db` with the chosen backup (and copy `backups/uploads/` back into `uploads/` if needed), restart. Attachments no longer used anywhere are deleted after 24 h. The JSON export is still available in **Settings → Data and export**.

### Calendar and phone

- **Calendar**: paste the link from **Settings → Calendar (ICS)** into your calendar app ("Subscribe to calendar" / "From URL"). Open Projectory through its network address (not `localhost`) to get a link that works elsewhere. The link works even with `APP_PASSWORD`: it carries its own secret key.
- **Install the app**: PWA installation requires HTTPS (or `localhost`); behind a reverse proxy with a certificate, use "Install Projectory" in the browser.

---

## Quick start with your repositories

1. **Projects → Import repositories**: pick the forge, leave the field empty to list the token owner's repositories (or type a user / organisation), filter (e.g. `gladys-`), tick, choose the category, then **Import**.
2. The first sync starts in the background. It records what already exists as read, so there is no flood of notifications.
3. **Settings → Push notifications**: install the ntfy app on your phone, subscribe to a hard-to-guess topic, enter it here, then send a test.

## Example: following Gladys

In **Projects → New project**:

- **Category**: Organisation — **Client**: Gladys
- **Repository**: GitHub, `GladysAssistant/Gladys`
- **Version in use**: the one installed at home, e.g. `4.45.0`
- **Versions**: "Repository releases" + "Docker Hub image" → `gladysassistant/gladys`
- **Forum**: "Discourse forum", URL `https://community.gladysassistant.com`, then either:
  - empty path → latest topics
  - path `c/<slug>/<id>` → a category (the category URL on the forum, without the domain)
  - path `tag/zigbee` → a tag
  - search `zigbee2mqtt order:latest` → search results

For a non-Discourse forum, use its RSS/Atom feed (Discourse also exposes `…/latest.rss`) with filter keywords: `bug, error, crash`.

---

## Development

Requirements: Node.js ≥ 22.13 (SQLite built into Node, no native dependency).

```bash
# API (port 3001), data in ./data
cd server && npm install && npm run dev

# Front end (port 5173, proxies /api to 3001)
cd web && npm install && npm run dev

# API tests (forges, forums and ntfy are mocked)
cd server && npm test
```

### CI, development images and releases (GitHub Actions)

| Workflow | Trigger | What it does |
|---|---|---|
| **CI** (`ci.yml`) | push to `main`, pull request, manual run | API tests, front-end build, then Docker image. On `main`: publishes `ghcr.io/william-de71/projectory:dev` and `:dev-<sha>` (amd64 + arm64). On PRs: build only, nothing published. Manual run from a branch: publishes `:dev-<branch>`. |
| **Release** (`release.yml`) | **Actions → Release → Run workflow**, choose `patch` / `minor` / `major` | Tests, next version computed from the latest `vX.Y.Z` tag, `package.json` files and `CHANGELOG.md` updated (commits grouped as features / fixes / other), commit + tag on `main`, GitHub release with the notes, images `:X.Y.Z`, `:X.Y`, `:X` and `:latest`. |

For a clean changelog, prefix commits with `feat: …` (feature) or `fix: …` (fix); everything else goes under "other changes".
The release pushes to `main` with the workflow's `GITHUB_TOKEN`: if `main` is protected, allow GitHub Actions to bypass the rule.

### Architecture

```
projectory/
├── server/                 Fastify 5, ESM, node:sqlite
│   ├── src/
│   │   ├── index.js        startup + sync scheduler
│   │   ├── app.js          routes, optional auth, serves the built front end
│   │   ├── db.js           SQLite schema + migrations (PRAGMA user_version)
│   │   ├── routes/         projects, content (items/docs/categories/time), overview (inbox/dashboard/search/export)
│   │   │                   integrations (import, issues, accounts, notifications), milestones (versions, changelog)
│   │   └── sync/           forges/ (github, gitlab, gitea), sources.js (npm/Docker versions, Discourse, RSS), notify.js (ntfy), index.js (orchestration)
│   └── test/
├── web/                    React 19 + Vite + Ant Design 6
│   └── src/{pages,components,api}
├── data/                   volume: projectory.db
├── .github/                CI / Release workflows, scripts/release.mjs
├── Dockerfile              single image: front-end build + API serving it
├── docker-compose.yml      GHCR image
└── docker-compose.build.yml  override to build from source
```

Loosely inspired by [portfolio-manager](https://github.com/AymericLeFeyer/portfolio-manager) (Fastify + React/Ant Design, drawer-based CRUD, docker-compose), but written from scratch.
