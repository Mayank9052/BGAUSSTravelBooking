// src/components/layout/ProfileEditModal.tsx
// Profile modal shown from CommonNavbar avatar click
// NON-editable: Email, Employee Code, Role, Last Login (shown read-only, greyed out)
// Editable: DisplayName, Department, Designation, ReportingManager,
//           ContactNumber, AlternateEmail, EmergencyContact

import { useState, useEffect } from "react";
import { get, put } from "../../services/apiClient";

const DEPARTMENTS = [
  "Branding and Marketing","Sales","Production","Finance and Legal",
  "Logistic and Store Mgt","Quality","Service","CBD",
  "Research and Development EE","Development","HR and Admin","SCM",
  "Research and Development VI","Research and Development MD","Operation",
  "B2B Sales","IT","B2B Service","Maintenance","Customer Care","Strategic Business",
];

interface ProfileData {
  employeeId:       number;
  email:            string;
  employeeCode:     string;
  role:             string;
  displayName:      string;
  department:       string;
  designation:      string;
  reportingManager: string;
  contactNumber:    string;
  alternateEmail:   string;
  emergencyContact: string;
  lastLoginAt:      string | null;
}

interface UpdateProfileDto {
  displayName?:      string;
  department?:       string;
  designation?:      string;
  reportingManager?: string;
  contactNumber?:    string;
  alternateEmail?:   string;
  emergencyContact?: string;
}

interface Props {
  initials: string;
  onClose:  () => void;
}

