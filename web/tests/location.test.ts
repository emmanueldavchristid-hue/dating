import { describe, expect, it } from "vitest";
import { parseLocation } from "@/components/admin/PlaceForm";

describe("parseLocation (ajout rapide d'un lieu)", () => {
  it("lit un lien Google Maps complet", () => {
    expect(parseLocation("https://www.google.com/maps/place/Strike+Bowl/@5.3601,-3.9962,17z/data=!3m1")).toEqual({ lat: 5.3601, lng: -3.9962 });
    expect(parseLocation("https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0:0x0!8m2!3d5.29145!4d-3.98712")).toEqual({ lat: 5.29145, lng: -3.98712 });
    expect(parseLocation("https://maps.google.com/?q=5.31,-4.02")).toEqual({ lat: 5.31, lng: -4.02 });
  });
  it("lit des coordonnées tapées, virgule décimale comprise", () => {
    expect(parseLocation("5.3364, -4.0267")).toEqual({ lat: 5.3364, lng: -4.0267 });
    expect(parseLocation("5,3364 -4,0267")).toEqual({ lat: 5.3364, lng: -4.0267 });
  });
  it("refuse un lien court ou du texte", () => {
    expect(parseLocation("https://maps.app.goo.gl/AbCdEf")).toBeNull();
    expect(parseLocation("Maquis chez Tantie")).toBeNull();
  });
});
