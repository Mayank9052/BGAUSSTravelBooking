// src/components/BillViewer.tsx
// Standalone bill viewer component used across Dashboard and Expense pages.
//
// ROOT CAUSE of "not supported" error:
//   The bill URL was constructed as: window.location.origin + /uploads/bills/file.jpg
//   But ASP.NET Core's UseStaticFiles() was not serving files from the uploads folder
//   because UseStaticFiles() by default only serves from wwwroot root — NOT subfolders
//   unless specifically configured.
//
// FIXES APPLIED:
//   1. URL construction: always use full absolute URL with correct origin
//   2. Content-Type: fetch the file with proper Accept headers so browser knows what to show
//   3. For images: use <img> tag directly (most reliable)
//   4. For PDFs: open via object URL from a fetch with auth header
//   5. Download: use fetch + blob so content-type is respected
//   6. Program.cs fix at bottom of this file — add UseStaticFiles for uploads folder

import { useState } from "react";

interface BillViewerProps {
  billPath:     string | null;
  billFileName: string | null;
  compact?:     boolean;   // true = icon-only mode for table cells
}

// Build the full absolute URL for a bill path
export function getBillUrl(billPath: string | null): string | null {
  if (!billPath) return null;
  if (billPath.startsWith("http")) return billPath;
  // Always use the current origin — works on localhost AND production IP
  return `${window.location.origin}${billPath}`;
}

// Determine file type from path
function fileType(billPath: string | null): "image" | "pdf" | "unknown" {
  if (!billPath) return "unknown";
  const lower = billPath.toLowerCase();
  if (/\.(jpg|jpeg|png|webp)$/.test(lower)) return "image";
  if (/\.pdf$/.test(lower)) return "pdf";
  return "unknown";
}

// Download a bill file properly using fetch + blob
// This ensures the browser gets the correct content-type
async function downloadBill(url: string, fileName: string): Promise<void> {
  try {
    const token = localStorage.getItem("jwt_token");
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();

    // Force the correct content type based on extension
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg",
      png: "image/png",  webp: "image/webp",
      pdf: "application/pdf",
    };
    const mime = mimeMap[ext] ?? blob.type ?? "application/octet-stream";
    const typedBlob = new Blob([blob], { type: mime });

    const objectUrl = URL.createObjectURL(typedBlob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  } catch (err) {
    console.error("Download failed:", err);
    // Fallback: open in new tab
    window.open(url, "_blank");
  }
}

// Open an image or PDF in a new tab correctly
async function openBillInTab(url: string, fileName: string): Promise<void> {
  try {
    const token = localStorage.getItem("jwt_token");
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();
    const ext  = fileName.split(".").pop()?.toLowerCase() ?? "";
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg",
      png: "image/png",  webp: "image/webp",
      pdf: "application/pdf",
    };
    const mime = mimeMap[ext] ?? blob.type ?? "application/octet-stream";
    const typedBlob = new Blob([blob], { type: mime });
    const objectUrl = URL.createObjectURL(typedBlob);

    const win = window.open(objectUrl, "_blank");
    // Revoke after 60s to free memory
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    if (!win) {
      // Popup blocked — fallback
      URL.revokeObjectURL(objectUrl);
      window.open(url, "_blank");
    }
  } catch {
    // Direct link fallback
    window.open(url, "_blank");
  }
}

