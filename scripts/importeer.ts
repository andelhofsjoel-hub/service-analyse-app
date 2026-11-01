// Leest bestaande bestanden in en zet ze om naar de gegevens die de app gebruikt.
//
// Gebruik (in een terminal, in de map van het project):
//   npm run importeer -- voorraad   "D:\Dropbox\...\TUNTURI-FLUID - 2026.xlsx"
//   npm run importeer -- aanvragen  "D:\Dropbox\...\Servicemonteur aanvraag 27_10_2026 16-53-07.xlsx"
//   npm run importeer -- documenten "D:\Dropbox\...\Technische map TUNTURI"
//
// Voorlopig schrijft dit naar de map data/ (JSON-bestanden). Zodra Supabase gekoppeld is,
// schrijft hetzelfde script naar de database.
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { leesDocument } from "../src/lib/documenten";
import { leesAanvragen, leesVoorraad } from "../src/lib/excel";

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

  if (soort === "voorraad") {
    const onderdelen = await leesVoorraad(bron);
    await bewaar("onderdelen.json", onderdelen);
    console.log(`${onderdelen.length} onderdelen, waarvan ${onderdelen.filter((o) => o.opStock > 0).length} op stock`);
  } else if (soort === "aanvragen") {
    const nieuw = await leesAanvragen(bron);
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
    await bewaar("documenten.json", documenten);
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
