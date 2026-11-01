// Haalt gegevens op. Voorlopig uit de map data/ (gevuld door "npm run importeer").
// Later komt hier Supabase in de plaats; de rest van de app hoeft daarvoor niet te veranderen.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentInfo } from "./documenten";
import type { AanvraagRij, OnderdeelRij } from "./excel";

async function lees<T>(naam: string): Promise<T[]> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", naam), "utf8"));
  } catch {
    return []; // nog niets ingelezen
  }
}

export const haalDocumenten = () => lees<DocumentInfo>("documenten.json");
export const haalOnderdelen = () => lees<OnderdeelRij>("onderdelen.json");
export const haalAanvragen = () => lees<AanvraagRij>("aanvragen.json");

/** Zoekt onderdelen op code (begint met) of op woorden in de omschrijving. Maximaal 50 resultaten. */
export async function zoekOnderdelen(zoekterm: string): Promise<OnderdeelRij[]> {
  const term = zoekterm.trim().toLowerCase();
  if (!term) return [];
  const zonderPunt = term.replace(/^\./, "");
  const woorden = term.split(/\s+/);
  const alle = await haalOnderdelen();
  const opCode = alle.filter((o) => o.code.toLowerCase().replace(/^\./, "").startsWith(zonderPunt));
  const opTekst = alle.filter(
    (o) => !opCode.includes(o) && woorden.every((w) => (o.omschrijving ?? "").toLowerCase().includes(w)),
  );
  return [...opCode, ...opTekst].slice(0, 50);
}
