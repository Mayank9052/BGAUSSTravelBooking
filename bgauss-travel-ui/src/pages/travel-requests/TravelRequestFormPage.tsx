import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { getSessionUserProfile, hasRequiredEmployeeDetails } from "../../utils/sessionUser";
import styles from "./TravelRequestFormPage.module.css";

const REQUEST_PAGE_CONFIG = {
  flight: {
    icon: "\u2708\uFE0F",
    title: "Flight Booking Request",
    subtitle: "Raise an air travel request for domestic or international business movement.",
    routeLabel: "Flight",
    fieldLabels: {
      from: "Departure City",
      to: "Arrival City",
      date1: "Departure Date",
      date2: "Return Date",
      option1: "Trip Type",
      option2: "Cabin Preference",
    },
    option1Values: ["One Way", "Round Trip", "Multi City"],
    option2Values: ["Economy", "Premium Economy", "Business"],
    policyPoints: [
      "Book flights only for approved business travel.",
      "Choose the most cost-effective fare within policy.",
      "Attach meeting details for customer or plant visits.",
    ],
    documents: ["Travel agenda", "Approval mail", "Customer or plant visit note"],
  },
  train: {
    icon: "\uD83D\uDE82",
    title: "Train Booking Request",
    subtitle: "Raise a rail booking request for intercity official travel.",
    routeLabel: "Train",
    fieldLabels: {
      from: "Boarding Station",
      to: "Destination Station",
      date1: "Journey Date",
      date2: "Return Date",
      option1: "Journey Type",
      option2: "Coach Preference",
    },
    option1Values: ["One Way", "Round Trip"],
    option2Values: ["Sleeper", "3A", "2A", "Chair Car"],
    policyPoints: [
      "Use train travel when it is practical and policy-friendly.",
      "Mention reporting time when same-day travel is needed.",
      "Add return details if a round-trip booking is required.",
    ],
    documents: ["Visit purpose note", "Approval mail", "Travel timeline"],
  },
  cab: {
    icon: "\uD83D\uDE95",
    title: "Cab Booking Request",
    subtitle: "Raise a request for office visits, airport transfers, or local business travel.",
    routeLabel: "Cab",
    fieldLabels: {
      from: "Pickup Location",
      to: "Drop Location",
      date1: "Travel Date",
      date2: "Return/Pickup Back Date",
      option1: "Cab Type",
      option2: "Usage Window",
    },
    option1Values: ["Sedan", "SUV", "Premium"],
    option2Values: ["One Way", "Round Trip", "Full Day"],
    policyPoints: [
      "Use cab requests for business movement only.",
      "Mention airport transfer separately if tied to a flight.",
      "Provide exact pickup timing to avoid delays.",
    ],
    documents: ["Meeting schedule", "Approval mail", "Airport or office timing"],
  },
  hotel: {
    icon: "\uD83C\uDFE8",
    title: "Hotel Booking Request",
    subtitle: "Raise an accommodation request for approved overnight travel and events.",
    routeLabel: "Hotel",
    fieldLabels: {
      from: "City of Stay",
      to: "Preferred Area/Property",
      date1: "Check-in Date",
      date2: "Check-out Date",
      option1: "Room Type",
      option2: "Stay Category",
    },
    option1Values: ["Standard", "Executive", "Twin Sharing"],
    option2Values: ["Single Stay", "Extended Stay", "Event Stay"],
    policyPoints: [
      "Hotel bookings must align with approved travel duration.",
      "Choose business-approved properties wherever available.",
      "Mention late check-in or event venue requirements clearly.",
    ],
    documents: ["Travel approval", "Event or meeting details", "Guest stay requirement note"],
  },
} as const;

type RequestType = keyof typeof REQUEST_PAGE_CONFIG;

