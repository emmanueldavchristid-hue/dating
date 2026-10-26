"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ApiError, errorMessage } from "@/lib/api";
import { IconAlert, IconClock, IconCompass, IconCrown, IconGem, IconLock, IconRefresh, IconSparkle, IconUser } from "../icons";
import styles from "./States.module.css";

interface EmptyProps {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "gold" | "accent";
}

export function EmptyState({ icon, title, children, action, tone = "default" }: EmptyProps) {
  return (
    <div className={`${styles.state} ${styles[tone]}`}>
      <span className={styles.iconWrap}>{icon ?? <IconCompass />}</span>
      <h2 className={styles.title}>{title}</h2>
      {children ? <div className={styles.text}>{children}</div> : null}
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}

export function LoginPrompt({ title = "Connectez-vous pour continuer", children }: { title?: string; children?: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const next = encodeURIComponent(pathname);
  return (
    <EmptyState
      icon={<IconUser />}
      title={title}
      tone="accent"
      action={
        <>
          <Link href={`/login?next=${next}`} className="btn btn-primary">
            Se connecter
          </Link>
          <Link href={`/register?next=${next}`} className="btn">
            Créer un compte
          </Link>
        </>
      }
    >
      {children ?? <p>Votre compte garde vos favoris, vos soirées et vos préférences sur tous vos appareils.</p>}
    </EmptyState>
  );
}

export function PremiumGate({ title = "Réservé aux membres premium", children }: { title?: string; children?: ReactNode }) {
  return (
    <EmptyState
      icon={<IconCrown />}
      title={title}
      tone="gold"
      action={
        <Link href="/premium" className="btn btn-gold">
          <IconGem /> Découvrir les offres
        </Link>
      }
    >
      {children ?? <p>Les pépites et les soirées sur mesure sont réservées aux offres premium.</p>}
    </EmptyState>
  );
}

export function ComingSoon({ title = "Bientôt disponible", children }: { title?: string; children?: ReactNode }) {
  return (
    <EmptyState icon={<IconSparkle />} title={title}>
      {children ?? <p>Cette fonctionnalité n&apos;est pas encore activée sur ce service.</p>}
    </EmptyState>
  );
}

/** Affiche l'état adapté à une erreur d'API (premium, quota, auth, bientôt, réseau…). */
export function ErrorState({ error, onRetry, compact = false }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  if (error instanceof ApiError) {
    if (error.kind === "auth") return <LoginPrompt />;
    if (error.kind === "premium") return <PremiumGate>{<p>{error.detail}</p>}</PremiumGate>;
    if (error.kind === "not_configured") return <ComingSoon>{<p>{error.detail}</p>}</ComingSoon>;
    if (error.kind === "quota")
      return (
        <EmptyState
          icon={<IconClock />}
          title="Quota du jour atteint"
          tone="gold"
          action={
            <Link href="/premium" className="btn btn-gold">
              Augmenter mon quota
            </Link>
          }
        >
          <p>{error.detail}</p>
        </EmptyState>
      );
    if (error.kind === "forbidden")
      return (
        <EmptyState icon={<IconLock />} title="Accès refusé">
          <p>{error.detail}</p>
        </EmptyState>
      );
    if (error.kind === "not_found")
      return (
        <EmptyState
          icon={<IconCompass />}
          title="Introuvable"
          action={
            <Link href="/" className="btn">
              Retour à l&apos;accueil
            </Link>
          }
        >
          <p>{error.detail}</p>
        </EmptyState>
      );
  }
  return (
    <div className={compact ? styles.inlineError : undefined}>
      <EmptyState
        icon={<IconAlert />}
        title="Oups, ça n'a pas fonctionné"
        action={
          onRetry ? (
            <button type="button" className="btn" onClick={onRetry}>
              <IconRefresh /> Réessayer
            </button>
          ) : undefined
        }
      >
        <p>{errorMessage(error)}</p>
      </EmptyState>
    </div>
  );
}
