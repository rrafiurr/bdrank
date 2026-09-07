/**
 * Hosts the server accepts a video link from, mirrored here only to give the
 * submitter immediate feedback. This is NOT a security check — the server
 * re-parses every link against its own allowlist and is the sole authority on
 * what becomes an embed.
 */
const SUPPORTED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "vimeo.com",
  "www.vimeo.com",
  "player.vimeo.com",
  "dailymotion.com",
  "www.dailymotion.com",
  "dai.ly",
  "tiktok.com",
  "www.tiktok.com",
  "instagram.com",
  "www.instagram.com",
  "facebook.com",
  "www.facebook.com",
  "web.facebook.com",
  "m.facebook.com",
  "fb.watch",
];

/** True when a link is on a supported platform and worth submitting. */
export function looksLikeSupportedVideo(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "https:" && SUPPORTED_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}
