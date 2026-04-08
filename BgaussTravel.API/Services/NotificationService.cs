// Services/NotificationService.cs
// Sends email notifications to HR when an employee submits an expense.
// Uses plain SMTP (System.Net.Mail) — swap for Microsoft Graph if preferred.

using System.Net;
using System.Net.Mail;
using Microsoft.EntityFrameworkCore;
using BgaussTravel.API.Data;
using BgaussTravel.API.Models;


namespace BgaussTravel.API.Services;

public class NotificationService
{
    private readonly AppDbContext db;
    private readonly IConfiguration config;
    private readonly ILogger<NotificationService> logger;

    public NotificationService(AppDbContext db, IConfiguration config, ILogger<NotificationService> logger)
    {
        this.db = db;
        this.config = config;
        this.logger = logger;
    }
    public async Task SendClaimEmailAsync(
        ExpenseClaim    claim,
        TravelEmployee  employee,
        TravelRequest   request)
    {
        try
        {
            var hrUsers = await db.TravelEmployees
                .Where(e => (e.Role == "HR" || e.Role == "Admin") && e.IsActive)
                .Select(e => e.Email)
                .ToListAsync();

            if (!hrUsers.Any()) return;

            var smtp = config.GetSection("Smtp");
            using var client = new SmtpClient(smtp["Host"], int.Parse(smtp["Port"] ?? "587"))
            {
                Credentials    = new NetworkCredential(smtp["User"], smtp["Password"]),
                EnableSsl      = true,
                DeliveryMethod = SmtpDeliveryMethod.Network,
            };

            var subject = $"[BGauss Travel] New Expense Claim {claim.ClaimCode} — {employee.DisplayName}";
            var body    = $"""
                <html><body style="font-family:Segoe UI,sans-serif;color:#1a1a1a">
                  <div style="max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
                    <div style="background:#D83B34;padding:24px 28px">
                      <h2 style="color:#fff;margin:0">BGauss Travel — New Expense Claim</h2>
                    </div>
                    <div style="padding:28px">
                      <table style="width:100%;border-collapse:collapse">
                        <tr><td style="padding:8px 0;color:#6b7280;width:140px">Request ID</td>
                            <td style="padding:8px 0;font-weight:600">{request.RequestCode}</td></tr>
                        <tr><td style="padding:8px 0;color:#6b7280">Claim ID</td>
                            <td style="padding:8px 0;font-weight:600">{claim.ClaimCode}</td></tr>
                        <tr><td style="padding:8px 0;color:#6b7280">Employee</td>
                            <td style="padding:8px 0">{employee.DisplayName} ({employee.Department})</td></tr>
                        <tr><td style="padding:8px 0;color:#6b7280">Category</td>
                            <td style="padding:8px 0">{claim.Category}</td></tr>
                        <tr><td style="padding:8px 0;color:#6b7280">Amount</td>
                            <td style="padding:8px 0;font-weight:700;color:#D83B34">
                              {claim.Currency} {claim.Amount:N2}</td></tr>
                        <tr><td style="padding:8px 0;color:#6b7280">Date</td>
                            <td style="padding:8px 0">{claim.ExpenseDate}</td></tr>
                        <tr><td style="padding:8px 0;color:#6b7280">Description</td>
                            <td style="padding:8px 0">{claim.Description ?? "—"}</td></tr>
                        <tr><td style="padding:8px 0;color:#6b7280">Bill</td>
                            <td style="padding:8px 0">{(claim.BillFileName != null ? "Attached" : "No bill uploaded")}</td></tr>
                      </table>
                      <div style="margin-top:24px">
                        <a href="{config["AppUrl"]}/hr/expenses/{claim.ClaimId}"
                           style="background:#D83B34;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-weight:600">
                          Review in Portal →
                        </a>
                      </div>
                    </div>
                    <div style="background:#f9fafb;padding:16px 28px;font-size:12px;color:#9ca3af">
                      BGauss Travel Booking System · Auto-generated notification
                    </div>
                  </div>
                </body></html>
                """;

            var from = smtp["From"] ?? smtp["User"] ?? "travel@bgauss.com";

            foreach (var hrEmail in hrUsers)
            {
                var mail = new MailMessage(from, hrEmail, subject, body) { IsBodyHtml = true };
                await client.SendMailAsync(mail);
                logger.LogInformation("Email sent to HR {Email} for claim {Code}", hrEmail, claim.ClaimCode);
            }

            // Mark notifications as email-sent in DB
            var notifications = await db.TravelNotifications
                .Where(n => n.ClaimId == claim.ClaimId && !n.EmailSent)
                .ToListAsync();

            foreach (var n in notifications)
            {
                n.EmailSent = true;
            }

            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send email for claim {Code}", claim.ClaimCode);
            // Non-fatal — real-time SignalR already fired
        }
    }
}