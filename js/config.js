// Content Sense — config.js
// SUPABASE_FUNCTION_URL: URL Edge Function `analyze-text` (sudah diisi
// sesuai project Supabase kamu).
// SUPABASE_ANON_KEY: "anon public" key project kamu — aman ditaruh di
// frontend (BUKAN service_role key). Cara ambil: Supabase Dashboard >
// Project Settings > API Keys > salin yang berlabel "anon public".

window.ContentSenseConfig = {
  SUPABASE_FUNCTION_URL: "https://wzokcxnnalvrrvgclwfb.supabase.co/functions/v1/analyze-text",
  SUPABASE_ANON_KEY: "PASTE_ANON_PUBLIC_KEY_DI_SINI",
};
