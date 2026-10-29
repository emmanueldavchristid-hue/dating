"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { IconConcierge, IconCrown, IconInfo, IconRefresh, IconSend, IconSparkle } from "@/components/icons";
import { PlaceCard } from "@/components/place/PlaceCard";
import { RequireAuth } from "@/components/ui/RequireAuth";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "@/context/LocationContext";
import { useMeta } from "@/context/MetaContext";
import { ApiError, api, errorMessage } from "@/lib/api";
import { formatFcfa } from "@/lib/format";
import type { ConciergeResponse } from "@/lib/types";
import styles from "./concierge.module.css";

interface Msg {
  id: number;
  role: "user" | "assistant" | "error";
  text: string;
  res?: ConciergeResponse;
  kind?: "quota" | "other";
  retry?: string;
}

const SUGGESTIONS = [
  "Un rooftop calme pour un verre ce soir",
  "Où manger un bon garba pas cher au Plateau ?",
  "Une sortie en famille ce week-end",
  "Un endroit romantique avec vue sur la lagune",
  "Une plage tranquille près d'Abidjan",
];

function Chat() {
  const params = useSearchParams();
  const { user } = useAuth();
  const { originParams } = useLocation();
  const { capabilities, categoryName, ambianceName } = useMeta();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [provider, setProvider] = useState<"rules" | "anthropic" | null>(null);
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoSent = useRef(false);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setMsgs((m) => [...m, { id: ++seq.current, role: "user", text: t }]);
    setBusy(true);
    try {
      const res = await api.concierge(t, originParams);
      setQuota(res.quota);
      setProvider(res.provider);
      setMsgs((m) => [...m, { id: ++seq.current, role: "assistant", text: res.reply, res }]);
    } catch (e) {
      const quotaHit = e instanceof ApiError && e.kind === "quota";
      if (quotaHit && quota) setQuota({ ...quota, used: quota.limit });
      setMsgs((m) => [...m, { id: ++seq.current, role: "error", text: errorMessage(e), kind: quotaHit ? "quota" : "other", retry: quotaHit ? undefined : t }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  useEffect(() => {
    const q = params.get("q");
    if (q && !autoSent.current && user) {
      autoSent.current = true;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const mode = provider ?? (capabilities?.ai === "anthropic" ? "anthropic" : capabilities?.ai === "rules" ? "rules" : null);
  const exhausted = quota != null && quota.used >= quota.limit;

  return (
    <div className={styles.chat}>
      <div className={styles.status}>
        {mode ? (
          <span className={`badge ${mode === "anthropic" ? "badge-accent" : ""}`} title={mode === "rules" ? "Réponses construites par des règles à partir de votre demande" : "Réponses rédigées par une IA, lieux toujours issus de notre base"}>
            <IconSparkle /> {mode === "rules" ? "Mode règles" : "IA"}
          </span>
        ) : null}
        {quota ? (
          <span className={`badge ${exhausted ? "badge-gold" : ""}`} aria-label={`Quota : ${quota.used} demandes sur ${quota.limit} aujourd'hui`}>
            {quota.used}/{quota.limit} aujourd&apos;hui
          </span>
        ) : null}
        <span className={styles.statusNote}>
          <IconInfo size={14} /> Les lieux proposés viennent toujours de notre base.
        </span>
      </div>

      <div className={styles.thread} aria-live="polite" aria-busy={busy}>
        {msgs.length === 0 ? (
          <div className={styles.welcome}>
            <span className={styles.welcomeIcon}>
              <IconConcierge />
            </span>
            <h2 className={styles.welcomeTitle}>Dites-moi ce qui vous ferait plaisir</h2>
            <p className="muted">Ambiance, quartier, budget, avec qui… Je vous propose des lieux de notre sélection.</p>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className={styles.suggestion} onClick={() => send(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className={`${styles.msg} ${styles.mine}`}>
              <p className={styles.bubbleMine}>{m.text}</p>
            </div>
          ) : m.role === "assistant" ? (
            <div key={m.id} className={`${styles.msg} ${styles.theirs}`}>
              <span className={styles.botAvatar} aria-hidden="true">
                <IconConcierge size={16} />
              </span>
              <div className={styles.botBody}>
                <p className={styles.bubble}>{m.text}</p>
                {m.res ? <Parsed res={m.res} categoryName={categoryName} ambianceName={ambianceName} /> : null}
                {m.res?.places.length ? (
                  <div className={styles.places}>
                    {m.res.places.map((p) => (
                      <PlaceCard key={p.id} place={p} compact />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div key={m.id} className={`${styles.msg} ${styles.theirs}`}>
              <span className={`${styles.botAvatar} ${m.kind === "quota" ? styles.goldAvatar : ""}`} aria-hidden="true">
                {m.kind === "quota" ? <IconCrown size={16} /> : <IconInfo size={16} />}
              </span>
              <div className={`${styles.bubble} ${m.kind === "quota" ? styles.quotaBubble : styles.errorBubble}`} role="alert">
                <p>{m.kind === "quota" ? "Vous avez utilisé toutes vos demandes du jour." : m.text}</p>
                {m.kind === "quota" ? (
                  <>
                    <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                      {m.text} Le compteur se remet à zéro demain.
                    </p>
                    <Link href="/premium" className="btn btn-gold btn-sm" style={{ alignSelf: "flex-start", marginTop: 8 }}>
                      Passer à Plus
                    </Link>
                  </>
                ) : m.retry ? (
                  <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start", marginTop: 8 }} onClick={() => send(m.retry!)}>
                    <IconRefresh /> Réessayer
                  </button>
                ) : null}
              </div>
            </div>
          ),
        )}
        {busy ? (
          <div className={`${styles.msg} ${styles.theirs}`}>
            <span className={styles.botAvatar} aria-hidden="true">
              <IconConcierge size={16} />
            </span>
            <p className={`${styles.bubble} ${styles.typing}`} aria-label="Le concierge réfléchit">
              <span />
              <span />
              <span />
            </p>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="concierge-input" className="sr-only">
          Votre demande
        </label>
        <textarea
          ref={inputRef}
          id="concierge-input"
          className={styles.input}
          rows={1}
          value={input}
          maxLength={500}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={exhausted ? "Quota du jour atteint" : "Ex. un maquis animé à Yopougon samedi soir"}
          disabled={exhausted}
        />
        <button type="submit" className={`btn btn-primary ${styles.send}`} disabled={!input.trim() || busy || exhausted} aria-label="Envoyer">
          <IconSend />
        </button>
      </form>
    </div>
  );
}

function Parsed({ res, categoryName, ambianceName }: { res: ConciergeResponse; categoryName: (s: string) => string; ambianceName: (s: string) => string }) {
  const p = res.parsed;
  const tags = [
    ...(p.categories ?? []).map(categoryName),
    ...(p.ambiances ?? []).map(ambianceName),
    ...(p.budget_max_fcfa ? [`≤ ${formatFcfa(p.budget_max_fcfa)}`] : []),
    ...(p.open_now ? ["Ouvert maintenant"] : []),
    ...(p.q ? [`« ${p.q} »`] : []),
  ];
  if (!tags.length) return null;
  return (
    <p className={styles.parsed}>
      <span>J&apos;ai compris :</span>
      {tags.map((t) => (
        <span key={t} className={styles.tag}>
          {t}
        </span>
      ))}
    </p>
  );
}

export default function ConciergePage() {
  return (
    <div className={`page ${styles.page}`}>
      <title>Concierge</title>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <p className="eyebrow">Concierge</p>
        <h1 className="page-title">Votre concierge de sortie</h1>
      </div>
      <RequireAuth title="Le concierge est réservé aux membres" reason={<p>Créez un compte gratuit pour lui poser vos questions (3 demandes par jour en offre Découverte).</p>}>
        <Suspense fallback={null}>
          <Chat />
        </Suspense>
      </RequireAuth>
    </div>
  );
}
