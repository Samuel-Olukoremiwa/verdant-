import { ImageResponse } from "next/og";
export const alt = "Verdant. Less admin. More living.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#183f32",
        color: "#f5f7f2",
        display: "flex",
        flexDirection: "column",
        padding: 70,
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
        verdant.
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 92,
          fontWeight: 700,
          letterSpacing: -5,
          lineHeight: 1.1,
        }}
      >
        <span>Less admin.</span>
        <span style={{ color: "#d7f56a" }}>More living.</span>
      </div>
      <div style={{ display: "flex", fontSize: 24 }}>
        Residents · Estate payments · Gate access
      </div>
    </div>,
    size,
  );
}
