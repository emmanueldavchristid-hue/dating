"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useMeta } from "@/context/MetaContext";
import { APP_NAME } from "@/lib/config";
import { planLabel } from "@/lib/format";
import {
  IconCompass,
  IconConcierge,
  IconCrown,
  IconGem,
  IconHeart,
  IconInfo,
  IconMap,
  IconRoute,
  IconSearch,
  IconSettings,
  IconUser,
} from "../icons";
import { Logo } from "./Logo";
import styles from "./AppShell.module.css";

const TABS = [
  { href: "/", label: "Découvrir", Icon: IconCompass },
  { href: "/map", label: "Carte", Icon: IconMap },
  { href: "/gems", label: "Pépites", Icon: IconGem },
  { href: "/concierge", label: "Concierge", Icon: IconConcierge },
  { href: "/me", label: "Moi", Icon: IconUser },
];

const SIDE_EXTRA = [
  { href: "/search", label: "Rechercher", Icon: IconSearch },
  { href: "/favorites", label: "Favoris & collections", Icon: IconHeart },
  { href: "/itinerary", label: "Ma soirée", Icon: IconRoute },
  { href: "/premium", label: "Premium", Icon: IconCrown },
];

const BARE_ROUTES = ["/onboarding", "/login", "/register"];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { user } = useAuth();
  const { capabilities } = useMeta();
  const bare = BARE_ROUTES.some((r) => pathname.startsWith(r));
  const canAdmin = user?.role === "admin" || user?.role === "curator";

  const footer = (
    <footer className={styles.footer}>
      {capabilities?.demo_data ? (
        <p className={styles.demoNotice}>
          <IconInfo size={16} />
          <span>
            <strong>Données de démonstration fictives.</strong> Certains lieux affichés sont des exemples marqués « Démo » et
            n&apos;existent pas.
          </span>
        </p>
      ) : null}
      <p className={styles.footLine}>
        © {new Date().getFullYear()} {APP_NAME} · Cartographie ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>{" "}
        · Les distances sont calculées à vol d&apos;oiseau.
      </p>
    </footer>
  );

  if (bare) {
    return (
      <div className={styles.bare}>
        <a href="#main" className="skip-link">
          Aller au contenu
        </a>
        <main id="main" className={styles.bareMain}>
          {children}
        </main>
        {footer}
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>

      <aside className={styles.sidebar} aria-label="Navigation principale">
        <div className={styles.sideLogo}>
          <Logo />
        </div>
        <nav className={styles.sideNav}>
          {TABS.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className={styles.sideLink} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
          <div className={styles.sideSep} role="presentation" />
          {SIDE_EXTRA.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className={styles.sideLink} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
          {canAdmin ? (
            <Link href="/admin" className={styles.sideLink} aria-current={isActive(pathname, "/admin") ? "page" : undefined}>
              <IconSettings />
              <span>{user?.role === "admin" ? "Administration" : "Curation"}</span>
            </Link>
          ) : null}
        </nav>
        <div className={styles.sideFoot}>
          {user ? (
            <Link href="/me" className={styles.sideUser}>
              <span className={styles.avatar} aria-hidden="true">
                {user.display_name.slice(0, 1).toUpperCase()}
              </span>
              <span className={styles.sideUserText}>
                <span className={styles.sideUserName}>{user.display_name}</span>
                <span className={user.plan === "free" ? styles.planFree : styles.planPaid}>Offre {planLabel(user.plan)}</span>
              </span>
            </Link>
          ) : (
            <div className={styles.sideAuth}>
              <Link href="/login" className="btn btn-primary btn-block">
                Se connecter
              </Link>
              <Link href="/register" className="btn btn-ghost btn-block">
                Créer un compte
              </Link>
            </div>
          )}
        </div>
      </aside>

      <header className={styles.topbar}>
        <Logo />
        <div className="row">
          <Link href="/search" className="icon-btn icon-btn-sm" aria-label="Rechercher">
            <IconSearch />
          </Link>
          <Link href="/favorites" className="icon-btn icon-btn-sm" aria-label="Favoris et collections">
            <IconHeart />
          </Link>
          {canAdmin ? (
            <Link href="/admin" className="icon-btn icon-btn-sm" aria-label="Administration">
              <IconSettings />
            </Link>
          ) : null}
        </div>
      </header>

      <div className={styles.content}>
        <main id="main" className={styles.main}>
          {children}
        </main>
        {footer}
      </div>

      <nav className={styles.tabbar} aria-label="Navigation principale">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className={styles.tab} aria-current={active ? "page" : undefined}>
              <Icon size={22} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
