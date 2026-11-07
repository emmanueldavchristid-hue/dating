"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMeta } from "@/context/MetaContext";
import { distanceLabel, formatBudgetRange } from "@/lib/format";
import type { PlaceCard } from "@/lib/types";
import { IconLock, IconRoute } from "../icons";
import { Cover } from "../place/Cover";
import { DemoBadge, OpenBadge } from "../place/PlaceMeta";
import styles from "./Timeline.module.css";

export interface TimelineStep {
  key: string;
  place: PlaceCard;
  legKm: number | null;
  startTime?: string | null;
  note?: string | null;
}

/** Frise d'une soirée : étapes + distance à vol d'oiseau entre elles. */
export function Timeline({ steps, renderControls }: { steps: TimelineStep[]; renderControls?: (index: number) => ReactNode }) {
  const { categoryName } = useMeta();
  return (
    <ol className={styles.timeline}>
      {steps.map((s, i) => {
        const budget = formatBudgetRange(s.place.budget_min_fcfa, s.place.budget_max_fcfa);
        return (
          <li key={s.key} className={styles.item}>
            {i > 0 ? (
              <div className={styles.leg}>
                <IconRoute size={14} />
                {s.legKm != null ? distanceLabel(s.legKm) : "Distance inconnue"}
              </div>
            ) : null}
            <div className={styles.step}>
              <span className={styles.num} aria-hidden="true">
                {i + 1}
              </span>
              <div className={styles.card}>
                <Link href={s.place.locked ? "/premium" : `/places/${encodeURIComponent(s.place.slug)}`} className={styles.cardLink}>
                  <Cover cover={s.place.cover} category={s.place.categories[0]} size="thumb" className={styles.thumb} locked={s.place.locked} />
                  <span className={styles.info}>
                    <span className={styles.kicker}>
                      {s.startTime ? <strong className={styles.time}>{s.startTime.slice(0, 5)}</strong> : null}
                      {s.place.categories.slice(0, 1).map(categoryName).join("")}
                      {s.place.district ? ` · ${s.place.district}` : ""}
                    </span>
                    <span className={styles.name}>
                      {s.place.locked ? <IconLock size={14} /> : null} {s.place.name}
                    </span>
                    <span className="row wrap" style={{ gap: 6 }}>
                      <OpenBadge status={s.place.open_status} closesAt={s.place.closes_at} />
                      {s.place.is_demo ? <DemoBadge /> : null}
                      {budget ? <span className={styles.budget}>{budget}</span> : null}
                    </span>
                    {s.note ? <span className={styles.note}>« {s.note} »</span> : null}
                  </span>
                </Link>
                {renderControls ? <div className={styles.controls}>{renderControls(i)}</div> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
