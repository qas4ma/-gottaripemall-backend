const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 300 }); // cache 5 mins

app.use(cors());
app.use(express.json());

// ─── Scrapers ────────────────────────────────────────────────────────────────

async function withBrowser(fn) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function scrapeSmyths(query) {
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
    const url = `https://www.smythstoys.com/uk/en-gb/search/?text=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    const results = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.product-item, [class*="productItem"], [class*="product-tile"]'));
      return cards.slice(0, 5).map(card => {
        const name = card.querySelector('[class*="name"], h2, h3, .product-name')?.innerText?.trim();
        const price = card.querySelector('[class*="price"], .price')?.innerText?.trim();
        const outOfStock = card.innerText.toLowerCase().includes('out of stock') ||
                           card.querySelector('[class*="outOfStock"], [class*="unavailable"]') !== null;
        const url = card.querySelector('a')?.href;
        return { name, price, stock: outOfStock ? 'out' : 'in', url };
      }).filter(r => r.name);
    });

    return results.map(r => ({ ...r, retailer: 'Smyths', logo: 'smyths' }));
  });
}

async function scrapeArgos(query) {
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
    const url = `https://www.argos.co.uk/search/${encodeURIComponent(query)}/`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    const results = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-test="component-product-card"], [class*="ProductCard"]'));
      return cards.slice(0, 5).map(card => {
        const name = card.querySelector('[data-test="component-product-card-title"], h2, h3')?.innerText?.trim();
        const price = card.querySelector('[data-test="component-product-card-price"], [class*="price"]')?.innerText?.trim();
        const outOfStock = card.innerText.toLowerCase().includes('out of stock') ||
                           card.querySelector('[class*="outOfStock"]') !== null;
        const url = card.querySelector('a')?.href;
        return { name, price, stock: outOfStock ? 'out' : 'in', url: url ? `https://www.argos.co.uk${url}` : null };
      }).filter(r => r.name);
    });

    return results.map(r => ({ ...r, retailer: 'Argos', logo: 'argos' }));
  });
}

async function scrapeZatu(query) {
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
    const url = `https://www.zatu.co.uk/search?q=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    const results = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.product, [class*="product-item"], .search-result'));
      return cards.slice(0, 5).map(card => {
        const name = card.querySelector('h2, h3, [class*="title"], [class*="name"]')?.innerText?.trim();
        const price = card.querySelector('[class*="price"]')?.innerText?.trim();
        const outOfStock = card.innerText.toLowerCase().includes('out of stock') ||
                           card.innerText.toLowerCase().includes('pre-order');
        const url = card.querySelector('a')?.href;
        return { name, price, stock: outOfStock ? 'out' : 'in', url };
      }).filter(r => r.name);
    });

    return results.map(r => ({ ...r, retailer: 'Zatu', logo: 'zatu' }));
  });
}

async function scrapeGame(query) {
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
    const url = `https://www.game.co.uk/search?q=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    const results = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[class*="product"], .item'));
      return cards.slice(0, 5).map(card => {
        const name = card.querySelector('h2, h3, [class*="title"]')?.innerText?.trim();
        const price = card.querySelector('[class*="price"]')?.innerText?.trim();
        const outOfStock = card.innerText.toLowerCase().includes('out of stock') ||
                           card.querySelector('[class*="outofstock"]') !== null;
        const url = card.querySelector('a')?.href;
        return { name, price, stock: outOfStock ? 'out' : 'in', url };
      }).filter(r => r.name);
    });

    return results.map(r => ({ ...r, retailer: 'Game', logo: 'game' }));
  });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Search across all retailers
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing query parameter q' });

  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, cached: true });

  try {
    const [smyths, argos, zatu, game] = await Promise.allSettled([
      scrapeSmyths(query),
      scrapeArgos(query),
      scrapeZatu(query),
      scrapeGame(query),
    ]);

    const allResults = [
      ...(smyths.status === 'fulfilled' ? smyths.value : []),
      ...(argos.status  === 'fulfilled' ? argos.value  : []),
      ...(zatu.status   === 'fulfilled' ? zatu.value   : []),
      ...(game.status   === 'fulfilled' ? game.value   : []),
    ];

    // Group by normalised product name
    const grouped = {};
    for (const item of allResults) {
      if (!item.name) continue;
      const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          name: item.name,
          retailers: [],
        };
      }
      grouped[key].retailers.push({
        name: item.retailer,
        price: item.price || 'N/A',
        url: item.url || '#',
        stock: item.stock,
      });
    }

    const results = Object.values(grouped);
    cache.set(cacheKey, results);
    res.json({ results, cached: false, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Scrape failed', detail: err.message });
  }
});

// Check stock for a specific product URL
app.get('/api/stock', async (req, res) => {
  const { url, retailer } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  const cacheKey = `stock:${url}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const result = await withBrowser(async (browser) => {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

      return page.evaluate(() => {
        const body = document.body.innerText.toLowerCase();
        const inStock = body.includes('add to basket') || body.includes('add to cart') || body.includes('buy now');
        const outOfStock = body.includes('out of stock') || body.includes('sold out') || body.includes('unavailable');
        const lowStock = body.includes('low stock') || body.includes('only') && body.includes('left');
        const priceEl = document.querySelector('[class*="price"], [itemprop="price"], .price');
        return {
          stock: outOfStock ? 'out' : lowStock ? 'low' : inStock ? 'in' : 'unknown',
          price: priceEl?.innerText?.trim() || null,
        };
      });
    });

    cache.set(cacheKey, result);
    res.json({ ...result, url, retailer, cached: false, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Stock check failed', detail: err.message });
  }
});

// Popular products — check stock for a curated list
app.get('/api/popular', async (req, res) => {
  const cacheKey = 'popular';
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, cached: true });

  const POPULAR_QUERIES = [
    'Prismatic Evolutions Elite Trainer Box',
    'Surging Sparks Booster Box',
    'Stellar Crown Elite Trainer Box',
    'Paldean Fates Elite Trainer Box',
    'Twilight Masquerade Booster Box',
    'Paradox Rift Booster Box',
    'Charizard ex Collection',
    'Pikachu ex Tin',
  ];

  try {
    const results = await Promise.all(
      POPULAR_QUERIES.map(q =>
        Promise.allSettled([
          scrapeSmyths(q),
          scrapeArgos(q),
          scrapeZatu(q),
        ]).then(settled => {
          const retailers = settled
            .filter(s => s.status === 'fulfilled' && s.value.length > 0)
            .map(s => s.value[0])
            .map(r => ({ name: r.retailer, price: r.price || 'N/A', url: r.url || '#', stock: r.stock }));
          return { id: q.toLowerCase().replace(/\s+/g, '-'), name: q, retailers };
        })
      )
    );

    cache.set(cacheKey, results);
    res.json({ results, cached: false, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch popular products', detail: err.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`gottaripemall backend running on port ${PORT}`));
