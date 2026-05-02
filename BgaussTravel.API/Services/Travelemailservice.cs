// Services/TravelEmailService.cs
// Handles all travel-request email notifications:
//   1. Employee acknowledgement on submission
//   2. Approval request to HR (Mayank.maheshwari@bgauss.com)
//   3. Status update to employee on approve/reject

using System.Net;
using System.Net.Mail;
using BgaussTravel.API.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace BgaussTravel.API.Services;

public interface ITravelEmailService
{
    /// <summary>Send acknowledgement to employee + approval request to HR.</summary>
    Task SendSubmissionEmailsAsync(TravelRequest request, TravelEmployee employee);

    /// <summary>Send approval/rejection result back to the employee.</summary>
    Task SendStatusUpdateEmailAsync(TravelRequest request, TravelEmployee employee, string? comments);
}

public class TravelEmailService : ITravelEmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<TravelEmailService> _logger;

    // Hardcoded HR approver — change via appsettings if needed
    private const string HrApproverEmail = "Mayank.maheshwari@bgauss.com";
    private const string HrApproverName  = "Mayank Maheshwari";

    public TravelEmailService(IConfiguration config, ILogger<TravelEmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    // ── Shared SMTP client factory ────────────────────────────────────────────
    private SmtpClient BuildClient()
    {
        var smtp = _config.GetSection("Smtp");
        return new SmtpClient(smtp["Host"], int.Parse(smtp["Port"] ?? "587"))
        {
            Credentials    = new NetworkCredential(smtp["User"], smtp["Password"]),
            EnableSsl      = true,                          // STARTTLS on port 587
            DeliveryMethod = SmtpDeliveryMethod.Network,
        };
    }

    private string From =>
        _config["Smtp:From"] ?? _config["Smtp:User"] ?? "travel@bgauss.com";

    private string AppUrl =>
        _config["AppUrl"] ?? "https://35.171.187.211";

    // ─────────────────────────────────────────────────────────────────────────
    // 1 + 2  |  Submission → employee ACK + HR approval request
    // ─────────────────────────────────────────────────────────────────────────
    public async Task SendSubmissionEmailsAsync(TravelRequest request, TravelEmployee employee)
    {
        // SmtpClient is NOT thread-safe — never share one instance across concurrent sends.
        // Each helper creates and disposes its own client; run sequentially to be safe.
        await SendEmployeeAckAsync(request, employee);
        await SendHrApprovalRequestAsync(request, employee);
    }

    // ── 1. Employee acknowledgement ───────────────────────────────────────────
    private async Task SendEmployeeAckAsync(TravelRequest request, TravelEmployee employee)
    {
        if (string.IsNullOrWhiteSpace(employee.Email))
        {
            _logger.LogWarning("Employee {Id} has no email — skipping ACK for {Code}", employee.EmployeeId, request.RequestCode);
            return;
        }

        try
        {
            using var client = BuildClient();                           // own instance
            var subject = $"[BGauss Travel] Request Received — {request.RequestCode}";
            var body    = EmployeeAckHtml(request, employee);

            var mail = new MailMessage(From, employee.Email, subject, body) { IsBodyHtml = true };
            await client.SendMailAsync(mail);
            _logger.LogInformation("ACK email sent to {Email} for {Code}", employee.Email, request.RequestCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send ACK email for {Code}", request.RequestCode);
        }
    }

    // ── 2. HR approval request ────────────────────────────────────────────────
    private async Task SendHrApprovalRequestAsync(TravelRequest request, TravelEmployee employee)
    {
        try
        {
            using var client = BuildClient();                           // own instance
            var subject = $"[BGauss Travel] Approval Required — {request.RequestCode} | {employee.DisplayName}";
            var body    = HrApprovalRequestHtml(request, employee);

            var mail = new MailMessage(From, HrApproverEmail, subject, body) { IsBodyHtml = true };
            mail.CC.Add(new MailAddress(From, "BGauss Travel System"));
            await client.SendMailAsync(mail);
            _logger.LogInformation("Approval request sent to {Hr} for {Code}", HrApproverEmail, request.RequestCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send HR approval email for {Code}", request.RequestCode);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Status update → employee (approve / reject)
    // ─────────────────────────────────────────────────────────────────────────
    public async Task SendStatusUpdateEmailAsync(TravelRequest request, TravelEmployee employee, string? comments)
    {
        if (string.IsNullOrWhiteSpace(employee.Email))
        {
            _logger.LogWarning("Employee {Id} has no email — skipping status update for {Code}", employee.EmployeeId, request.RequestCode);
            return;
        }

        try
        {
            using var client  = BuildClient();
            bool approved     = request.Status == "Approved";
            var subject       = approved
                ? $"[BGauss Travel] ✅ Request Approved — {request.RequestCode}"
                : $"[BGauss Travel] ❌ Request Rejected — {request.RequestCode}";
            var body          = StatusUpdateHtml(request, employee, comments, approved);

            var mail = new MailMessage(From, employee.Email, subject, body) { IsBodyHtml = true };
            await client.SendMailAsync(mail);
            _logger.LogInformation("Status update ({Status}) sent to {Email} for {Code}",
                request.Status, employee.Email, request.RequestCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send status update email for {Code}", request.RequestCode);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HTML templates
    // ─────────────────────────────────────────────────────────────────────────

    private static string TableRow(string label, string value) => $"""
        <tr>
          <td style="padding:8px 0;color:#6b7280;width:160px;vertical-align:top">{label}</td>
          <td style="padding:8px 0;font-weight:600;color:#0f172a">{System.Net.WebUtility.HtmlEncode(value)}</td>
        </tr>
        """;

    // Shared header/footer wrappers
    private static string WrapEmail(string accentColor, string headerTitle, string innerHtml) => $"""
        <html><body style="margin:0;padding:20px;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a">
          <div style="max-width:620px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 16px rgba(0,0,0,0.07)">
            <!-- Header -->
            <div style="background:{accentColor};padding:28px 32px">
              <p style="margin:0 0 4px;color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:1px;text-transform:uppercase">BGauss Travel System</p>
              <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700">{headerTitle}</h2>
            </div>
            <!-- Body -->
            <div style="padding:28px 32px">
              {innerHtml}
            </div>
            <!-- Footer -->
            <div style="background:#f8fafc;padding:16px 32px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">
              BGauss Travel Booking System &nbsp;·&nbsp; Auto-generated notification &nbsp;·&nbsp; Do not reply
            </div>
          </div>
        </body></html>
        """;

    // ── Template 1: Employee acknowledgement ──────────────────────────────────
    private string EmployeeAckHtml(TravelRequest request, TravelEmployee employee) =>
        WrapEmail("#1D4ED8", "Travel Request Received", $"""
            <p style="margin:0 0 20px;color:#374151">
              Hi <strong>{System.Net.WebUtility.HtmlEncode(employee.DisplayName)}</strong>,<br/>
              Your travel request has been received and is pending HR approval. You will be notified once a decision is made.
            </p>
            <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">
              {TableRow("Request No.",   request.RequestCode)}
              {TableRow("Employee",      $"{employee.DisplayName} ({employee.EmployeeCode})")}
              {TableRow("Department",    employee.Department ?? "—")}
              {TableRow("Transport",     request.TransportType)}
              {TableRow("Destination",   request.Destination)}
              {TableRow("Departure",     request.DepartureDate.ToString("dd MMM yyyy"))}
              {TableRow("Return",        request.ReturnDate.ToString("dd MMM yyyy"))}
              {TableRow("Est. Amount",   request.EstimatedAmount.HasValue ? $"₹ {request.EstimatedAmount:N2}" : "—")}
              {TableRow("Purpose",       request.TravelPurpose)}
              {(string.IsNullOrWhiteSpace(request.Notes) ? "" : TableRow("Notes", request.Notes!))}
              {TableRow("Submitted At",  request.SubmittedAt?.ToString("dd MMM yyyy, hh:mm tt") ?? DateTime.UtcNow.ToString("dd MMM yyyy, hh:mm tt") + " UTC")}
            </table>
            <p style="margin:24px 0 0;font-size:13px;color:#6b7280">
              You can track your request status on the portal at any time.
            </p>
            <div style="margin-top:20px">
              <a href="{AppUrl}/dashboard"
                 style="display:inline-block;background:#1D4ED8;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
                View My Requests →
              </a>
            </div>
            """);

    // ── Template 2: HR approval request ───────────────────────────────────────
    private string HrApprovalRequestHtml(TravelRequest request, TravelEmployee employee) =>
        WrapEmail("#D97706", $"Approval Required — {request.RequestCode}", $"""
            <p style="margin:0 0 20px;color:#374151">
              Hi <strong>{HrApproverName}</strong>,<br/>
              A new travel request has been submitted and requires your approval.
            </p>
            <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">
              {TableRow("Request No.",   request.RequestCode)}
              {TableRow("Employee",      $"{employee.DisplayName} ({employee.EmployeeCode})")}
              {TableRow("Department",    employee.Department ?? "—")}
              {TableRow("Transport",     request.TransportType)}
              {TableRow("Destination",   request.Destination)}
              {TableRow("Departure",     request.DepartureDate.ToString("dd MMM yyyy"))}
              {TableRow("Return",        request.ReturnDate.ToString("dd MMM yyyy"))}
              {TableRow("Est. Amount",   request.EstimatedAmount.HasValue ? $"₹ {request.EstimatedAmount:N2}" : "—")}
              {TableRow("Purpose",       request.TravelPurpose)}
              {(string.IsNullOrWhiteSpace(request.Notes) ? "" : TableRow("Notes", request.Notes!))}
              {TableRow("Submitted At",  request.SubmittedAt?.ToString("dd MMM yyyy, hh:mm tt") ?? DateTime.UtcNow.ToString("dd MMM yyyy, hh:mm tt") + " UTC")}
            </table>
            <p style="margin:20px 0 8px;font-weight:600;color:#0f172a">Action Required</p>
            <p style="margin:0 0 20px;font-size:13px;color:#6b7280">
              Please review the request in the portal and approve or reject it with remarks.
            </p>
            <div style="display:flex;gap:12px;margin-top:20px">
              <a href="{AppUrl}/hr/approvals/{request.RequestId}"
                 style="display:inline-block;background:#16A34A;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
                ✅ Review &amp; Approve →
              </a>
              <a href="{AppUrl}/hr/approvals/{request.RequestId}"
                 style="display:inline-block;background:#DC2626;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin-left:12px">
                ❌ Review &amp; Reject →
              </a>
            </div>
            """);

    // ── Template 3: Status update to employee ─────────────────────────────────
    private string StatusUpdateHtml(TravelRequest request, TravelEmployee employee, string? comments, bool approved) =>
        WrapEmail(approved ? "#16A34A" : "#DC2626",
                  approved ? "✅ Travel Request Approved" : "❌ Travel Request Rejected",
                  $"""
            <p style="margin:0 0 20px;color:#374151">
              Hi <strong>{System.Net.WebUtility.HtmlEncode(employee.DisplayName)}</strong>,<br/>
              {(approved
                ? "Great news! Your travel request has been <strong style=\"color:#16A34A\">approved</strong>."
                : "Your travel request has been <strong style=\"color:#DC2626\">rejected</strong>. Please review the remarks below and contact HR if needed.")}
            </p>
            <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">
              {TableRow("Request No.",  request.RequestCode)}
              {TableRow("Transport",    request.TransportType)}
              {TableRow("Destination",  request.Destination)}
              {TableRow("Departure",    request.DepartureDate.ToString("dd MMM yyyy"))}
              {TableRow("Return",       request.ReturnDate.ToString("dd MMM yyyy"))}
              {TableRow("Status",       request.Status)}
              {TableRow("Decided At",   request.UpdatedAt.ToString("dd MMM yyyy, hh:mm tt") + " UTC")}
              {(string.IsNullOrWhiteSpace(comments) ? "" : TableRow("HR Remarks", comments!))}
            </table>
            {(approved ? $"""
            <div style="margin-top:20px;padding:14px 18px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:13px;color:#166534">
              You may now proceed with booking arrangements. Keep all receipts for expense claims after your travel.
            </div>
            """ : $"""
            <div style="margin-top:20px;padding:14px 18px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:13px;color:#991b1b">
              If you believe this decision was made in error, please reach out to HR or your reporting manager.
            </div>
            """)}
            <div style="margin-top:24px">
              <a href="{AppUrl}/dashboard"
                 style="display:inline-block;background:{(approved ? "#1D4ED8" : "#374151")};color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
                View My Requests →
              </a>
            </div>
            """);
}