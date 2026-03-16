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
  const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
  return cheerio.load(res.data);
}

async function scrapeSmyths(query) {
  try {
    const $ = await fetchPage(`https://www.smythstoys.com/uk/en-gb/search/?text=${encodeURIComponent(query)}`);
    const results = [];
    $('.product-item, [class*="productItem"]').slice(0, 4).each((_, el) => {
      const name = $(el).find('[class*="name"], h2, h3').first().text().trim();
      const price = $(el).find('[class*="price"]').first().text().trim();
      const outOfStock = $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a').first().attr('href');
      if (name) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url: href ? `https://www.smythstoys.com${href}` : 'https://www.smythstoys.com', retailer: 'Smyths' });
    });
    return results;
  } catch (e) { return []; }
}

async function scrapeArgos(query) {
  try {
    const $ = await fetchPage(`https://www.argos.co.uk/search/${encodeURIComponent(query)}/`);
    const results = [];
    $('[data-test="component-product-card"], [class*="ProductCard"]').slice(0, 4).each((_, el) => {
      const name = $(el).find('[data-test="component-product-card-title"], h2, h3').first().text().trim();
      const price = $(el).find('[class*="price"]').first().text().trim();
      const outOfStock = $(el).text().toLowerCase().includes('out of stock');
      const href = $(el).find('a').first().attr('href');
      if (name) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url: href ? `https://www.argos.co.uk${href}` : 'https://www.argos.co.uk', retailer: 'Argos' });
    });
    return results;
  } catch (e) { return []; }
}

async function scrapeZatu(query) {
  try {
    const $ = await fetchPage(`https://www.zatu.co.uk/search?q=${encodeURIComponent(query)}`);
    const results = [];
    $('.product, [class*="product-item"]').slice(0, 4).each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"]').first().text().trim();
      const price = $(el).find('[class*="price"]').first().text().trim();
      const outOfStock = $(el).text().toLowerCase().includes('out of stock');
      const url = $(el).find('a').first().attr('href');
      if (name) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url: url || 'https://www.zatu.co.uk', retailer: 'Zatu' });
    });
    return results;
  } catch (e) { return []; }
}

async function scrapeGame(query) {
  try {
    const $ = await fetchPage(`https://www.game.co.uk/search?q=${encodeURIComponent(query)}`);
    const results = [];
    $('[class*="product"], .item').slice(0, 4).each((_, el) => {
      const name = $(el).find('h2, h3, [class*="title"]').first().text().trim();
      const price = $(el).find('[class*="price"]').first().text().trim();
      const outOfStock = $(el).text().toLowerCase().includes('out of stock');
      const url = $(el).find('a').first().attr('href');
      if (name) results.push({ name, price, stock: outOfStock ? 'out' : 'in', url: url || 'https://www.game.co.uk', retailer: 'Game' });
    });
    return results;
  } catch (e) { return []; }
}

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing query parameter q' });
  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, cached: true });

  const [smyths, argos, zatu, game] = await Promise.allSettled([
    scrapeSmyths(query), scrapeArgos(query), scrapeZatu(query), scrapeGame(query)
  ]);

  const all = [
    ...(smyths.status === 'fulfilled' ? smyths.value : []),
    ...(argos.status  === 'fulfilled' ? argos.value  : []),
    ...(zatu.status   === 'fulfilled' ? zatu.value   : []),
    ...(game.status   === 'fulfilled' ? game.value   : []),
  ];

  const grouped = {};
  for (const item of all) {
    if (!item.name) continue;
    const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (!grouped[key]) grouped[key] = { id: key, name: item.name, retailers: [] };
    grouped[key].retailers.push({ name: item.retailer, price: item.price || 'N/A', url: item.url, stock: item.stock });
  }

  const results = Object.values(grouped);
  cache.set(cacheKey, results);
  res.json({ results, cached: false, timestamp: new Date().toISOString() });
});

app.get('/api/popular', async (req, res) => {
  const cacheKey = 'popular';
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, cached: true });

  const POPULAR = [
    'Prismatic Evolutions Elite Trainer Box',
    'Surging Sparks Booster Box',
    'Stellar Crown Elite Trainer Box',
    'Paldean Fates Elite Trainer Box',
    'Twilight Masquerade Booster Box',
    'Paradox Rift Booster Box',
    'Charizard ex Collection',
    'Pikachu ex Tin',
  ];

  const results = await Promise.all(POPULAR.map(async q => {
    const [smyths, argos, zatu] = await Promise.allSettled([
      scrapeSmyths(q), scrapeArgos(q), scrapeZatu(q)
    ]);
    const retailers = [smyths, argos, zatu]
      .filter(s => s.status === 'fulfilled' && s.value.length > 0)
      .map(s => s.value[0])
      .map(r => ({ name: r.retailer, price: r.price || 'N/A', url: r.url, stock: r.stock }));
    return { id: q.toLowerCase().replace(/\s+/g, '-'), name: q, retailers };
  }));

  cache.set(cacheKey, results);
  res.json({ results, cached: false, timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`gottaripemall backend running on port ${PORT}`));
