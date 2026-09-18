import { ImageResponse } from "next/og";

/**
 * The share card.
 *
 * The metadata already declared `summary_large_image` and an Open Graph block,
 * but no image existed — so every link to the site rendered as a blank card,
 * which is the one SEO defect a crawler cannot work around. Generated rather
 * than committed as a PNG so the wording tracks the page instead of going stale
 * in a binary nobody opens.
 */
export const alt = "NutritiScan — health questions, answered with the sources shown";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(145deg, #05080a 35%, #0d2a20 100%)",
          color: "#e9f2ec",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "linear-gradient(140deg, #c9fa63, #6fe8b4)",
              color: "#07130c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 46,
              fontWeight: 700,
            }}
          >
            +
          </div>
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1 }}>nutritiscan</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, lineHeight: 1.1, letterSpacing: -2.5, fontWeight: 600 }}>
            Health questions,
          </div>
          <div style={{ fontSize: 68, lineHeight: 1.1, letterSpacing: -2.5, color: "#9be9c4" }}>
            answered with the sources shown.
          </div>
        </div>

        <div style={{ display: "flex", gap: 36, fontSize: 24, color: "#93a79a" }}>
          <div style={{ display: "flex" }}>Sources on every answer</div>
          <div style={{ display: "flex" }}>Your records stay yours</div>
          <div style={{ display: "flex" }}>Not a doctor</div>
        </div>
      </div>
    ),
    size,
  );
}
