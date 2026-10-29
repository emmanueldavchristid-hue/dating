import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page page-narrow" style={{ paddingTop: 64 }}>
      <p className="eyebrow">Erreur 404</p>
      <h1 className="page-title" style={{ margin: "8px 0 12px" }}>
        Cette adresse n&apos;existe pas (encore)
      </h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        La page demandée est introuvable. Revenez à l&apos;accueil pour trouver où sortir ce soir.
      </p>
      <Link href="/" className="btn btn-primary">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
