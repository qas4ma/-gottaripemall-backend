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

async function fetchPage(url) {
  const res = await axios.get(url, { headers: HEADERS, timeout: 12000 });
  return cheerio.load(res.data);
}

// ── Scrapers ──────────────────────────────────────────────────────────────────

async function scrapeArgos(query) {
  try {
    const $ = await fetchPage(`https://www.argos.co.uk/search/${encodeURIComponent(query)}/`);
    const results = [];
    $('[class*="ProductCard"], [data-test="component-product-card"]').slice(0, 6).each((_, el) => {
      const name = $(el).find('[data-test="component-product-card-title"], h2, h3').first().text().trim();
      const priceEl = $(el).find('[class*="price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a[href*="/product/"]').first().attr('href');
      const url = href ? `https://www.argos.co.uk${href}` : null;
      if (name && url) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Argos', logo: '🛒' });
    });
    return results;
  } catch (e) { return []; }
}

async function scrapeSmyths(query) {
  try {
    const $ = await fetchPage(`https://www.smythstoys.com/uk/en-gb/search/?text=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product-tile"], [class*="ProductTile"], .product-item, [class*="product-grid-item"]').slice(0, 6).each((_, el) => {
      const name = $(el).find('[class*="product-title"], [class*="ProductTitle"], h2, h3').first().text().trim();
      const priceEl = $(el).find('[class*="price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock') || $(el).find('[class*="outOfStock"]').length > 0;
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.smythstoys.com${href}`) : null;
      if (name && url) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Smyths', logo: '🧸' });
    });
    return results;
  } catch (e) { return []; }
}

async function scrapeZatu(query) {
  try {
    const $ = await fetchPage(`https://www.zatu.co.uk/search?q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product-card"], [class*="ProductCard"], .product, [class*="product-item"]').slice(0, 6).each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"], [class*="name"]').first().text().trim();
      const priceEl = $(el).find('[class*="price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock') || $(el).text().toLowerCase().includes('pre-order');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.zatu.co.uk${href}`) : null;
      if (name && url) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Zatu', logo: '🎲' });
    });
    return results;
  } catch (e) { return []; }
}

async function scrapeGame(query) {
  try {
    const $ = await fetchPage(`https://www.game.co.uk/search?q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product-card"], [class*="product-item"], .product').slice(0, 6).each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"]').first().text().trim();
      const priceEl = $(el).find('[class*="price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.game.co.uk${href}`) : null;
      if (name && url) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Game', logo: '🎮' });
    });
    return results;
  } catch (e) { return []; }
}

async function scrapePokemonCenter(query) {
  try {
    const $ = await fetchPage(`https://www.pokemoncenter.com/en-gb/search?q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product-tile"], [class*="ProductTile"], [class*="product-card"]').slice(0, 6).each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"], [class*="name"]').first().text().trim();
      const priceEl = $(el).find('[class*="price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock') || $(el).text().toLowerCase().includes('sold out');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.pokemoncenter.com${href}`) : null;
      if (name && url) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Pokémon Center', logo: '🎴' });
    });
    return results;
  } catch (e) { return []; }
}

async function scrapeTotalCards(query) {
  try {
    const $ = await fetchPage(`https://www.totalcards.net/search?type=product&q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product"], .grid__item').slice(0, 6).each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"], .card__heading').first().text().trim();
      const priceEl = $(el).find('[class*="price"], .price').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('sold out') || $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.totalcards.net${href}`) : null;
      if (name && url) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Total Cards', logo: '🃏' });
    });
    return results;
  } catch (e) { return []; }
}

async function scrapeChaosCards(query) {
  try {
    const $ = await fetchPage(`https://www.chaoscards.co.uk/search?type=product&q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product"], .grid__item, [class*="ProductItem"]').slice(0, 6).each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"]').first().text().trim();
      const priceEl = $(el).find('[class*="price"], .price').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('sold out') || $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.chaoscards.co.uk${href}`) : null;
      if (name && url) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Chaos Cards', logo: '🌀' });
    });
    return results;
  } catch (e) { return []; }
}

