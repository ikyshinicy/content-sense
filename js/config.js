// Content Sense — config.js
// SUPABASE_FUNCTION_URL: URL Edge Function `analyze-text` (sudah diisi
// sesuai project Supabase kamu).
// SUPABASE_ANON_KEY: "anon public" key project kamu — aman ditaruh di
// frontend (BUKAN service_role key). Cara ambil: Supabase Dashboard >
// Project Settings > API Keys > salin yang berlabel "anon public".

window.ContentSenseConfig = {
  SUPABASE_FUNCTION_URL: "https://wzokcxnnalvrrvgclwfb.supabase.co/functions/v1/analyze-text",
  SUPABASE_URL_FUNCTION_URL: "https://wzokcxnnalvrrvgclwfb.supabase.co/functions/v1/analyze-url",
  SUPABASE_PHOTO_FUNCTION_URL: "https://wzokcxnnalvrrvgclwfb.supabase.co/functions/v1/analyze-photo",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6b2tjeG5uYWx2cnJ2Z2Nsd2ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjg4MzgsImV4cCI6MjA5Mjk0NDgzOH0.Az0j3K-SRxzXLaCAeggI6O-KKGxYfCRRW08WzPqAwTo",
};
