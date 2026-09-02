/** Official Dota 2 CDN imagery (Valve). */
export const DOTA_IMG = {
  logo:
    "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png",
  patchBg:
    "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/backgrounds/nav_bg.png",
  heroes: {
    kez: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/kez.png",
    invoker:
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/invoker.png",
    crystal_maiden:
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/crystal_maiden.png",
  },
  items: {
    aghanim:
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/ultimate_scepter.png",
    ward:
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/ward_observer.png",
    tp: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/tpscroll.png",
    bloodstone:
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/bloodstone.png",
    manta:
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/manta.png",
  },
};

export const SECTION_ICONS = {
  general: DOTA_IMG.logo,
  features: DOTA_IMG.items.aghanim,
  fixes: DOTA_IMG.items.ward,
  ui: DOTA_IMG.heroes.crystal_maiden,
  tools: DOTA_IMG.items.tp,
  integrations: DOTA_IMG.items.bloodstone,
  governance: DOTA_IMG.logo,
};

/**
 * Site changelogs in Dota patch-note style: version hero + expandable sections.
 * Newest first.
 */
export const CHANGELOGS = [
  {
    version: "0.0.57",
    date: "2026-09-01",
    title: "Home Assistant App",
    tagline: "The parser now runs on a schedule outside the browser, for a whole squad at once.",
    heroImage: DOTA_IMG.items.aghanim,
    accent: "#42d68c",
    sections: [
      {
        id: "features",
        title: "Features",
        icon: SECTION_ICONS.features,
        items: [
          {
            text: "New Home Assistant app: point it at any number of profile IDs and it fetches, parses and exports every account's recent games on a cron schedule — one tab, folder and set of CSVs per player.",
          },
          {
            text: "Optional OpenDota API key support raises the request budget from 60 to 1200 per minute, which is the difference between roughly 5 and 120 replay parses per minute.",
          },
        ],
      },
      {
        id: "general",
        title: "Under the hood",
        icon: SECTION_ICONS.general,
        items: [
          {
            text: "The match cache now sits behind a storage interface, so the same analytics core runs against IndexedDB in the browser and the filesystem on a Home Assistant box. Browser behaviour is unchanged.",
          },
          {
            text: "CSV column definitions moved into a shared module, so the site's downloads and the app's exports stay identical.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.56",
    date: "2026-07-21",
    title: "OpenDota Parser Tool Unlocked",
    tagline: "Completed analyses no longer leave parsing tools permanently blocked.",
    heroImage: DOTA_IMG.items.tp,
    accent: "#4a90c4",
    sections: [
      {
        id: "fixes",
        title: "Fixes",
        icon: SECTION_ICONS.fixes,
        items: [
          {
            text: "OpenDota parse-all and full-history tools can now start after an Analyze run finishes; completed analyses correctly release their active-operation lock.",
          },
          {
            text: "Starting a new analysis still safely cancels an older one without allowing stale cleanup to unlock the current task.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.55",
    date: "2026-07-14",
    title: "Match Filters & Raw CSV Export",
    tagline: "Exclude bots and export every match behind the table.",
    heroImage: DOTA_IMG.heroes.kez,
    accent: "#4a90c4",
    sections: [
      {
        id: "features",
        title: "Features",
        icon: SECTION_ICONS.features,
        items: [
          {
            text: "Analyze (and Tools) can exclude bot matches, practice/tutorial lobbies, and optionally keep only standard game modes — alongside Turbo and ranked filters.",
          },
          {
            text: "Export matches CSV downloads the raw per-match sample used for the matchup table (win, KDA, lobby, mode, lane, enemy heroes).",
          },
          {
            text: "Export matchups CSV is unchanged for the aggregated hero table; both buttons enable after analysis.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.54",
    date: "2026-07-10",
    title: "Instant Load Without OpenDota 429s",
    tagline: "Static hero and builder data ships with the site; match APIs only when you analyze.",
    heroImage: DOTA_IMG.logo,
    accent: "#4a90c4",
    sections: [
      {
        id: "fixes",
        title: "Fixes",
        icon: SECTION_ICONS.fixes,
        items: [
          {
            text: "Hero list and Hero Builder game data load from same-origin bundled files at deploy — no more blocking on OpenDota /heroes 429 retries on first visit.",
          },
          {
            text: "dotaconstants heroes, abilities, items, and patch list are bundled alongside Valve data in CI.",
          },
          {
            text: "OpenDota is only used for match analysis and optional item popularity (cached); hero picker prefers bundled Valve herolist, then dotaconstants.",
          },
          {
            text: "Added favicon to stop /favicon.ico 404 noise in the console.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.53",
    date: "2026-07-09",
    title: "Bear Skills & Item Damage",
    tagline: "Spirit Bear skills track your build; tower DPS reacts to items.",
    heroImage: DOTA_IMG.heroes.kez,
    accent: "#c59a2f",
    sections: [
      {
        id: "fixes",
        title: "Fixes",
        icon: SECTION_ICONS.fixes,
        items: [
          {
            text: "Spirit Bear skill pips now follow Lone Druid's skill order (Entangle, Spirit Link, Savage Roar) instead of staying empty.",
          },
          {
            text: "Demolish shows as active on the bear from level 1; tower DPS includes the +40% building bonus.",
          },
          {
            text: "Equipping or removing items refreshes the tower damage table; item +damage and Deso/AC apply on hero and bear inventories (combined column merges armor debuffs from either).",
          },
          {
            text: "Power Treads switchable stat now adds to all attributes on the universal Spirit Bear.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.52",
    date: "2026-07-09",
    title: "Tower Damage & Spirit Bear",
    tagline: "Live tower TTK math and a proper Spirit Bear panel.",
    heroImage: DOTA_IMG.heroes.kez,
    accent: "#c59a2f",
    sections: [
      {
        id: "features",
        title: "Features",
        icon: SECTION_ICONS.features,
        items: [
          {
            text: "Hero Builder shows Spirit Bear skills (mirrored from Lone Druid) plus bear item slots in the skill panel.",
          },
          {
            text: "Tower damage table estimates time to destroy T1–T4 towers and the Ancient from your build's auto-attack DPS, including Desolator, Assault Cuirass armor reduction, and Spirit Bear Demolish.",
          },
          {
            text: "Building HP/armor and siege rules are bundled from live Dota VPK extracts on each deploy (not hardcoded).",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.51",
    date: "2026-07-08",
    title: "Spirit Bear Panel",
    tagline: "Bear inventory lives in the skill build card.",
    heroImage: DOTA_IMG.logo,
    accent: "#42d68c",
    sections: [
      {
        id: "fixes",
        title: "Fixes",
        icon: SECTION_ICONS.fixes,
        items: [
          {
            text: "Moved Spirit Bear inventory into the Skill build panel so Lone Druid players can find bear items and the mirror note in one place.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.50",
    date: "2026-07-08",
    title: "Bundled Game Data",
    tagline: "Fix CORS failures on GitHub Pages.",
    heroImage: DOTA_IMG.logo,
    accent: "#42d68c",
    sections: [
      {
        id: "fixes",
        title: "Bug Fixes",
        items: [
          {
            type: "fixed",
            text: "Valve hero/talent and patch data is bundled at deploy time and served same-origin — no browser CORS or third-party proxy required.",
          },
          {
            type: "fixed",
            text: "Hero Builder no longer fails to load when live Valve fetches are blocked; falls back to dotaconstants gracefully.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.48",
    date: "2026-07-07",
    title: "Builder Fixes",
    tagline: "Correct talents, Kez mirrors, gold display, and consumable upgrades.",
    heroImage: DOTA_IMG.heroes.kez,
    accent: "#42d68c",
    sections: [
      {
        id: "fixes",
        title: "Bug Fixes",
        items: [
          {
            type: "fixed",
            text: "Footer version no longer drops back to an older cached build — deploy now ships versioned JS bundles and respects the HTML/meta version.",
          },
          {
            type: "fixed",
            text: "Live talents and patch items load in the browser via a CORS-safe Valve datafeed proxy (fixes placeholder talent text on GitHub Pages).",
          },
          {
            type: "fixed",
            text: "Kez stance abilities mirror skill points (Echo Slash ↔ Falcon Rush, etc.).",
          },
          {
            type: "fixed",
            text: "Gold checkpoints and summary update live from GPM; item timeline uses a proper modal instead of blocked prompts.",
          },
          {
            type: "fixed",
            text: "All items tab in item picker; consumable upgrade slots with consume toggles and descriptions for Scepter, Shard, and Moon Shard.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.47",
    date: "2026-07-07",
    title: "Builder Upgrades & Gold",
    tagline: "Live patch data, item timeline, and special hero support.",
    heroImage: DOTA_IMG.items.manta,
    accent: "#42d68c",
    sections: [
      {
        id: "features",
        title: "Feature Updates",
        items: [
          {
            type: "changed",
            text: "Game data loads dotaconstants 7.41 base + Valve patch-note overlays, with an automatic freshness check against the latest patch on load.",
          },
          {
            type: "added",
            text: "Aghanim's Shard/Scepter and Moon Shard use dedicated upgrade slots (not inventory). Granted abilities show when you plan to buy them — not as levelable skills.",
          },
          {
            type: "added",
            text: "Item timeline with buy/sell (50% refund), GPM + starting gold inputs, and estimated gold at 10/20/30/40/50/60 minutes.",
          },
          {
            type: "added",
            text: "Import from cached matches — pull skill order, purchases, and GPM from games already stored for your account.",
          },
          {
            type: "added",
            text: "Kez dual-stance skill grid and Lone Druid Spirit Bear inventory with mirrored skill notes.",
          },
          {
            type: "added",
            text: "All items tab in the item picker.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.46",
    date: "2026-07-07",
    title: "Live Patch Data",
    tagline: "Hero Builder talents and items stay current with 7.41d.",
    heroImage: DOTA_IMG.items.aghanim,
    accent: "#42d68c",
    sections: [
      {
        id: "features",
        title: "Feature Updates",
        items: [
          {
            type: "changed",
            text: "Hero Builder now loads live hero abilities and talents from Valve's datafeed (current patch, e.g. 7.41d) with resolved talent text instead of stale dotaconstants placeholders.",
          },
          {
            type: "changed",
            text: "Item stats and costs are patched from Valve patch notes (7.41 through the latest letter patch) so values like Mage Slayer damage reflect in-game numbers.",
          },
          {
            type: "added",
            text: "Refresh data button on the Hero Builder toolbar to bust caches and re-fetch from Valve.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.45",
    date: "2026-07-07",
    title: "Hero Builder Tab",
    tagline: "Plan skill builds and item timings for any hero.",
    heroImage: DOTA_IMG.items.manta,
    accent: "#42d68c",
    sections: [
      {
        id: "features",
        title: "Feature Updates",
        items: [
          {
            type: "added",
            text: "Hero Builder tab — pick any hero, see live base stats/abilities from the OpenDota community dataset, and build a level-by-level skill order (regular abilities, ultimate unlocks at 6/12/18, Attribute Bonus, and talent tiers at 10/15/20/25).",
          },
          {
            type: "added",
            text: "6 inventory slots + neutral slot + backpack (backpack is planning-only, matching real Dota) with a searchable item picker organized by shop category and OpenDota purchase-popularity badges per hero.",
          },
          {
            type: "added",
            text: "Live computed stat sheet (str/agi/int, HP/mana, regen, armor, magic resist, damage, attack speed, move speed, effective HP) that updates as you build.",
          },
          {
            type: "added",
            text: "Builds save locally to this browser (nameable, listable, deletable) so you can keep multiple builds per hero.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.44",
    date: "2026-06-26",
    title: "All Heroes Tab",
    tagline: "Cross-hero stats from your local cache.",
    heroImage: DOTA_IMG.items.bloodstone,
    accent: "#155dfc",
    sections: [
      {
        id: "features",
        title: "Feature Updates",
        items: [
          {
            type: "added",
            text: "All Heroes tab — aggregate game win %, lane win %, Wilson intervals, and K/D from every hero with cached matches for your account.",
          },
          {
            type: "added",
            text: "Sortable hero table, top-N bar chart (win/lane/games), game-vs-lane comparison chart, and CSV export with Turbo/ranked/min-games filters.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.43",
    date: "2026-06-25",
    title: "Guided Tour",
    tagline: "First-run walkthrough with spotlight steps.",
    heroImage: DOTA_IMG.heroes.crystal_maiden,
    accent: "#42d68c",
    sections: [
      {
        id: "features",
        title: "Feature Updates",
        items: [
          {
            type: "added",
            text: "First-run guided tour — step-by-step spotlight modals for account, hero, filters, parsing, results, tabs, and footer actions.",
          },
          {
            type: "added",
            text: "Restart guided tour button in Tools → Guided tour for replaying the walkthrough anytime.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.42",
    date: "2026-06-25",
    title: "Data Quality & Ranked Filter",
    tagline: "Warn when stats lie; filter ranked only.",
    heroImage: DOTA_IMG.items.aghanim,
    accent: "#c59a2f",
    sections: [
      {
        id: "features",
        title: "Feature Updates",
        items: [
          {
            type: "added",
            text: "Data quality panel after analysis — warns when parse/STRATZ is off, lane data is sparse, Wilson intervals are wide, or lane filters lack assignments.",
          },
          {
            type: "added",
            text: "Ranked only filter (OpenDota lobby_type 7) alongside Exclude Turbo, in Analyze and Tools.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.41",
    date: "2026-06-25",
    title: "Significant Filter Tooltip",
    tagline: "OpenDota significant ≠ ranked-only.",
    heroImage: DOTA_IMG.heroes.crystal_maiden,
    accent: "#9a9a9a",
    sections: [
      {
        id: "ui",
        title: "UI Updates",
        items: [
          {
            type: "changed",
            text: "“Significant matches only” tooltip now explains OpenDota’s significant=1 API filter (excludes casual modes like Turbo), not ranked-only or Wilson confidence.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.40",
    date: "2026-06-25",
    title: "Lane Filters & Chart Confidence",
    tagline: "Match OpenDota laning; hide noisy lane trends.",
    heroImage: DOTA_IMG.items.ward,
    accent: "#155dfc",
    sections: [
      {
        id: "fixes",
        title: "Bug Fixes",
        items: [
          {
            type: "fixed",
            text: "Enemy lane filters now use OpenDota lane_role (heatmap @10 min — same as the laning tab) instead of the draft lane field. Snapshots lane data before STRATZ merge; clears poisoned match cache (v5).",
          },
          {
            type: "fixed",
            text: "Rolling lane win % line is hidden when half or fewer matches in the window have lane outcomes (low confidence).",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.39",
    date: "2026-06-25",
    title: "Startup Resilience",
    tagline: "Survives OpenDota outages and GSAP hiccups.",
    heroImage: DOTA_IMG.items.tp,
    accent: "#42d68c",
    sections: [
      {
        id: "fixes",
        title: "Bug Fixes",
        items: [
          {
            type: "fixed",
            text: "App no longer appears frozen when OpenDota is down: hero list falls back to dotaconstants, network errors fail fast, and the footer version renders even before JS boots.",
          },
          {
            type: "fixed",
            text: "GSAP intro animations clear opacity/transform after running so cards cannot stay invisible; scroll-trigger reveals removed (CSS handles motion).",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.38",
    date: "2026-06-25",
    title: "Lane Filter Fix",
    tagline: "OpenDota lanes stay OpenDota lanes.",
    heroImage: DOTA_IMG.items.ward,
    accent: "#5b9fd4",
    sections: [
      {
        id: "fixes",
        title: "Bug Fixes",
        items: [
          {
            type: "fixed",
            text: "Enemy lane/role filters now use OpenDota map lane data directly. STRATZ position is stored separately and no longer overwrites OpenDota lane_role (which caused offlaners to show as safelane).",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.37",
    date: "2026-06-25",
    title: "Support Lane Outcomes",
    tagline: "2v2 lanes use team gold, not solo LH@10.",
    heroImage: DOTA_IMG.heroes.crystal_maiden,
    accent: "#42d68c",
    sections: [
      {
        id: "fixes",
        title: "Bug Fixes",
        items: [
          {
            type: "fixed",
            text: "Safelane and offlane lane won/lost now compares combined ally gold vs combined enemy gold (OpenDota 2v2 lanes). Supports share the same outcome as their lane partner.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.36",
    date: "2026-06-25",
    title: "Patch Notes Tab",
    tagline: "Gameplay updates, but for this app.",
    heroImage: DOTA_IMG.logo,
    accent: "#c59a2f",
    sections: [
      {
        id: "features",
        title: "Feature Updates",
        items: [
          {
            type: "added",
            text: "Changelogs tab with Dota-style patch banners, version pills, expandable sections, and Valve CDN imagery.",
          },
          { type: "added", text: "GSAP motion for page load, tab switches, results reveal, and changelog section expands." },
        ],
      },
    ],
  },
  {
    version: "0.0.35",
    date: "2026-06-25",
    title: "Uncapped Ambition",
    tagline: "Raise the limit. Accept the consequences.",
    heroImage: DOTA_IMG.heroes.kez,
    accent: "#42d68c",
    sections: [
      {
        id: "general",
        title: "General Updates",
        items: [
          { type: "changed", text: "Default match limit increased from 100 to 250." },
          {
            type: "changed",
            text: "Maximum match limit raised from 500 to 99,999. Turbo scan cap updated to match.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.34",
    date: "2026-06-25",
    title: "Loadout Presets",
    tagline: "Save your build. Run it again.",
    heroImage: DOTA_IMG.items.tp,
    accent: "#155dfc",
    sections: [
      {
        id: "features",
        title: "Feature Updates",
        items: [
          { type: "added", text: "Saved configs modal: name presets, load, delete, and auto-save to this browser." },
          { type: "added", text: "Session banner shows last saved and last successful analysis run." },
        ],
      },
      {
        id: "general",
        title: "General Updates",
        items: [
          { type: "changed", text: "OpenDota replay parse is on by default; STRATZ fallback and parallel parsing default to off." },
        ],
      },
    ],
  },
  {
    version: "0.0.33",
    date: "2026-06-25",
    title: "STRATZ Schema Fix",
    tagline: "Wrong fields no longer hard-counter the whole query.",
    heroImage: DOTA_IMG.items.bloodstone,
    accent: "#c59a2f",
    sections: [
      {
        id: "fixes",
        title: "Bug Fixes",
        items: [
          {
            type: "fixed",
            text: "Removed invalid GraphQL ward fields from STRATZ query that caused HTTP 400 on every match.",
          },
        ],
      },
    ],
  },
  {
    version: "0.0.32",
    date: "2026-06-25",
    title: "Token & Table Polish",
    tagline: "Green W, red L, grey D.",
    heroImage: DOTA_IMG.items.ward,
    accent: "#42d68c",
    sections: [
      {
        id: "ui",
        title: "UI Updates",
        items: [
          { type: "changed", text: "Lane W-L-D column colour-coded: wins green, losses red, draws muted." },
        ],
      },
      {
        id: "fixes",
        title: "Bug Fixes",
        items: [
          { type: "fixed", text: "STRATZ token restored from localStorage when the input is empty; analyze blocked without a token." },
        ],
      },
    ],
  },
  {
    version: "0.0.31",
    date: "2026-06-25",
    title: "STRATZ Throttle",
    tagline: "Eight requests per second is not a suggestion.",
    heroImage: DOTA_IMG.items.bloodstone,
    accent: "#155dfc",
    sections: [
      {
        id: "integrations",
        title: "Integration Updates",
        items: [
          { type: "added", text: "Global STRATZ rate limiter (~6 req/s) with automatic 429 retry using Retry-After headers." },
        ],
      },
    ],
  },
  {
    version: "0.0.30",
    date: "2026-06-24",
    title: "Hero Picker Rework",
    tagline: "No more invisible datalist on mobile.",
    heroImage: DOTA_IMG.heroes.invoker,
    accent: "#42d68c",
    sections: [
      {
        id: "fixes",
        title: "Bug Fixes",
        items: [
          { type: "fixed", text: "Custom hero combobox replaces broken mobile datalist; analyze disabled until heroes load." },
          { type: "fixed", text: "Fuzzy hero match on submit when the name uniquely identifies one hero." },
        ],
      },
    ],
  },
  {
    version: "0.0.29",
    date: "2026-06-24",
    title: "STRATZ Fallback",
    tagline: "When OpenDota has no parse, STRATZ fills the lane.",
    heroImage: DOTA_IMG.items.bloodstone,
    accent: "#c59a2f",
    sections: [
      {
        id: "integrations",
        title: "Integration Updates",
        items: [
          { type: "added", text: "Optional STRATZ GraphQL fallback for lane gold/LH when OpenDota parse is missing." },
          { type: "added", text: "STRATZ API token field stored locally; share links support stratz=1 without exposing the token." },
        ],
      },
    ],
  },
  {
    version: "0.0.28",
    date: "2026-06-24",
    title: "Parse Age & Lane Record",
    tagline: "Thirty-one days. Then the ancients refuse.",
    heroImage: DOTA_IMG.heroes.kez,
    accent: "#42d68c",
    sections: [
      {
        id: "features",
        title: "Feature Updates",
        items: [
          { type: "added", text: "Lane W-L-D column on the enemy matchup table." },
          { type: "added", text: "31-day OpenDota parse age limit with Full history parse tool override." },
        ],
      },
    ],
  },
  {
    version: "0.0.27",
    date: "2026-06-24",
    title: "Matchup Filters",
    tagline: "Filter the table without refetching the world.",
    heroImage: DOTA_IMG.heroes.crystal_maiden,
    accent: "#155dfc",
    sections: [
      {
        id: "features",
        title: "Feature Updates",
        items: [
          { type: "added", text: "Lane and Dota position filters above the matchup table with live refilter." },
          { type: "changed", text: "Per-hero lane win % and lane games columns; correct Dota positions 1–5." },
        ],
      },
    ],
  },
  {
    version: "0.0.26",
    date: "2026-06-24",
    title: "Live Refilter",
    tagline: "Change filters. Keep your cached matches.",
    heroImage: DOTA_IMG.items.aghanim,
    accent: "#42d68c",
    sections: [
      {
        id: "features",
        title: "Feature Updates",
        items: [
          { type: "added", text: "Re-filter cached analysis when lane/role filters change without re-fetching." },
          { type: "fixed", text: "Lane win % now computed vs lane opponent per hero, not all enemies." },
        ],
      },
    ],
  },
  {
    version: "0.0.25",
    date: "2026-06-24",
    title: "Responsive & Filters",
    tagline: "Mobile layouts and lane role filters land.",
    heroImage: DOTA_IMG.heroes.kez,
    accent: "#155dfc",
    sections: [
      {
        id: "ui",
        title: "UI Updates",
        items: [
          { type: "added", text: "Mobile-responsive layout for parameters, tables, and charts." },
          { type: "added", text: "Lane and role filter controls for matchup analysis." },
        ],
      },
    ],
  },
  {
    version: "0.0.24",
    date: "2026-06-23",
    title: "Parameters UX",
    tagline: "Parallel toggle and cleaner activity log.",
    heroImage: DOTA_IMG.items.tp,
    accent: "#7d7d7d",
    sections: [
      {
        id: "ui",
        title: "UI Updates",
        items: [
          { type: "changed", text: "Improved parameters panel grouping and parallel parse toggle." },
          { type: "fixed", text: "Activity log crash on certain parse outcomes." },
        ],
      },
    ],
  },
  {
    version: "0.0.23",
    date: "2026-06-23",
    title: "Tools Tab",
    tagline: "Batch parse from the sidebar of sanity.",
    heroImage: DOTA_IMG.items.tp,
    accent: "#155dfc",
    sections: [
      {
        id: "tools",
        title: "Tool Updates",
        items: [
          { type: "added", text: "Tools tab with parse-all, full history parse, and retry-failed batch jobs." },
          { type: "added", text: "Parallel parsing lanes and per-match IndexedDB cache." },
        ],
      },
    ],
  },
  {
    version: "0.0.22",
    date: "2026-06-22",
    title: "Foundation II",
    tagline: "Parse, cache, pace, deploy.",
    heroImage: DOTA_IMG.logo,
    accent: "#42d68c",
    sections: [
      {
        id: "features",
        title: "Feature Updates",
        items: [
          { type: "added", text: "OpenDota parse queue with local match cache and visible activity log." },
          { type: "added", text: "Rate limiting at 60 req/min with wait messages in the UI." },
          { type: "added", text: "Saved recent accounts with Steam avatar and name." },
        ],
      },
      {
        id: "general",
        title: "General Updates",
        items: [
          { type: "added", text: "GitHub Pages deploy via Actions; footer with version, share link, and support." },
          { type: "added", text: "Patch filter, Wilson CI charts, lane vs game win comparison." },
          { type: "added", text: "Polysights design system applied to the static frontend." },
        ],
      },
      {
        id: "governance",
        title: "Project Updates",
        items: [
          { type: "added", text: "MIT open source, issue templates, CODEOWNERS, and contributing guide." },
        ],
      },
    ],
  },
];

export function getLatestChangelog() {
  return CHANGELOGS[0] ?? null;
}
