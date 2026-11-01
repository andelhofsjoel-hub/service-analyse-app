// Leest de Excel-bestanden die nu in gebruik zijn: de voorraadlijst en de aanvraaglijsten van Tunturi.
import ExcelJS from "exceljs";

export interface OnderdeelRij {
  code: string;
  omschrijving: string | null;
  prijs: number | null;
  merk: string | null;
  nietMeerLeverbaar: boolean;
  vervangenDoor: string | null;
  opStock: number;
  gereserveerd: number;
  gereserveerdVoor: string[]; // opdrachtnummers
}

export interface AanvraagRij {
  aanvraagnummer: string;
  status: string | null;
  artikelcode: string | null;
  artikelOmschrijving: string | null;
  serienummer: string | null;
  aankoopdatum: Date | null;
  garantie: boolean | null;
  typeGebruik: string | null;
  klacht: string | null;
  memo: string | null;
  klant: {
    externNummer: string | null;
    naam: string | null;
    straat: string | null;
    postcode: string | null;
    plaats: string | null;
    land: string | null;
    email: string | null;
    telefoon: string | null;
  };
  ontvangenOp: Date | null;
}

/** Zet een Excel-celwaarde om naar gewone tekst (ExcelJS geeft soms objecten terug). */
export function tekst(waarde: ExcelJS.CellValue): string | null {
  if (waarde === null || waarde === undefined) return null;
  if (waarde instanceof Date) return waarde.toISOString();
  if (typeof waarde === "object") {
    if ("text" in waarde && typeof waarde.text === "string") return waarde.text.trim() || null; // hyperlink
    if ("richText" in waarde) return waarde.richText.map((r) => r.text).join("").trim() || null;
    if ("result" in waarde) return tekst(waarde.result as ExcelJS.CellValue); // formule
    return null;
  }
  const s = String(waarde).trim();
  return s === "" ? null : s;
}

