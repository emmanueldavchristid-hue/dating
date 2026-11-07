"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { Cover as CoverT } from "@/lib/types";
import { CategoryIcon } from "../icons";
import styles from "./Cover.module.css";

interface Props {
  cover: CoverT;
  category?: string;
  categoryIcon?: string | null;
  size?: "thumb" | "card" | "hero";
  locked?: boolean;
  className?: string;
}

const SAFE_COLOR = /^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%]+\)$|^hsla?\([\d\s.,%deg]+\)$/i;

/** Couverture : photo réelle si fournie, sinon visuel généré (dégradé + glyphe de catégorie). Jamais de photo d'illustration. */
export function Cover({ cover, category, categoryIcon, size = "card", locked = false, className }: Props) {
  const [a, b] = cover.gradient ?? [];
  const c1 = a && SAFE_COLOR.test(a) ? a : "#3a2a20";
  const c2 = b && SAFE_COLOR.test(b) ? b : "#16171c";
  // Image injoignable (réseau, lien mort) : visuel généré plutôt qu'une image cassée.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const cls = `${styles.cover} ${styles[size]} ${locked ? styles.locked : ""} ${className ?? ""}`;

  if (cover.url && !locked && failedUrl !== cover.url) {
    return (
      <div className={cls}>
        <img src={cover.url} alt={cover.alt} className={styles.img} loading="lazy" onError={() => setFailedUrl(cover.url)} />
      </div>
    );
  }
  return (
    <div
      className={cls}
      role="img"
      aria-label={cover.alt || "Visuel généré"}
      style={{ ["--c1" as string]: c1, ["--c2" as string]: c2 }}
    >
      <span className={styles.glow} aria-hidden="true" />
      <span className={styles.glyph} aria-hidden="true">
        <CategoryIcon slug={category} icon={categoryIcon} size={size === "hero" ? 220 : size === "thumb" ? 56 : 120} strokeWidth={1.1} />
      </span>
      <span className={styles.grain} aria-hidden="true" />
    </div>
  );
}
