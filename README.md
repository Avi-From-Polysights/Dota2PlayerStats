# Open Source Dota 2 Player Stats
Made with love by KezualThrower, TheDucktator, Rare (Avi-from-Polysights) and AI. Mostly AI. A little bit of love though.

A static web app that pulls match data from [OpenDota](https://www.opendota.com/) and shows hero matchup stats with Wilson confidence intervals, lane win rates, and win-rate trends over time.

**Live site:** https://avi-from-polysights.github.io/Dota2PlayerStats/

## Features

- **Configurable params** — account ID, hero, match limit, request delay, significant-match filter, Wilson confidence level, rolling window size
- **Enemy hero matchups** — games, wins, losses, win %, Wilson CI, avg duration/K/D (same logic as the original Python script)
- **Lane win %** — win rate broken down by lane assignment (Safe, Mid, Off, Jungle)
- **Win rate over time** — rolling win-rate chart with overall baseline and recent trend indicator
- **CSV export** — download the matchup table
- **All Heroes tab** — cross-hero win/lane rates aggregated from your locally cached matches
- **Hero Builder tab** — skill build (abilities, talents, Attribute Bonus) and item build planner with live computed stats, using OpenDota/dotaconstants hero & item data plus item-popularity stats; builds save locally

Everything runs in the browser. No backend, no API keys. Match history, accounts, and hero builds are cached locally in your browser (IndexedDB) for performance and offline reuse.

## Usage

1. Open the site (or run a local static server in this folder).
2. Enter your Dota 2 **account ID** (from OpenDota or Steam).
3. Search and select a **hero**.
4. Adjust match limit and other options as needed.
5. Click **Analyze matches** and wait while match details are fetched (OpenDota rate limits apply).

## Local development

Any static file server works:

```bash
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Wilson confidence intervals

Win rates use the [Wilson score interval](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval) instead of a naive `wins/games` percentage. This gives a more honest range when sample sizes are small (e.g. 3W–2L on an enemy hero).

## Original script

This project is a browser port of a Python script that fetched Kez matchup data and exported an Excel file. The core matchup aggregation logic is preserved; Excel generation was replaced with an interactive UI and CSV export.

## Home Assistant app

The same parser also ships as a Home Assistant app (add-on) that runs on a
schedule for several accounts at once, with no browser tab open. Add this
repository under **Settings → Add-ons → Add-on Store → ⋮ → Repositories**:

```
https://github.com/Avi-From-Polysights/Dota2PlayerStats
```

Configure one entry per player, optionally an OpenDota API key, and a cron
schedule. Each run writes per-account CSV/JSON exports to
`/share/dota2stats/<account_id>-<name>/` plus combined multi-account files, and
the sidebar UI gives every player their own tab. See
[addon/dota2-stats/DOCS.md](addon/dota2-stats/DOCS.md) for the full option list.

Running it locally, without Home Assistant:

```bash
D2PS_OPTIONS=./dev-options.json D2PS_DATA=./.devdata D2PS_EXPORT_DIR=./.devshare node addon/dota2-stats/app/main.mjs
# then open http://localhost:8099
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) — fork, open a PR, and note that **only the maintainer can approve and merge** pull requests.

## License

MIT — see [LICENSE](LICENSE).
