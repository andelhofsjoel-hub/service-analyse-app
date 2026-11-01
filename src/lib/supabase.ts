// Verbinding met Supabase (database + bestandsopslag).
//
// LET OP: zolang er nog geen login is, leest de server met de geheime sleutel (SUPABASE_SECRET_KEY)
// en filtert hij zelf op het bedrijf (BEDRIJF_NAAM). Dat is enkel veilig op je eigen pc.
// Voor de app online gaat, komt er een login en gebruikt de server de sleutel van de ingelogde gebruiker.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function supabaseGeconfigureerd(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

let client: SupabaseClient | null = null;

export function supabaseServer(): SupabaseClient {
  if (!supabaseGeconfigureerd()) throw new Error("Supabase is niet ingesteld: vul .env.local in (zie .env.example)");
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
  return client;
}

/** Geeft het id van het bedrijf (maakt het aan als het nog niet bestaat). */
export async function bedrijfId(db: SupabaseClient): Promise<string> {
  const naam = process.env.BEDRIJF_NAAM ?? "Meditechniek";
  const { data, error } = await db.from("bedrijf").select("id").eq("naam", naam).maybeSingle();
  if (error) throw error;
  if (data) return data.id;
  const nieuw = await db.from("bedrijf").insert({ naam }).select("id").single();
  if (nieuw.error) throw nieuw.error;
  return nieuw.data.id;
}
