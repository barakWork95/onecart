import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION } from "@/config/site";

/** The size WhatsApp, Facebook, X and LinkedIn all render as a large card. */
export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

export const SHARE_CARD_ALT = `OneCart: find the best price. ${SITE_DESCRIPTION}`;

// Satori has no CSS variables: these mirror the brand tokens in globals.css and the theme color.
const NAVY = "#0f2a5f";
const BLUE = "#1a5fe0";
const MUTED = "#4b5875";

/** app/icon.svg, inlined: no file read at render time, so the card prerenders at build. */
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="oc-blue" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b8cff"/>
      <stop offset="1" stop-color="#1747d6"/>
    </linearGradient>
  </defs>
  <g fill="none" stroke="url(#oc-blue)" stroke-linecap="round" stroke-linejoin="round">
    <!-- the "1": flag, stem, and the cart's floor -->
    <path d="M58 132 L138 74 L138 352 L404 352" stroke-width="56"/>
    <!-- basket: top rail and slanted front -->
    <path d="M196 150 L452 150 L398 318 L200 318" stroke-width="34"/>
    <!-- wire grid -->
    <path d="M206 206 L420 206 M206 262 L402 262" stroke-width="26"/>
    <path d="M268 160 L240 310 M352 160 L324 310" stroke-width="24"/>
  </g>
  <g fill="#0f2a5f">
    <circle cx="180" cy="420" r="31"/>
    <circle cx="352" cy="420" r="31"/>
  </g>
</svg>`;
const LOGO_SRC = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

const PARTS = ["Item", "Shipping", "Import VAT", "Customs"] as const;

/**
 * The share preview for every page (opengraph-image / twitter-image). Rendered
 * once at build time: no request data, so it's static. Keep LOGO_SVG in step
 * with app/icon.svg (a test checks).
 */
export function renderShareCard(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: "linear-gradient(180deg, #e8f0ff 0%, #ffffff 70%)",
        color: NAVY,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img> only. */}
        <img src={LOGO_SRC} width={88} height={88} alt="" />
        <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1 }}>OneCart</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>
          Find the best price.
        </div>
        <div style={{ fontSize: 32, color: MUTED, lineHeight: 1.3 }}>
          Amazon, eBay and AliExpress compared by the price you&apos;ll actually pay in Israel.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 600 }}>
        {PARTS.map((part, i) => (
          <div key={part} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {i > 0 && <div style={{ color: MUTED }}>+</div>}
            <div
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: 999,
                background: "#ffffff",
                border: "2px solid #d5e1fb",
              }}
            >
              {part}
            </div>
          </div>
        ))}
        <div style={{ color: MUTED }}>=</div>
        <div
          style={{
            display: "flex",
            padding: "10px 22px",
            borderRadius: 999,
            background: BLUE,
            color: "#ffffff",
          }}
        >
          Landed price
        </div>
      </div>
    </div>,
    SHARE_CARD_SIZE,
  );
}
