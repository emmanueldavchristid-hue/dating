import { describe, expect, it } from "vitest";
import { isoToLocalInput, localInputToIso } from "@/components/admin/AgendaTab";

describe("dates de l'agenda (admin)", () => {
  it("aller-retour entre le champ du navigateur et l'ISO", () => {
    const iso = localInputToIso("2026-11-08T22:30");
    expect(iso).not.toBeNull();
    expect(isoToLocalInput(iso)).toBe("2026-11-08T22:30");
  });
  it("champ vide ou invalide → null", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("pas une date")).toBeNull();
    expect(isoToLocalInput(null)).toBe("");
  });
});
