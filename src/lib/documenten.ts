// Herkent documenten op basis van hun bestandsnaam en kiest de juiste versie voor een toestel.
//
// Tunturi-voorbeeld:  17TBE60000_Tunturi U Bike E60_19G5CFE1825-20G5CFE1442_V3.1.pdf
//   artikelcode = 17TBE60000, serienummers 19G5CFE1825 t/m 20G5CFE1442, versie 3.1
// Fluid-voorbeeld:    22FVK3V0ST - Exploded Diagram ENG 2021 Viking 3 V.pdf
//   artikelcode = 22FVK3V0ST, geen serienummerbereik

export type DocumentSoort = "exploded_view" | "service_manual" | "handleiding" | "andere";

export interface DocumentInfo {
  bestandsnaam: string;
  pad: string;
  soort: DocumentSoort;
  artikelcode: string | null;
  serienummerVan: string | null;
  serienummerTot: string | null; // null = open einde ("XXX")
  versie: string | null;
  isDubbel: boolean; // bv. "... (1).pdf"
}

// Een artikelcode is 2 cijfers (jaar) + 8 letters/cijfers, bv. 23TBE50000 of 22FAPP00B0.
const ARTIKELCODE = /^(\d{2}[A-Z0-9]{8})(?=[\s_\-.]|$)/;
// Een serienummer: 2 cijfers (jaar), maandletter A-M, dan letters/cijfers, eindigend op cijfers.
const SERIENUMMER = "\\d{2}[A-M][A-Z0-9]{4}\\d{4}";
const BEREIK = new RegExp(`(${SERIENUMMER})-(${SERIENUMMER}|XXX)`, "i");
const VERSIE = /_V\s?(\d+(?:\.\d+)*)/i;

export function soortUitMap(map: string): DocumentSoort {
  const m = map.toLowerCase();
  if (m.includes("spare")) return "exploded_view";
  if (m.includes("service")) return "service_manual";
  if (m.includes("manual")) return "handleiding";
  return "andere";
}

/** Haalt artikelcode, serienummerbereik en versie uit een pad zoals "spare-parts/17TBE60000_....pdf". */
export function leesDocument(pad: string): DocumentInfo {
  const delen = pad.replace(/\\/g, "/").split("/");
  const bestandsnaam = delen[delen.length - 1];
  const map = delen.length > 1 ? delen[delen.length - 2] : "";
  const naam = bestandsnaam.replace(/\.[a-z0-9]+$/i, "");

  // Sommige bestanden beginnen met een datum, bv. "20201021_17TBF40000_...": sla die over.
  const zonderDatum = naam.replace(/^\d{8}_/, "");
  const artikel = zonderDatum.match(ARTIKELCODE);
  const bereik = naam.match(BEREIK);
  const versie = naam.match(VERSIE);

  return {
    bestandsnaam,
    pad,
    soort: soortUitMap(map),
    artikelcode: artikel ? artikel[1] : null,
    serienummerVan: bereik ? bereik[1].toUpperCase() : null,
    serienummerTot: bereik && bereik[2].toUpperCase() !== "XXX" ? bereik[2].toUpperCase() : null,
    versie: versie ? versie[1] : null,
    isDubbel: /\(\d+\)$/.test(naam.trim()),
  };
}

/**
 * Zet een serienummer om naar een sorteerbare sleutel: jaar + maand + volgnummer.
 * 19G5CFE1825 -> "19" + "G" + "1825". Geeft null als het geen geldig serienummer is.
 */
export function serienummerSleutel(serienummer: string): string | null {
  const s = serienummer.trim().toUpperCase();
  const m = s.match(/^(\d{2})([A-M])[A-Z0-9]{4}(\d{4})$/);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

export type Match = "binnen_bereik" | "geen_bereik" | "onbekend_serienummer" | "buiten_bereik";

export function matchSerienummer(doc: DocumentInfo, serienummer: string | null): Match {
  if (!doc.serienummerVan) return "geen_bereik";
  const sleutel = serienummer ? serienummerSleutel(serienummer) : null;
  if (!sleutel) return "onbekend_serienummer";
  const van = serienummerSleutel(doc.serienummerVan);
  const tot = doc.serienummerTot ? serienummerSleutel(doc.serienummerTot) : null;
  if (van && sleutel < van) return "buiten_bereik";
  if (tot && sleutel > tot) return "buiten_bereik";
  return "binnen_bereik";
}

const MATCH_VOLGORDE: Record<Match, number> = {
  binnen_bereik: 0,
  geen_bereik: 1,
  onbekend_serienummer: 2,
  buiten_bereik: 3,
};

export interface Gevonden extends DocumentInfo {
  match: Match;
}

/**
 * Geeft de documenten voor een toestel, best passende eerst.
 * Dubbels worden weggelaten. Documenten buiten het serienummerbereik komen achteraan,
 * zodat de technieker ze nog kan zien als het serienummer fout ingevuld is.
 */
export function zoekDocumenten(
  documenten: DocumentInfo[],
  artikelcode: string,
  serienummer: string | null,
): Gevonden[] {
  const code = artikelcode.trim().toUpperCase();
  const gezien = new Set<string>();
  return documenten
    .filter((d) => d.artikelcode === code && !d.isDubbel)
    .filter((d) => {
      const sleutel = `${d.soort}|${d.bestandsnaam.replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
      if (gezien.has(sleutel)) return false;
      gezien.add(sleutel);
      return true;
    })
    .map((d) => ({ ...d, match: matchSerienummer(d, serienummer) }))
    .sort((a, b) => MATCH_VOLGORDE[a.match] - MATCH_VOLGORDE[b.match] || a.soort.localeCompare(b.soort));
}
