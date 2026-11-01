import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site-config";

export const runtime = "nodejs";
export const alt = siteConfig.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function HomeOG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background:
            "radial-gradient(60% 50% at 30% 20%, rgba(99,102,241,0.18), transparent 70%), #09090b",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#a1a1aa",
            fontSize: 22,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "#a1a1aa",
            }}
          />
          {siteConfig.name}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 78,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              maxWidth: 1000,
              display: "flex",
            }}
          >
            Build your agents. Prepare your cloud kit.
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#a1a1aa",
              maxWidth: 900,
              display: "flex",
            }}
          >
            {siteConfig.tagline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            color: "#71717a",
            fontSize: 22,
          }}
        >
          <span>Discover</span>
          <span>·</span>
          <span>Design</span>
          <span>·</span>
          <span>Build</span>
          <span>·</span>
          <span>Test</span>
          <span>·</span>
          <span>Deploy</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
