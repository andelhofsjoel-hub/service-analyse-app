// Schrijft ingelezen gegevens naar Supabase. Bestaande rijen worden bijgewerkt (upsert), niet verdubbeld.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentInfo } from "./documenten";
import type { AanvraagRij, OnderdeelRij } from "./excel";

const PAKKET = 500; // aantal rijen per verzending

async function inPakketten<T>(rijen: T[], stuur: (pakket: T[]) => Promise<void>) {
  for (let i = 0; i < rijen.length; i += PAKKET) await stuur(rijen.slice(i, i + PAKKET));
}

function controleer<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function importeerOnderdelen(db: SupabaseClient, bedrijfId: string, onderdelen: OnderdeelRij[]) {
  // Dubbele codes in Excel: de laatste rij wint.
  const uniek = [...new Map(onderdelen.map((o) => [o.code, o])).values()];

  const ids = new Map<string, string>();
  await inPakketten(uniek, async (pakket) => {
    const rijen = controleer(
      await db
        .from("onderdeel")
        .upsert(
          pakket.map((o) => ({
            bedrijf_id: bedrijfId,
            code: o.code,
            omschrijving: o.omschrijving,
            prijs: o.prijs,
            merk: o.merk,
            niet_meer_leverbaar: o.nietMeerLeverbaar,
            vervangen_door: o.vervangenDoor,
          })),
          { onConflict: "bedrijf_id,code" },
        )
        .select("id, code"),
    ) as { id: string; code: string }[];
    rijen.forEach((r) => ids.set(r.code, r.id));
  });

  await inPakketten(uniek, async (pakket) => {
    controleer(
      await db.from("voorraad").upsert(
        pakket.map((o) => ({
          bedrijf_id: bedrijfId,
          onderdeel_id: ids.get(o.code)!,
          locatie: "magazijn",
          op_stock: o.opStock,
          gereserveerd: o.gereserveerd,
          gereserveerd_voor: o.gereserveerdVoor,
        })),
        { onConflict: "onderdeel_id,locatie" },
      ),
    );
  });
  return uniek.length;
}

export async function importeerDocumenten(db: SupabaseClient, bedrijfId: string, documenten: DocumentInfo[]) {
  const teBewaren = documenten.filter((d) => !d.isDubbel);
  await inPakketten(teBewaren, async (pakket) => {
    controleer(
      await db.from("document").upsert(
        pakket.map((d) => ({
          bedrijf_id: bedrijfId,
          soort: d.soort,
          bestandsnaam: d.bestandsnaam,
          opslag_pad: d.pad, // de bestanden zelf uploaden we in een volgende stap naar Supabase Storage
          artikelcode: d.artikelcode,
          serienummer_van: d.serienummerVan,
          serienummer_tot: d.serienummerTot,
          versie: d.versie,
        })),
        { onConflict: "bedrijf_id,opslag_pad" },
      ),
    );
  });
  return teBewaren.length;
}

/** Leest aanvragen in voor één opdrachtgever (bv. "Tunturi"). Geeft het aantal nieuwe aanvragen terug. */
export async function importeerAanvragen(
  db: SupabaseClient,
  bedrijfId: string,
  opdrachtgever: string,
  aanvragen: AanvraagRij[],
) {
  const og = controleer(
    await db
      .from("opdrachtgever")
      .upsert({ bedrijf_id: bedrijfId, naam: opdrachtgever }, { onConflict: "bedrijf_id,naam" })
      .select("id")
      .single(),
  ) as { id: string };

  const bestaand = controleer(
    await db
      .from("aanvraag")
      .select("aanvraagnummer")
      .eq("bedrijf_id", bedrijfId)
      .eq("opdrachtgever_id", og.id)
      .in("aanvraagnummer", aanvragen.map((a) => a.aanvraagnummer)),
  ) as { aanvraagnummer: string }[];
  const gekend = new Set(bestaand.map((a) => a.aanvraagnummer));

  let nieuw = 0;
  for (const a of aanvragen) {
    if (gekend.has(a.aanvraagnummer)) continue;

    let klantId: string | null = null;
    if (a.klant.naam) {
      const klant = controleer(
        await db
          .from("klant")
          .upsert(
            {
              bedrijf_id: bedrijfId,
              extern_nummer: a.klant.externNummer,
              naam: a.klant.naam,
              straat: a.klant.straat,
              postcode: a.klant.postcode,
              plaats: a.klant.plaats,
              land: a.klant.land,
              email: a.klant.email,
              telefoon: a.klant.telefoon,
            },
            { onConflict: "bedrijf_id,extern_nummer" },
          )
          .select("id")
          .single(),
      ) as { id: string };
      klantId = klant.id;
    }

    let toestelId: string | null = null;
    if (a.serienummer) {
      const toestel = controleer(
        await db
          .from("toestel")
          .upsert(
            {
              bedrijf_id: bedrijfId,
              serienummer: a.serienummer,
              aankoopdatum: a.aankoopdatum ? new Date(a.aankoopdatum).toISOString().slice(0, 10) : null,
              klant_id: klantId,
            },
            { onConflict: "bedrijf_id,serienummer" },
          )
          .select("id")
          .single(),
      ) as { id: string };
      toestelId = toestel.id;
    }

    controleer(
      await db.from("aanvraag").insert({
        bedrijf_id: bedrijfId,
        opdrachtgever_id: og.id,
        aanvraagnummer: a.aanvraagnummer,
        status_opdrachtgever: a.status,
        toestel_id: toestelId,
        artikelcode: a.artikelcode,
        artikel_omschrijving: a.artikelOmschrijving,
        serienummer: a.serienummer,
        klacht: a.klacht,
        memo: a.memo,
        garantie: a.garantie,
        type_gebruik: a.typeGebruik,
        ontvangen_op: a.ontvangenOp,
      }),
    );
    nieuw++;
  }
  return nieuw;
}