export function getal(waarde: ExcelJS.CellValue): number | null {
  const s = tekst(waarde);
  if (s === null) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function datum(waarde: ExcelJS.CellValue): Date | null {
  if (waarde instanceof Date) return waarde;
  // Excel bewaart datums als dagnummer sinds 1900 (bv. 46322.63 = 27 oktober 2026, 15:10)
  if (typeof waarde === "number" && waarde > 20000 && waarde < 80000) {
    return new Date(Math.round((waarde - 25569) * 86400000));
  }
  const s = tekst(waarde);
  if (!s) return null;
  const nl = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/); // 23-02-2024 of 6/8/26
  if (nl) {
    const jaar = nl[3].length === 2 ? 2000 + Number(nl[3]) : Number(nl[3]);
    return new Date(Date.UTC(jaar, Number(nl[2]) - 1, Number(nl[1])));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Leest alle rijen van één blad. We gebruiken de "streaming" lezer van ExcelJS: die is sneller
 * bij grote bestanden en loopt niet vast op de aanvraaglijsten van Tunturi (de gewone lezer doet dat wel).
 * Geeft per rij een lijst celwaarden, waarbij index 1 = kolom A.
 */
export async function leesBlad(bestand: string, blad: string | number): Promise<ExcelJS.CellValue[][]> {
  const lezer = new ExcelJS.stream.xlsx.WorkbookReader(bestand, {
    sharedStrings: "cache",
    worksheets: "emit",
    hyperlinks: "ignore",
    styles: "ignore",
    entries: "emit",
  });
  let index = 0;
  for await (const werkblad of lezer) {
    // De streaming lezer kent de bladnaam via het (interne) veld "name".
    const naam = (werkblad as unknown as { name?: string }).name;
    const gezocht = typeof blad === "number" ? index === blad : naam === blad;
    index++;
    const rijen: ExcelJS.CellValue[][] = [];
    for await (const rij of werkblad) {
      if (gezocht) rijen.push((rij.values as ExcelJS.CellValue[]) ?? []);
    }
    if (gezocht) return rijen;
  }
  throw new Error(`Blad ${blad} niet gevonden in ${bestand}`);
}

const KOLOM = (letter: string) => letter.toUpperCase().charCodeAt(0) - 64; // A=1, B=2, ...

/**
 * Blad "stock-prices" (zonder kopregel), uitleg van Joel op 1 november 2026:
 * A = artikelnummer, B = omschrijving, C = prijs, N = op stock, P = gereserveerd,
 * S t/m V = opdrachtnummers waarvoor gereserveerd. Kolom D en G bevatten soms een vervangend nummer,
 * G ook "No longer available", H het merk.
 */
export async function leesVoorraad(bestand: string): Promise<OnderdeelRij[]> {
  const rijen = await leesBlad(bestand, "stock-prices");
  const resultaat: OnderdeelRij[] = [];
  for (const r of rijen) {
    const cel = (k: string) => r[KOLOM(k)];
    const code = tekst(cel("A"));
    if (!code) continue;
    const d = tekst(cel("D"));
    const g = tekst(cel("G"));
    resultaat.push({
      code,
      omschrijving: tekst(cel("B")),
      prijs: getal(cel("C")),
      merk: tekst(cel("H")),
      nietMeerLeverbaar: g === "No longer available",
      vervangenDoor: [d, g].find((v) => v && v.startsWith(".")) ?? null,
      opStock: Math.max(0, getal(cel("N")) ?? 0),
      gereserveerd: Math.max(0, getal(cel("P")) ?? 0),
      gereserveerdVoor: ["S", "T", "U", "V"].map((k) => tekst(cel(k))).filter((v): v is string => !!v),
    });
  }
  return resultaat;
}

/** Aanvraaglijst uit het CRM van Tunturi ("Servicemonteur aanvraag ....xlsx"), gelezen op kolomnaam. */
export async function leesAanvragen(bestand: string): Promise<AanvraagRij[]> {
  const [kop, ...rijen] = await leesBlad(bestand, 0);
  const kolom: Record<string, number> = {};
  kop.forEach((cel, nr) => {
    const naam = tekst(cel);
    if (naam) kolom[naam] = nr;
  });
  // Kolomnamen beginnen voorspelbaar; zoek op begin zodat kleine wijzigingen bij Tunturi geen probleem zijn.
  const zoek = (begin: string) => {
    const naam = Object.keys(kolom).find((k) => k.toLowerCase().startsWith(begin.toLowerCase()));
    return naam ? kolom[naam] : undefined;
  };
  const resultaat: AanvraagRij[] = [];
  for (const r of rijen) {
    const waarde = (begin: string) => {
      const nr = zoek(begin);
      return nr ? r[nr] : null;
    };
    const aanvraagnummer = tekst(waarde("Aanvraagnummer"));
    if (!aanvraagnummer) continue;
    const garantie = tekst(waarde("Garantie"));
    resultaat.push({
      aanvraagnummer,
      status: tekst(waarde("Aanvraag status")),
      artikelcode: kolom["Artikel"] ? tekst(r[kolom["Artikel"]]) : null,
      artikelOmschrijving: tekst(waarde("Artikel omschrijving")),
      serienummer: tekst(waarde("Serienummer")),
      aankoopdatum: datum(waarde("Aankoopdatum")),
      garantie: garantie === null ? null : garantie.toLowerCase() === "ja",
      typeGebruik: tekst(waarde("Type gebruik")),
      klacht: tekst(waarde("Omschrijving")),
      memo: tekst(waarde("Memo")),
      klant: {
        externNummer: tekst(waarde("Accountnummer")),
        naam: tekst(waarde("Klant")),
        straat: tekst(waarde("Adres 1: straat")),
        postcode: tekst(waarde("Adres 1: postcode")),
        plaats: tekst(waarde("Adres 1: plaats")),
        land: tekst(waarde("Land")),
        email: tekst(waarde("E-mail")),
        telefoon: tekst(waarde("Telefoonnummer")),
      },
      ontvangenOp: datum(waarde("Gemaakt op")),
    });
  }
  return resultaat;
}
