const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 300 });
app.use(cors());
app.use(express.json());

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

const POKEMON_KEYWORDS = ['pokemon', 'pokémon', 'tcg', 'trainer box', 'booster', 'elite trainer', 'scarlet', 'violet', 'sword', 'shield', 'pikachu', 'charizard', 'paldea', 'paldean', 'prismatic', 'surging', 'stellar', 'twilight', 'paradox', 'obsidian', 'silver tempest', 'lost origin', 'astral radiance', 'temporal forces', 'twilight masquerade', 'shrouded fable', 'stellar crown', 'prismatic evolutions'];
const EXCLUDE_KEYWORDS = ['dice tray', 'sleeve', 'playmat', 'binder', 'folder', 'token', 'counter', 'storage box', 'deck box', 'card sleeves'];

function isPokemonTCG(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  const hasPokemon = POKEMON_KEYWORDS.some(k => lower.includes(k));
  const isExcluded = EXCLUDE_KEYWORDS.some(k => lower.includes(k));
  return hasPokemon && !isExcluded;
}

async function fetchPage(url) {
  const res = await axios.get(url, { headers: HEADERS, timeout: 12000 });
  return cheerio.load(res.data);
}

// ── Pokémon Center UK ─────────────────────────────────────────────────────────
async function scrapePokemonCenter(query) {
  try {
    const $ = await fetchPage(`https://www.pokemoncenter.com/en-gb/search?q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product-tile"], [class*="product-card"], [class*="ProductTile"], article').each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"], [class*="name"]').first().text().trim();
      const priceEl = $(el).find('[class*="price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock') || $(el).text().toLowerCase().includes('sold out');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.pokemoncenter.com${href}`) : null;
      if (name && url && isPokemonTCG(name)) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Pokémon Center', logo: '🎴' });
    });
    return results.slice(0, 5);
  } catch (e) { return []; }
}

async function scrapeArgos(query) {
  try {
    const $ = await fetchPage(`https://www.argos.co.uk/search/${encodeURIComponent(query)}/`);
    const results = [];
    $('[class*="ProductCard"], [data-test="component-product-card"]').each((_, el) => {
      const name = $(el).find('[data-test="component-product-card-title"], h2, h3').first().text().trim();
      const priceEl = $(el).find('[class*="price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a[href*="/product/"]').first().attr('href');
      const url = href ? `https://www.argos.co.uk${href}` : null;
      if (name && url && isPokemonTCG(name)) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Argos', logo: '🛒' });
    });
    return results.slice(0, 5);
  } catch (e) { return []; }
}

async function scrapeSmyths(query) {
  try {
    const $ = await fetchPage(`https://www.smythstoys.com/uk/en-gb/search/?text=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product-tile"], [class*="ProductTile"], .product-item').each((_, el) => {
      const name = $(el).find('[class*="product-title"], [class*="ProductTitle"], h2, h3').first().text().trim();
      const priceEl = $(el).find('[class*="price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.smythstoys.com${href}`) : null;
      if (name && url && isPokemonTCG(name)) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Smyths', logo: '🧸' });
    });
    return results.slice(0, 5);
  } catch (e) { return []; }
}

async function scrapeGame(query) {
  try {
    const $ = await fetchPage(`https://www.game.co.uk/search?q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product-card"], [class*="product-item"]').each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"]').first().text().trim();
      const priceEl = $(el).find('[class*="price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.game.co.uk${href}`) : null;
      if (name && url && isPokemonTCG(name)) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Game', logo: '🎮' });
    });
    return results.slice(0, 5);
  } catch (e) { return []; }
}

async function scrapeTotalCards(query) {
  try {
    const $ = await fetchPage(`https://www.totalcards.net/search?type=product&q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product"], .grid__item').each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"], .card__heading').first().text().trim();
      const priceEl = $(el).find('[class*="price"], .price').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('sold out') || $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.totalcards.net${href}`) : null;
      if (name && url && isPokemonTCG(name)) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Total Cards', logo: '🃏' });
    });
    return results.slice(0, 5);
  } catch (e) { return []; }
}

async function scrapeChaosCards(query) {
  try {
    const $ = await fetchPage(`https://www.chaoscards.co.uk/search?type=product&q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product"], .grid__item').each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"]').first().text().trim();
      const priceEl = $(el).find('[class*="price"], .price').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('sold out') || $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.chaoscards.co.uk${href}`) : null;
      if (name && url && isPokemonTCG(name)) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Chaos Cards', logo: '🌀' });
    });
    return results.slice(0, 5);
  } catch (e) { return []; }
}

async function scrapeMagicMadhouse(query) {
  try {
    const $ = await fetchPage(`https://www.magicmadhouse.co.uk/search?q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product"], .grid__item').each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"]').first().text().trim();
      const priceEl = $(el).find('[class*="price"], .price').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('sold out') || $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.magicmadhouse.co.uk${href}`) : null;
      if (name && url && isPokemonTCG(name)) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Magic Madhouse', logo: '🔮' });
    });
    return results.slice(0, 5);
  } catch (e) { return []; }
}

