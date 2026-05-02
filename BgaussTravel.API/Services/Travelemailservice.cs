// Services/TravelEmailService.cs
// Handles all travel-request AND expense-claim email notifications:
//   Travel Requests:
//     1. Employee acknowledgement on submission
//     2. Approval request to HR (Mayank.maheshwari@bgauss.com)
//     3. Status update to employee on approve/reject
//   Expense Claims:
//     4. Employee + HR notification on claim submission
//     5. Status update to employee on approve/reject
//     6. Reimbursement confirmation to employee

using System.Net;
using System.Net.Mail;
using BgaussTravel.API.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace BgaussTravel.API.Services;

public interface ITravelEmailService
{
    // ── Travel Request ────────────────────────────────────────────────────────
    /// <summary>Send acknowledgement to employee + approval request to HR.</summary>
    Task SendSubmissionEmailsAsync(TravelRequest request, TravelEmployee employee);

    /// <summary>Send approval/rejection result back to the employee.</summary>
    Task SendStatusUpdateEmailAsync(TravelRequest request, TravelEmployee employee, string? comments);

    // ── Expense Claims ────────────────────────────────────────────────────────
    /// <summary>Send acknowledgement to employee + notification to HR on claim submission.</summary>
    Task SendClaimSubmissionEmailsAsync(ExpenseClaim claim, TravelEmployee employee, TravelRequest request);

    /// <summary>Send approve/reject result to the employee.</summary>
    Task SendClaimStatusUpdateEmailAsync(ExpenseClaim claim, TravelEmployee employee, string? comments);

