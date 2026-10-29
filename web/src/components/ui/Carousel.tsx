"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconChevronLeft, IconChevronRight } from "../icons";
import styles from "./Carousel.module.css";

/** Carrousel horizontal accessible (défilement natif + boutons sur desktop). */
interface Props {
  children: ReactNode;
  label: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
}

export function Carousel({ children, label, title, subtitle, extra }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.headText}>
          {title ? <h2 className="section-title">{title}</h2> : null}
          {subtitle ? <p className="section-sub">{subtitle}</p> : null}
        </div>
        <div className={styles.headSide}>
          {extra}
          <div className={styles.controls}>
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => scroll(-1)} disabled={!canPrev} aria-label={`Précédent — ${label}`}>
              <IconChevronLeft />
            </button>
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => scroll(1)} disabled={!canNext} aria-label={`Suivant — ${label}`}>
              <IconChevronRight />
            </button>
          </div>
        </div>
      </div>
      <div ref={ref} className={styles.track} onScroll={update} role="list" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export function CarouselItem({ children }: { children: ReactNode }) {
  return (
    <div role="listitem" className={styles.item}>
      {children}
    </div>
  );
}
