import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/config";
import { IconArrowLeft, IconBookmark, IconConcierge, IconGem } from "../icons";
import { Logo } from "../shell/Logo";
import styles from "./AuthLayout.module.css";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className={styles.wrap}>
      <aside className={styles.visual} aria-hidden="true">
        <div className={styles.visualInner}>
          <Logo />
          <p className={styles.quote}>
            Les meilleures sorties d&apos;Abidjan,
            <br />
            <span>sans perdre la soirée à chercher.</span>
          </p>
          <ul className={styles.perks}>
            <li>
              <IconConcierge /> Un concierge qui comprend « un endroit calme pour un premier rendez-vous ».
            </li>
            <li>
              <IconBookmark /> Vos favoris et collections, partout.
            </li>
            <li>
              <IconGem /> Des pépites sélectionnées par des curateurs locaux.
            </li>
          </ul>
        </div>
      </aside>
      <div className={styles.formSide}>
        <div className={styles.topLinks}>
          <Link href="/" className="btn btn-ghost btn-sm">
            <IconArrowLeft /> Retour
          </Link>
          <span className={styles.mobileLogo}>
            <Logo />
          </span>
        </div>
        <div className={styles.formBox}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
          {children}
          <div className={styles.footer}>{footer}</div>
          <p className={styles.legal}>
            En continuant, vous acceptez que {APP_NAME} conserve vos préférences pour personnaliser vos suggestions. Vous pouvez
            exporter ou supprimer vos données à tout moment.
          </p>
        </div>
      </div>
    </div>
  );
}
