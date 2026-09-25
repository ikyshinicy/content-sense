// Content Sense — _shared/cors.ts
// Helper CORS + response JSON dipakai bersama oleh analyze-url dan
// analyze-photo. Pola & header persis sama dengan yang sudah dipakai di
// analyze-text/index.ts supaya perilaku CORS konsisten di semua function.

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
  });
}