async function getLatestSets() {
  try {
    const res = await axios.get('https://api.tcgdex.net/v2/en/sets', { timeout: 8000 });
    return res.data
      .filter(s => s.releaseDate)
      .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))
      .slice(0, 12);
  } catch (e) { return []; }
}

function groupByProduct(allResults) {
  const grouped = {};
  for (const item of allResults) {
    if (!item.name || item.name.length < 5 || !item.url) continue;
    const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (!grouped[key]) grouped[key] = { id: key, name: item.name, retailers: [] };
    if (!grouped[key].retailers.find(r => r.name === item.retailer)) {
      grouped[key].retailers.push({ name: item.retailer, price: item.price || 'N/A', url: item.url, stock: item.stock, logo: item.logo });
    }
  }
  return Object.values(grouped).filter(p => p.retailers.length > 0);
}

async function scrapeAll(query) {
  const settled = await Promise.allSettled([
    scrapeArgos(query), scrapeSmyths(query), scrapePokemonCenter(query), scrapeGame(query),
    scrapeTotalCards(query), scrapeChaosCards(query), scrapeMagicMadhouse(query),
  ]);
  return settled.flatMap(s => s.status === 'fulfilled' ? s.value : []);
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing query' });
  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, cached: true });
  const all = await scrapeAll(`pokemon tcg ${query}`);
  const results = groupByProduct(all);
  cache.set(cacheKey, results);
  res.json({ results, cached: false, timestamp: new Date().toISOString() });
});

app.get('/api/popular', async (req, res) => {
  const cacheKey = 'popular';
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, cached: true });

  const QUERIES = [
    { name: 'Prismatic Evolutions Elite Trainer Box',  query: 'Pokemon Prismatic Evolutions Elite Trainer Box' },
    { name: 'Prismatic Evolutions Booster Bundle',     query: 'Pokemon Prismatic Evolutions Booster Bundle' },
    { name: 'Surging Sparks Booster Box',              query: 'Pokemon Surging Sparks Booster Box' },
    { name: 'Surging Sparks Elite Trainer Box',        query: 'Pokemon Surging Sparks Elite Trainer Box' },
    { name: 'Stellar Crown Elite Trainer Box',         query: 'Pokemon Stellar Crown Elite Trainer Box' },
    { name: 'Paldean Fates Elite Trainer Box',         query: 'Pokemon Paldean Fates Elite Trainer Box' },
    { name: 'Twilight Masquerade Booster Box',         query: 'Pokemon Twilight Masquerade Booster Box' },
    { name: 'Paradox Rift Booster Box',                query: 'Pokemon Paradox Rift Booster Box' },
    { name: 'Charizard ex Premium Collection',         query: 'Pokemon Charizard ex Premium Collection' },
    { name: 'Pikachu ex Tin',                          query: 'Pokemon Pikachu ex Tin' },
  ];

  const results = await Promise.all(QUERIES.map(async ({ name, query }) => {
    const settled = await Promise.allSettled([
      scrapeArgos(query), scrapeSmyths(query), scrapePokemonCenter(query),
      scrapeTotalCards(query), scrapeChaosCards(query), scrapeMagicMadhouse(query),
    ]);
    const all = settled.flatMap(s => s.status === 'fulfilled' ? s.value : []);
    const retailers = [];
    const seen = new Set();
    for (const item of all) {
      if (!seen.has(item.retailer) && item.url) {
        seen.add(item.retailer);
        retailers.push({ name: item.retailer, price: item.price || 'N/A', url: item.url, stock: item.stock, logo: item.logo });
      }
    }
    const displayName = all[0]?.name || name;
    return { id: name.toLowerCase().replace(/\s+/g, '-'), name: displayName, retailers };
  }));

  const filtered = results.filter(p => p.retailers.length > 0);
  cache.set(cacheKey, filtered);
  res.json({ results: filtered, cached: false, timestamp: new Date().toISOString() });
});

app.get('/api/new-releases', async (req, res) => {
  const cacheKey = 'new-releases';
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, cached: true });
  const sets = await getLatestSets();
  cache.set(cacheKey, sets);
  res.json({ results: sets, cached: false, timestamp: new Date().toISOString() });
});

// Debug endpoint — lets us see raw scrape output for a retailer
app.get('/api/debug/:retailer', async (req, res) => {
  const { retailer } = req.params;
  const query = req.query.q || 'Pokemon Elite Trainer Box';
  let results = [];
  if (retailer === 'pokemoncenter') results = await scrapePokemonCenter(query);
  else if (retailer === 'argos') results = await scrapeArgos(query);
  else if (retailer === 'smyths') results = await scrapeSmyths(query);
  else if (retailer === 'totalcards') results = await scrapeTotalCards(query);
  res.json({ retailer, query, count: results.length, results });
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`gottaripemall backend running on port ${PORT}`));
