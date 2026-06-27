import { useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { BASE_URL } from "@/lib/api";

// Minimal standalone page rendered inside an iframe on the owner's site.
// No Header/Footer — just the badge widget + powered-by seal.
const SITE_URL = BASE_URL.replace(/\/api\/v1$/, "");

export default function EmbedPage() {
  const { token } = useParams<{ token: string }>();
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current || !token) return;
    mounted.current = true;

    const script = document.createElement("script");
    script.src = `${SITE_URL}/widget.js`;
    script.setAttribute("data-bdranks-token", token);
    document.body.appendChild(script);
  }, [token]);

  return (
    <div style={{ padding: "8px", fontFamily: "sans-serif" }}>
      <div id="bdranks-embed-root" />
      <div style={{ textAlign: "right", marginTop: "6px" }}>
        <Link
          to="/"
          style={{ fontSize: "10px", color: "#94a3b8", textDecoration: "none" }}
        >
          Powered by BdRanks
        </Link>
      </div>
    </div>
  );
}
