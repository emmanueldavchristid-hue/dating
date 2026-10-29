"use client";

import { useLocation } from "@/context/LocationContext";
import { IconLocate, IconShield } from "../icons";
import styles from "./Location.module.css";

/** Carte de consentement : on explique AVANT de demander la position au navigateur. */
export function ConsentCard({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const { consent, gpsStatus, acceptGps, declineGps } = useLocation();

  return (
    <section className={`${styles.consent} ${compact ? styles.consentCompact : ""}`} aria-labelledby="consent-title">
      <span className={styles.consentIcon} aria-hidden="true">
        <IconLocate />
      </span>
      <div className={styles.consentBody}>
        <h3 id="consent-title" className={styles.consentTitle}>
          Utiliser ma position ?
        </h3>
        <p className={styles.consentText}>
          Elle sert uniquement à trier les lieux par proximité et à afficher les distances (à vol d&apos;oiseau). Elle n&apos;est
          pas partagée et vous pouvez retirer votre accord à tout moment depuis « Moi ».
        </p>
        <p className={styles.consentNote}>
          <IconShield size={14} /> Sans position, choisissez simplement une ville ou un quartier.
        </p>
        {gpsStatus === "denied" ? (
          <p className="form-error" role="alert">
            Votre navigateur a refusé l&apos;accès à la position. Autorisez-la dans ses réglages, ou choisissez un quartier.
          </p>
        ) : gpsStatus === "unavailable" ? (
          <p className="form-error" role="alert">
            Position indisponible sur cet appareil. Choisissez une ville ou un quartier ci-dessous.
          </p>
        ) : null}
        <div className={styles.consentActions}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              acceptGps();
              onDone?.();
            }}
            disabled={gpsStatus === "locating"}
          >
            {gpsStatus === "locating" ? <span className="spinner" aria-hidden="true" /> : <IconLocate />}
            {gpsStatus === "locating" ? "Localisation…" : consent === "granted" ? "Actualiser ma position" : "Partager ma position"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              declineGps();
              onDone?.();
            }}
          >
            {consent === "granted" ? "Ne plus utiliser ma position" : "Non merci"}
          </button>
        </div>
      </div>
    </section>
  );
}
