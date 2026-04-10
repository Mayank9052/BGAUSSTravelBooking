// Controllers/ApprovalController.cs

using BgaussTravel.API.Data;
using BgaussTravel.API.DTOs;
using BgaussTravel.API.Models;
using BgaussTravel.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;

namespace BgaussTravel.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ApprovalController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITravelNotificationService _notify;

    public ApprovalController(AppDbContext db, ITravelNotificationService notify)
    { _db = db; _notify = notify; }

    int GetEmployeeIdFromToken()
    {
        try
        {
            var authHeader = Request.Headers["Authorization"].FirstOrDefault();
            if (string.IsNullOrWhiteSpace(authHeader) || !authHeader.StartsWith("Bearer "))
                return 0;
            var jwt = new JwtSecurityTokenHandler().ReadJwtToken(authHeader["Bearer ".Length..].Trim());
            var val = jwt.Claims.FirstOrDefault(c => c.Type == "EmployeeId")?.Value;
            return int.TryParse(val, out var id) ? id : 0;
        }
        catch { return 0; }
    }

    // ── GET /api/Approval/summary ─────────────────────────────────────────────
    // Powers the HR/Admin stat cards on the dashboard.
    // Returns counts for every request status + resolved list for History tab.
    [HttpGet("summary")]
    public async Task<IActionResult> Summary()
    {
        // One DB round-trip: group all TravelRequests by status
        var statusCounts = await _db.TravelRequests
            .GroupBy(r => r.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        var countByStatus = statusCounts.ToDictionary(x => x.Status, x => x.Count);

        int Get(string s) => countByStatus.TryGetValue(s, out var c) ? c : 0;

        // Expense pipeline: sum of all Submitted expense claim amounts
        var expensePipeline = await _db.ExpenseClaims
            .Where(e => e.Status == "Submitted")
            .SumAsync(e => (decimal?)e.Amount) ?? 0m;

        // Resolved requests (Approved + Rejected) for the History sub-tab
        var resolvedRequests = await _db.TravelRequests
            .Include(r => r.Employee)
            .Where(r => r.Status == "Approved" || r.Status == "Rejected")
            .OrderByDescending(r => r.UpdatedAt)
            .Select(r => new
            {
                requestId       = r.RequestId,
                requestCode     = r.RequestCode,
                travelPurpose   = r.TravelPurpose,
                destination     = r.Destination,
                transportType   = r.TransportType,
                departureDate   = r.DepartureDate,
                returnDate      = r.ReturnDate,
                estimatedAmount = r.EstimatedAmount,
                status          = r.Status,
                submittedAt     = r.SubmittedAt,
                createdAt       = r.CreatedAt,
                updatedAt       = r.UpdatedAt,
                notes           = r.Notes,
                employeeId      = r.Employee.EmployeeId,
                employeeName    = r.Employee.DisplayName,
                employeeCode    = r.Employee.EmployeeCode,
                department      = r.Employee.Department,
                expenseClaims   = new List<object>(),
            })
            .ToListAsync();

        return Ok(new
        {
            // Counts for stat cards
            pendingApprovals  = Get("Submitted") + Get("UnderReview"),
            approvedCount     = Get("Approved"),
            rejectedCount     = Get("Rejected"),
            draftCount        = Get("Draft"),
            totalRequests     = statusCounts.Sum(x => x.Count),
            expensePipeline,          // ₹ sum of pending expense claims

            // Full resolved list — avoids a second API call from the frontend
            resolvedRequests,
        });
    }

    // ── GET /api/Approval/pending ─────────────────────────────────────────────
    [HttpGet("pending")]
    public async Task<IActionResult> Pending()
    {
        var requests = await _db.TravelRequests
            .Include(r => r.Employee)
            .Include(r => r.ExpenseClaims)
            .Where(r => r.Status == "Submitted" || r.Status == "UnderReview")
            .OrderBy(r => r.CreatedAt)
            .Select(r => new
            {
                requestId       = r.RequestId,
                requestCode     = r.RequestCode,
                travelPurpose   = r.TravelPurpose,
                destination     = r.Destination,
                transportType   = r.TransportType,
                departureDate   = r.DepartureDate,
                returnDate      = r.ReturnDate,
                estimatedAmount = r.EstimatedAmount,
                status          = r.Status,
                submittedAt     = r.SubmittedAt,
                createdAt       = r.CreatedAt,
                notes           = r.Notes,
                employeeId      = r.Employee.EmployeeId,
                employeeName    = r.Employee.DisplayName,
                employeeCode    = r.Employee.EmployeeCode,
                department      = r.Employee.Department,
                expenseClaims   = new List<object>(),
            })
            .ToListAsync();

        var expenses = await _db.ExpenseClaims
            .Include(e => e.Employee)
            .Include(e => e.Request)
            .Where(e => e.Status == "Submitted")
            .OrderBy(e => e.CreatedAt)
            .Select(e => new
            {
                e.ClaimId, e.ClaimCode, e.Category, e.Amount, e.Currency,
                e.ExpenseDate, e.Description, e.Status, e.CreatedAt,
                e.BillFileName,
                requestCode  = e.Request.RequestCode,
                employeeName = e.Employee.DisplayName,
                employeeCode = e.Employee.EmployeeCode,
            })
            .ToListAsync();

        return Ok(new { pendingRequests = requests, pendingExpenses = expenses });
    }

    // ── POST /api/Approval/request/{id} ──────────────────────────────────────
    [HttpPost("request/{id:int}")]
    public async Task<IActionResult> ActionOnRequest(int id, [FromBody] ApprovalActionDto dto)
    {
        var approverId = GetEmployeeIdFromToken();
        if (approverId == 0) return Unauthorized(new { message = "Invalid or missing token." });

        var request = await _db.TravelRequests
            .Include(r => r.Employee)
            .FirstOrDefaultAsync(r => r.RequestId == id);
        if (request == null) return NotFound(new { message = "Request not found." });

        var action = dto.Action.Trim().ToLower();
        if (action != "approve" && action != "reject")
            return BadRequest(new { message = "Action must be 'approve' or 'reject'." });

        _db.TravelApprovals.Add(new TravelApproval
        {
            RequestId  = id,
            ApproverId = approverId,
            Level      = 1,
            Action     = action == "approve" ? "Approved" : "Rejected",
            Comments   = dto.Comments,
            ActionAt   = DateTime.UtcNow,
            CreatedAt  = DateTime.UtcNow,
        });

        request.Status    = action == "approve" ? "Approved" : "Rejected";
        request.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _notify.NotifyUserAsync(request.EmployeeId, approverId, "TravelRequest",
            $"Travel Request {(action == "approve" ? "Approved ✅" : "Rejected ❌")}",
            $"Your request {request.RequestCode} ({request.Destination}) has been {request.Status.ToLower()}." +
            (dto.Comments != null ? $" Remarks: {dto.Comments}" : ""),
            requestId: request.RequestId);

        return Ok(new { request.RequestId, request.RequestCode, request.Status });
    }

    // ── GET /api/Approval/history/{requestId} ────────────────────────────────
    [HttpGet("history/{requestId:int}")]
    public async Task<IActionResult> History(int requestId)
    {
        var rows = await _db.TravelApprovals
            .Include(a => a.Approver)
            .Where(a => a.RequestId == requestId)
            .OrderBy(a => a.CreatedAt)
            .Select(a => new ApprovalResponseDto
            {
                ApprovalId   = a.ApprovalId, RequestId    = a.RequestId,
                ApproverId   = a.ApproverId, ApproverName = a.Approver.DisplayName,
                Level        = a.Level,      Action       = a.Action,
                Comments     = a.Comments,   ActionAt     = a.ActionAt,
                CreatedAt    = a.CreatedAt,
            })
            .ToListAsync();
        return Ok(rows);
    }
}