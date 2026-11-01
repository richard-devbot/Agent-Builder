import { ImageResponse } from "next/og";
import { getAssetBySlug } from "@/lib/content";
import { ASSET_TYPES, type AssetType } from "@/lib/schema";
import { PHASE_META_BY_SLUG } from "@/lib/taxonomy";
import { siteConfig } from "@/lib/site-config";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Asset preview";

const TYPE_LABEL: Record<AssetType, string> = {
  template: "Template",
  skill: "Skill",
  "mcp-config": "MCP config",
  playbook: "Playbook",
};

function isAssetType(v: string): v is AssetType {
  return (ASSET_TYPES as readonly string[]).includes(v);
}

export default async function AssetOG({
  params,
}: {
  params: { type: string; slug: string };
}) {
  if (!isAssetType(params.type)) {
    return fallback("Asset");
  }
  const asset = await getAssetBySlug(params.type, params.slug);
  if (!asset) return fallback("Asset");

  const phase = PHASE_META_BY_SLUG[asset.phase];

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

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <Pill label={TYPE_LABEL[asset.type]} />
            <Pill label={phase.name} muted />
            <Pill label={asset.category.replace(/-/g, " ")} muted />
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              maxWidth: 1056,
              display: "flex",
            }}
          >
            {asset.title}
          </div>
          <div
            style={{
              fontSize: 26,
              color: "#a1a1aa",
              maxWidth: 1056,
              display: "flex",
            }}
          >
            {asset.description}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#71717a",
            fontSize: 22,
          }}
        >
          <span>{(asset.stack ?? []).slice(0, 4).join(" · ") || "—"}</span>
          <span>{asset.difficulty}</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

function Pill({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 16px",
        borderRadius: 999,
        fontSize: 22,
        background: muted ? "transparent" : "#27272a",
        color: muted ? "#a1a1aa" : "#fafafa",
        border: muted ? "1px solid #3f3f46" : "1px solid transparent",
        textTransform: "capitalize",
      }}
    >
      {label}
    </div>
  );
}

function fallback(label: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          color: "#fafafa",
          fontSize: 64,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {label}
      </div>
    ),
    { ...size },
  );
}
