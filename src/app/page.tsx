// Startpagina: een toestel opzoeken (documenten + eerdere aanvragen) of een onderdeel opzoeken (voorraad).
import { Suspense } from "react";
import { haalAanvragen, haalDocumenten, zoekOnderdelen } from "@/lib/data";
import { zoekDocumenten, type Match } from "@/lib/documenten";

const SOORT_LABEL: Record<string, string> = {
  exploded_view: "Exploded view",
  service_manual: "Service manual",
  handleiding: "Handleiding",
  andere: "Ander document",
};

const MATCH_LABEL: Record<Match, string> = {
  binnen_bereik: "Past bij dit serienummer",
  geen_bereik: "Geldt voor alle serienummers",
  onbekend_serienummer: "Serienummer niet herkend: controleer de versie",
  buiten_bereik: "Ander serienummerbereik",
};

function eerste(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

// De pagina hangt af van de zoekopdracht in de URL; daarom laden we de inhoud binnen <Suspense>.
export default function Opzoeken({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Laden…</p>}>
      <Inhoud searchParams={searchParams} />
    </Suspense>
  );
}

async function Inhoud({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  const artikel = eerste(params.artikel).toUpperCase();
  const serienummer = eerste(params.serienummer).toUpperCase();
  const onderdeel = eerste(params.onderdeel);

  const documenten = artikel ? zoekDocumenten(await haalDocumenten(), artikel, serienummer || null) : [];
  const aanvragen = artikel ? (await haalAanvragen()).filter((a) => a.artikelcode === artikel) : [];
  const onderdelen = onderdeel ? await zoekOnderdelen(onderdeel) : [];

  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Toestel opzoeken</h2>
        <form className="flex flex-wrap gap-2">
          <input name="artikel" defaultValue={artikel} placeholder="Artikelcode, bv. 17TBE60000"
            className="flex-1 rounded border px-3 py-2" required />
          <input name="serienummer" defaultValue={serienummer} placeholder="Serienummer (optioneel)"
            className="flex-1 rounded border px-3 py-2" />
          <button className="rounded bg-slate-900 px-4 py-2 text-white">Zoek</button>
        </form>

        {artikel && (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="font-medium">Documenten ({documenten.length})</h3>
              {documenten.length === 0 ? (
                <p className="text-sm text-slate-500">Geen documenten gevonden voor {artikel}.</p>
              ) : (
                <ul className="mt-2 divide-y text-sm">
                  {documenten.map((d) => (
                    <li key={d.pad} className={`py-2 ${d.match === "buiten_bereik" ? "opacity-50" : ""}`}>
                      <span className="mr-2 rounded bg-slate-100 px-2 py-0.5 text-xs">{SOORT_LABEL[d.soort]}</span>
                      {d.bestandsnaam}
                      <span className="ml-2 text-xs text-slate-500">{MATCH_LABEL[d.match]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="font-medium">Eerdere aanvragen voor dit toesteltype ({aanvragen.length})</h3>
              <ul className="mt-2 divide-y text-sm">
                {aanvragen.map((a) => (
                  <li key={a.aanvraagnummer} className="py-2">
                    <span className="font-mono">{a.aanvraagnummer}</span> · {a.serienummer ?? "geen serienummer"}
                    <p className="whitespace-pre-line text-slate-600">{a.klacht}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Onderdeel opzoeken</h2>
        <form className="flex gap-2">
          <input name="onderdeel" defaultValue={onderdeel} placeholder="Onderdeelcode of omschrijving, bv. .813.4095 of servomotor"
            className="flex-1 rounded border px-3 py-2" required />
          <button className="rounded bg-slate-900 px-4 py-2 text-white">Zoek</button>
        </form>

        {onderdeel && (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr><th className="py-1">Code</th><th>Omschrijving</th><th className="text-right">Prijs</th>
                <th className="text-right">Op stock</th><th className="text-right">Gereserveerd</th><th className="pl-4">Opmerking</th></tr>
            </thead>
            <tbody className="divide-y">
              {onderdelen.map((o) => (
                <tr key={o.code}>
                  <td className="py-1 font-mono">{o.code}</td>
                  <td>{o.omschrijving}</td>
                  <td className="text-right">{o.prijs != null ? `€ ${o.prijs.toFixed(2)}` : ""}</td>
                  <td className={`text-right ${o.opStock > 0 ? "font-semibold text-green-700" : ""}`}>{o.opStock}</td>
                  <td className="text-right">
                    {o.gereserveerd > 0 ? `${o.gereserveerd} (${o.gereserveerdVoor.join(", ")})` : 0}
                  </td>
                  <td className="pl-4 text-xs text-slate-500">
                    {o.nietMeerLeverbaar && "Niet meer leverbaar. "}
                    {o.vervangenDoor && `Vervangen door ${o.vervangenDoor}`}
                  </td>
                </tr>
              ))}
              {onderdelen.length === 0 && (
                <tr><td colSpan={6} className="py-2 text-slate-500">Niets gevonden voor “{onderdeel}”.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
