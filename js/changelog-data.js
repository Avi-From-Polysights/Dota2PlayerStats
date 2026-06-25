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
