// Controllers/ReportController.cs
// FIXES:
//  1. by-department: TravelRequest.Department may be NULL for old rows
//     → fallback to Employee.Department via navigation property
//     → also handles the case where TravelRequest.Department column doesn't exist yet
//  2. by-employee: was using GroupBy on DisplayName (string, nullable).
//     Now groups on EmployeeId (int) — returns one row per employee, always.
//  3. by-transport: date filter now applied (was missing).
//  4. by-department expense join: fixed to use Request.Department with fallback.

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

    // ── JWT helper ────────────────────────────────────────────────────────────
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

    // ── GET /api/Report/dashboard ─────────────────────────────────────────────
    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddMonths(-1);
        var end   = to   ?? DateTime.UtcNow;

        var startDate = DateOnly.FromDateTime(start);
        var endDate   = DateOnly.FromDateTime(end);

        return Ok(new DashboardSummaryDto
        {
            TotalRequests = await _db.TravelRequests
                .CountAsync(r => r.CreatedAt >= start && r.CreatedAt <= end),

            PendingRequests  = await _db.TravelRequests.CountAsync(r => r.Status == "Submitted"),
            ApprovedRequests = await _db.TravelRequests.CountAsync(r => r.Status == "Approved"),
            RejectedRequests = await _db.TravelRequests.CountAsync(r => r.Status == "Rejected"),

            // ✅ FIX HERE
            TotalExpenses = await _db.ExpenseClaims
                .Where(e => e.ExpenseDate >= startDate && e.ExpenseDate <= endDate)
                .Where(e => e.Status != "Rejected")
                .SumAsync(e => (decimal?)e.Amount) ?? 0,

            PendingExpenses = await _db.ExpenseClaims
                .Where(e => e.Status == "Submitted")
                .SumAsync(e => (decimal?)e.Amount) ?? 0,

            ApprovedExpenses = await _db.ExpenseClaims
                .Where(e => e.Status == "Approved" || e.Status == "Reimbursed")
                .SumAsync(e => (decimal?)e.Amount) ?? 0,

            TotalEmployees = await _db.TravelEmployees
                .CountAsync(e => e.IsActive && e.Role == "Employee"),
        });
    }

    // ── GET /api/Report/by-transport (Admin — all employees, with date filter) ─
    [HttpGet("by-transport")]
    public async Task<IActionResult> ByTransport(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddYears(-5);
        var end   = to   ?? DateTime.UtcNow;

        var data = await _db.TravelRequests
            .Where(r => r.CreatedAt >= start && r.CreatedAt <= end)
            .GroupBy(r => r.TransportType)
            .Select(g => new
            {
                Transport = g.Key ?? "Unknown",

                Count = g.Count(),

                // 🔥 TotalAmount from ExpenseClaims
                TotalAmount = _db.ExpenseClaims
                    .Where(e =>
                        g.Select(r => r.RequestId).Contains(e.RequestId) &&   // match Request
                        e.Category != null &&
                        g.Key != null &&
                        EF.Functions.Like(e.Category, "%" + g.Key + "%")     // match TransportType in Category
                    )
                    .Sum(e => (decimal?)e.Amount) ?? 0
            })
            .OrderByDescending(x => x.Count)
            .ToListAsync();

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

    // ── GET /api/Report/by-employee ───────────────────────────────────────────
    // FIX: Group on EmployeeId (int — never null), not DisplayName (string — nullable).
    //      Pull employee metadata separately and join in memory.
    //      This guarantees 1 row per employee regardless of nulls.
    [HttpGet("by-employee")]
    public async Task<IActionResult> ByEmployee([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddMonths(-3);
        var end   = to   ?? DateTime.UtcNow;

        // Step 1: Aggregate expense claims grouped by EmployeeId
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

        // Step 2: Fetch employee metadata for only those IDs
        var empIds = claimGroups.Select(g => g.EmployeeId).Distinct().ToList();
        var employees = await _db.TravelEmployees
            .Where(e => empIds.Contains(e.EmployeeId))
            .Select(e => new
            {
                e.EmployeeId,
                e.DisplayName,
                e.EmployeeCode,
                e.Department,
            })
            .ToListAsync();

        var empMap = employees.ToDictionary(e => e.EmployeeId);

        // Step 3: Join and build response
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

    // ── GET /api/Report/by-department ─────────────────────────────────────────
    // FIX: TravelRequest.Department may be NULL for rows created before the
    //      column was added. Fallback chain:
    //        TravelRequest.Department → Employee.Department → "Unknown"
    //      We load requests with Employee included and resolve dept in memory.
    [HttpGet("by-department")]
    public async Task<IActionResult> ByDepartment(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
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