    /// <summary>Send reimbursement confirmation to the employee.</summary>
    Task SendClaimReimbursedEmailAsync(ExpenseClaim claim, TravelEmployee employee);
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
            EnableSsl      = true,
            DeliveryMethod = SmtpDeliveryMethod.Network,
        };
    }

    private string From =>
        _config["Smtp:From"] ?? _config["Smtp:User"] ?? "travel@bgauss.com";

    private string AppUrl =>
        _config["AppUrl"] ?? "https://35.171.187.211";

    // =========================================================================
    // TRAVEL REQUEST EMAILS  (unchanged)
    // =========================================================================

    public async Task SendSubmissionEmailsAsync(TravelRequest request, TravelEmployee employee)
    {
        await SendEmployeeAckAsync(request, employee);
        await SendHrApprovalRequestAsync(request, employee);
    }

    private async Task SendEmployeeAckAsync(TravelRequest request, TravelEmployee employee)
    {
        if (string.IsNullOrWhiteSpace(employee.Email))
        {
            _logger.LogWarning("Employee {Id} has no email — skipping ACK for {Code}", employee.EmployeeId, request.RequestCode);
            return;
        }
        try
        {
            using var client = BuildClient();
            var mail = new MailMessage(From, employee.Email,
                $"[BGauss Travel] Request Received — {request.RequestCode}",
                EmployeeAckHtml(request, employee)) { IsBodyHtml = true };
            await client.SendMailAsync(mail);
            _logger.LogInformation("ACK email sent to {Email} for {Code}", employee.Email, request.RequestCode);
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to send ACK email for {Code}", request.RequestCode); }
    }

    private async Task SendHrApprovalRequestAsync(TravelRequest request, TravelEmployee employee)
    {
        try
        {
            using var client = BuildClient();
            var mail = new MailMessage(From, HrApproverEmail,
                $"[BGauss Travel] Approval Required — {request.RequestCode} | {employee.DisplayName}",
                HrApprovalRequestHtml(request, employee)) { IsBodyHtml = true };
            mail.CC.Add(new MailAddress(From, "BGauss Travel System"));
            await client.SendMailAsync(mail);
            _logger.LogInformation("Approval request sent to {Hr} for {Code}", HrApproverEmail, request.RequestCode);
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to send HR approval email for {Code}", request.RequestCode); }
    }

    public async Task SendStatusUpdateEmailAsync(TravelRequest request, TravelEmployee employee, string? comments)
    {
        if (string.IsNullOrWhiteSpace(employee.Email))
        {
            _logger.LogWarning("Employee {Id} has no email — skipping status update for {Code}", employee.EmployeeId, request.RequestCode);
            return;
        }
        try
        {
            using var client = BuildClient();
            bool approved = request.Status == "Approved";
            var mail = new MailMessage(From, employee.Email,
                approved
                    ? $"[BGauss Travel] ✅ Request Approved — {request.RequestCode}"
                    : $"[BGauss Travel] ❌ Request Rejected — {request.RequestCode}",
                StatusUpdateHtml(request, employee, comments, approved)) { IsBodyHtml = true };
            await client.SendMailAsync(mail);
            _logger.LogInformation("Status update ({Status}) sent to {Email} for {Code}",
                request.Status, employee.Email, request.RequestCode);
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to send status update email for {Code}", request.RequestCode); }
    }

    // =========================================================================
    // EXPENSE CLAIM EMAILS  (new)
    // =========================================================================

    // ── 4. Claim submission: employee ACK + HR notification ───────────────────
    public async Task SendClaimSubmissionEmailsAsync(ExpenseClaim claim, TravelEmployee employee, TravelRequest request)
    {
        await SendClaimEmployeeAckAsync(claim, employee, request);
        await SendClaimHrNotificationAsync(claim, employee, request);
    }

    private async Task SendClaimEmployeeAckAsync(ExpenseClaim claim, TravelEmployee employee, TravelRequest request)
    {
        if (string.IsNullOrWhiteSpace(employee.Email))
        {
            _logger.LogWarning("Employee {Id} has no email — skipping claim ACK for {Code}", employee.EmployeeId, claim.ClaimCode);
            return;
        }
        try
        {
            using var client = BuildClient();
            var mail = new MailMessage(From, employee.Email,
                $"[BGauss Travel] Expense Claim Received — {claim.ClaimCode}",
                ClaimEmployeeAckHtml(claim, employee, request)) { IsBodyHtml = true };
            await client.SendMailAsync(mail);
            _logger.LogInformation("Claim ACK sent to {Email} for {Code}", employee.Email, claim.ClaimCode);
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to send claim ACK for {Code}", claim.ClaimCode); }
    }

    private async Task SendClaimHrNotificationAsync(ExpenseClaim claim, TravelEmployee employee, TravelRequest request)
    {
        try
        {
            using var client = BuildClient();
            var mail = new MailMessage(From, HrApproverEmail,
                $"[BGauss Travel] Expense Claim Review Required — {claim.ClaimCode} | {employee.DisplayName}",
                ClaimHrNotificationHtml(claim, employee, request)) { IsBodyHtml = true };
            mail.CC.Add(new MailAddress(From, "BGauss Travel System"));
            await client.SendMailAsync(mail);
            _logger.LogInformation("Claim HR notification sent to {Hr} for {Code}", HrApproverEmail, claim.ClaimCode);
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to send claim HR notification for {Code}", claim.ClaimCode); }
    }

    // ── 5. Claim approve / reject → employee ──────────────────────────────────
    public async Task SendClaimStatusUpdateEmailAsync(ExpenseClaim claim, TravelEmployee employee, string? comments)
    {
        if (string.IsNullOrWhiteSpace(employee.Email))
        {
            _logger.LogWarning("Employee {Id} has no email — skipping claim status update for {Code}", employee.EmployeeId, claim.ClaimCode);
            return;
        }
        try
        {
            using var client = BuildClient();
            bool approved = claim.Status == "Approved";
            var mail = new MailMessage(From, employee.Email,
                approved
                    ? $"[BGauss Travel] ✅ Expense Claim Approved — {claim.ClaimCode}"
                    : $"[BGauss Travel] ❌ Expense Claim Rejected — {claim.ClaimCode}",
                ClaimStatusUpdateHtml(claim, employee, comments, approved)) { IsBodyHtml = true };
            await client.SendMailAsync(mail);
            _logger.LogInformation("Claim status update ({Status}) sent to {Email} for {Code}",
                claim.Status, employee.Email, claim.ClaimCode);
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to send claim status update email for {Code}", claim.ClaimCode); }
    }

    // ── 6. Reimbursement confirmation → employee ──────────────────────────────
    public async Task SendClaimReimbursedEmailAsync(ExpenseClaim claim, TravelEmployee employee)
    {
        if (string.IsNullOrWhiteSpace(employee.Email))
        {
            _logger.LogWarning("Employee {Id} has no email — skipping reimbursement email for {Code}", employee.EmployeeId, claim.ClaimCode);
            return;
        }
        try
        {
            using var client = BuildClient();
            var mail = new MailMessage(From, employee.Email,
                $"[BGauss Travel] 💰 Reimbursement Processed — {claim.ClaimCode}",
                ClaimReimbursedHtml(claim, employee)) { IsBodyHtml = true };
            await client.SendMailAsync(mail);
            _logger.LogInformation("Reimbursement email sent to {Email} for {Code}", employee.Email, claim.ClaimCode);
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to send reimbursement email for {Code}", claim.ClaimCode); }
    }

    // =========================================================================
    // HTML TEMPLATES — shared helpers
    // =========================================================================

    private static string H(string? s) => WebUtility.HtmlEncode(s ?? "");

    private static string TableRow(string label, string value) => $"""
        <tr>
          <td style="padding:8px 0;color:#6b7280;width:160px;vertical-align:top">{label}</td>
          <td style="padding:8px 0;font-weight:600;color:#0f172a">{H(value)}</td>
        </tr>
        """;

    private static string WrapEmail(string accentColor, string headerTitle, string innerHtml) => $"""
        <html><body style="margin:0;padding:20px;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a">
          <div style="max-width:620px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 16px rgba(0,0,0,0.07)">
            <div style="background:{accentColor};padding:28px 32px">
              <p style="margin:0 0 4px;color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:1px;text-transform:uppercase">BGauss Travel System</p>
              <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700">{headerTitle}</h2>
            </div>
            <div style="padding:28px 32px">{innerHtml}</div>
            <div style="background:#f8fafc;padding:16px 32px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">
              BGauss Travel Booking System &nbsp;·&nbsp; Auto-generated notification &nbsp;·&nbsp; Do not reply
            </div>
          </div>
        </body></html>
        """;

    // =========================================================================
    // HTML TEMPLATES — Travel Request (unchanged)
    // =========================================================================

    private string EmployeeAckHtml(TravelRequest r, TravelEmployee e) =>
        WrapEmail("#1D4ED8", "Travel Request Received", $"""
            <p style="margin:0 0 20px;color:#374151">
              Hi <strong>{H(e.DisplayName)}</strong>,<br/>
              Your travel request has been received and is pending HR approval. You will be notified once a decision is made.
            </p>
            <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">
              {TableRow("Request No.",   r.RequestCode)}
              {TableRow("Employee",      $"{e.DisplayName} ({e.EmployeeCode})")}
              {TableRow("Department",    e.Department ?? "—")}
              {TableRow("Transport",     r.TransportType)}
              {TableRow("Destination",   r.Destination)}
              {TableRow("Departure",     r.DepartureDate.ToString("dd MMM yyyy"))}
              {TableRow("Return",        r.ReturnDate.ToString("dd MMM yyyy"))}
              {TableRow("Est. Amount",   r.EstimatedAmount.HasValue ? $"₹ {r.EstimatedAmount:N2}" : "—")}
              {TableRow("Purpose",       r.TravelPurpose)}
              {(string.IsNullOrWhiteSpace(r.Notes) ? "" : TableRow("Notes", r.Notes!))}
              {TableRow("Submitted At",  r.SubmittedAt?.ToString("dd MMM yyyy, hh:mm tt") ?? DateTime.UtcNow.ToString("dd MMM yyyy, hh:mm tt") + " UTC")}
            </table>
            <p style="margin:24px 0 0;font-size:13px;color:#6b7280">You can track your request status on the portal at any time.</p>
            <div style="margin-top:20px">
              <a href="{AppUrl}/dashboard" style="display:inline-block;background:#1D4ED8;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
                View My Requests →
              </a>
            </div>
            """);

    private string HrApprovalRequestHtml(TravelRequest r, TravelEmployee e) =>
        WrapEmail("#D97706", $"Approval Required — {r.RequestCode}", $"""
            <p style="margin:0 0 20px;color:#374151">
              Hi <strong>{HrApproverName}</strong>,<br/>
              A new travel request has been submitted and requires your approval.
            </p>
            <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">
              {TableRow("Request No.",   r.RequestCode)}
              {TableRow("Employee",      $"{e.DisplayName} ({e.EmployeeCode})")}
              {TableRow("Department",    e.Department ?? "—")}
              {TableRow("Transport",     r.TransportType)}
              {TableRow("Destination",   r.Destination)}
              {TableRow("Departure",     r.DepartureDate.ToString("dd MMM yyyy"))}
              {TableRow("Return",        r.ReturnDate.ToString("dd MMM yyyy"))}
              {TableRow("Est. Amount",   r.EstimatedAmount.HasValue ? $"₹ {r.EstimatedAmount:N2}" : "—")}
              {TableRow("Purpose",       r.TravelPurpose)}
              {(string.IsNullOrWhiteSpace(r.Notes) ? "" : TableRow("Notes", r.Notes!))}
              {TableRow("Submitted At",  r.SubmittedAt?.ToString("dd MMM yyyy, hh:mm tt") ?? DateTime.UtcNow.ToString("dd MMM yyyy, hh:mm tt") + " UTC")}
            </table>
            <p style="margin:20px 0 8px;font-weight:600;color:#0f172a">Action Required</p>
            <p style="margin:0 0 20px;font-size:13px;color:#6b7280">Please review the request in the portal and approve or reject it with remarks.</p>
            <div style="margin-top:20px">
              <a href="{AppUrl}/hr/approvals/{r.RequestId}" style="display:inline-block;background:#16A34A;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
                ✅ Review &amp; Approve →
              </a>
              <a href="{AppUrl}/hr/approvals/{r.RequestId}" style="display:inline-block;background:#DC2626;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin-left:12px">
                ❌ Review &amp; Reject →
              </a>
            </div>
            """);

    private string StatusUpdateHtml(TravelRequest r, TravelEmployee e, string? comments, bool approved) =>
        WrapEmail(approved ? "#16A34A" : "#DC2626",
                  approved ? "✅ Travel Request Approved" : "❌ Travel Request Rejected",
                  $"""
            <p style="margin:0 0 20px;color:#374151">
              Hi <strong>{H(e.DisplayName)}</strong>,<br/>
              {(approved
                ? "Great news! Your travel request has been <strong style=\"color:#16A34A\">approved</strong>."
                : "Your travel request has been <strong style=\"color:#DC2626\">rejected</strong>. Please review the remarks below and contact HR if needed.")}
            </p>
            <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">
              {TableRow("Request No.",  r.RequestCode)}
              {TableRow("Transport",    r.TransportType)}
              {TableRow("Destination",  r.Destination)}
              {TableRow("Departure",    r.DepartureDate.ToString("dd MMM yyyy"))}
              {TableRow("Return",       r.ReturnDate.ToString("dd MMM yyyy"))}
              {TableRow("Status",       r.Status)}
              {TableRow("Decided At",   r.UpdatedAt.ToString("dd MMM yyyy, hh:mm tt") + " UTC")}
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
              <a href="{AppUrl}/dashboard" style="display:inline-block;background:{(approved ? "#1D4ED8" : "#374151")};color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
                View My Requests →
              </a>
            </div>
            """);

    // =========================================================================
    // HTML TEMPLATES — Expense Claims (new)
    // =========================================================================

    // ── Template 4a: Employee ACK on claim submission ─────────────────────────
    private string ClaimEmployeeAckHtml(ExpenseClaim c, TravelEmployee e, TravelRequest r) =>
        WrapEmail("#1D4ED8", "Expense Claim Received", $"""
            <p style="margin:0 0 20px;color:#374151">
              Hi <strong>{H(e.DisplayName)}</strong>,<br/>
              Your expense claim has been received and is pending review. You will be notified once a decision is made.
            </p>
            <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">
              {TableRow("Claim No.",     c.ClaimCode)}
              {TableRow("Request No.",   r.RequestCode)}
              {TableRow("Employee",      $"{e.DisplayName} ({e.EmployeeCode})")}
              {TableRow("Department",    e.Department ?? "—")}
              {TableRow("Category",      c.Category)}
              {TableRow("Amount",        $"₹ {c.Amount:N2} {c.Currency}")}
              {TableRow("Expense Date",  c.ExpenseDate.ToString("dd MMM yyyy"))}
              {TableRow("Description",   c.Description ?? "—")}
              {TableRow("Submitted At",  c.CreatedAt.ToString("dd MMM yyyy, hh:mm tt") + " UTC")}
            </table>
            <p style="margin:24px 0 0;font-size:13px;color:#6b7280">You can track your claim status on the portal at any time.</p>
            <div style="margin-top:20px">
              <a href="{AppUrl}/dashboard" style="display:inline-block;background:#1D4ED8;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
                View My Claims →
              </a>
            </div>
            """);

    // ── Template 4b: HR notification on claim submission ──────────────────────
    private string ClaimHrNotificationHtml(ExpenseClaim c, TravelEmployee e, TravelRequest r) =>
        WrapEmail("#D97706", $"Expense Claim Review Required — {c.ClaimCode}", $"""
            <p style="margin:0 0 20px;color:#374151">
              Hi <strong>{HrApproverName}</strong>,<br/>
              A new expense claim has been submitted and requires your review.
            </p>
            <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">
              {TableRow("Claim No.",     c.ClaimCode)}
              {TableRow("Request No.",   r.RequestCode)}
              {TableRow("Employee",      $"{e.DisplayName} ({e.EmployeeCode})")}
              {TableRow("Department",    e.Department ?? "—")}
              {TableRow("Category",      c.Category)}
              {TableRow("Amount",        $"₹ {c.Amount:N2} {c.Currency}")}
              {TableRow("Expense Date",  c.ExpenseDate.ToString("dd MMM yyyy"))}
              {TableRow("Description",   c.Description ?? "—")}
              {TableRow("Submitted At",  c.CreatedAt.ToString("dd MMM yyyy, hh:mm tt") + " UTC")}
            </table>
            <p style="margin:20px 0 8px;font-weight:600;color:#0f172a">Action Required</p>
            <p style="margin:0 0 20px;font-size:13px;color:#6b7280">
              Please review the claim details (and any attached bill) in the portal, then approve or reject it.
            </p>
            <div style="margin-top:20px">
              <a href="{AppUrl}/hr/expenses/{c.ClaimId}" style="display:inline-block;background:#16A34A;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
                ✅ Review &amp; Approve →
              </a>
              <a href="{AppUrl}/hr/expenses/{c.ClaimId}" style="display:inline-block;background:#DC2626;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin-left:12px">
                ❌ Review &amp; Reject →
              </a>
            </div>
            """);

    // ── Template 5: Claim approve / reject → employee ─────────────────────────
    private string ClaimStatusUpdateHtml(ExpenseClaim c, TravelEmployee e, string? comments, bool approved) =>
        WrapEmail(approved ? "#16A34A" : "#DC2626",
                  approved ? "✅ Expense Claim Approved" : "❌ Expense Claim Rejected",
                  $"""
            <p style="margin:0 0 20px;color:#374151">
              Hi <strong>{H(e.DisplayName)}</strong>,<br/>
              {(approved
                ? "Great news! Your expense claim has been <strong style=\"color:#16A34A\">approved</strong> and will be reimbursed shortly."
                : "Your expense claim has been <strong style=\"color:#DC2626\">rejected</strong>. Please review the remarks below and contact HR if needed.")}
            </p>
            <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">
              {TableRow("Claim No.",    c.ClaimCode)}
              {TableRow("Category",     c.Category)}
              {TableRow("Amount",       $"₹ {c.Amount:N2} {c.Currency}")}
              {TableRow("Expense Date", c.ExpenseDate.ToString("dd MMM yyyy"))}
              {TableRow("Status",       c.Status)}
              {TableRow("Decided At",   (c.ApprovedAt ?? DateTime.UtcNow).ToString("dd MMM yyyy, hh:mm tt") + " UTC")}
              {(string.IsNullOrWhiteSpace(comments) ? "" : TableRow("HR Remarks", comments!))}
            </table>
            {(approved ? $"""
            <div style="margin-top:20px;padding:14px 18px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:13px;color:#166534">
              Your reimbursement will be processed in the next payment cycle. Please ensure your bank details are up to date on the portal.
            </div>
            """ : $"""
            <div style="margin-top:20px;padding:14px 18px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:13px;color:#991b1b">
              If you believe this decision was made in error, please reach out to HR or your reporting manager.
            </div>
            """)}
            <div style="margin-top:24px">
              <a href="{AppUrl}/dashboard" style="display:inline-block;background:{(approved ? "#1D4ED8" : "#374151")};color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
                View My Claims →
              </a>
            </div>
            """);

    // ── Template 6: Reimbursement confirmation → employee ─────────────────────
    private string ClaimReimbursedHtml(ExpenseClaim c, TravelEmployee e) =>
        WrapEmail("#0F766E", "💰 Reimbursement Processed", $"""
            <p style="margin:0 0 20px;color:#374151">
              Hi <strong>{H(e.DisplayName)}</strong>,<br/>
              Great news! Your expense claim reimbursement has been processed successfully.
            </p>
            <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">
              {TableRow("Claim No.",       c.ClaimCode)}
              {TableRow("Category",        c.Category)}
              {TableRow("Amount",          $"₹ {c.Amount:N2} {c.Currency}")}
              {TableRow("Expense Date",    c.ExpenseDate.ToString("dd MMM yyyy"))}
              {TableRow("Status",          "Reimbursed")}
              {TableRow("Reimbursed At",   (c.ReimbursedAt ?? DateTime.UtcNow).ToString("dd MMM yyyy, hh:mm tt") + " UTC")}
            </table>
            <div style="margin-top:20px;padding:14px 18px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;font-size:13px;color:#134e4a">
              The reimbursement amount of <strong>₹ {c.Amount:N2}</strong> has been processed. 
              Please allow 1–2 business days for the funds to reflect in your account.
            </div>
            <div style="margin-top:24px">
              <a href="{AppUrl}/dashboard" style="display:inline-block;background:#0F766E;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
                View My Claims →
              </a>
            </div>
            """);
}