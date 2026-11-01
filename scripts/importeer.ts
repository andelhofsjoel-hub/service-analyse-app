// Leest bestaande bestanden in en zet ze om naar de gegevens die de app gebruikt.
//
// Gebruik (in een terminal, in de map van het project):
//   npm run importeer -- voorraad   "D:\Dropbox\...\TUNTURI-FLUID - 2026.xlsx"
//   npm run importeer -- aanvragen  "D:\Dropbox\...\Servicemonteur aanvraag 27_10_2026 16-53-07.xlsx"
//   npm run importeer -- documenten "D:\Dropbox\...\Technische map TUNTURI"
//
// Staat Supabase ingesteld in .env.local, dan gaat alles naar de database.
// Anders schrijft het script naar de map data/ (JSON-bestanden), handig om lokaal te testen.
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { leesDocument } from "../src/lib/documenten";
import { leesAanvragen, leesVoorraad } from "../src/lib/excel";
import { bedrijfId, supabaseGeconfigureerd, supabaseServer } from "../src/lib/supabase";
import { importeerAanvragen, importeerDocumenten, importeerOnderdelen } from "../src/lib/supabase-import";

const DATA = path.join(process.cwd(), "data");

async function bewaar(naam: string, gegevens: unknown) {
  await mkdir(DATA, { recursive: true });
  const bestand = path.join(DATA, naam);
  await writeFile(bestand, JSON.stringify(gegevens, null, 2), "utf8");
  console.log(`Opgeslagen: ${bestand}`);
}

async function lijstBestanden(map: string, basis = map): Promise<string[]> {
  const resultaat: string[] = [];
  for (const naam of await readdir(map)) {
    const vol = path.join(map, naam);
    if ((await stat(vol)).isDirectory()) resultaat.push(...(await lijstBestanden(vol, basis)));
    else if (/\.(pdf|docx?|xlsx?|jpe?g|png|mp4|mov)$/i.test(naam) && !naam.startsWith("~$")) {
      resultaat.push(path.relative(basis, vol).split(path.sep).join("/"));
    }
  }
  return resultaat;
}

async function main() {
  const [soort, bron] = process.argv.slice(2);
  if (!soort || !bron) {
    console.log("Gebruik: npm run importeer -- <voorraad|aanvragen|documenten> <bestand of map>");
    process.exit(1);
  }

  const db = supabaseGeconfigureerd() ? supabaseServer() : null;
  const bedrijf = db ? await bedrijfId(db) : null;
  console.log(db ? "Doel: Supabase" : "Doel: map data/ (Supabase niet ingesteld)");

  if (soort === "voorraad") {
    const onderdelen = await leesVoorraad(bron);
    if (db && bedrijf) {
      const n = await importeerOnderdelen(db, bedrijf, onderdelen);
      console.log(`${n} onderdelen bijgewerkt in Supabase`);
      return;
    }
    await bewaar("onderdelen.json", onderdelen);
    console.log(`${onderdelen.length} onderdelen, waarvan ${onderdelen.filter((o) => o.opStock > 0).length} op stock`);
  } else if (soort === "aanvragen") {
    const nieuw = await leesAanvragen(bron);
    if (db && bedrijf) {
      const opdrachtgever = process.argv[4] ?? "Tunturi";
      const n = await importeerAanvragen(db, bedrijf, opdrachtgever, nieuw);
      console.log(`${n} nieuwe aanvragen, ${nieuw.length - n} waren al gekend`);
      return;
    }
    // Bestaande aanvragen behouden en dubbels overslaan op aanvraagnummer.
    const bestand = path.join(DATA, "aanvragen.json");
    const bestaand: { aanvraagnummer: string }[] = await readFile(bestand, "utf8")
      .then((s) => JSON.parse(s))
      .catch(() => []);
    const gekend = new Set(bestaand.map((a) => a.aanvraagnummer));
    const toegevoegd = nieuw.filter((a) => !gekend.has(a.aanvraagnummer));
    await bewaar("aanvragen.json", [...bestaand, ...toegevoegd]);
    console.log(`${toegevoegd.length} nieuwe aanvragen, ${nieuw.length - toegevoegd.length} waren al gekend`);
  } else if (soort === "documenten") {
    // Een map met submappen (spare-parts, service manual, manuals) of een tekstbestand met één pad per regel.
    const isMap = (await stat(bron)).isDirectory();
    const paden = isMap
      ? await lijstBestanden(bron)
      : (await readFile(bron, "utf8")).split(/\r?\n/).filter(Boolean);
    const documenten = paden.map(leesDocument);
    if (db && bedrijf) {
      console.log(`${await importeerDocumenten(db, bedrijf, documenten)} documenten bijgewerkt in Supabase`);
    } else {
      await bewaar("documenten.json", documenten);
    }
    const zonderCode = documenten.filter((d) => !d.artikelcode && d.soort !== "andere");
    console.log(`${documenten.length} documenten, ${zonderCode.length} zonder herkende artikelcode:`);
    zonderCode.forEach((d) => console.log("  - " + d.pad));
  } else {
    console.log(`Onbekende soort: ${soort}`);
    process.exit(1);
  }
}

main().catch((fout) => {
  console.error(fout);
  process.exit(1);
});
