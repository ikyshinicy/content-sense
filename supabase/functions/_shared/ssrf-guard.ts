// Content Sense — _shared/ssrf-guard.ts
// Validasi dasar supaya endpoint analyze-url tidak bisa disalahgunakan
// buat fetch ke alamat internal (SSRF). Cakupannya: skema harus http/https,
// tolak hostname literal yang mengarah ke IP privat/loopback/link-local.
//
// CATATAN JUJUR: ini BUKAN proteksi SSRF lengkap. Domain publik yang
// di-resolve DNS-nya ke IP privat (DNS rebinding) tidak kecekal di sini,
// karena Deno edge runtime tidak expose resolusi DNS manual sebelum fetch
// tanpa dependency tambahan. Untuk kebutuhan MVP (endpoint publik yang
// nerima link berita), ini baseline yang wajar; kalau nanti butuh proteksi
// lebih ketat, tambahkan resolusi DNS eksplisit + cek ulang IP sebelum
// fetch.

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0"]);
const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".internal"];

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = nums;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true;
  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::1") return true; // loopback
  if (h.startsWith("fe80:")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
  return false;
}

export type UrlCheck = { safe: true; url: URL } | { safe: false; reason: string };

export function checkUrlSafety(rawUrl: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { safe: false, reason: "URL tidak valid." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { safe: false, reason: "URL harus dimulai dengan http:// atau https://." };
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: "URL ini tidak diizinkan untuk diakses." };
  }
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { safe: false, reason: "URL ini tidak diizinkan untuk diakses." };
  }
  if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    return { safe: false, reason: "URL ini tidak diizinkan untuk diakses." };
  }

  return { safe: true, url };
}