export default function ProfileEditModal({ initials, onClose }: Props) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [form,    setForm]    = useState<UpdateProfileDto>({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    get<ProfileData>("/TravelEmployee/my-profile")
      .then(data => {
        setProfile(data);
        setForm({
          displayName:      data.displayName      ?? "",
          department:       data.department       ?? "",
          designation:      data.designation      ?? "",
          reportingManager: data.reportingManager ?? "",
          contactNumber:    data.contactNumber    ?? "",
          alternateEmail:   data.alternateEmail   ?? "",
          emergencyContact: data.emergencyContact ?? "",
        });
      })
      .catch(() => setError("Failed to load profile. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form.displayName?.trim()) { setError("Display Name cannot be empty."); return; }
    setError(""); setSaving(true);
    try {
      const result = await put<{ message: string; displayName: string; department: string }>(
        "/TravelEmployee/my-profile", form,
      );
      if (result.displayName) localStorage.setItem("full_name",    result.displayName);
      if (result.department)  localStorage.setItem("department",   result.department);
      if (form.designation)   localStorage.setItem("designation",  form.designation);
      if (form.reportingManager) localStorage.setItem("reporting_manager", form.reportingManager);
      if (form.contactNumber) localStorage.setItem("contact_number", form.contactNumber);

      setSaved(true);
      setProfile(prev => prev ? { ...prev, ...form } as ProfileData : prev);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Style helpers ──────────────────────────────────────────────────────────
  const baseInp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1.5px solid #e2e8f0", fontSize: 13, color: "#0f172a",
    outline: "none", background: "#fff", fontFamily: "inherit",
    boxSizing: "border-box",
  };
  const readonlyStyle: React.CSSProperties = {
    ...baseInp, background: "#f1f5f9", color: "#94a3b8",
    cursor: "not-allowed", border: "1.5px solid #f1f5f9",
  };
  const label = (text: string) => (
    <label style={{
      fontSize: 11, color: "#64748b", fontWeight: 700,
      display: "block", marginBottom: 4,
      textTransform: "uppercase", letterSpacing: "0.04em",
    }}>{text}</label>
  );

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.5)", zIndex: 9000,
      }} />

      {/* Modal */}
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(580px, 95vw)", maxHeight: "92vh", overflowY: "auto",
        background: "#fff", borderRadius: 20,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)", zIndex: 9001,
        fontFamily: "'Segoe UI', sans-serif",
      }}>

        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
          padding: "22px 24px", borderRadius: "20px 20px 0 0",
          display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 10,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 800, color: "#fff", flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#fff" }}>
              My Profile
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              System fields are read-only · Edit your personal details below
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.12)", border: "none",
            color: "#fff", borderRadius: 8, padding: "6px 12px",
            cursor: "pointer", fontSize: 18, lineHeight: 1, flexShrink: 0,
          }}>×</button>
        </div>

        <div style={{ padding: "24px" }}>
          {loading ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
              Loading profile…
            </div>
          ) : error && !profile ? (
            <div style={{ padding: "24px 0", color: "#dc2626", textAlign: "center", fontSize: 13 }}>
              {error}
            </div>
          ) : (
            <>
              {/* ── Read-only section ── */}
              <div style={{
                background: "#f8fafc", borderRadius: 14, padding: "16px 18px",
                marginBottom: 24, border: "1.5px solid #f1f5f9",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                  <span style={{ fontSize: 13 }}>🔒</span>
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: "#94a3b8",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    Managed by IT — Read Only
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    {label("Email")}
                    <input readOnly value={profile?.email ?? ""} style={readonlyStyle} />
                  </div>
                  <div>
                    {label("Employee Code")}
                    <input readOnly value={profile?.employeeCode ?? "—"} style={readonlyStyle} />
                  </div>
                  <div>
                    {label("Role")}
                    <input readOnly value={profile?.role ?? ""} style={readonlyStyle} />
                  </div>
                  <div>
                    {label("Last Login")}
                    <input
                      readOnly
                      value={profile?.lastLoginAt
                        ? new Date(profile.lastLoginAt).toLocaleString("en-IN")
                        : "—"}
                      style={readonlyStyle}
                    />
                  </div>
                </div>
              </div>

              {/* ── Editable section ── */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
                  <span style={{ fontSize: 14 }}>✏️</span>
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: "#0f172a",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    Your Details — Editable
                  </span>
                </div>

                {error && (
                  <div style={{
                    padding: "10px 14px", borderRadius: 8, marginBottom: 14,
                    background: "#fef2f2", border: "1px solid #fecaca",
                    color: "#b91c1c", fontSize: 12, fontWeight: 600,
                  }}>{error}</div>
                )}

                {saved && (
                  <div style={{
                    padding: "10px 14px", borderRadius: 8, marginBottom: 14,
                    background: "#dcfce7", border: "1px solid #86efac",
                    color: "#15803d", fontSize: 12, fontWeight: 700,
                  }}>✅ Profile updated successfully!</div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {/* Display Name — full width */}
                  <div style={{ gridColumn: "1 / -1" }}>
                    {label("Display Name *")}
                    <input
                      value={form.displayName ?? ""}
                      onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                      style={baseInp} placeholder="Your full name"
                    />
                  </div>

                  {/* Department */}
                  <div>
                    {label("Department")}
                    <select
                      value={form.department ?? ""}
                      onChange={e => setForm(p => ({ ...p, department: e.target.value }))}
                      style={baseInp}
                    >
                      <option value="">— Select —</option>
                      {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>

                  {/* Designation */}
                  <div>
                    {label("Designation")}
                    <input
                      value={form.designation ?? ""}
                      onChange={e => setForm(p => ({ ...p, designation: e.target.value }))}
                      style={baseInp} placeholder="e.g. Software Engineer"
                    />
                  </div>

                  {/* Reporting Manager */}
                  <div>
                    {label("Reporting Manager")}
                    <input
                      value={form.reportingManager ?? ""}
                      onChange={e => setForm(p => ({ ...p, reportingManager: e.target.value }))}
                      style={baseInp} placeholder="Manager's full name"
                    />
                  </div>

                  {/* Contact Number */}
                  <div>
                    {label("Contact Number")}
                    <input
                      type="tel"
                      value={form.contactNumber ?? ""}
                      onChange={e => setForm(p => ({ ...p, contactNumber: e.target.value }))}
                      style={baseInp} placeholder="+91 XXXXX XXXXX"
                    />
                  </div>

                  {/* Alternate Email */}
                  <div>
                    {label("Alternate Email")}
                    <input
                      type="email"
                      value={form.alternateEmail ?? ""}
                      onChange={e => setForm(p => ({ ...p, alternateEmail: e.target.value }))}
                      style={baseInp} placeholder="alternate@email.com"
                    />
                  </div>

                  {/* Emergency Contact — full width */}
                  <div style={{ gridColumn: "1 / -1" }}>
                    {label("Emergency Contact")}
                    <input
                      value={form.emergencyContact ?? ""}
                      onChange={e => setForm(p => ({ ...p, emergencyContact: e.target.value }))}
                      style={baseInp} placeholder="Name & phone number of emergency contact"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{
                display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24,
                paddingTop: 20, borderTop: "1.5px solid #f1f5f9",
              }}>
                <button onClick={onClose} style={{
                  padding: "10px 22px", background: "#f1f5f9", color: "#64748b",
                  border: "1.5px solid #e2e8f0", borderRadius: 10,
                  fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}>Cancel</button>

                <button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  style={{
                    padding: "10px 26px",
                    background: saving ? "#94a3b8" : saved ? "#15803d" : "#0f172a",
                    color: "#fff", border: "none", borderRadius: 10,
                    fontWeight: 800, fontSize: 13,
                    cursor: saving ? "not-allowed" : "pointer",
                    transition: "background 0.2s",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  {saving ? "Saving…" : saved ? "✅ Saved!" : "Save Changes"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}