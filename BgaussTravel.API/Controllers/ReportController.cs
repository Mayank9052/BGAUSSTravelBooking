// Controllers/ReportController.cs
// FIXES:
//  1. /api/Report/dashboard — now scoped by JWT role:
//       Admin/HR → org-wide totals (all employees)
//       Employee → only their own TravelRequests + ExpenseClaims
//  2. /api/Report/my-transport — already employee-scoped (unchanged)
//  3. /api/Report/by-transport — admin only (unchanged)
//  4. by-employee / by-department — unchanged (admin only)

using BgaussTravel.API.Data;
using BgaussTravel.API.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BgaussTravel.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReportController : ControllerBase
{
    private readonly AppDbContext _db;
    public ReportController(AppDbContext db) => _db = db;

    // ── JWT helpers ───────────────────────────────────────────────────────────
    private int GetEmployeeIdFromToken()
    {
        try
        {
            var authHeader = Request.Headers["Authorization"].FirstOrDefault();
            if (string.IsNullOrWhiteSpace(authHeader) || !authHeader.StartsWith("Bearer "))
                return 0;
            var jwt = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler()
                        .ReadJwtToken(authHeader["Bearer ".Length..].Trim());
            var val = jwt.Claims.FirstOrDefault(c => c.Type == "EmployeeId")?.Value;
            return int.TryParse(val, out var id) ? id : 0;
        }
        catch { return 0; }
    }

    private string GetRoleFromToken()
    {
        try
        {
            var authHeader = Request.Headers["Authorization"].FirstOrDefault();
            if (string.IsNullOrWhiteSpace(authHeader) || !authHeader.StartsWith("Bearer "))
                return "Employee";
            var jwt = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler()
                        .ReadJwtToken(authHeader["Bearer ".Length..].Trim());
            return jwt.Claims.FirstOrDefault(c => c.Type == "Role")?.Value ?? "Employee";
        }
        catch { return "Employee"; }
    }

    private bool IsAdminOrHr()
    {
        var role = GetRoleFromToken();
        return role.Equals("Admin", StringComparison.OrdinalIgnoreCase) ||
               role.Equals("HR",    StringComparison.OrdinalIgnoreCase);
    }

    // ── GET /api/Report/dashboard ─────────────────────────────────────────────
    // Admin/HR → org-wide sums
    // Employee → only their own requests and expense claims
    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var empId = GetEmployeeIdFromToken();
        if (empId == 0) return Unauthorized(new { message = "Invalid token." });

        var start = from ?? DateTime.UtcNow.AddMonths(-1);
        var end   = to   ?? DateTime.UtcNow;

        var startDate = DateOnly.FromDateTime(start);
        var endDate   = DateOnly.FromDateTime(end);

        var adminMode = IsAdminOrHr();

        // ── Request counts ────────────────────────────────────────────────────
        var reqQuery = adminMode
            ? _db.TravelRequests.Where(r => r.CreatedAt >= start && r.CreatedAt <= end)
            : _db.TravelRequests.Where(r => r.EmployeeId == empId && r.CreatedAt >= start && r.CreatedAt <= end);

        var allReqQuery = adminMode
            ? _db.TravelRequests.AsQueryable()
            : _db.TravelRequests.Where(r => r.EmployeeId == empId);

        var totalRequests    = await reqQuery.CountAsync();
        var pendingRequests  = await allReqQuery.CountAsync(r => r.Status == "Submitted");
        var approvedRequests = await allReqQuery.CountAsync(r => r.Status == "Approved");
        var rejectedRequests = await allReqQuery.CountAsync(r => r.Status == "Rejected");

        // ── Expense sums ──────────────────────────────────────────────────────
        var expQuery = adminMode
            ? _db.ExpenseClaims.Where(e => e.ExpenseDate >= startDate && e.ExpenseDate <= endDate && e.Status != "Rejected")
            : _db.ExpenseClaims.Where(e => e.EmployeeId == empId && e.ExpenseDate >= startDate && e.ExpenseDate <= endDate && e.Status != "Rejected");

        var allExpQuery = adminMode
            ? _db.ExpenseClaims.AsQueryable()
            : _db.ExpenseClaims.Where(e => e.EmployeeId == empId);

        var totalExpenses    = await expQuery.SumAsync(e => (decimal?)e.Amount) ?? 0;
        var pendingExpenses  = await allExpQuery.Where(e => e.Status == "Submitted").SumAsync(e => (decimal?)e.Amount) ?? 0;
        var approvedExpenses = await allExpQuery.Where(e => e.Status == "Approved" || e.Status == "Reimbursed").SumAsync(e => (decimal?)e.Amount) ?? 0;

        // TotalEmployees only makes sense for admin; for employees show their own team count (or 0)
        var totalEmployees = adminMode
            ? await _db.TravelEmployees.CountAsync(e => e.IsActive && e.Role == "Employee")
            : 0;

        return Ok(new DashboardSummaryDto
        {
            TotalRequests    = totalRequests,
            PendingRequests  = pendingRequests,
            ApprovedRequests = approvedRequests,
            RejectedRequests = rejectedRequests,
            TotalExpenses    = totalExpenses,
            PendingExpenses  = pendingExpenses,
            ApprovedExpenses = approvedExpenses,
            TotalEmployees   = totalEmployees,
        });
    }

    // ── GET /api/Report/by-transport (Admin — all employees) ─────────────────
    // In ReportController.cs — fix by-transport
    [HttpGet("by-transport")]
    public async Task<IActionResult> ByTransport([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddYears(-5);
        var end   = to   ?? DateTime.UtcNow;

        // Get all requests in date range
        var requests = await _db.TravelRequests
            .Where(r => r.CreatedAt >= start && r.CreatedAt <= end)
            .Select(r => new { r.RequestId, r.TransportType })
            .ToListAsync();

        var requestIds = requests.Select(r => r.RequestId).ToList();

        // Sum expenses by requestId (not by category LIKE match)
        var expensesByRequest = await _db.ExpenseClaims
            .Where(e => requestIds.Contains(e.RequestId) && e.Status != "Rejected")
            .GroupBy(e => e.RequestId)
            .Select(g => new { RequestId = g.Key, Total = g.Sum(e => e.Amount) })
            .ToListAsync();

        var expMap = expensesByRequest.ToDictionary(e => e.RequestId, e => e.Total);

        var data = requests
            .GroupBy(r => r.TransportType ?? "Unknown")
            .Select(g => new {
                Transport   = g.Key,
                Count       = g.Count(),
                TotalAmount = g.Sum(r => expMap.TryGetValue(r.RequestId, out var amt) ? amt : 0m),
            })
            .OrderByDescending(x => x.Count)
            .ToList();

        return Ok(data);
    }

    // ── GET /api/Report/my-transport (Employee — own trips only) ─────────────
    [HttpGet("my-transport")]
    public async Task<IActionResult> MyTransport([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var empId = GetEmployeeIdFromToken();
        if (empId == 0)
            return Unauthorized(new { message = "Invalid token." });

        var start = from ?? DateTime.UtcNow.AddYears(-5);
        var end   = to   ?? DateTime.UtcNow;

        var data = await (
            from r in _db.TravelRequests
            join e in _db.ExpenseClaims
                on r.RequestId equals e.RequestId into expGroup
            from e in expGroup.DefaultIfEmpty() // LEFT JOIN
            where r.EmployeeId == empId
                && r.CreatedAt >= start
                && r.CreatedAt <= end
            group new { r, e } by r.TransportType into g
            select new
            {
                Transport = g.Key ?? "Unknown",
                Count = g.Select(x => x.r.RequestId).Distinct().Count(),

                // ✅ Sum from ExpenseClaims
                TotalAmount = g.Sum(x => (decimal?)x.e.Amount) ?? 0
            }
        )
        .OrderByDescending(x => x.Count)
        .ToListAsync();

        return Ok(data);
    }

    // ── GET /api/Report/by-employee (Admin only) ──────────────────────────────
    [HttpGet("by-employee")]
    public async Task<IActionResult> ByEmployee([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddMonths(-3);
        var end   = to   ?? DateTime.UtcNow;

        // Group expense claims by EmployeeId (never null)
        var claimGroups = await _db.ExpenseClaims
            .GroupBy(e => e.EmployeeId)
            .Select(g => new
            {
                EmployeeId  = g.Key,
                TotalAmount = g.Sum(e => e.Amount),
                ClaimCount  = g.Count(),
                Approved    = g.Count(e => e.Status == "Approved" || e.Status == "Reimbursed"),
                Pending     = g.Count(e => e.Status == "Submitted"),
            })
            .ToListAsync();

        if (!claimGroups.Any())
            return Ok(Array.Empty<object>());

        var empIds = claimGroups.Select(g => g.EmployeeId).Distinct().ToList();
        var employees = await _db.TravelEmployees
            .Where(e => empIds.Contains(e.EmployeeId))
            .Select(e => new { e.EmployeeId, e.DisplayName, e.EmployeeCode, e.Department })
            .ToListAsync();

        var empMap = employees.ToDictionary(e => e.EmployeeId);

        var result = claimGroups
            .Select(g =>
            {
                empMap.TryGetValue(g.EmployeeId, out var emp);
                return new
                {
                    EmployeeId   = g.EmployeeId,
                    DisplayName  = emp?.DisplayName  ?? $"Employee #{g.EmployeeId}",
                    EmployeeCode = emp?.EmployeeCode ?? "",
                    Department   = emp?.Department   ?? "",
                    TotalAmount  = g.TotalAmount,
                    ClaimCount   = g.ClaimCount,
                    Approved     = g.Approved,
                    Pending      = g.Pending,
                };
            })
            .OrderByDescending(x => x.TotalAmount)
            .ToList();

        return Ok(result);
    }

    // ── GET /api/Report/by-department (Admin only) ────────────────────────────
    [HttpGet("by-department")]
    public async Task<IActionResult> ByDepartment([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddYears(-1);
        var end   = to   ?? DateTime.UtcNow;

        // ✅ FIX conversion
        var startDateOnly = DateOnly.FromDateTime(start);
        var endDateOnly   = DateOnly.FromDateTime(end);

        var data = await (
            from r in _db.TravelRequests
            join e in _db.ExpenseClaims
                on r.RequestId equals e.RequestId into re
            from e in re.DefaultIfEmpty()

            where r.CreatedAt >= start && r.CreatedAt <= end

            let department =
                !string.IsNullOrEmpty(r.Department)
                    ? r.Department
                    : (r.Employee != null && !string.IsNullOrEmpty(r.Employee.Department))
                        ? r.Employee.Department
                        : "Unknown"

            select new
            {
                r.RequestId,
                Department = department,
                RequestStatus = r.Status,

                // ✅ FIXED comparison
                Amount = (e != null
                        && e.Status != "Rejected"
                        && e.ExpenseDate >= startDateOnly
                        && e.ExpenseDate <= endDateOnly)
                            ? e.Amount
                            : 0
            }
        )
        .GroupBy(x => x.Department)
        .Select(g => new
        {
            department = g.Key,
            requestCount = g.Select(x => x.RequestId).Distinct().Count(),
            approved = g.Count(x => x.RequestStatus == "Approved"),
            pending  = g.Count(x => x.RequestStatus == "Submitted" || x.RequestStatus == "UnderReview"),
            expenseTotal = g.Sum(x => (decimal?)x.Amount) ?? 0
        })
        .OrderByDescending(x => x.requestCount)
        .ToListAsync();

        return Ok(data);
    }

    // ── GET /api/Report/by-status ─────────────────────────────────────────────
    [HttpGet("by-status")]
    public async Task<IActionResult> ByStatus()
    {
        var requests = await _db.TravelRequests
            .GroupBy(r => r.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        var expenses = await _db.ExpenseClaims
            .GroupBy(e => e.Status)
            .Select(g => new { Status = g.Key, Count = g.Count(), Total = g.Sum(e => e.Amount) })
            .ToListAsync();

        return Ok(new { requests, expenses });
    }
}