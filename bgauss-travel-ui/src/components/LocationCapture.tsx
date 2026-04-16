// src/components/LocationCapture.tsx
import { useState, useEffect } from "react";

export interface CapturedLocation {
  latitude:   number;
  longitude:  number;
  address:    string;
  capturedAt: string;
}

interface LocationCaptureProps {
  captured:  CapturedLocation | null;
  onCapture: (loc: CapturedLocation) => void;
  onClear?:  () => void;
}

export function LocationCapture({ captured, onCapture, onClear }: LocationCaptureProps) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // ── Auto-capture on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!captured) {
      capture();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capture = () => {
    if (!navigator.geolocation) {
      setError("Your browser does not support location.");
      return;
    }

    // HTTP + non-localhost = blocked by browser security policy
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setError("Location requires HTTPS. Will work after domain setup.");
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

        // Reverse geocode
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            {
              headers: {
                "Accept-Language": "en",
                "User-Agent": "BGauss-Travel-App/1.0",
              },
            }
          );
          if (res.ok) {
            const data = await res.json() as { display_name?: string };
            if (data.display_name) address = data.display_name;
          }
        } catch {
          // fallback to coordinates string
        }

        onCapture({ latitude, longitude, address, capturedAt: new Date().toISOString() });
        setLoading(false);
      },
      (err) => {
        let message: string;
        switch (err.code) {
          case GeolocationPositionError.PERMISSION_DENIED:
            message = "Location access denied. Click the lock icon in address bar → Allow Location → refresh.";
            break;
          case GeolocationPositionError.POSITION_UNAVAILABLE:
            message = "Location unavailable. Check your internet/GPS.";
            break;
          case GeolocationPositionError.TIMEOUT:
            message = "Location timed out. Please try again.";
            break;
          default:
            message = "Location error. Please capture manually.";
        }
        setError(message);
        setLoading(false);
      },
      { timeout: 15000, maximumAge: 0, enableHighAccuracy: true }
    );
  };

  const btnBase: React.CSSProperties = {
    padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 12,
    border: "1.5px solid", cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
    fontFamily: "inherit", transition: "all 0.15s",
  };

  // ── Loading state (auto-detecting) ────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8,
        padding: "10px 12px", borderRadius: 8,
        background: "#f8fafc", border: "1.5px solid #e2e8f0",
        fontSize: 12, color: "#64748b" }}>
        <Spinner />
        <span>Detecting your location automatically…</span>
      </div>
    );
  }

  // ── Captured state ────────────────────────────────────────────────────────
  if (captured) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{
          padding: "9px 12px", borderRadius: 8,
          background: "#f0fdf4", border: "1.5px solid #86efac",
          fontSize: 12, color: "#15803d",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>📍 Location captured automatically</div>
          <div style={{ color: "#166534", lineHeight: 1.5, wordBreak: "break-word" }}>
            {captured.address}
          </div>
          <div style={{ color: "#4ade80", marginTop: 3, fontSize: 10 }}>
            {captured.latitude.toFixed(5)}, {captured.longitude.toFixed(5)}
            {" · "}
            {new Date(captured.capturedAt).toLocaleTimeString("en-IN", {
              hour: "2-digit", minute: "2-digit",
            })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={capture} disabled={loading}
            style={{ ...btnBase, background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>
            ↺ Re-capture
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

  // ── Not captured / error state ────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {error ? (
        <>
          <div style={{
            fontSize: 11, color: "#dc2626",
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 6, padding: "8px 10px", lineHeight: 1.6, maxWidth: 420,
          }}>
            ⚠ {error}
          </div>
          <button type="button" onClick={capture}
            style={{ ...btnBase, background: "#fff", borderColor: "#cbd5e1",
              color: "#475569", width: "fit-content" }}>
            📍 Try Again
          </button>
        </>
      ) : (
        <button type="button" onClick={capture}
          style={{ ...btnBase, background: "#fff", borderColor: "#cbd5e1",
            color: "#475569", width: "fit-content" }}>
          📍 Capture My Location
        </button>
      )}
      <span style={{ fontSize: 11, color: "#94a3b8" }}>
        Auto-detecting location… Optional — helps HR track your origin point.
        {!window.isSecureContext && window.location.hostname !== "localhost" && (
          <span style={{ color: "#f59e0b" }}> (Requires HTTPS)</span>
        )}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      width: 12, height: 12,
      border: "2px solid #cbd5e1", borderTopColor: "#64748b",
      borderRadius: "50%", animation: "lcSpin 0.7s linear infinite",
      display: "inline-block",
    }}>
      <style>{`@keyframes lcSpin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}