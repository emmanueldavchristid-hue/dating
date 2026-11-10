"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
import { creditLabel, MAX_CREDIT_LENGTH, PHOTO_SOURCES, photoErrorMessage, uploadPlacePhoto, validatePhotoFile, type PhotoSource } from "@/lib/photos";
import type { AdminPhoto, AdminPhotoList, AdminPhotoPatch } from "@/lib/types";
import { IconCamera, IconCheck, IconImage, IconTrash } from "../icons";
import { Modal } from "../ui/Modal";
import styles from "./admin.module.css";

const STATUS_LABEL: Record<AdminPhoto["status"], string> = { approved: "Affichée", pending: "À valider", rejected: "Refusée" };
const COVER_LABEL: Record<AdminPhotoList["cover_kind"], string> = {
  photo: "Photo réelle autorisée",
  wikimedia: "Photo Wikimedia validée",
  illustration: "Illustration (aucune vraie photo)",
};

/**
 * Photos d'un lieu, avec leur provenance et leurs droits.
 * Ordre d'affichage (décidé par le serveur) : photo réelle autorisée → Wikimedia validée → illustration.
 * Réservé aux curateurs et administrateurs (le serveur le vérifie aussi).
 */
export function PhotoManager({ placeId, onChanged }: { placeId: string; slug?: string; onChanged?: () => void }) {
  const toast = useToast();
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<AdminPhotoList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [source, setSource] = useState<PhotoSource>("team");
  const [author, setAuthor] = useState("");
  const [license, setLicense] = useState("");
  const [licenseUrl, setLicenseUrl] = useState("");
  const [sourcePage, setSourcePage] = useState("");
  const [rightsNote, setRightsNote] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [makeCover, setMakeCover] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    return api.admin
      .photos(placeId)
      .then((d) => {
        setData(d);
        return d;
      })
      .catch((e: unknown) => {
        setLoadError(photoErrorMessage(e));
        return null;
      });
  }, [placeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setAuthor("");
    setLicense("");
    setLicenseUrl("");
    setSourcePage("");
    setRightsNote("");
    setRightsConfirmed(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const pick = (f: File | null) => {
    setError(null);
    if (!f) return reset();
    const invalid = validatePhotoFile(f);
    if (invalid) {
      setError(invalid);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await uploadPlacePhoto(placeId, file, { source, author, license, licenseUrl, sourcePage, rightsNote, rightsConfirmed, makeCover });
      toast(res.is_cover ? "Photo ajoutée en couverture" : "Photo ajoutée", "success");
      reset();
      await load();
      onChanged?.();
    } catch (e) {
      setError(photoErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const run = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      toast(done, "success");
      setConfirmId(null);
      setEditing(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError(photoErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const items = data?.items ?? [];
  const pending = items.filter((p) => p.status === "pending").length;

  return (
    <section className={styles.photos} aria-labelledby={`${inputId}-title`}>
      <div className={styles.photosHead}>
        <h3 id={`${inputId}-title`} className={styles.photosTitle}>
          <IconImage size={18} /> Photos
        </h3>
        {data ? (
          <span className="subtle">
            Affiché : <strong>{COVER_LABEL[data.cover_kind]}</strong>
            {pending ? ` · ${pending} à valider` : ""}
          </span>
        ) : null}
      </div>
      <p className="subtle" style={{ fontSize: 13, margin: 0 }}>
        Ordre d&apos;affichage : photo réelle autorisée, puis photo Wikimedia validée (avec ses crédits), sinon une illustration signalée comme telle.
      </p>

      {loadError ? (
        <p className="form-error" role="alert">
          {loadError}{" "}
          <button type="button" className="link" onClick={() => void load()}>
            Réessayer
          </button>
        </p>
      ) : !data ? (
        <div className="skeleton" style={{ height: 120, borderRadius: 16 }} aria-busy="true" />
      ) : items.length ? (
        <ul className={styles.photoGrid}>
          {items.map((ph, i) => (
            <li key={ph.id} className={`${styles.photoItem} ${ph.is_cover && ph.status === "approved" ? styles.photoCover : ""}`} data-testid="admin-photo">
              <div className={styles.photoImgWrap}>
                {ph.url ? <img src={ph.url} alt={`Photo ${i + 1}`} className={styles.photoImg} loading="lazy" /> : null}
                {ph.is_cover && ph.status === "approved" ? (
                  <span className={`badge badge-accent ${styles.photoBadge}`}>
                    <IconCheck size={12} /> Couverture
                  </span>
                ) : null}
              </div>
              <p className={styles.photoCredit}>
                <span className={`badge ${ph.status === "approved" ? "badge-open" : ph.status === "pending" ? "badge-gold" : "badge-closed"}`}>{STATUS_LABEL[ph.status]}</span>{" "}
                {ph.source_label}
              </p>
              {ph.credit ? <p className={styles.photoCredit}>{creditLabel(ph.credit)}</p> : null}
              {ph.source_page ? (
                <p className={styles.photoCredit}>
                  <a href={ph.source_page} target="_blank" rel="noreferrer noopener" className="link">
                    Page source
                  </a>
                  {ph.license_url ? (
                    <>
                      {" · "}
                      <a href={ph.license_url} target="_blank" rel="noreferrer noopener" className="link">
                        Licence
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
              {ph.rights_note ? <p className={styles.photoCredit}>Autorisation : {ph.rights_note}</p> : null}

              {editing === ph.id ? (
                <PhotoEditor photo={ph} busy={busy === ph.id} onCancel={() => setEditing(null)} onSave={(body) => void run(ph.id, () => api.admin.updatePhoto(ph.id, body), "Infos de la photo enregistrées")} />
              ) : confirmId === ph.id ? (
                <div className={styles.photoActions} role="group" aria-label="Confirmer la suppression">
                  <span className={styles.confirmText}>Supprimer définitivement ?</span>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => void run(ph.id, () => api.admin.deletePhoto(ph.id), "Photo supprimée")} disabled={busy === ph.id}>
                    {busy === ph.id ? <span className="spinner" aria-hidden="true" /> : <IconTrash size={14} />} Supprimer
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)} disabled={busy === ph.id}>
                    Annuler
                  </button>
                </div>
              ) : (
                <div className={styles.photoActions}>
                  {ph.status !== "approved" ? (
                    <button type="button" className="btn btn-sm" onClick={() => void run(ph.id, () => api.admin.updatePhoto(ph.id, { status: "approved" }), "Photo validée")} disabled={!!busy}>
                      <IconCheck size={14} /> Valider
                    </button>
                  ) : null}
                  {ph.status !== "rejected" ? (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => void run(ph.id, () => api.admin.updatePhoto(ph.id, { status: "rejected" }), "Photo refusée")} disabled={!!busy}>
                      Refuser
                    </button>
                  ) : null}
                  {ph.status === "approved" && !ph.is_cover ? (
                    <button type="button" className="btn btn-sm" onClick={() => void run(ph.id, () => api.admin.setCover(ph.id), "Photo mise en avant")} disabled={!!busy}>
                      Mettre en avant
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(ph.id)} disabled={!!busy}>
                    Modifier les crédits
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmId(ph.id)} disabled={!!busy} aria-label={`Supprimer la photo ${i + 1}`}>
                    <IconTrash size={14} /> Supprimer
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Aucune photo : la fiche affiche une illustration, signalée comme telle. Ajoutez une vraie photo ci-dessous.</p>
      )}

      <div className={styles.uploadBox}>
        <strong>{data?.cover_kind === "photo" ? "Ajouter une photo réelle" : "Remplacer l'illustration par une vraie photo"}</strong>
        <label htmlFor={inputId} className={styles.dropLabel}>
          {preview ? <img src={preview} alt="Aperçu de la photo choisie" className={styles.uploadPreview} /> : <IconCamera size={22} />}
          <span>
            <strong>{file ? file.name : "Choisir une photo"}</strong>
            <span className="subtle">JPEG, PNG ou WebP · 8 Mo maximum</span>
          </span>
        </label>
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          disabled={uploading}
          aria-label="Photo à envoyer"
        />
        <fieldset className="field" disabled={uploading} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Provenance</legend>
          {PHOTO_SOURCES.map((o) => (
            <label key={o.value} className="checkbox">
              <input type="radio" name={`${inputId}-source`} value={o.value} checked={source === o.value} onChange={() => setSource(o.value)} />
              <span>
                {o.label} <span className="subtle" style={{ fontWeight: 500 }}>· {o.hint}</span>
              </span>
            </label>
          ))}
          <span className="hint">Pas de photo copiée depuis Google, Instagram ou TikTok sans accord écrit de son auteur.</span>
        </fieldset>
        <label className="field">
          <span className="label">Auteur (obligatoire)</span>
          <input className="input" value={author} maxLength={MAX_CREDIT_LENGTH} onChange={(e) => setAuthor(e.target.value)} placeholder="Nom du photographe ou du lieu" disabled={uploading} />
          <span className="hint">Affiché en crédit sous la photo.</span>
        </label>
        {source !== "team" ? (
          <label className="field">
            <span className="label">Autorisation obtenue (obligatoire)</span>
            <input className="input" value={rightsNote} maxLength={300} onChange={(e) => setRightsNote(e.target.value)} placeholder="Ex. : accord écrit du gérant par WhatsApp le 10/11" disabled={uploading} />
            <span className="hint">Conservé pour l&apos;équipe, non affiché au public.</span>
          </label>
        ) : null}
        {source === "licensed" ? (
          <>
            <label className="field">
              <span className="label">Licence</span>
              <input className="input" value={license} maxLength={80} onChange={(e) => setLicense(e.target.value)} placeholder="Ex. : CC BY 4.0" disabled={uploading} />
            </label>
            <label className="field">
              <span className="label">Lien de la licence</span>
              <input className="input" type="url" value={licenseUrl} maxLength={300} onChange={(e) => setLicenseUrl(e.target.value)} disabled={uploading} />
            </label>
          </>
        ) : null}
        <label className="field">
          <span className="label">Page source (facultatif)</span>
          <input className="input" type="url" value={sourcePage} maxLength={500} onChange={(e) => setSourcePage(e.target.value)} placeholder="Lien vers la photo d'origine" disabled={uploading} />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={rightsConfirmed} onChange={(e) => setRightsConfirmed(e.target.checked)} disabled={uploading} />
          <span>J&apos;ai le droit d&apos;utiliser cette photo dans l&apos;application (obligatoire)</span>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={makeCover} onChange={(e) => setMakeCover(e.target.checked)} disabled={uploading} />
          <span>Photo principale (couverture)</span>
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="row wrap">
          <button type="button" className="btn btn-primary" onClick={() => void upload()} disabled={!file || uploading}>
            {uploading ? <span className="spinner" aria-hidden="true" /> : <IconCamera size={16} />}
            {uploading ? "Envoi en cours…" : "Envoyer la photo"}
          </button>
          {file && !uploading ? (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Annuler
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Correction de la provenance et des droits d'une photo. */
function PhotoEditor({ photo, busy, onSave, onCancel }: { photo: AdminPhoto; busy: boolean; onSave: (b: AdminPhotoPatch) => void; onCancel: () => void }) {
  const [f, setF] = useState({
    author: photo.author ?? "",
    license: photo.license ?? "",
    license_url: photo.license_url ?? "",
    source_page: photo.source_page ?? "",
    rights_note: photo.rights_note ?? "",
  });
  const field = (key: keyof typeof f, label: string, max: number) => (
    <label className="field">
      <span className="label">{label}</span>
      <input className="input" value={f[key]} maxLength={max} onChange={(e) => setF({ ...f, [key]: e.target.value })} disabled={busy} />
    </label>
  );
  return (
    <div className={styles.uploadBox}>
      {field("author", "Auteur", 160)}
      {field("license", "Licence", 80)}
      {field("license_url", "Lien de la licence", 300)}
      {field("source_page", "Page source", 500)}
      {field("rights_note", "Autorisation (interne)", 300)}
      <div className="row wrap">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => onSave(f)} disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null} Enregistrer
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
      </div>
    </div>
  );
}

/** Fenêtre « Photos » (depuis la curation ou la liste des lieux). */
export function PhotoModal({ place, onClose }: { place: { id: string; slug: string; name: string } | null; onClose: () => void }) {
  return (
    <Modal open={!!place} onClose={onClose} title={place ? `Photos · ${place.name}` : "Photos"} variant="sheet">
      {place ? <PhotoManager placeId={place.id} slug={place.slug} /> : null}
    </Modal>
  );
}
