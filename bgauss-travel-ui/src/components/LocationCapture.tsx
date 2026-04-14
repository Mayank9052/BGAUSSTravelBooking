// src/components/LocationCapture.tsx
// Reusable component: captures the user's GPS coordinates + reverse-geocodes to address.
// Returns a CapturedLocation object via onCapture callback.

import { useState } from "react";

export interface CapturedLocation {
  latitude:    number;
  longitude:   number;
  address:     string;
  capturedAt:  string;   // ISO timestamp
}

interface LocationCaptureProps {
  captured:   CapturedLocation | null;
  onCapture:  (loc: CapturedLocation) => void;
  onClear?:   () => void;
}

export function LocationCapture({ captured, onCapture, onClear }: LocationCaptureProps) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const capture = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          if (res.ok) {
            const data = await res.json() as { display_name?: string };
            if (data.display_name) address = data.display_name;
          }
        } catch { /* use coordinate string if reverse geocode fails */ }

        onCapture({ latitude, longitude, address, capturedAt: new Date().toISOString() });
        setLoading(false);
      },
      (err) => {
        setError(
          err.code === 1 ? "Location access denied. Please allow location in browser settings." :
          err.code === 2 ? "Location unavailable. Try again." :
          "Location request timed out."
        );
        setLoading(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const btnBase: React.CSSProperties = {
    padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 12,
    border: "1.5px solid", cursor: "pointer", display: "inline-flex",
    alignItems: "center", gap: 6, fontFamily: "inherit", transition: "all 0.15s",
  };

  if (captured) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ padding: "9px 12px", borderRadius: 8, background: "#f0fdf4", border: "1.5px solid #86efac", fontSize: 12, color: "#15803d" }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>📍 Location captured</div>
          <div style={{ color: "#166534", lineHeight: 1.5 }}>{captured.address}</div>
          <div style={{ color: "#86efac", marginTop: 3, fontSize: 10 }}>
            {captured.latitude.toFixed(5)}, {captured.longitude.toFixed(5)}
            {" · "}
            {new Date(captured.capturedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={capture} disabled={loading}
            style={{ ...btnBase, background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>
            {loading ? <><Spinner />Updating…</> : "↺ Re-capture"}
          </button>
          {onClear && (
            <button type="button" onClick={onClear}
              style={{ ...btnBase, background: "#fef2f2", borderColor: "#fecaca", color: "#dc2626" }}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button type="button" onClick={capture} disabled={loading}
        style={{ ...btnBase, background: loading ? "#f1f5f9" : "#fff", borderColor: "#cbd5e1", color: "#475569", width: "fit-content" }}>
        {loading ? <><Spinner />Detecting location…</> : <>📍 Capture My Location</>}
      </button>
      {error && <span style={{ fontSize: 11, color: "#dc2626" }}>{error}</span>}
      <span style={{ fontSize: 11, color: "#94a3b8" }}>Optional — helps HR track your origin point.</span>
    </div>
  );
}

function Spinner() {
  return (
    <span style={{ width: 12, height: 12, border: "2px solid #cbd5e1", borderTopColor: "#64748b", borderRadius: "50%", animation: "lcSpin 0.7s linear infinite", display: "inline-block" }}>
      <style>{`@keyframes lcSpin{to{transform:rotate(360deg)}}`}</style>
    </span>
  );
}
