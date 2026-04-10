import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import {
  getSessionUserProfile,
  hasRequiredEmployeeDetails,
  persistEmployeeDetails,
  type EditableEmployeeDetails,
} from "../../utils/sessionUser";
import styles from "./TravelRequestOptionsPage.module.css";

const REQUEST_OPTIONS = [
  {
    id: "flight",
    icon: "\u2708\uFE0F",
    title: "Flight Request",
    description: "Domestic and international air travel for meetings, site visits, and official tours.",
    path: "/booking/new/flight",
  },
  {
    id: "train",
    icon: "\uD83D\uDE82",
    title: "Train Request",
    description: "Rail booking for intercity travel with lower-cost and policy-friendly options.",
    path: "/booking/new/train",
  },
  {
    id: "cab",
    icon: "\uD83D\uDE95",
    title: "Cab Request",
    description: "Local transport for airport transfers, office visits, and same-day business movement.",
    path: "/booking/new/cab",
  },
  {
    id: "hotel",
    icon: "\uD83C\uDFE8",
    title: "Hotel Request",
    description: "Accommodation requests for approved overnight business travel and events.",
    path: "/booking/new/hotel",
  },
] as const;

type RequestOptionId = (typeof REQUEST_OPTIONS)[number]["id"];

export default function TravelRequestOptionsPage() {
  const navigate = useNavigate();
  const { signOut } = useMsalLogin();
  const sessionUser = getSessionUserProfile();
  const [selectedOption, setSelectedOption] = useState<RequestOptionId | "">("");
  const [employeeDetails, setEmployeeDetails] = useState<EditableEmployeeDetails>({
    employeeId: sessionUser.employeeId || sessionUser.employeeRecordId,
    fullName: sessionUser.fullName,
    department: sessionUser.department,
    designation: sessionUser.designation,
    reportingManager: sessionUser.reportingManager,
    contactNumber: sessionUser.contactNumber,
    email: sessionUser.email,
  });

  const fullName = employeeDetails.fullName || sessionUser.fullName || "Employee";
  const role = sessionUser.role || "Employee";
  const isProfileComplete = hasRequiredEmployeeDetails(employeeDetails);

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

  const handleEmployeeChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setEmployeeDetails((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const selectedRequest = REQUEST_OPTIONS.find((option) => option.id === selectedOption);
    if (!selectedRequest) {
      return;
    }

    persistEmployeeDetails(employeeDetails);
    navigate(selectedRequest.path, {
      state: {
        employeeDetails,
      },
    });
  };

  const selectedRequest = REQUEST_OPTIONS.find((option) => option.id === selectedOption);

  return (
    <div className={styles.page}>
      <CommonNavbar
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={handleSignOut}
      />

      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Raise travel request</p>
            <h1 className={styles.title}>Complete employee details before travel mode selection</h1>
            <p className={styles.subtitle}>
              New Travel Request now opens this raise-request form first. Fill the required
              employee details, choose the mode of travel, and then continue to the selected
              request form.
            </p>
          </div>

          <div className={styles.heroActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </button>
          </div>
        </section>

        <div className={styles.contentLayout}>
          <section className={styles.formCard}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Required fields</p>
                <h2 className={styles.sectionTitle}>Raise Travel Request</h2>
                <p className={styles.sectionText}>
                  If any employee details are missing, complete them here first. After
                  submission, the selected mode-of-travel form opens automatically.
                </p>
              </div>
              <span className={styles.sectionMeta}>
                {isProfileComplete ? "Profile ready" : "Fill all required details"}
              </span>
            </div>

            <form className={styles.formGrid} onSubmit={handleSubmit}>
              <label className={styles.field}>
                <span className={styles.label}>Employee ID *</span>
                <input
                  className={styles.input}
                  name="employeeId"
                  value={employeeDetails.employeeId}
                  onChange={handleEmployeeChange}
                  placeholder="Enter employee ID"
                  required
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Employee Name *</span>
                <input
                  className={styles.input}
                  name="fullName"
                  value={employeeDetails.fullName}
                  onChange={handleEmployeeChange}
                  placeholder="Enter employee name"
                  required
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Department *</span>
                <input
                  className={styles.input}
                  name="department"
                  value={employeeDetails.department}
                  onChange={handleEmployeeChange}
                  placeholder="Enter department"
                  required
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Designation *</span>
                <input
                  className={styles.input}
                  name="designation"
                  value={employeeDetails.designation}
                  onChange={handleEmployeeChange}
                  placeholder="Enter designation"
                  required
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Reporting Manager *</span>
                <input
                  className={styles.input}
                  name="reportingManager"
                  value={employeeDetails.reportingManager}
                  onChange={handleEmployeeChange}
                  placeholder="Enter reporting manager"
                  required
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Contact Number *</span>
                <input
                  className={styles.input}
                  name="contactNumber"
                  value={employeeDetails.contactNumber}
                  onChange={handleEmployeeChange}
                  placeholder="Enter contact number"
                  type="tel"
                  required
                />
              </label>

              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.label}>Email ID *</span>
                <input
                  className={styles.input}
                  name="email"
                  value={employeeDetails.email}
                  onChange={handleEmployeeChange}
                  placeholder="Enter email ID"
                  type="email"
                  required
                />
              </label>

              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.label}>Mode of Travel *</span>
                <select
                  className={styles.input}
                  name="modeOfTravel"
                  value={selectedOption}
                  onChange={(event) => setSelectedOption(event.target.value as RequestOptionId)}
                  required
                >
                  <option value="" disabled>
                    Select mode of travel
                  </option>
                  {REQUEST_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.actionsRow}>
                <button type="submit" className={styles.primaryBtn} disabled={!selectedOption}>
                  {selectedRequest ? `Continue to ${selectedRequest.title}` : "Continue to Request Form"}
                </button>
              </div>
            </form>
          </section>

          <aside className={styles.sideColumn}>
            <section className={styles.selectionCard}>
              <p className={styles.selectionLabel}>Current selection</p>
              <h3 className={styles.selectionTitle}>{selectedRequest?.title ?? "No travel mode selected"}</h3>
              <p className={styles.selectionDescription}>
                {selectedRequest?.description ??
                  "Choose the travel mode you want to raise after completing the employee details."}
              </p>
            </section>

            <section className={styles.optionsSection}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Available Request Types</h2>
                <span className={styles.sectionMeta}>{REQUEST_OPTIONS.length} options</span>
              </div>

              <div className={styles.optionsGrid}>
                {REQUEST_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`${styles.optionCard} ${selectedOption === option.id ? styles.optionCardActive : ""}`}
                    onClick={() => setSelectedOption(option.id)}
                  >
                    <span className={styles.optionIcon}>{option.icon}</span>
                    <span className={styles.optionTitle}>{option.title}</span>
                    <span className={styles.optionDescription}>{option.description}</span>
                    <span className={styles.optionTag}>
                      {selectedOption === option.id ? "Selected" : "Choose"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