export default function TravelRequestFormPage() {
  const navigate = useNavigate();
  const { signOut } = useMsalLogin();
  const { requestType } = useParams<{ requestType: string }>();

  const config = requestType ? REQUEST_PAGE_CONFIG[requestType as RequestType] : undefined;
  const sessionUser = getSessionUserProfile();
  const employeeDetails = {
    employeeId: sessionUser.employeeId || sessionUser.employeeRecordId,
    fullName: sessionUser.fullName,
    department: sessionUser.department,
    designation: sessionUser.designation,
    reportingManager: sessionUser.reportingManager,
    contactNumber: sessionUser.contactNumber,
    email: sessionUser.email,
  };

  const fullName = sessionUser.fullName || "Employee";
  const role = sessionUser.role || "Employee";
  const department = sessionUser.department;
  const employeeCode = employeeDetails.employeeId;

  const initials =
    fullName
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "ME";

  const handleSignOut = async () => {
    await signOut();
  };

  if (!config) {
    return <Navigate to="/booking/new" replace />;
  }

  if (!hasRequiredEmployeeDetails(employeeDetails)) {
    return <Navigate to="/booking/new" replace />;
  }

  return (
    <div className={styles.page}>
      <CommonNavbar
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={handleSignOut}
      />

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.heroBadge}>{config.routeLabel} Request</span>
            <h1 className={styles.heroTitle}>
              <span className={styles.heroIcon}>{config.icon}</span>
              {config.title}
            </h1>
            <p className={styles.heroSubtitle}>{config.subtitle}</p>
          </div>

          <div className={styles.heroActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate("/booking/new")}>
              Back to Options
            </button>
            <button type="button" className={styles.primaryBtn} onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </button>
          </div>
        </section>

        <div className={styles.layout}>
          <section className={styles.formCard}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Request details</p>
                <h2 className={styles.sectionTitle}>Employee Travel Submission</h2>
                <p className={styles.sectionNote}>
                  Employee details were captured in Raise Travel Request. Complete only the
                  selected {config.routeLabel.toLowerCase()} request details here.
                </p>
              </div>
              <span className={styles.typeChip}>{config.routeLabel}</span>
            </div>

            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>{config.fieldLabels.from}</span>
                <input className={styles.input} placeholder={`Enter ${config.fieldLabels.from.toLowerCase()}`} />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>{config.fieldLabels.to}</span>
                <input className={styles.input} placeholder={`Enter ${config.fieldLabels.to.toLowerCase()}`} />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>{config.fieldLabels.date1}</span>
                <input className={styles.input} type="date" />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>{config.fieldLabels.date2}</span>
                <input className={styles.input} type="date" />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>{config.fieldLabels.option1}</span>
                <select className={styles.input} defaultValue="">
                  <option value="" disabled>
                    Select {config.fieldLabels.option1.toLowerCase()}
                  </option>
                  {config.option1Values.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>{config.fieldLabels.option2}</span>
                <select className={styles.input} defaultValue="">
                  <option value="" disabled>
                    Select {config.fieldLabels.option2.toLowerCase()}
                  </option>
                  {config.option2Values.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.label}>Travel Purpose</span>
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  placeholder="Describe the business purpose, location, and travel justification."
                />
              </label>

              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.label}>Additional Notes</span>
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  placeholder="Mention reporting time, preferred vendors, event details, or approval references."
                />
              </label>
            </div>
          </section>

          <aside className={styles.sideColumn}>
            <section className={styles.infoCard}>
              <p className={styles.sectionEyebrow}>Employee info</p>
              <div className={styles.profileBlock}>
                <div className={styles.profileAvatar}>{initials}</div>
                <div>
                  <p className={styles.profileName}>{fullName}</p>
                  <p className={styles.profileMeta}>{role} · {department || "BGauss"}</p>
                  <p className={styles.profileMeta}>Code: {employeeCode || "N/A"}</p>
                  <p className={styles.profileMeta}>
                    Designation: {sessionUser.designation || "To be updated"}
                  </p>
                  <p className={styles.profileMeta}>
                    Reporting Manager: {sessionUser.reportingManager || "To be updated"}
                  </p>
                  <p className={styles.profileMeta}>
                    Contact: {sessionUser.contactNumber || "To be updated"}
                  </p>
                  <p className={styles.profileMeta}>
                    Email: {sessionUser.email || "To be updated"}
                  </p>
                </div>
              </div>
            </section>

            <section className={styles.infoCard}>
              <p className={styles.sectionEyebrow}>Policy checklist</p>
              <ul className={styles.list}>
                {config.policyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </section>

            <section className={styles.infoCard}>
              <p className={styles.sectionEyebrow}>Recommended documents</p>
              <ul className={styles.list}>
                {config.documents.map((document) => (
                  <li key={document}>{document}</li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
