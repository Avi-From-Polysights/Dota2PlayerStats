# Dota 2 Player Stats

Runs the OpenDota fetch + replay-parse pipeline from
[Dota2PlayerStats](https://avi-from-polysights.github.io/Dota2PlayerStats/) on a
schedule, for as many accounts as you like, and writes per-player CSV/JSON
exports to `/share`.

## Why it runs on a schedule

OpenDota will not parse a replay much older than **31 days**. Anything you miss
for a month can never get lane data again. A weekly run keeps every game's
laning stats permanently.

## Setup

1. Add one entry per player under **accounts** — a display name and the numeric
   OpenDota/Steam32 account ID (the number in `opendota.com/players/<id>`).
2. Optionally paste an **opendota_api_key** (free from
   [opendota.com/api-keys](https://www.opendota.com/api-keys)). Without one you
   are capped at 60 weighted requests/minute and a parse costs 10 of them, so
   roughly 5 parses per minute. With a key that becomes 1200/minute.
3. Start the app and open it from the sidebar. Hit **Run now** for the first
   backfill, then leave the schedule to it.

The first run over 31 days can take 30–90 minutes on the free tier. It is fully
resumable: every match is cached as it completes, so a restart picks up where it
left off. Matches shared between configured accounts are fetched and parsed
once, not once per player.

## Options

| Option | Default | Notes |
| --- | --- | --- |
| `accounts` | — | One `name` + `account_id` per player |
| `opendota_api_key` | empty | Raises the rate limit to 1200/min |
| `days` | `31` | How far back each run looks |
| `cron` | `0 5 * * 1` | 5-field cron, container local time (Mondays 05:00) |
| `run_on_start` | `false` | Run once immediately when the app starts |
| `request_parse` | `true` | Turn off to collect stats without queueing replay parses |
| `parse_concurrency` | `6` | Parallel parse lanes (they share one rate-limit budget) |
| `parse_retries` | `2` | Retries before a match is recorded as a parse failure |
| `exclude_turbo` / `exclude_bots` / `exclude_practice` | `true` | Match filters |
| `ranked_only` / `standard_modes_only` | `false` | Stricter filters |
| `significant_only` | `false` | OpenDota's "significant" match flag |
| `confidence` | `0.95` | Wilson confidence level |
| `cache_retention_days` | `120` | Cached match payloads older than this are pruned |
| `export_dir` | `/share/dota2stats` | Where exports are written |

## Output

Per account, under `<export_dir>/<account_id>-<name>/`:

| File | Contents |
| --- | --- |
| `matches.csv` | One row per match: hero, win, lane, lane outcome, gold@10, KDA, mode, enemy heroes |
| `matchups.csv` | Enemy-hero matchup table with Wilson confidence intervals |
| `heroes.csv` | Per-hero games, win rate and lane win rate |
| `lanes.csv` | Per-lane games, win rate and lane win rate with intervals |
| `summary.json` | Totals, lane breakdown, top matchups, run metadata |
| `history/<date>/` | A dated copy of all of the above from each run |

Plus `combined-summary.csv` (one row per account) and `combined-matches.csv`
(every match across all accounts, with an `account` column) at the top level.

## Notes

- Lane win rate needs a parsed replay. Games without one still count toward win
  rate; the UI shows lane-data coverage so you know how complete the sample is.
- The app talks only to OpenDota. The STRATZ lane fallback is a browser-app
  feature and is not used here.
- Rate-limit pauses, parse timeouts and retries are all visible in the app log
  and in the UI's activity pane.
