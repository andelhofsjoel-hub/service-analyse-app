import { describe, expect, it } from "vitest";
import { leesDocument, serienummerSleutel, zoekDocumenten } from "./documenten";

describe("leesDocument", () => {
  it("leest een Tunturi exploded view met serienummerbereik en versie", () => {
    const d = leesDocument("spare-parts/17TBE60000_Tunturi U Bike E60_19G5CFE1825-20G5CFE1442_V3.1.pdf");
    expect(d).toMatchObject({
      soort: "exploded_view",
      artikelcode: "17TBE60000",
      serienummerVan: "19G5CFE1825",
      serienummerTot: "20G5CFE1442",
      versie: "3.1",
      isDubbel: false,
    });
  });

  it("herkent een open einde (XXX)", () => {
    const d = leesDocument("spare-parts/23TBE40000_Tunturi Signature E40 Bike_23M5AFE1701-XXX_V1.01.pdf");
    expect(d.serienummerVan).toBe("23M5AFE1701");
    expect(d.serienummerTot).toBeNull();
  });

  it("leest een Fluid-bestand zonder serienummers", () => {
    const d = leesDocument("spare-parts/22FVK3V0ST - Exploded Diagram ENG 2021 Viking 3 V.pdf");
    expect(d.artikelcode).toBe("22FVK3V0ST");
    expect(d.serienummerVan).toBeNull();
  });

  it("slaat een datum vooraan over", () => {
    const d = leesDocument("manuals/20201021_17TBF40000_U Bike Competence F40-BAI display_OM8_WEB.pdf");
    expect(d.artikelcode).toBe("17TBF40000");
    expect(d.soort).toBe("handleiding");
  });

  it("herkent service manuals en dubbels", () => {
    const d = leesDocument("service manual/2019_Tunturi Treadmill T20-T40_service manual_V1.2_Draft (1).pdf");
    expect(d.soort).toBe("service_manual");
    expect(d.isDubbel).toBe(true);
    expect(d.artikelcode).toBeNull();
  });
});

describe("serienummerSleutel", () => {
  it("maakt een sorteerbare sleutel", () => {
    expect(serienummerSleutel("19G5CFE1825")).toBe("19G1825");
    expect(serienummerSleutel("niet geldig")).toBeNull();
  });
});

describe("zoekDocumenten", () => {
  const e60 = [
    "spare-parts/17TBE60000_Tunturi U Bike E60_16M5AFE1022-18D5AFE0892_V1.7.pdf",
    "spare-parts/17TBE60000_Tunturi U Bike E60_19G5CFE1825-20G5CFE1442_V3.1.pdf",
    "spare-parts/17TBE60000_Tunturi U Bike E60_20H5CFE0813-21J5DFE0474_V3.24.pdf",
    "spare-parts/17TBE60000_Tunturi U Bike E60_21K5EFE0703-23J5EFE0600_V4.01.pdf",
    "service manual/17TBE60000_E60 Bike Performance_Service manual-Web_V1.11.pdf",
    "manuals/17TBE60000_U Bike Performance E60-BAI display_OM8_20191112.pdf",
  ].map(leesDocument);

  it("zet de exploded view van het juiste serienummerbereik bovenaan", () => {
    const res = zoekDocumenten(e60, "17TBE60000", "21F5DFE1097");
    expect(res[0].bestandsnaam).toContain("20H5CFE0813-21J5DFE0474");
    expect(res[0].match).toBe("binnen_bereik");
    // service manual en handleiding hebben geen bereik en komen daarna
    expect(res.slice(1, 3).map((r) => r.match)).toEqual(["geen_bereik", "geen_bereik"]);
    // de andere exploded views staan achteraan
    expect(res.slice(3).every((r) => r.match === "buiten_bereik")).toBe(true);
  });

  it("toont alles als het serienummer onbekend is", () => {
    const res = zoekDocumenten(e60, "17tbe60000", null);
    expect(res).toHaveLength(6);
  });
});
