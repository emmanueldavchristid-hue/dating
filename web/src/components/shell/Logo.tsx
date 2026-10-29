import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import styles from "./Logo.module.css";

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={styles.mark}>
      <rect width="32" height="32" rx="10" fill="var(--accent)" />
      <path d="M7 21.5a9 9 0 0 1 18 0" fill="none" stroke="var(--on-accent)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11.5 21.5a4.5 4.5 0 0 1 9 0" fill="none" stroke="var(--on-accent)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="8.5" r="1.8" fill="var(--on-accent)" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className={styles.logo} aria-label={`${APP_NAME} — accueil`}>
      <LogoMark />
      <span className={styles.word}>{APP_NAME}</span>
    </Link>
  );
}
