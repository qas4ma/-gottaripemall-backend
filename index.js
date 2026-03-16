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

async function scrapeArgos(query) {
  try {
    const $ = await fetchPage(`https://www.argos.co.uk/search/${encodeURIComponent(query)}/`);
    const results = [];
    $('[class*="ProductCard"], [data-test="component-product-card"]').slice(0, 5).each((_, el) => {
      const name = $(el).find('[data-test="component-product-card-title"], h2, h3').first().text().trim();
      const priceEl = $(el).find('[data-test="component-product-card-price"], [class*="price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a[href*="/product/"]').first().attr('href');
      const url = href ? `https://www.argos.co.uk${href}` : null;
      if (name && url) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Argos' });
    });
    return results;
  } catch (e) { console.error('Argos error:', e.message); return []; }
}

async function scrapeSmyths(query) {
  try {
    const $ = await fetchPage(`https://www.smythstoys.com/uk/en-gb/search/?text=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product-tile"], [class*="ProductTile"], .product-item').slice(0, 5).each((_, el) => {
      const name = $(el).find('[class*="product-title"], [class*="ProductTitle"], h2, h3').first().text().trim();
      const priceEl = $(el).find('[class*="price"], [class*="Price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock') || $(el).find('[class*="outOfStock"]').length > 0;
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.smythstoys.com${href}`) : null;
      if (name && url) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Smyths' });
    });
    return results;
  } catch (e) { console.error('Smyths error:', e.message); return []; }
}

async function scrapeZatu(query) {
  try {
    const $ = await fetchPage(`https://www.zatu.co.uk/search?q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product-card"], [class*="ProductCard"], .product').slice(0, 5).each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"], [class*="name"]').first().text().trim();
      const priceEl = $(el).find('[class*="price"], [class*="Price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock') || $(el).text().toLowerCase().includes('pre-order');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.zatu.co.uk${href}`) : null;
      if (name && url) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Zatu' });
    });
    return results;
  } catch (e) { console.error('Zatu error:', e.message); return []; }
}

async function scrapeGame(query) {
  try {
    const $ = await fetchPage(`https://www.game.co.uk/search?q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product-card"], [class*="product-item"], .product').slice(0, 5).each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"]').first().text().trim();
      const priceEl = $(el).find('[class*="price"]').first().text().trim();
      const price = priceEl.match(/£[\d.]+/)?.[0] || priceEl;
      const outOfStock = $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a').first().attr('href');
      const url = href ? (href.startsWith('http') ? href : `https://www.game.co.uk${href}`) : null;
      if (name && url) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url, retailer: 'Game' });
    });
    return results;
  } catch (e) { console.error('Game error:', e.message); return []; }
}

// Group results by product name, collecting all retailers
function groupByProduct(allResults) {
  const grouped = {};
  for (const item of allResults) {
    if (!item.name || !item.url) continue;
    const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (!grouped[key]) {
      grouped[key] = { id: key, name: item.name, retailers: [] };
    }
    grouped[key].retailers.push({
      name: item.retailer,
      price: item.price || 'N/A',
      url: item.url,
      stock: item.stock,
    });
  }
  return Object.values(grouped);
}

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing query parameter q' });

  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, cached: true });

  const [argos, smyths, zatu, game] = await Promise.allSettled([
    scrapeArgos(query), scrapeSmyths(query), scrapeZatu(query), scrapeGame(query)
  ]);

  const all = [
    ...(argos.status  === 'fulfilled' ? argos.value  : []),
    ...(smyths.status === 'fulfilled' ? smyths.value : []),
    ...(zatu.status   === 'fulfilled' ? zatu.value   : []),
    ...(game.status   === 'fulfilled' ? game.value   : []),
  ];

  const results = groupByProduct(all);
  cache.set(cacheKey, results);
  res.json({ results, cached: false, timestamp: new Date().toISOString() });
});

app.get('/api/popular', async (req, res) => {
  const cacheKey = 'popular';
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, cached: true });

  const POPULAR = [
    'Prismatic Evolutions Elite Trainer Box Pokemon',
    'Surging Sparks Booster Box Pokemon',
    'Stellar Crown Elite Trainer Box Pokemon',
    'Paldean Fates Elite Trainer Box Pokemon',
    'Twilight Masquerade Booster Box Pokemon',
    'Paradox Rift Booster Box Pokemon',
    'Charizard ex Premium Collection Pokemon',
    'Pikachu ex Tin Pokemon',
  ];

  const results = await Promise.all(POPULAR.map(async q => {
    const [argos, smyths, zatu] = await Promise.allSettled([
      scrapeArgos(q), scrapeSmyths(q), scrapeZatu(q)
    ]);

    const all = [
      ...(argos.status  === 'fulfilled' ? argos.value  : []),
      ...(smyths.status === 'fulfilled' ? smyths.value : []),
      ...(zatu.status   === 'fulfilled' ? zatu.value   : []),
    ];

    // Pick the best matching result per retailer
    const retailers = [];
    const seen = new Set();
    for (const item of all) {
      if (!seen.has(item.retailer)) {
        seen.add(item.retailer);
        retailers.push({ name: item.retailer, price: item.price || 'N/A', url: item.url, stock: item.stock });
      }
    }

    const firstName = all[0]?.name || q.replace(' Pokemon', '');
    return {
      id: q.toLowerCase().replace(/\s+/g, '-'),
      name: firstName,
      retailers,
    };
  }));

  cache.set(cacheKey, results);
  res.json({ results, cached: false, timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`gottaripemall backend running on port ${PORT}`));
