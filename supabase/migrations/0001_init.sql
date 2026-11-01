-- Eerste databaseschema voor de service-analyse app.
-- Elke tabel heeft bedrijf_id: zo heeft elk bedrijf dat de app gebruikt zijn eigen, afgeschermde data.

create extension if not exists pg_trgm; -- snel zoeken in tekst (klachten, omschrijvingen)

-- ---------- Bedrijven en gebruikers ----------
create table bedrijf (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  aangemaakt_op timestamptz not null default now()
);

create table gebruiker (
  id uuid primary key references auth.users (id) on delete cascade,
  bedrijf_id uuid not null references bedrijf (id),
  naam text not null,
  rol text not null check (rol in ('beheerder', 'planner', 'technieker')),
  aangemaakt_op timestamptz not null default now()
);

-- Hulpfunctie: het bedrijf van de ingelogde gebruiker (gebruikt in de beveiligingsregels onderaan).
create function mijn_bedrijf_id() returns uuid
language sql stable security definer set search_path = public as $$
  select bedrijf_id from gebruiker where id = auth.uid()
$$;

-- ---------- Bronnen ----------
create table bronkoppeling (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  type text not null check (type in ('excel', 'upload', 'monday', 'andere')),
  naam text not null,
  instellingen jsonb not null default '{}',
  laatste_sync timestamptz
);

create table opdrachtgever (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  naam text not null, -- bv. Tunturi, LevareCura
  unique (bedrijf_id, naam)
);

-- ---------- Toestellen en documenten ----------
create table toesteltype (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  artikelcode text not null, -- bv. 23TBE50000
  naam text,
  merk text,
  categorie text, -- loopband, fiets, crosstrainer, roeier, ...
  unique (bedrijf_id, artikelcode)
);

create table document (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  soort text not null check (soort in ('exploded_view', 'service_manual', 'handleiding', 'foto', 'video', 'andere')),
  bestandsnaam text not null,
  opslag_pad text not null, -- pad in Supabase Storage
  artikelcode text, -- uit de bestandsnaam gehaald
  serienummer_van text,
  serienummer_tot text, -- null = open einde (XXX)
  versie text,
  bron_id uuid references bronkoppeling (id),
  aangemaakt_op timestamptz not null default now(),
  unique (bedrijf_id, opslag_pad)
);
create index on document (bedrijf_id, artikelcode);

-- ---------- Onderdelen en voorraad ----------
create table onderdeel (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  code text not null, -- bv. .813.4095
  omschrijving text,
  prijs numeric(10, 2),
  merk text,
  niet_meer_leverbaar boolean not null default false,
  vervangen_door text, -- nieuwe onderdeelcode
  unique (bedrijf_id, code)
);
create index on onderdeel using gin (omschrijving gin_trgm_ops);

-- In welke exploded view staat een onderdeel (voor opzoeken via artikelnummer of foto)
create table onderdeel_in_document (
  bedrijf_id uuid not null references bedrijf (id),
  onderdeel_code text not null,
  document_id uuid not null references document (id) on delete cascade,
  pagina int,
  positie text,
  primary key (document_id, onderdeel_code, positie)
);
create index on onderdeel_in_document (bedrijf_id, onderdeel_code);

create table voorraad (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  onderdeel_id uuid not null references onderdeel (id),
  locatie text not null default 'magazijn',
  op_stock int not null default 0 check (op_stock >= 0),
  gereserveerd int not null default 0 check (gereserveerd >= 0),
  minimum int not null default 0,
  unique (onderdeel_id, locatie)
);

-- ---------- Klanten, toestellen, aanvragen ----------
create table klant (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  extern_nummer text, -- accountnummer bij de opdrachtgever
  naam text not null,
  straat text, postcode text, plaats text, land text,
  email text, telefoon text
);

create table toestel (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  toesteltype_id uuid references toesteltype (id),
  serienummer text,
  aankoopdatum date,
  klant_id uuid references klant (id)
);

create table aanvraag (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  opdrachtgever_id uuid references opdrachtgever (id),
  aanvraagnummer text not null, -- uniek per opdrachtgever, voorkomt dubbels bij inlezen
  status_opdrachtgever text, -- bv. Voorbehandeld
  toestel_id uuid references toestel (id),
  artikelcode text,
  serienummer text,
  klacht text,
  memo text,
  garantie boolean,
  type_gebruik text,
  ontvangen_op timestamptz,
  bron_id uuid references bronkoppeling (id),
  unique (bedrijf_id, opdrachtgever_id, aanvraagnummer)
);
create index on aanvraag using gin (klacht gin_trgm_ops);

-- ---------- Serviceopdrachten ----------
create table serviceopdracht (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  aanvraag_id uuid not null references aanvraag (id),
  bezoeknummer int not null default 1,
  status text not null default 'nieuw'
    check (status in ('nieuw', 'onderdelen_besteld', 'contact_opnemen', 'ingepland', 'uitgevoerd', 'herhaalbezoek', 'afgesloten', 'on_hold')),
  technieker_id uuid references gebruiker (id),
  afspraak_op timestamptz,
  oplossing text, -- wat de technieker deed
  interne_opmerking text,
  aangemaakt_op timestamptz not null default now()
);

-- Onderdelen per opdracht: reserveren -> verbruiken -> rest terug in stock
create table gebruikt_onderdeel (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  serviceopdracht_id uuid not null references serviceopdracht (id) on delete cascade,
  onderdeel_id uuid not null references onderdeel (id),
  aantal_gereserveerd int not null default 0,
  aantal_verbruikt int not null default 0,
  aantal_teruggeboekt int not null default 0,
  status text not null default 'gereserveerd' check (status in ('gereserveerd', 'verbruikt', 'terug_in_stock')),
  gereserveerd_op timestamptz not null default now()
);

create table bestellijn (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  onderdeel_id uuid not null references onderdeel (id),
  aantal int not null check (aantal > 0),
  serviceopdracht_id uuid references serviceopdracht (id),
  status text not null default 'te_bestellen' check (status in ('te_bestellen', 'besteld', 'geleverd', 'niet_leverbaar')),
  besteld_op date,
  geleverd_op date
);

-- ---------- Analyse ----------
create table analyse (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijf (id),
  aanvraag_id uuid not null references aanvraag (id) on delete cascade,
  voorgestelde_documenten uuid[] not null default '{}',
  voorgestelde_onderdelen jsonb not null default '[]', -- [{code, aantal, reden}]
  vergelijkbare_opdrachten uuid[] not null default '{}',
  aangemaakt_op timestamptz not null default now()
);

-- ---------- Beveiliging: elk bedrijf ziet alleen zijn eigen rijen ----------
do $$
declare t text;
begin
  foreach t in array array['bronkoppeling','opdrachtgever','toesteltype','document','onderdeel',
    'onderdeel_in_document','voorraad','klant','toestel','aanvraag','serviceopdracht',
    'gebruikt_onderdeel','bestellijn','analyse']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy eigen_bedrijf on %I for all using (bedrijf_id = mijn_bedrijf_id()) with check (bedrijf_id = mijn_bedrijf_id())', t);
  end loop;
end $$;

alter table bedrijf enable row level security;
create policy eigen_bedrijf on bedrijf for select using (id = mijn_bedrijf_id());
alter table gebruiker enable row level security;
create policy zelfde_bedrijf on gebruiker for select using (bedrijf_id = mijn_bedrijf_id());
