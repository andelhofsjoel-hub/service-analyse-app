import { describe, expect, it } from "vitest";
import type { OnderdeelRij } from "./excel";
import { voegDubbelsSamen } from "./supabase-import";

const rij = (deel: Partial<OnderdeelRij>): OnderdeelRij => ({
  code: ".WM367#15",
  omschrijving: null,
  prijs: null,
  merk: null,
  nietMeerLeverbaar: false,
  vervangenDoor: null,
  opStock: 0,
  gereserveerd: 0,
  gereserveerdVoor: [],
  ...deel,
});

describe("voegDubbelsSamen", () => {
  it("houdt één rij per code en vult een ontbrekende prijs aan uit de eerdere rij", () => {
    const res = voegDubbelsSamen([
      rij({ omschrijving: '1" Square end Cap MAN. ENDED', prijs: 0.89 }),
      rij({ omschrijving: '1" Square end Cap', opStock: 2 }),
      rij({ code: "ANDER", prijs: 5 }),
    ]);
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ omschrijving: '1" Square end Cap', prijs: 0.89, opStock: 2 });
  });
});
