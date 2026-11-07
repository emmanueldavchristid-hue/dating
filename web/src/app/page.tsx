"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CategoryIcon, IconArrowRight, IconConcierge, IconGem, IconLock, IconRoute, IconSearch } from "@/components/icons";
import { LocationChip } from "@/components/location/LocationChip";
import { PlaceCard, PlaceCardSkeleton } from "@/components/place/PlaceCard";
import { Carousel, CarouselItem } from "@/components/ui/Carousel";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "@/context/LocationContext";
import { useMeta } from "@/context/MetaContext";
import { api } from "@/lib/api";
import { STORAGE_KEYS } from "@/lib/config";
import { routeForQuery } from "@/lib/routes";
import { readStorage } from "@/lib/storage";
import type { HomeResponse } from "@/lib/types";
import styles from "./home.module.css";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Encore debout";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function HomePage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const { categories } = useMeta();
  const { originParams, gpsStatus } = useLocation();
  const [data, setData] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [hello, setHello] = useState("Bonsoir");

  useEffect(() => setHello(greeting()), []);

  // Premier passage : proposer l'onboarding (une seule fois).
  useEffect(() => {
    if (!ready) return;
    const done = readStorage(STORAGE_KEYS.onboarded);
    const hasPrefs = !!user && (user.preferences.categories.length > 0 || user.preferences.ambiances.length > 0);
    if (!done && !hasPrefs) router.replace("/onboarding");
  }, [ready, user, router]);

  const originKey = JSON.stringify(originParams);
  useEffect(() => {
    if (gpsStatus === "locating") return;
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    api.recommendations
      .home(JSON.parse(originKey), ctrl.signal)
      .then(setData)
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e);
      });
    return () => ctrl.abort();
  }, [originKey, attempt, gpsStatus, user?.id]);

  const sections = data?.sections.filter((s) => s.items.length > 0) ?? [];

  return (
    <div className={`page ${styles.page}`}>
      <title>Où sort-on aujourd&apos;hui ?</title>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <p className={styles.hello}>
            {hello}
            {user ? `, ${user.display_name.split(" ")[0]}` : ""}
          </p>
          <LocationChip />
        </div>
        <h1 className={styles.title}>
          Où sort-on <span className={styles.titleAccent}>aujourd&apos;hui&nbsp;?</span>
        </h1>
        <form
          className={styles.search}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(routeForQuery(q));
          }}
        >
          <IconSearch className={styles.searchIcon} />
          <label htmlFor="home-q" className="sr-only">
            Rechercher un lieu ou poser une question
          </label>
          <input
            id="home-q"
            className={styles.searchInput}
            placeholder="Un rooftop calme à Cocody, un maquis pas cher…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
          <button type="submit" className={`btn btn-primary ${styles.searchBtn}`} aria-label="Lancer la recherche">
            <IconArrowRight />
          </button>
        </form>
        <p className={styles.searchHint}>
          <IconConcierge size={14} /> Une phrase complète ? Le concierge vous répond.
        </p>

        <nav className={`chip-row ${styles.cats}`} aria-label="Catégories">
          {categories.length
            ? categories.map((c) => (
                <Link key={c.slug} href={`/search?categories=${encodeURIComponent(c.slug)}`} className="chip">
                  <CategoryIcon slug={c.slug} icon={c.icon} />
                  {c.name}
                </Link>
              ))
            : Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton" style={{ width: 104, height: 38, borderRadius: 999, flex: "none" }} />)}
        </nav>
      </section>

      {error ? (
        <div className="section">
          <ErrorState error={error} onRetry={() => setAttempt((n) => n + 1)} />
        </div>
      ) : !data ? (
        [0, 1].map((i) => (
          <section key={i} className="section" aria-busy="true">
            <div className="skeleton" style={{ height: 22, width: 220, marginBottom: 16 }} />
            <div className={styles.skelRow}>
              {[0, 1, 2, 3].map((j) => (
                <PlaceCardSkeleton key={j} compact />
              ))}
            </div>
          </section>
        ))
      ) : sections.length === 0 ? (
        <div className="section">
          <EmptyState
            title="Pas encore de suggestions ici"
            action={
              <Link href="/search" className="btn btn-primary">
                Explorer tous les lieux
              </Link>
            }
          >
            <p>Aucun lieu ne correspond encore à cette zone. Essayez une autre ville ou un autre quartier.</p>
          </EmptyState>
        </div>
      ) : (
        sections.map((s, idx) => (
          <div key={s.key}>
            <section className="section fade-in" aria-labelledby={`sec-${s.key}`}>
              <Carousel
                label={s.title}
                title={<span id={`sec-${s.key}`}>{s.title}</span>}
                subtitle={s.subtitle}
              >
                {s.items.map((p) => (
                  <CarouselItem key={p.id}>
                    <PlaceCard place={p} compact />
                  </CarouselItem>
                ))}
              </Carousel>
            </section>
            {idx === 0 ? <Teasers /> : null}
          </div>
        ))
      )}
      {data && sections.length === 0 ? <Teasers /> : null}
    </div>
  );
}

function Teasers() {
  return (
    <div className={`section ${styles.teasers}`}>
      <Link href="/gems" className={styles.gemsTeaser}>
        <span className={styles.teaserIcon}>
          <IconGem />
        </span>
        <span className={styles.teaserText}>
          <span className={styles.teaserEyebrow}>
            <IconLock size={12} /> Pépites
          </span>
          <strong className={styles.teaserTitle}>Les adresses que les Abidjanais gardent pour eux</strong>
          <span className={styles.teaserSub}>Sélectionnées et vérifiées par nos curateurs.</span>
        </span>
        <IconArrowRight className={styles.teaserArrow} />
      </Link>
      <Link href="/itinerary" className={styles.planTeaser}>
        <span className={styles.teaserIconAccent}>
          <IconRoute />
        </span>
        <span className={styles.teaserText}>
          <span className={styles.teaserEyebrowAccent}>Ma soirée</span>
          <strong className={styles.teaserTitle}>Composez une sortie en plusieurs étapes</strong>
          <span className={styles.teaserSub}>Apéro, dîner, puis un verre : on enchaîne.</span>
        </span>
        <IconArrowRight className={styles.teaserArrow} />
      </Link>
    </div>
  );
}
