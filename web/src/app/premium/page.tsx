"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconCheck, IconCrown, IconGem, IconInfo, IconPhone, IconShield, IconSparkle } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { ErrorState } from "@/components/ui/States";
import { useAuth } from "@/context/AuthContext";
import { ApiError, api, errorMessage } from "@/lib/api";
import { formatFcfa, planLabel } from "@/lib/format";
import type { BillingPlan, Plan } from "@/lib/types";
import styles from "./premium.module.css";

const ORDER: Plan[] = ["free", "plus", "insider"];

export default function PremiumPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<Plan | null>(null);
  const [notice, setNotice] = useState<{ plan: Plan; message: string; soon: boolean } | null>(null);

  useEffect(() => {
    setError(null);
    api.billing
      .plans()
      .then((p) => setPlans([...p].sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code))))
      .catch(setError);
  }, [attempt]);

  const current: Plan = user?.plan ?? "free";

  const checkout = async (plan: Plan) => {
    setBusy(plan);
    try {
      await api.billing.checkout(plan);
      setNotice({ plan, message: "Demande envoyée.", soon: false });
    } catch (e) {
      const soon = e instanceof ApiError && e.kind === "not_configured";
      setNotice({ plan, message: soon ? e.detail : errorMessage(e), soon });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <title>Offres premium</title>
      <section className={styles.hero}>
        <span className={styles.heroIcon} aria-hidden="true">
          <IconCrown />
        </span>
        <h1 className={styles.title}>Sortez mieux, plus souvent.</h1>
        <p className={styles.sub}>Pépites confidentielles, concierge sans compter, soirées en 5 actes. Sans engagement.</p>
        {user ? (
          <p className={styles.current}>
            Votre offre actuelle : <strong>{planLabel(current)}</strong>
          </p>
        ) : null}
      </section>

      {error ? (
        <ErrorState error={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !plans ? (
        <div className={styles.grid}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 420, borderRadius: 28 }} />
          ))}
        </div>
      ) : (
        <div className={styles.grid}>
          {plans.map((p) => {
            const isCurrent = p.code === current;
            const featured = p.code === "insider";
            const isUpgrade = ORDER.indexOf(p.code) > ORDER.indexOf(current);
            return (
              <article key={p.code} className={`${styles.plan} ${featured ? styles.featured : ""} ${isCurrent ? styles.isCurrent : ""}`}>
                {featured ? (
                  <span className={styles.ribbon}>
                    <IconGem size={13} /> Pépites incluses
                  </span>
                ) : null}
                <h2 className={styles.planName}>{p.name}</h2>
                <p className={styles.price}>
                  {p.price_fcfa === 0 ? (
                    "Gratuit"
                  ) : p.price_fcfa == null ? (
                    <span className={styles.priceSoon}>Tarif annoncé au lancement</span>
                  ) : (
                    <>
                      {formatFcfa(p.price_fcfa)}
                      <span className={styles.per}> / mois</span>
                    </>
                  )}
                </p>
                <ul className={styles.features}>
                  {p.features.map((f) => (
                    <li key={f}>
                      <IconCheck size={16} /> {f}
                    </li>
                  ))}
                </ul>
                <dl className={styles.quotas}>
                  <div>
                    <dt>Concierge</dt>
                    <dd>{p.quotas.concierge_per_day} / jour</dd>
                  </div>
                  <div>
                    <dt>Soirées</dt>
                    <dd>{p.quotas.itinerary_max_steps} étapes max</dd>
                  </div>
                </dl>
                <div className={styles.cta}>
                  {isCurrent ? (
                    <button type="button" className="btn btn-block" disabled>
                      <IconCheck /> Votre offre actuelle
                    </button>
                  ) : p.code === "free" ? (
                    <button type="button" className="btn btn-block" disabled title="Pour revenir à Découverte, résiliez votre abonnement à échéance">
                      Inclus pour tous
                    </button>
                  ) : !user ? (
                    <Link href="/register?next=/premium" className={`btn btn-block ${featured ? "btn-gold" : "btn-primary"}`}>
                      Créer un compte pour souscrire
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={`btn btn-block ${featured ? "btn-gold" : "btn-primary"}`}
                      onClick={() => checkout(p.code)}
                      disabled={busy !== null || !isUpgrade}
                      title={!isUpgrade ? "Vous bénéficiez déjà d'une offre supérieure" : undefined}
                    >
                      {busy === p.code ? <span className="spinner" aria-hidden="true" /> : <IconSparkle />}
                      Choisir {p.name}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section className={styles.pay}>
        <IconPhone />
        <div>
          <strong>Paiement mobile bientôt disponible</strong>
          <p className="muted">
            Orange Money, Wave et MTN MoMo seront acceptés via un agrégateur de paiement. Aucun paiement n&apos;est encaissé pour le moment.
          </p>
        </div>
      </section>
      <p className={styles.trust}>
        <IconShield size={14} /> Aucune donnée bancaire n&apos;est demandée ni stockée par l&apos;application.
      </p>

      <Modal
        open={!!notice}
        onClose={() => setNotice(null)}
        title={notice?.soon ? "Paiement pas encore activé" : "Abonnement"}
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setNotice(null)}>
            Compris
          </button>
        }
      >
        {notice?.soon ? (
          <div className="stack">
            <p>
              Merci de votre intérêt pour l&apos;offre <strong>{notice ? planLabel(notice.plan) : ""}</strong> ! Le paiement n&apos;est pas encore activé.
            </p>
            <p className="muted">Orange Money, Wave et MTN MoMo arrivent bientôt via un agrégateur de paiement. Aucun montant ne vous a été débité.</p>
            {notice?.message && !/agrégateur/i.test(notice.message) ? (
              <p className="subtle" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <IconInfo size={14} /> {notice.message}
              </p>
            ) : null}
          </div>
        ) : (
          <p>{notice?.message}</p>
        )}
      </Modal>
    </div>
  );
}
