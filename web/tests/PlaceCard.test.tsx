import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlaceCard } from "@/components/place/PlaceCard";
import { makePlace } from "./fixtures";

const text = () => document.body.textContent?.replace(/ /g, " ") ?? "";

describe("PlaceCard — règles d'honnêteté", () => {
  it("affiche le badge « Démo » pour une donnée fictive", () => {
    render(<PlaceCard place={makePlace({ is_demo: true })} />);
    expect(screen.getByText("Démo")).toBeInTheDocument();
  });

  it("n'affiche pas de badge Démo pour un lieu réel", () => {
    render(<PlaceCard place={makePlace({ is_demo: false })} />);
    expect(screen.queryByText("Démo")).not.toBeInTheDocument();
  });

  it("distance étiquetée « à vol d'oiseau » et aucun temps de trajet si travel = null", () => {
    render(<PlaceCard place={makePlace({ travel: null, distance_km: 2.4 })} />);
    expect(text()).toContain("2,4 km à vol d'oiseau");
    expect(text()).not.toMatch(/min en voiture|min à pied/);
  });

  it("affiche le temps de trajet et sa source quand il est fourni", () => {
    render(<PlaceCard place={makePlace({ travel: { mode: "driving", minutes: 14, source: "OSRM" } })} />);
    expect(text()).toContain("14 min en voiture");
    expect(text()).toContain("OSRM");
  });

  it("statut inconnu → « Horaires non vérifiés »", () => {
    render(<PlaceCard place={makePlace({ open_status: "unknown" })} />);
    expect(screen.getByText("Horaires non vérifiés")).toBeInTheDocument();
  });

  it("note absente → « Pas encore d'avis » (jamais de note inventée)", () => {
    render(<PlaceCard place={makePlace({ rating_avg: null, rating_count: 0 })} />);
    expect(screen.getByText("Pas encore d'avis")).toBeInTheDocument();
  });

  it("budget inconnu : rien n'est affiché", () => {
    render(<PlaceCard place={makePlace({ budget_min_fcfa: null, budget_max_fcfa: null })} />);
    expect(text()).not.toContain("FCFA");
  });

  it("pépite verrouillée : style or, cadenas, lien vers /premium, ni distance ni fiche", () => {
    render(
      <PlaceCard
        place={makePlace({
          locked: true,
          tier: "premium",
          name: "Pépite Insider",
          location: null,
          distance_km: null,
          reasons: [],
        })}
      />,
    );
    expect(screen.getByRole("article", { name: "Pépite verrouillée" })).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/premium");
    expect(screen.getByText(/Débloquer avec une offre premium/)).toBeInTheDocument();
    expect(text()).not.toContain("vol d'oiseau");
  });

  it("lien vers la fiche du lieu", () => {
    render(<PlaceCard place={makePlace()} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/places/le-toit-du-plateau");
  });

  it("couverture générée (dégradé) quand cover.url est null — aucune photo", () => {
    const { container } = render(<PlaceCard place={makePlace()} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Ambiance du Toit du Plateau" })).toBeInTheDocument();
  });
});