async function scrapeMagicMadhouse(query) {
  try {
    const $ = await fetchPage(`https://www.magicmadhouse.co.uk/search?q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product"], .grid__item').slice(0, 6).each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"]').first().text().trim();
      const priceEl = $(el).find('[class*="price"], .price').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('sold out') || $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.magicmadhouse.co.uk${href}`) : null;
      if (name && url) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Magic Madhouse', logo: '🔮' });
    });
    return results;
  } catch (e) { return []; }
}

// ── Get latest sets from TCGdex API ──────────────────────────────────────────
async function getLatestSets() {
  try {
    const res = await axios.get('https://api.tcgdex.net/v2/en/sets', { timeout: 8000 });
    // Sort by release date descending, take top 10
    const sets = res.data
      .filter(s => s.releaseDate)
      .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))
      .slice(0, 10);
    return sets;
  } catch (e) { return []; }
}

// ── Group results by product ──────────────────────────────────────────────────
function groupByProduct(allResults) {
  const grouped = {};
  for (const item of allResults) {
    if (!item.name || item.name.length < 5) continue;
    const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (!grouped[key]) grouped[key] = { id: key, name: item.name, retailers: [] };
    // avoid duplicate retailer entries
    if (!grouped[key].retailers.find(r => r.name === item.retailer)) {
      grouped[key].retailers.push({ name: item.retailer, price: item.price || 'N/A', url: item.url, stock: item.stock, logo: item.logo });
    }
  }
  return Object.values(grouped).filter(p => p.retailers.length > 0);
}

async function scrapeAll(query) {
  const settled = await Promise.allSettled([
    scrapeArgos(query),
    scrapeSmyths(query),
    scrapeZatu(query),
    scrapeGame(query),
    scrapePokemonCenter(query),
    scrapeTotalCards(query),
    scrapeChaosCards(query),
    scrapeMagicMadhouse(query),
  ]);
  return settled.flatMap(s => s.status === 'fulfilled' ? s.value : []);
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing query' });
  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, cached: true });

  const all = await scrapeAll(query + ' pokemon tcg');
  const results = groupByProduct(all);
  cache.set(cacheKey, results);
  res.json({ results, cached: false, timestamp: new Date().toISOString() });
});

app.get('/api/popular', async (req, res) => {
  const cacheKey = 'popular';
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, cached: true });

  // Get latest sets from TCGdex to keep popular products up to date
  const latestSets = await getLatestSets();
  const setQueries = latestSets.map(s => `${s.name} pokemon tcg`);

  // Always include evergreen popular products
  const staticQueries = [
    'Prismatic Evolutions Elite Trainer Box pokemon',
    'Surging Sparks Booster Box pokemon',
    'Paldean Fates Elite Trainer Box pokemon',
    'Twilight Masquerade Booster Box pokemon',
    'Charizard ex Premium Collection pokemon',
    'Pikachu ex Tin pokemon',
  ];

  // Merge latest sets with static popular, dedupe
  const allQueries = [...new Set([...setQueries.slice(0, 6), ...staticQueries])].slice(0, 10);

  const results = await Promise.all(allQueries.map(async q => {
    const settled = await Promise.allSettled([
      scrapeArgos(q), scrapeSmyths(q), scrapeZatu(q),
      scrapeTotalCards(q), scrapeChaosCards(q), scrapePokemonCenter(q),
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
    const name = all[0]?.name || q.replace(' pokemon tcg', '').replace(' pokemon', '');
    return { id: q.toLowerCase().replace(/\s+/g, '-'), name, retailers };
  }));

  const filtered = results.filter(p => p.retailers.length > 0);
  cache.set(cacheKey, filtered);
  res.json({ results: filtered, cached: false, timestamp: new Date().toISOString() });
});

// New releases endpoint using TCGdex
app.get('/api/new-releases', async (req, res) => {
  const cacheKey = 'new-releases';
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, cached: true });

  const sets = await getLatestSets();
  cache.set(cacheKey, sets);
  res.json({ results: sets, cached: false, timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`gottaripemall backend running on port ${PORT}`));
