// Captures de tous les écrans (export web, viewport téléphone 390×844).
// Prérequis : API sur http://localhost:8000 (données réelles ou de démo : aucun nom de lieu n'est supposé) et un export web :
//   EXPO_PUBLIC_API_URL=http://localhost:4810/api/v1 npx expo export --platform web --output-dir dist-web
// Usage : SHOTS_DIR=/chemin node e2e/screens.mjs   (Chromium via PLAYWRIGHT_BROWSERS_PATH, jamais téléchargé ici)
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startServer } from "./serve.mjs";

const PORT = 4810;
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.SHOTS_DIR ?? join(process.cwd(), "e2e", "output");
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-2026!";
const PHOTO = fileURLToPath(new URL("./fixtures/lieu.jpg", import.meta.url));
mkdirSync(OUT, { recursive: true });

const problems = [];
let shots = 0;

const server = await startServer(PORT);

/** Appel direct à l'API (via le relais) pour choisir des lieux sans dépendre des données. */
async function apiGet(path, token) {
  const res = await fetch(`${BASE}/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}
// Un lieu avec une vraie photo (crédit visible) et un lieu sans photo ni avis (état « données éparses »).
const SAMPLE = (await apiGet("/places/search?page_size=50")).items.filter((p) => !p.locked);
const PHOTO_SLUG = SAMPLE.find((p) => p.cover?.url)?.slug ?? null;
const SPARSE_SLUG = SAMPLE.find((p) => !p.cover?.url && p.rating_count === 0)?.slug ?? SAMPLE[0]?.slug ?? null;
const GEMS = await apiGet("/places/gems").catch(() => []);
console.log(`lieu avec photo : ${PHOTO_SLUG ?? "—"} · lieu sans photo : ${SPARSE_SLUG ?? "—"} · pépites : ${GEMS.length}`);
const browser = await chromium.launch();

async function newPhone({ onboarded = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
    timezoneId: "Africa/Abidjan",
  });
  if (onboarded) await ctx.addInitScript(() => localStorage.setItem("sortie.onboarded", "true"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  return { ctx, page };
}

const wait = (page, ms = 900) => page.waitForTimeout(ms);
async function shot(page, name) {
  await wait(page, 700);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  shots++;
  console.log("✓", name);
}
/** Navigation côté client (le jeton web reste en mémoire : pas de rechargement). */
async function nav(page, path) {
  await page.evaluate((p) => {
    window.history.pushState(null, "", p);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  }, path);
  await wait(page, 1300);
}
const btn = (page, name) => page.getByRole("button", { name, exact: true }).first();
async function scroll(page, dy) {
  await page.mouse.move(195, 420);
  await page.mouse.wheel(0, dy);
  await wait(page, 700);
}
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    problems.push(`${name}: ${e.message.split("\n")[0]}`);
    console.log("✗", name, e.message.split("\n")[0]);
  }
}
async function login(page, email) {
  await nav(page, "/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await btn(page, "Se connecter").click();
  await wait(page, 1500);
}

// ---------------------------------------------------------------- Parcours « Découverte » (offre gratuite)
{
  const { ctx, page } = await newPhone();
  await page.goto(BASE + "/");
  await wait(page, 2500);
  await step("onboarding", async () => {
    await shot(page, "01-onboarding-intro");
    await btn(page, "Suivant").click();
    await shot(page, "02-onboarding-pepites");
    await btn(page, "Passer l'introduction").click();
    await page.getByRole("checkbox", { name: "Rooftops" }).click();
    await page.getByRole("checkbox", { name: "Lounges" }).click();
    await btn(page, "Calme").click();
    await btn(page, "20 000").click();
    await shot(page, "03-onboarding-preferences");
    await btn(page, "Continuer").click();
    await btn(page, "Cocody").click();
    await shot(page, "04-onboarding-localisation");
    await btn(page, "C'est parti").click();
    await wait(page, 2500);
  });
  await step("home-anon", async () => {
    await page.getByTestId("place-tile").first().waitFor({ timeout: 10000 });
    await shot(page, "05-decouvrir-anonyme");
  });
  await step("concierge-anon", async () => {
    await page.getByTestId("tab-concierge").click();
    await shot(page, "06-concierge-non-connecte");
  });
  await step("login", async () => {
    await nav(page, "/login");
    await page.getByLabel("E-mail", { exact: true }).fill("user@sortie.demo");
    await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
    await shot(page, "07-connexion");
    await btn(page, "Se connecter").click();
    await wait(page, 1500);
  });
  await step("home", async () => {
    await nav(page, "/");
    await page.getByTestId("place-tile").first().waitFor({ timeout: 10000 });
    await shot(page, "08-decouvrir");
    await scroll(page, 700);
    await shot(page, "09-decouvrir-sections");
    await scroll(page, 900);
    await shot(page, "10-decouvrir-bas");
    await scroll(page, -3000);
    await page.getByRole("button", { name: /^Position/ }).click();
    await shot(page, "11-choix-position");
    await page.getByRole("button", { name: "Fermer", exact: true }).last().click();
  });
  await step("search", async () => {
    // Requête introuvable → état vide (indépendant des données).
    await nav(page, "/search?q=zzqxw-introuvable");
    await page.getByText("Aucun lieu ne correspond").waitFor({ timeout: 10000 });
    await shot(page, "12a-recherche-vide");
    await nav(page, "/search?categories=restaurant,maquis,cafe");
    await page.getByTestId("place-row").first().waitFor({ timeout: 10000 });
    await shot(page, "12-recherche");
    await page.getByRole("button", { name: /^Filtres/ }).click();
    await shot(page, "13-filtres");
    await scroll(page, 600);
    await shot(page, "14-filtres-bas");
    await btn(page, "Voir les lieux").click();
  });
  await step("place", async () => {
    // Premier résultat d'une recherche, ouvert comme un membre le ferait.
    await nav(page, "/search?categories=restaurant,maquis,cafe");
    await page.getByTestId("place-row").first().click();
    await page.getByText("Fiabilité de la fiche").waitFor({ timeout: 10000 });
    await shot(page, "15-fiche-lieu");
    await scroll(page, 650);
    await shot(page, "16-fiche-lieu-infos");
    await scroll(page, 900);
    await shot(page, "17-fiche-lieu-avis");
    await scroll(page, 1200);
    await shot(page, "18-fiche-lieu-fiabilite");
    await btn(page, "Collection").click();
    await shot(page, "19-ajout-collection");
    await page.getByRole("button", { name: "Fermer", exact: true }).last().click();
    await btn(page, "Signaler").click();
    await btn(page, "Horaires faux").click();
    await shot(page, "20-signaler-erreur");
    await page.getByRole("button", { name: "Fermer", exact: true }).last().click();
  });
  await step("place-photo", async () => {
    if (!PHOTO_SLUG) return;
    await nav(page, `/place/${PHOTO_SLUG}`);
    await page.getByText("Fiabilité de la fiche").waitFor({ timeout: 10000 });
    await shot(page, "18a-fiche-photo-credit");
  });
  await step("place-sparse", async () => {
    if (!SPARSE_SLUG) return;
    await nav(page, `/place/${SPARSE_SLUG}`);
    await page.getByText("Fiabilité de la fiche").waitFor({ timeout: 10000 });
    await shot(page, "18b-fiche-donnees-eparses");
    await scroll(page, 700);
    await shot(page, "18c-fiche-donnees-eparses-bas");
  });
  await step("gem-gate", async () => {
    const gem = GEMS.find((g) => g.locked);
    if (!gem) return;
    await nav(page, `/place/${gem.slug || gem.id}`);
    await shot(page, "21-pepite-verrouillee");
  });
  await step("gems", async () => {
    await nav(page, "/gems");
    // Sans pépite publiée, on capture l'état vide.
    if (GEMS.length) await page.getByTestId("locked-card").first().waitFor({ timeout: 10000 });
    await shot(page, GEMS.length ? "22-pepites-gratuit" : "22-pepites-vide");
  });
  await step("map", async () => {
    await page.getByTestId("tab-map").click();
    await wait(page, 1500);
    await shot(page, "23-carte-web");
  });
  await step("concierge", async () => {
    await page.getByTestId("tab-concierge").click();
    await shot(page, "24-concierge");
    await btn(page, "Un rooftop calme ce soir pour un date").click();
    await page.getByTestId("place-row").first().waitFor({ timeout: 15000 }).catch(() => wait(page, 4000));
    await shot(page, "25-concierge-reponse");
  });
  await step("soiree", async () => {
    await nav(page, "/soiree");
    await shot(page, "26-ma-soiree");
    await btn(page, "Proposer ma soirée").click();
    await page.getByText("Ta proposition").waitFor({ timeout: 10000 });
    await scroll(page, 520);
    await shot(page, "27-ma-soiree-proposition");
    await page.getByRole("button", { name: /^4 étapes/ }).click();
    await scroll(page, -2000);
    await shot(page, "28-ma-soiree-upsell");
  });
  await step("me", async () => {
    await nav(page, "/me");
    await shot(page, "29-moi");
    await scroll(page, 700);
    await shot(page, "30-moi-bas");
  });
  await step("premium", async () => {
    await nav(page, "/premium");
    await shot(page, "31-premium");
    await btn(page, "Passer à Plus").click();
    await shot(page, "32-paiement-non-active");
    await btn(page, "Compris").click();
  });
  await step("favorites", async () => {
    await nav(page, "/favorites");
    await shot(page, "33-favoris");
  });
  await step("collections", async () => {
    await nav(page, "/collections");
    await shot(page, "34-collections");
  });
  await step("preferences", async () => {
    await nav(page, "/preferences");
    await shot(page, "35-preferences");
  });
  await step("about", async () => {
    await nav(page, "/about");
    await shot(page, "36-a-propos");
  });
  await step("register", async () => {
    await nav(page, "/register");
    await btn(page, "Créer mon compte").click();
    await shot(page, "37-inscription-erreurs");
  });
  await ctx.close();
}

// ---------------------------------------------------------------- Insider (premium)
{
  const { ctx, page } = await newPhone({ onboarded: true });
  await page.goto(BASE + "/");
  await wait(page, 2500);
  await step("insider", async () => {
    await login(page, "insider@sortie.demo");
    await nav(page, "/gems");
    if (GEMS.length) await page.getByTestId("place-row").first().waitFor({ timeout: 10000 });
    await shot(page, "38-pepites-insider");
    await nav(page, "/me");
    await shot(page, "39-moi-insider");
  });
  await ctx.close();
}

// ---------------------------------------------------------------- Curateur : photos d'un lieu
{
  const { ctx, page } = await newPhone({ onboarded: true });
  await page.goto(BASE + "/");
  await wait(page, 2500);
  await step("curateur-photo", async () => {
    const slug = SPARSE_SLUG ?? PHOTO_SLUG;
    if (!slug) throw new Error("aucun lieu disponible");
    await login(page, "curateur@sortie.demo");
    await nav(page, `/place/${slug}`);
    await page.getByText("Fiabilité de la fiche").waitFor({ timeout: 10000 });
    await page.getByTestId("add-photo").scrollIntoViewIfNeeded();
    await shot(page, "41-curateur-galerie");
    await page.getByTestId("add-photo").click();
    await shot(page, "42-curateur-ajout-photo");
    // Le sélecteur web ouvre un <input type=file> : on lui donne la photo de test.
    const chooser = page.waitForEvent("filechooser", { timeout: 10000 });
    await btn(page, "Choisir dans la galerie").click();
    await (await chooser).setFiles(PHOTO);
    await page.getByText("Utiliser comme photo principale").waitFor({ timeout: 10000 });
    await page.getByLabel("Crédit (facultatif)", { exact: true }).fill("Photo : équipe e2e");
    await shot(page, "43-curateur-apercu");
    await btn(page, "Publier la photo").click();
    await page.getByText(/Photo ajoutée/).waitFor({ timeout: 20000 });
    await wait(page, 1500);
    await scroll(page, -3000);
    await shot(page, "44-curateur-photo-publiee");
    const detail = await apiGet(`/places/${slug}`);
    const mine = detail.photos.find((ph) => ph.credit === "Photo : équipe e2e");
    if (!mine) throw new Error("photo envoyée absente de la fiche");
    console.log(`  photo ${mine.id} · couverture=${detail.cover.url === mine.url}`);
    // Menu de la photo → suppression (nettoyage).
    await page.getByTestId("photo-menu").last().scrollIntoViewIfNeeded();
    await page.getByTestId("photo-menu").last().click();
    await shot(page, "45-curateur-menu-photo");
    await btn(page, "Supprimer").click();
    await shot(page, "46-curateur-confirmation");
    await page.getByRole("button", { name: "Supprimer", exact: true }).last().click();
    await page.getByText("Photo supprimée").waitFor({ timeout: 10000 });
    const after = await apiGet(`/places/${slug}`);
    if (after.photos.some((ph) => ph.id === mine.id)) throw new Error("photo non supprimée");
  });
  await ctx.close();
}

// ---------------------------------------------------------------- Admin
{
  const { ctx, page } = await newPhone({ onboarded: true });
  await page.goto(BASE + "/");
  await wait(page, 2500);
  await step("admin", async () => {
    await login(page, "admin@sortie.demo");
    await nav(page, "/me");
    await scroll(page, 700);
    await shot(page, "40-moi-admin");
  });
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${shots} captures dans ${OUT}`);
if (problems.length) {
  console.log(`${problems.length} problème(s) :\n- ${[...new Set(problems)].join("\n- ")}`);
  process.exitCode = 1;
}
