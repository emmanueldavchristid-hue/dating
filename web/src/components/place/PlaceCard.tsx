"use client";

import Link from "next/link";
import { useMetaOptional, humanizeSlug } from "@/context/MetaContext";
import { formatBudgetRange } from "@/lib/format";
import type { PlaceCard as Place } from "@/lib/types";
import { IconGem, IconLock, IconSparkle } from "../icons";
import { Cover } from "./Cover";
import { DemoBadge, DistanceTravel, OpenBadge, RatingInline } from "./PlaceMeta";
import styles from "./PlaceCard.module.css";

interface Props {
  place: Place;
  /** Affiche les raisons de recommandation. */
  showReasons?: boolean;
  compact?: boolean;
  /** Action secondaire (ex. retirer d'une collection). */
  action?: React.ReactNode;
}

export function PlaceCard({ place, showReasons = true, compact = false, action }: Props) {
  const meta = useMetaOptional();
  const catName = (s: string) => meta?.categoryName(s) ?? humanizeSlug(s);
  const mainCat = place.categories[0];
  const where = [place.district, meta?.cityName(place.city) || humanizeSlug(place.city)].filter(Boolean).join(", ");

  if (place.locked) {
    return (
      <article className={`${styles.card} ${styles.lockedCard} ${compact ? styles.compact : ""}`} aria-label="Pépite verrouillée">
        <Link href="/premium" className={styles.link}>
          <div className={styles.media}>
            <Cover cover={place.cover} category={mainCat} locked />
            <div className={styles.badgesTop}>
              <span className="badge badge-gold">
                <IconGem /> Pépite
              </span>
              {place.is_demo ? <DemoBadge /> : null}
            </div>
            <span className={styles.lockBubble} aria-hidden="true">
              <IconLock size={22} />
            </span>
          </div>
          <div className={styles.body}>
            <p className={styles.kicker}>
              {mainCat ? catName(mainCat) : "Lieu secret"}
              {place.district ? ` · ${place.district}` : ""}
            </p>
            <h3 className={styles.name}>{place.name}</h3>
            <p className={styles.desc}>{place.short_description || "Une adresse confidentielle sélectionnée par nos curateurs."}</p>
            <p className={styles.unlock}>
              <IconLock size={14} /> Débloquer avec Plus ou Insider
            </p>
          </div>
        </Link>
      </article>
    );
  }

  const budget = formatBudgetRange(place.budget_min_fcfa, place.budget_max_fcfa);

  return (
    <article className={`${styles.card} ${compact ? styles.compact : ""}`}>
      <Link href={`/places/${encodeURIComponent(place.slug)}`} className={styles.link}>
        <div className={styles.media}>
          <Cover cover={place.cover} category={mainCat} categoryIcon={mainCat ? meta?.categoryIcon(mainCat) : null} />
          <div className={styles.badgesTop}>
            {place.tier === "premium" ? (
              <span className="badge badge-gold">
                <IconGem /> Pépite
              </span>
            ) : null}
            {place.is_demo ? <DemoBadge /> : null}
          </div>
          <OpenBadge status={place.open_status} closesAt={place.closes_at} className={styles.openBadge} />
        </div>
        <div className={styles.body}>
          <p className={styles.kicker}>
            {place.categories.slice(0, 2).map(catName).join(" · ")}
            {where ? <span className={styles.where}> — {where}</span> : null}
          </p>
          <h3 className={styles.name}>{place.name}</h3>
          {!compact && place.short_description ? <p className={styles.desc}>{place.short_description}</p> : null}
          <div className={styles.metaRow}>
            <RatingInline avg={place.rating_avg} count={place.rating_count} />
            {budget ? <span className={styles.budget}>{budget}</span> : null}
          </div>
          <div className={styles.distance}>
            <DistanceTravel km={place.distance_km} travel={place.travel} />
          </div>
          {showReasons && place.reasons.length > 0 ? (
            <p className={styles.reasons}>
              <IconSparkle size={14} />
              <span>{place.reasons.slice(0, 2).join(" · ")}</span>
            </p>
          ) : null}
        </div>
      </Link>
      {action ? <div className={styles.action}>{action}</div> : null}
    </article>
  );
}

export function PlaceCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.card} ${compact ? styles.compact : ""}`} aria-hidden="true">
      <div className={`skeleton ${styles.skelMedia}`} />
      <div className={styles.body}>
        <div className="skeleton" style={{ height: 12, width: "45%" }} />
        <div className="skeleton" style={{ height: 20, width: "80%", marginTop: 4 }} />
        <div className="skeleton" style={{ height: 12, width: "95%", marginTop: 4 }} />
        <div className="skeleton" style={{ height: 12, width: "60%" }} />
      </div>
    </div>
  );
}
