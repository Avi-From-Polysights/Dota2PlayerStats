function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

export function normalizeHeroQuery(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u0060]/g, "'")
    .replace(/\s+/g, " ");
}

export function findHeroByQuery(heroes, query, { fuzzy = false } = {}) {
  const q = normalizeHeroQuery(query);
  if (!q) return null;

  const byName = new Map(heroes.map((h) => [normalizeHeroQuery(h.name), h]));
  const exact = byName.get(q);
  if (exact) return exact;
  if (!fuzzy) return null;

  const prefixMatches = heroes.filter((h) => normalizeHeroQuery(h.name).startsWith(q));
  if (prefixMatches.length === 1) return prefixMatches[0];

  const wordMatches = heroes.filter((h) =>
    normalizeHeroQuery(h.name)
      .split(" ")
      .some((word) => word.startsWith(q))
  );
  if (wordMatches.length === 1) return wordMatches[0];

  return null;
}

export function createHeroPicker({ input, hiddenInput, suggestionsEl, onResolved }) {
  let heroes = [];
  let blurTimer = null;

  function applyHero(hero) {
    if (!hero) {
      hiddenInput.value = "";
      onResolved?.(null);
      return null;
    }
    input.value = hero.name;
    hiddenInput.value = String(hero.id);
    onResolved?.(hero.id);
    return hero.id;
  }

  function resolve({ fuzzy = false } = {}) {
    const hero = findHeroByQuery(heroes, input.value, { fuzzy });
    if (hero) return applyHero(hero);
    hiddenInput.value = "";
    onResolved?.(null);
    return null;
  }

  function filterSuggestions(query) {
    const q = normalizeHeroQuery(query);
    if (!q) return heroes.slice(0, 20);
    return heroes
      .filter((h) => normalizeHeroQuery(h.name).includes(q))
      .slice(0, 20);
  }

  function renderSuggestions(items) {
    if (!items.length) {
      suggestionsEl.classList.add("hidden");
      suggestionsEl.innerHTML = "";
      return;
    }
    suggestionsEl.innerHTML = items
      .map(
        (h) =>
          `<li class="hero-combobox__option" role="option" data-hero-id="${h.id}">${escapeHtml(h.name)}</li>`
      )
      .join("");
    suggestionsEl.classList.remove("hidden");
  }

  function showSuggestions() {
    renderSuggestions(filterSuggestions(input.value));
  }

  function hideSuggestions() {
    suggestionsEl.classList.add("hidden");
  }

  function setHeroes(list) {
    heroes = list;
    input.disabled = false;
    input.placeholder = "Search hero…";
    if (hiddenInput.value) {
      const fromId = list.find((h) => String(h.id) === hiddenInput.value);
      if (fromId) input.value = fromId.name;
    }
    resolve({ fuzzy: true });
  }

  function setLoading() {
    heroes = [];
    input.disabled = true;
    input.placeholder = "Loading heroes…";
    hiddenInput.value = "";
    hideSuggestions();
  }

  function setHeroById(id) {
    const hero = heroes.find((h) => h.id === Number(id));
    if (hero) applyHero(hero);
  }

  input.addEventListener("input", () => {
    resolve({ fuzzy: false });
    showSuggestions();
  });

  input.addEventListener("focus", () => {
    clearTimeout(blurTimer);
    showSuggestions();
  });

  input.addEventListener("blur", () => {
    blurTimer = setTimeout(() => {
      hideSuggestions();
      resolve({ fuzzy: true });
    }, 150);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideSuggestions();
  });

  suggestionsEl.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  suggestionsEl.addEventListener("click", (event) => {
    const option = event.target.closest("[data-hero-id]");
    if (!option) return;
    const hero = heroes.find((h) => h.id === Number(option.dataset.heroId));
    if (hero) {
      applyHero(hero);
      hideSuggestions();
    }
  });

  setLoading();

  return {
    setHeroes,
    setHeroById,
    resolveHeroId: (options) => resolve(options),
  };
}
