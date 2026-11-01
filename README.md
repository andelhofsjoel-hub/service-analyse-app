# Service-analyse app

Webapp om service-aanvragen te analyseren: de juiste technische documenten tonen, onderdelen opzoeken,
voorraad reserveren en een bestellijst maken. Gebouwd voor Meditechniek (Tunturi), met het oog op
verkoop aan andere servicebedrijven: elk bedrijf heeft zijn eigen, afgeschermde gegevens.

## Wat er nu al werkt (stap 2, eerste deel)

- **Toestel opzoeken:** artikelcode + serienummer geeft de passende exploded view, service manual en handleiding.
  De juiste versie wordt gekozen op het serienummerbereik in de bestandsnaam.
- **Onderdeel opzoeken:** op code of omschrijving, met prijs, voorraad, reserveringen en vervangend nummer.
- **Inlezen:** voorraadlijst (blad `stock-prices`), aanvraaglijsten van Tunturi, en de technische map.

Nog niet: inloggen, de database (Supabase), bestanden openen, analyse op basis van historiek, planning.

## Hoe het project in elkaar zit

| Map / bestand | Wat het doet |
| --- | --- |
| `src/app/page.tsx` | De startpagina met de twee zoekformulieren |
| `src/app/layout.tsx` | De rand rond elke pagina (kop, breedte) |
| `src/lib/documenten.ts` | Leest artikelcode en serienummerbereik uit bestandsnamen en kiest de juiste versie |
| `src/lib/excel.ts` | Leest de Excel-bestanden (voorraad en aanvragen) |
| `src/lib/data.ts` | Haalt de gegevens op; nu uit `data/`, later uit Supabase |
| `scripts/importeer.ts` | Opdracht om bestanden in te lezen |
| `supabase/migrations/0001_init.sql` | Het databaseschema (alle tabellen) voor later |
| `data/` | Ingelezen gegevens. **Staat niet in GitHub** (klantgegevens en prijzen) |
| `voorbeelddata/` | Een korte lijst bestandsnamen om mee te testen |

## Zelf starten op je pc

Eenmalig: installeer [Node.js](https://nodejs.org) (versie 22 of hoger). Daarna, in deze map:

```bash
npm install
npm run importeer -- voorraad   "D:\Dropbox\Meditechniek\TR aangemaakt\TUNTURI\TUNTURI-FLUID - 2026.xlsx"
npm run importeer -- documenten "D:\Dropbox\Meditechniek\TR aangemaakt\TUNTURI\Technische map TUNTURI"
npm run importeer -- aanvragen  "D:\Dropbox\Meditechniek\TR aangemaakt\TUNTURI\Service aanvraag lijsten\Servicemonteur aanvraag 27_10_2026 16-53-07.xlsx"
npm run dev
```

Open dan http://localhost:3000.

## Testen

```bash
npm test        # automatische tests
npm run lint    # controle op fouten in de code
npm run build   # controle of de app volledig bouwt
```