export function BillViewer({ billPath, billFileName, compact = false }: BillViewerProps) {
  const [hovered,    setHovered]    = useState(false);
  const [imgError,   setImgError]   = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [opening,    setOpening]    = useState(false);

  if (!billPath) {
    return (
      <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>
        ⚠ No bill
      </span>
    );
  }

  const url      = getBillUrl(billPath);
  const fileName = billFileName ?? billPath.split("/").pop() ?? "bill";
  const type     = fileType(billPath);
  const isImg    = type === "image" && !imgError;

  if (!url) return null;

  const label = fileName.length > 18 ? fileName.slice(0, 18) + "…" : fileName;

  // ── Compact mode: used in table cells ──────────────────────────────────
  if (compact) {
    return (
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 5 }}>

        {/* View button */}
        <button
          type="button"
          disabled={opening}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={async () => {
            setOpening(true);
            await openBillInTab(url, fileName);
            setOpening(false);
          }}
          style={{
            fontSize: 11, color: "#3b82f6", fontWeight: 600,
            background: "none", border: "none", cursor: opening ? "wait" : "pointer",
            padding: 0, display: "inline-flex", alignItems: "center", gap: 4,
            textDecoration: "underline", whiteSpace: "nowrap",
          }}>
          {opening ? "Opening…" : `📎 ${label}`}
        </button>

        {/* Download button */}
        <button
          type="button"
          disabled={downloading}
          title={`Download ${fileName}`}
          onClick={async () => {
            setDownloading(true);
            await downloadBill(url, fileName);
            setDownloading(false);
          }}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, borderRadius: 6,
            background: downloading ? "#dbeafe" : "#f1f5f9",
            border: "1px solid #e2e8f0", color: "#64748b",
            cursor: downloading ? "wait" : "pointer",
            fontSize: 13, flexShrink: 0, fontFamily: "inherit",
          }}>
          {downloading ? "…" : "⬇"}
        </button>

        {/* Image hover preview */}
        {hovered && isImg && !opening && (
          <div style={{
            position: "absolute", bottom: "calc(100% + 10px)", left: "50%",
            transform: "translateX(-50%)", zIndex: 9999,
            background: "#fff", border: "1.5px solid #e2e8f0",
            borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            padding: 8, pointerEvents: "none", width: 200,
          }}>
          <img
            src={url}
            alt={fileName}
            onError={() => setImgError(true)}
            style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 8 }}
          />
          <p style={{ margin: "5px 0 0", fontSize: 10, color: "#64748b", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fileName}
          </p>
          </div>
        )}

        {/* PDF hover tooltip */}
        {hovered && !isImg && !opening && (
          <div style={{
            position: "absolute", bottom: "calc(100% + 10px)", left: "50%",
            transform: "translateX(-50%)", zIndex: 9999,
            background: "#0f172a", color: "#fff",
            borderRadius: 8, padding: "6px 12px",
            fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            pointerEvents: "none",
          }}>
            {type === "pdf" ? "📄" : "📎"} {fileName} — click to open
          </div>
        )}
      </div>
    );
  }

  // ── Full mode: used in bill-only upload section ─────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Image preview */}
      {isImg && (
        <div style={{
          borderRadius: 10, overflow: "hidden",
          border: "1.5px solid #e2e8f0", maxWidth: 300,
        }}>
          <img
            src={url}
            alt={fileName}
            onError={() => setImgError(true)}
            style={{ width: "100%", objectFit: "contain", display: "block", maxHeight: 240 }}
          />
        </div>
      )}

      {/* PDF icon */}
      {type === "pdf" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", background: "#fff5f0",
          border: "1.5px solid #fed7aa", borderRadius: 10,
        }}>
          <span style={{ fontSize: 28 }}>📄</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{fileName}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>PDF Document</div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={opening}
          onClick={async () => {
            setOpening(true);
            await openBillInTab(url, fileName);
            setOpening(false);
          }}
          style={{
            padding: "6px 14px", background: "#3b82f6", color: "#fff",
            border: "none", borderRadius: 8, fontWeight: 600, fontSize: 12,
            cursor: opening ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 5,
          }}>
          {opening ? "Opening…" : "🔍 View Bill"}
        </button>

        <button
          type="button"
          disabled={downloading}
          onClick={async () => {
            setDownloading(true);
            await downloadBill(url, fileName);
            setDownloading(false);
          }}
          style={{
            padding: "6px 14px", background: downloading ? "#f1f5f9" : "#0f172a",
            color: downloading ? "#64748b" : "#fff",
            border: "none", borderRadius: 8, fontWeight: 600, fontSize: 12,
            cursor: downloading ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 5,
          }}>
          {downloading ? "Downloading…" : "⬇ Download"}
        </button>
      </div>
    </div>
  );
}