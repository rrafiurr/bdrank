import { useState } from "react";
import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ApiVideo } from "@/lib/api";

interface Props {
  video: ApiVideo;
  /** Extra classes for the outer wrapper — used to cap the size on cards. */
  className?: string;
}

// Human-readable platform names for the overlay label.
const PROVIDER_LABEL: Record<string, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  vimeo: "Vimeo",
  dailymotion: "Dailymotion",
};

// Reels and TikToks are portrait; everything else plays 16:9.
const PORTRAIT = new Set(["tiktok", "instagram"]);

/**
 * Poster image for the facade, where the platform exposes one at a stable URL.
 * The others fall back to a plain placeholder rather than an API round-trip.
 */
function posterURL(video: ApiVideo): string | null {
  switch (video.provider) {
    case "youtube":
      return `https://i.ytimg.com/vi/${video.video_id}/hqdefault.jpg`;
    case "dailymotion":
      return `https://www.dailymotion.com/thumbnail/video/${video.video_id}`;
    default:
      return null;
  }
}

/**
 * A video attached to a review, rendered as a click-to-play facade: the
 * third-party iframe is only created once the viewer asks for it, so a page of
 * review cards does not load a player (and its trackers) per card.
 *
 * Only `video.embed_url` is ever used as a frame source — the server derives it
 * from a host allowlist, so an arbitrary link cannot become an iframe here.
 */
export function VideoEmbed({ video, className = "" }: Props) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  const label = PROVIDER_LABEL[video.provider] ?? video.provider;
  const aspect = PORTRAIT.has(video.provider) ? "aspect-[9/16]" : "aspect-video";
  const width = PORTRAIT.has(video.provider) ? "max-w-[320px]" : "";
  const poster = posterFailed ? null : posterURL(video);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-border/60 bg-muted ${aspect} ${width} ${className}`}>
      {playing ? (
        <iframe
          src={video.embed_url}
          title={t("video.playerTitle", { platform: label })}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          loading="lazy"
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            // Cards wrap their whole body in a link — playing must not navigate.
            e.preventDefault();
            e.stopPropagation();
            setPlaying(true);
          }}
          aria-label={t("video.play", { platform: label })}
          className="group absolute inset-0 flex h-full w-full items-center justify-center"
        >
          {poster ? (
            <img
              src={poster}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setPosterFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted-foreground/20" />
          )}
          <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/40" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-elevated transition-transform group-hover:scale-110">
            <Play className="ml-0.5 h-6 w-6 fill-black text-black" />
          </span>
          <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-0.5 text-xs font-medium text-white">
            {label}
          </span>
        </button>
      )}
    </div>
  );
}
