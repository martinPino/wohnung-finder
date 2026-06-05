import { chromium } from "playwright";
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto("https://www.immobilienscout24.de", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Dismiss cookie banner
  for (const s of ['button:has-text("Alle akzeptieren")', 'button:has-text("Akzeptieren")']) {
    const b = page.locator(s).first();
    if (await b.isVisible({timeout:1500}).catch(()=>false)) { await b.click(); await page.waitForTimeout(500); break; }
  }

  // Dump all select, button and dropdown elements in the search area
  const els = await page.$$eval("select, [role='listbox'], [role='combobox'], [class*='dropdown'], [class*='select'], [class*='filter'], button", els =>
    (els as HTMLElement[]).map(el => ({
      tag: el.tagName,
      text: (el.textContent??'').trim().replace(/\s+/g,' ').substring(0,60),
      id: el.id,
      name: (el as HTMLSelectElement).name ?? '',
      role: el.getAttribute('role')||'',
      cls: (el.className||'').replace(/\s+/g,' ').substring(0,80),
      options: el.tagName === 'SELECT' ? [...(el as HTMLSelectElement).options].map(o=>o.text+':'+o.value) : [],
    })).filter(e => e.text.length > 0 || e.options.length > 0)
  );

  console.log("=== Search form elements ===");
  els.forEach(e => {
    const relevant = /mieten|kaufen|wohnung|haus|suche|filter|type|art/i.test(e.text+e.id+e.name+e.cls);
    if (relevant) console.log(`⭐ [${e.tag}] "${e.text}" id="${e.id}" name="${e.name}" role="${e.role}" cls="${e.cls.substring(0,50)}" opts=[${e.options.join(', ')}]`);
  });

  await page.screenshot({ path: "/tmp/homepage.png" });
  await page.close();
  await browser.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
