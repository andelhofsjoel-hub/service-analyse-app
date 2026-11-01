// Haalt gegevens op: uit Supabase als dat ingesteld is (.env.local), anders uit de map data/.
// De pagina's merken het verschil niet.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentInfo } from "./documenten";
import type { AanvraagRij, OnderdeelRij } from "./excel";
import { bedrijfId, supabaseGeconfigureerd, supabaseServer } from "./supabase";

async function leesJson<T>(naam: string): Promise<T[]> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", naam), "utf8"));
  } catch {
    return []; // nog niets ingelezen
  }
}

async function db() {
  const client = supabaseServer();
  return { client, bedrijf: await bedrijfId(client) };
}

/** Alle documenten voor één artikelcode. */
export async function haalDocumenten(artikelcode: string): Promise<DocumentInfo[]> {
  if (!supabaseGeconfigureerd()) {
    return (await leesJson<DocumentInfo>("documenten.json")).filter((d) => d.artikelcode === artikelcode);
  }
  const { client, bedrijf } = await db();
  const { data, error } = await client
    .from("document")
    .select("bestandsnaam, opslag_pad, soort, artikelcode, serienummer_van, serienummer_tot, versie")
    .eq("bedrijf_id", bedrijf)
    .eq("artikelcode", artikelcode);
  if (error) throw error;
  return data.map((d) => ({
    bestandsnaam: d.bestandsnaam,
    pad: d.opslag_pad,
    soort: d.soort,
    artikelcode: d.artikelcode,
    serienummerVan: d.serienummer_van,
    serienummerTot: d.serienummer_tot,
    versie: d.versie,
    isDubbel: false,
  }));
}

/** Eerdere aanvragen voor een toesteltype, nieuwste eerst. */
export async function haalAanvragen(artikelcode: string): Promise<AanvraagRij[]> {
  if (!supabaseGeconfigureerd()) {
    return (await leesJson<AanvraagRij>("aanvragen.json")).filter((a) => a.artikelcode === artikelcode);
  }
  const { client, bedrijf } = await db();
  const { data, error } = await client
    .from("aanvraag")
    .select("aanvraagnummer, status_opdrachtgever, artikelcode, artikel_omschrijving, serienummer, klacht, memo, garantie, type_gebruik, ontvangen_op")
    .eq("bedrijf_id", bedrijf)
    .eq("artikelcode", artikelcode)
    .order("ontvangen_op", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data.map((a) => ({
    aanvraagnummer: a.aanvraagnummer,
    status: a.status_opdrachtgever,
    artikelcode: a.artikelcode,
    artikelOmschrijving: a.artikel_omschrijving,
    serienummer: a.serienummer,
    aankoopdatum: null,
    garantie: a.garantie,
    typeGebruik: a.type_gebruik,
    klacht: a.klacht,
    memo: a.memo,
    klant: { externNummer: null, naam: null, straat: null, postcode: null, plaats: null, land: null, email: null, telefoon: null },
    ontvangenOp: a.ontvangen_op ? new Date(a.ontvangen_op) : null,
  }));
}

/** Zoekt onderdelen op code (begint met) of op woorden in de omschrijving. Maximaal 50 resultaten. */
export async function zoekOnderdelen(zoekterm: string): Promise<OnderdeelRij[]> {
  const term = zoekterm.trim();
  if (!term) return [];

  if (!supabaseGeconfigureerd()) {
    const laag = term.toLowerCase();
    const zonderPunt = laag.replace(/^\./, "");
    const woorden = laag.split(/\s+/);
    const alle = await leesJson<OnderdeelRij>("onderdelen.json");
    const opCode = alle.filter((o) => o.code.toLowerCase().replace(/^\./, "").startsWith(zonderPunt));
    const opTekst = alle.filter(
      (o) => !opCode.includes(o) && woorden.every((w) => (o.omschrijving ?? "").toLowerCase().includes(w)),
    );
    return [...opCode, ...opTekst].slice(0, 50);
  }

  const { client, bedrijf } = await db();
  const veilig = term.replace(/[%,()]/g, " "); // tekens die de zoekopdracht zouden breken
  const code = veilig.startsWith(".") ? veilig : `.${veilig}`;
  const { data, error } = await client
    .from("onderdeel")
    .select("code, omschrijving, prijs, merk, niet_meer_leverbaar, vervangen_door, voorraad(op_stock, gereserveerd, gereserveerd_voor)")
    .eq("bedrijf_id", bedrijf)
    .or(`code.ilike.${code}%,code.ilike.${veilig}%,omschrijving.ilike.%${veilig}%`)
    .order("code")
    .limit(50);
  if (error) throw error;
  return data.map((o) => {
    const v = (o.voorraad as { op_stock: number; gereserveerd: number; gereserveerd_voor: string[] }[])[0];
    return {
      code: o.code,
      omschrijving: o.omschrijving,
      prijs: o.prijs === null ? null : Number(o.prijs),
      merk: o.merk,
      nietMeerLeverbaar: o.niet_meer_leverbaar,
      vervangenDoor: o.vervangen_door,
      opStock: v?.op_stock ?? 0,
      gereserveerd: v?.gereserveerd ?? 0,
      gereserveerdVoor: v?.gereserveerd_voor ?? [],
    };
  });
}
