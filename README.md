# Dota 2 Player Stats

A static web app that pulls match data from [OpenDota](https://www.opendota.com/) and shows hero matchup stats with Wilson confidence intervals, lane win rates, and win-rate trends over time.

**Live site:** https://avi-from-polysights.github.io/Dota2PlayerStats/

## Features

- **Configurable params** — account ID, hero, match limit, request delay, significant-match filter, Wilson confidence level, rolling window size
- **Enemy hero matchups** — games, wins, losses, win %, Wilson CI, avg duration/K/D (same logic as the original Python script)
- **Lane win %** — win rate broken down by lane assignment (Safe, Mid, Off, Jungle)
- **Win rate over time** — rolling win-rate chart with overall baseline and recent trend indicator
- **CSV export** — download the matchup table

Everything runs in the browser. No backend, no API keys, and no data is stored.

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

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) — fork, open a PR, and note that **only the maintainer can approve and merge** pull requests.

## License

MIT — see [LICENSE](LICENSE).
