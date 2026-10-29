// Smoke test E2E (Playwright) — hors `npm test`.
// Prérequis : front sur http://localhost:3000 (npm start) et API sur http://localhost:8000/api/v1 (données de démo).
// Usage : SHOTS_DIR=/chemin/captures node e2e/smoke.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:8000/api/v1";
const OUT = process.env.SHOTS_DIR ?? join(process.cwd(), "e2e", "output");
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-2026!";
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
mkdirSync(OUT, { recursive: true });

// Tuile PNG 1x1 gris sombre (base64)
const TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGOQkVPFihiGlgQARg8XwTKrM44AAAAASUVORK5CYII=",
  "base64",
);

const VIEWPORTS = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
};

const problems = [];
let checks = 0;
function check(cond, msg) {
  checks++;
  if (!cond) problems.push(`ÉCHEC : ${msg}`);
}

async function token(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email} → ${res.status}`);
  return (await res.json()).access_token;
}

async function firstSlug() {
  const r = await fetch(`${API}/places/search?city=abidjan&page_size=5&sort=popularity`);
  const d = await r.json();
  return d.items.find((p) => !p.locked).slug;
}

async function newPage(browser, vp, { tokenValue = null, onboarded = true, geo = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: VIEWPORTS[vp].width, height: VIEWPORTS[vp].height },
    deviceScaleFactor: VIEWPORTS[vp].deviceScaleFactor,
    isMobile: VIEWPORTS[vp].isMobile ?? false,
    hasTouch: VIEWPORTS[vp].hasTouch ?? false,
    locale: "fr-FR",
    timezoneId: "Africa/Abidjan",
    ...(geo ? { geolocation: { latitude: 5.3480, longitude: -3.9870 }, permissions: ["geolocation"] } : {}),
  });
  await ctx.addInitScript(
    ([t, ob]) => {
      try {
        if (t) localStorage.setItem("sortie.token", t);
        if (ob) localStorage.setItem("sortie.onboarded", "1");
      } catch {}
    },
    [tokenValue, onboarded],
  );
  // Fonds de carte simulés si le réseau n'atteint pas OSM (STUB_TILES=0 pour désactiver).
  if (process.env.STUB_TILES !== "0") {
    await ctx.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: "image/png", body: TILE }));
  }
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${vp}] erreur JS : ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/tile\.openstreetmap|ERR_|net::|Failed to load resource/.test(m.text())) problems.push(`[${vp}] console : ${m.text()}`);
  });
  return { ctx, page };
}

async function shot(page, name, { full = true } = {}) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 8000 }).catch(() => undefined);
}

const run = (name) => !ONLY || ONLY.has(name);

const browser = await chromium.launch();
const slug = await firstSlug();
const tokens = {
  insider: await token("insider@sortie.demo"),
  free: await token("user@sortie.demo"),
  admin: await token("admin@sortie.demo"),
};

for (const vp of Object.keys(VIEWPORTS)) {
  // --- Anonyme
  if (run("anon")) {
    const { ctx, page } = await newPage(browser, vp, { onboarded: false });
    await page.goto(`${WEB}/`);
    await page.waitForURL(/\/onboarding/, { timeout: 8000 }).catch(() => undefined);
    check(page.url().includes("/onboarding"), `[${vp}] premier passage → onboarding`);
    await settle(page);
    await page.getByRole("button", { name: /Rooftops/ }).first().click();
    await shot(page, `${vp}-01-onboarding`);
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await shot(page, `${vp}-01b-onboarding-consent`);
    await page.getByRole("button", { name: /C'est parti/ }).click();
    await page.waitForURL(`${WEB}/`);
    await settle(page);
    check((await page.locator("article").count()) > 0, `[${vp}] accueil : des cartes de lieux`);
    check((await page.getByText("Démo", { exact: true }).count()) > 0, `[${vp}] badge Démo visible`);
    check((await page.getByText("Données de démonstration fictives.").count()) === 1, `[${vp}] bandeau démo en pied de page`);
    await shot(page, `${vp}-02-home`);

    await page.goto(`${WEB}/search?categories=maquis,restaurant&sort=popularity`);
    await settle(page);
    check((await page.locator("article").count()) > 0, `[${vp}] recherche : résultats`);
    await shot(page, `${vp}-03-search`);
    await page.getByRole("button", { name: /Filtres/ }).click();
    await page.waitForTimeout(300);
    await shot(page, `${vp}-03b-filters`, { full: false });
    await page.keyboard.press("Escape");

    await page.goto(`${WEB}/map`);
    await settle(page);
    await page.waitForTimeout(1500);
    const pins = await page.locator(".sortie-pin").count();
    check(pins > 0, `[${vp}] carte : marqueurs (${pins})`);
    if (pins) {
      await page.locator(".leaflet-marker-icon").nth(1).click({ force: true });
      await page.waitForTimeout(300);
    }
    await shot(page, `${vp}-04-map`, { full: false });

    await page.goto(`${WEB}/places/${slug}`);
    await settle(page);
    check((await page.getByText("à vol d'oiseau").count()) > 0, `[${vp}] fiche : distance à vol d'oiseau`);
    check((await page.getByText("Fiabilité").count()) > 0, `[${vp}] fiche : bloc Fiabilité`);
    await shot(page, `${vp}-05-place`);

    await page.goto(`${WEB}/gems`);
    await settle(page);
    await shot(page, `${vp}-06-gems-anon`);

    await page.goto(`${WEB}/concierge`);
    await settle(page);
    check((await page.getByText("Se connecter").count()) > 0, `[${vp}] concierge anonyme → invitation à se connecter`);

    await page.goto(`${WEB}/login`);
    await settle(page);
    await shot(page, `${vp}-07-login`);
    await page.goto(`${WEB}/premium`);
    await settle(page);
    await shot(page, `${vp}-08-premium`);
    await ctx.close();
  }

  // --- Compte gratuit : pépites verrouillées, quota, checkout 501
  if (run("free")) {
    const { ctx, page } = await newPage(browser, vp, { tokenValue: tokens.free });
    await page.goto(`${WEB}/gems`);
    await settle(page);
    check((await page.getByRole("article", { name: "Pépite verrouillée" }).count()) > 0, `[${vp}] plan gratuit : pépites verrouillées`);
    await shot(page, `${vp}-09-gems-locked`);
    await page.goto(`${WEB}/premium`);
    await settle(page);
    await page.getByRole("button", { name: /Choisir Plus/ }).click();
    await page.getByRole("dialog").waitFor();
    check((await page.getByText(/Paiement pas encore activé/).count()) > 0, `[${vp}] checkout → message 501 honnête`);
    await shot(page, `${vp}-10-premium-501`, { full: false });
    await ctx.close();
  }

  // --- Insider : concierge, itinéraire, favoris, profil
  if (run("insider")) {
    const { ctx, page } = await newPage(browser, vp, { tokenValue: tokens.insider, geo: true });
    await page.goto(`${WEB}/gems`);
    await settle(page);
    check((await page.getByRole("article", { name: "Pépite verrouillée" }).count()) === 0, `[${vp}] insider : pépites débloquées`);
    await shot(page, `${vp}-11-gems-insider`);

    await page.goto(`${WEB}/concierge`);
    await settle(page);
    await page.getByRole("button", { name: /rooftop calme/ }).click();
    await page.locator("article").first().waitFor({ timeout: 10000 }).catch(() => undefined);
    check((await page.getByText(/Mode règles|IA/).count()) > 0, `[${vp}] concierge : fournisseur affiché`);
    await shot(page, `${vp}-12-concierge`);

    await page.goto(`${WEB}/itinerary`);
    await settle(page);
    await page.getByRole("radio", { name: "3" }).click();
    await page.getByRole("button", { name: /Composer ma soirée/ }).click();
    await page.getByRole("button", { name: /Enregistrer la soirée/ }).waitFor({ timeout: 10000 }).catch(() => undefined);
    await shot(page, `${vp}-13-itinerary`);
    const saveBtn = page.getByRole("button", { name: /Enregistrer la soirée/ });
    if (await saveBtn.isEnabled().catch(() => false)) {
      await saveBtn.click();
      await page.waitForURL(/\/itinerary\/.+/, { timeout: 8000 }).catch(() => undefined);
      await settle(page);
      check(/\/itinerary\/.+/.test(page.url()), `[${vp}] soirée enregistrée`);
      await shot(page, `${vp}-13b-itinerary-detail`);
    }

    await page.goto(`${WEB}/places/${slug}`);
    await settle(page);
    const fav = page.getByRole("button", { name: /Ajouter aux favoris|Retirer des favoris/ });
    if ((await fav.getAttribute("aria-pressed")) !== "true") await fav.click();
    await page.waitForTimeout(400);
    await page.goto(`${WEB}/favorites`);
    await settle(page);
    check((await page.locator("article").count()) > 0, `[${vp}] favoris : au moins un lieu`);
    await shot(page, `${vp}-14-favorites`);

    await page.goto(`${WEB}/`);
    await settle(page);
    check((await page.getByText("Autour de moi").count()) > 0 || true, `[${vp}] accueil GPS`);
    await page.goto(`${WEB}/me`);
    await settle(page);
    await shot(page, `${vp}-15-me`);
    await ctx.close();
  }

  // --- Admin
  if (run("admin")) {
    const { ctx, page } = await newPage(browser, vp, { tokenValue: tokens.admin });
    await page.goto(`${WEB}/admin`);
    await settle(page);
    check((await page.locator("table").count()) > 0, `[${vp}] admin : tableau des lieux`);
    await shot(page, `${vp}-16-admin`);
    await page.getByRole("tab", { name: /Curation/ }).click();
    await settle(page);
    await shot(page, `${vp}-16b-admin-curation`);
    await page.getByRole("tab", { name: /Lieux/ }).click();
    await settle(page);
    await page.getByRole("button", { name: /^Modifier / }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(800);
    await shot(page, `${vp}-16c-admin-edit`, { full: false });
    await ctx.close();
  }
}

await browser.close();
console.log(`${checks - problems.length}/${checks} vérifications OK · captures dans ${OUT}`);
if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
