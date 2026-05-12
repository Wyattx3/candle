require('dotenv').config();
const K = require('@onkernel/sdk').default;
const k = new K({ apiKey: process.env.KERNEL_API_KEY });

(async () => {
  // 1. Create residential proxy
  console.log("Creating residential proxy...");
  const proxy = await k.proxies.create({
    type: 'residential',
    config: { country: 'US' },
    name: 'google-search-proxy'
  });
  console.log("Proxy ID:", proxy.id);
  console.log("Proxy type:", proxy.type);

  // 2. Create browser with proxy attached
  console.log("\nCreating browser with proxy...");
  const s = await k.browsers.create({
    stealth: true,
    headless: false,
    timeout_seconds: 90,
    proxy_id: proxy.id,
  });
  console.log("Session:", s.session_id);

  try {
    // 3. Google search via Playwright
    console.log("\n--- Google search with residential proxy ---");
    const r = await k.browsers.playwright.execute(s.session_id, {
      code: `
        await page.goto("https://www.google.com/search?q=One+Piece+manga+latest+chapter&hl=en&num=5", { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(3000);
        const url = page.url();
        
        // Check if CAPTCHA
        if (url.includes("/sorry/")) {
          // Wait for auto-CAPTCHA solver
          for (let i = 0; i < 4; i++) {
            await page.waitForTimeout(5000);
            if (!page.url().includes("/sorry/")) break;
          }
        }
        
        const finalUrl = page.url();
        const links = await page.$$eval('#search a[href]', (els) => {
          return els.map(el => {
            const h3 = el.querySelector('h3');
            return {
              title: h3 ? h3.innerText.trim() : '',
              href: el.getAttribute('href') || ''
            };
          }).filter(l => l.title);
        });
        return { finalUrl, blocked: finalUrl.includes("/sorry/"), resultCount: links.length, results: links.slice(0, 5) };
      `,
      timeout_sec: 60,
    });
    console.log("Success:", r.success);
    if (r.success) console.log(JSON.stringify(r.result, null, 2));
    else console.log("Error:", r.error);

  } finally {
    await k.browsers.deleteByID(s.session_id).catch(() => {});
    await k.proxies.delete(proxy.id).catch(() => {});
    console.log("\nCleaned up.");
  }
})();
