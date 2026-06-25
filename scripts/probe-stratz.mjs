const TOKEN = process.env.STRATZ_TOKEN;
const MATCH_ID = Number(process.env.MATCH_ID || 8821716484);

if (!TOKEN) {
  console.error("Set STRATZ_TOKEN env var");
  process.exit(1);
}

const queries = {
  current: `
query MatchLane($matchId: Long!) {
  match(id: $matchId) {
    players {
      steamAccountId
      heroId
      position
      lane
      stats {
        lastHitsPerMinute
        networthPerMinute
      }
    }
  }
}`,
  noWards: `
query MatchLane($matchId: Long!) {
  match(id: $matchId) {
    players {
      steamAccountId
      heroId
      position
      lane
      stats {
        lastHitsPerMinute
        networthPerMinute
      }
    }
  }
}`,
};

async function run(name, query) {
  const res = await fetch("https://api.stratz.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      "User-Agent": "Dota2PlayerStats/1.0",
    },
    body: JSON.stringify({ query, variables: { matchId: MATCH_ID } }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  console.log(`\n=== ${name} HTTP ${res.status} ===`);
  if (body.errors) console.log("errors:", body.errors.map((e) => e.message).join("; "));
  if (body.data?.match?.players?.[0]) {
    const p = body.data.match.players[0];
    console.log("sample player:", {
      steamAccountId: p.steamAccountId,
      heroId: p.heroId,
      lane: p.lane,
      position: p.position,
      goldLen: p.stats?.networthPerMinute?.length,
      lhLen: p.stats?.lastHitsPerMinute?.length,
      gold10: p.stats?.networthPerMinute?.[10],
    });
  } else {
    console.log(JSON.stringify(body, null, 2).slice(0, 800));
  }
}

for (const [name, query] of Object.entries(queries)) {
  await run(name, query);
}
