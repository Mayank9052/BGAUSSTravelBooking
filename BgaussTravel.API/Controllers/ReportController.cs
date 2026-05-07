// Controllers/ReportController.cs
// FIXES:
//  1. /api/Report/dashboard — scoped by JWT role (Admin/HR = org-wide, Employee = own)
//  2. Date filtering now uses DepartureDate / ReturnDate (DateOnly) for TravelRequests
//     instead of CreatedAt — this ensures approved trips with expenses show up correctly
//  3. /api/Report/by-transport — uses DepartureDate range
//  4. /api/Report/my-transport — uses DepartureDate range
//  5. /api/Report/by-employee — uses ExpenseClaim.ExpenseDate (already DateOnly)
//  6. /api/Report/by-department — uses DepartureDate range
//  7. Multiple ExpenseClaims per TravelRequest all included (no category-match filter)

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
    // Date filter: TravelRequests by DepartureDate, ExpenseClaims by ExpenseDate
    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var empId = GetEmployeeIdFromToken();
        if (empId == 0) return Unauthorized(new { message = "Invalid token." });

        var start = from ?? DateTime.UtcNow.AddMonths(-1);
        var end   = to   ?? DateTime.UtcNow;

        // Convert to DateOnly for DepartureDate / ExpenseDate filtering
        var startDate = DateOnly.FromDateTime(start);
        var endDate   = DateOnly.FromDateTime(end);

        var adminMode = IsAdminOrHr();

        // ── TravelRequest counts filtered by DepartureDate ────────────────────
        // Using DepartureDate (DateOnly) so approved trips in the travel window appear
        var reqQuery = adminMode
            ? _db.TravelRequests.Where(r => r.DepartureDate >= startDate && r.DepartureDate <= endDate)
            : _db.TravelRequests.Where(r => r.EmployeeId == empId && r.DepartureDate >= startDate && r.DepartureDate <= endDate);

        // All-time status counts (not date-limited) for pending/approved/rejected totals
        var allReqQuery = adminMode
            ? _db.TravelRequests.AsQueryable()
            : _db.TravelRequests.Where(r => r.EmployeeId == empId);

        var totalRequests    = await reqQuery.CountAsync();
        var pendingRequests  = await allReqQuery.CountAsync(r => r.Status == "Submitted");
        var approvedRequests = await allReqQuery.CountAsync(r => r.Status == "Approved");
        var rejectedRequests = await allReqQuery.CountAsync(r => r.Status == "Rejected");

        // ── Expense sums filtered by ExpenseDate ──────────────────────────────
        var expQuery = adminMode
            ? _db.ExpenseClaims.Where(e => e.ExpenseDate >= startDate && e.ExpenseDate <= endDate && e.Status != "Rejected")
            : _db.ExpenseClaims.Where(e => e.EmployeeId == empId && e.ExpenseDate >= startDate && e.ExpenseDate <= endDate && e.Status != "Rejected");

        var allExpQuery = adminMode
            ? _db.ExpenseClaims.AsQueryable()
            : _db.ExpenseClaims.Where(e => e.EmployeeId == empId);

        var totalExpenses    = await expQuery.SumAsync(e => (decimal?)e.Amount) ?? 0;
        var pendingExpenses  = await allExpQuery.Where(e => e.Status == "Submitted").SumAsync(e => (decimal?)e.Amount) ?? 0;
        var approvedExpenses = await allExpQuery.Where(e => e.Status == "Approved" || e.Status == "Reimbursed").SumAsync(e => (decimal?)e.Amount) ?? 0;

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
    // Date filter: TravelRequest.DepartureDate (DateOnly)
    // Expense sum: ALL ExpenseClaims linked to matching TravelRequests (no category filter)
    [HttpGet("by-transport")]
    public async Task<IActionResult> ByTransport([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddYears(-5);
        var end   = to   ?? DateTime.UtcNow;

        // ✅ FIX: filter by DepartureDate (DateOnly) not CreatedAt
        var startDate = DateOnly.FromDateTime(start);
        var endDate   = DateOnly.FromDateTime(end);

        // Get all requests in departure-date range
        var requests = await _db.TravelRequests
            .Where(r => r.DepartureDate >= startDate && r.DepartureDate <= endDate)
            .Select(r => new { r.RequestId, r.TransportType })
            .ToListAsync();

        if (!requests.Any())
            return Ok(Array.Empty<object>());

        var requestIds = requests.Select(r => r.RequestId).ToList();

        // ✅ FIX: Sum ALL expenses for the request (no LIKE category filter)
        // This picks up all expense rows submitted under the same TravelRequest
        var expensesByRequest = await _db.ExpenseClaims
            .Where(e => requestIds.Contains(e.RequestId) && e.Status != "Rejected")
            .GroupBy(e => e.RequestId)
            .Select(g => new { RequestId = g.Key, Total = g.Sum(e => e.Amount) })
            .ToListAsync();

        var expMap = expensesByRequest.ToDictionary(e => e.RequestId, e => e.Total);

        var data = requests
            .GroupBy(r => r.TransportType ?? "Unknown")
            .Select(g => new {
                transport   = g.Key,
                count       = g.Count(),
                totalAmount = g.Sum(r => expMap.TryGetValue(r.RequestId, out var amt) ? amt : 0m),
            })
            .OrderByDescending(x => x.count)
            .ToList();

        return Ok(data);
    }

    // ── GET /api/Report/my-transport (Employee — own trips only) ─────────────
    // Date filter: TravelRequest.DepartureDate (DateOnly)
    [HttpGet("my-transport")]
    public async Task<IActionResult> MyTransport([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var empId = GetEmployeeIdFromToken();
        if (empId == 0)
            return Unauthorized(new { message = "Invalid token." });

        var start = from ?? DateTime.UtcNow.AddYears(-5);
        var end   = to   ?? DateTime.UtcNow;

        // ✅ FIX: filter by DepartureDate (DateOnly)
        var startDate = DateOnly.FromDateTime(start);
        var endDate   = DateOnly.FromDateTime(end);

        // Pull employee's requests in range, then join all their expense claims
        var requests = await _db.TravelRequests
            .Where(r => r.EmployeeId == empId
                     && r.DepartureDate >= startDate
                     && r.DepartureDate <= endDate)
            .Select(r => new { r.RequestId, r.TransportType })
            .ToListAsync();

        if (!requests.Any())
            return Ok(Array.Empty<object>());

        var requestIds = requests.Select(r => r.RequestId).ToList();

        // ✅ FIX: ALL expense claims for these requests, no category filter
        var expensesByRequest = await _db.ExpenseClaims
            .Where(e => requestIds.Contains(e.RequestId) && e.Status != "Rejected")
            .GroupBy(e => e.RequestId)
            .Select(g => new { RequestId = g.Key, Total = g.Sum(e => e.Amount) })
            .ToListAsync();

        var expMap = expensesByRequest.ToDictionary(e => e.RequestId, e => e.Total);

        var data = requests
            .GroupBy(r => r.TransportType ?? "Unknown")
            .Select(g => new {
                transport   = g.Key,
                count       = g.Count(),
                totalAmount = g.Sum(r => expMap.TryGetValue(r.RequestId, out var amt) ? amt : 0m),
            })
            .OrderByDescending(x => x.count)
            .ToList();

        return Ok(data);
    }

    // ── GET /api/Report/by-employee (Admin only) ──────────────────────────────
    // Groups expense claims by employee.
    // Date filter on ExpenseClaim.ExpenseDate (DateOnly)
    [HttpGet("by-employee")]
    public async Task<IActionResult> ByEmployee([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddMonths(-3);
        var end   = to   ?? DateTime.UtcNow;

        var startDate = DateOnly.FromDateTime(start);
        var endDate   = DateOnly.FromDateTime(end);

        // ✅ FIX: Apply date filter on ExpenseDate so recent expenses appear
        var claimGroups = await _db.ExpenseClaims
            .Where(e => e.ExpenseDate >= startDate && e.ExpenseDate <= endDate)
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
    // Date filter: TravelRequest.DepartureDate (DateOnly)
    // expenseTotal = sum of all ExpenseClaims linked to requests in that dept & date range
    [HttpGet("by-department")]
    public async Task<IActionResult> ByDepartment([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddYears(-1);
        var end   = to   ?? DateTime.UtcNow;

        // ✅ FIX: use DepartureDate (DateOnly) for the travel-request window
        var startDate = DateOnly.FromDateTime(start);
        var endDate   = DateOnly.FromDateTime(end);

        // Pull requests in departure window
        var requests = await _db.TravelRequests
            .Where(r => r.DepartureDate >= startDate && r.DepartureDate <= endDate)
            .Select(r => new
            {
                r.RequestId,
                r.Status,
                Department = !string.IsNullOrEmpty(r.Department)
                    ? r.Department
                    : (r.Employee != null && !string.IsNullOrEmpty(r.Employee.Department)
                        ? r.Employee.Department
                        : "Unknown"),
            })
            .ToListAsync();

        if (!requests.Any())
            return Ok(Array.Empty<object>());

        var requestIds = requests.Select(r => r.RequestId).ToList();

        // ✅ FIX: sum ALL expense claims for these requests (no category filter)
        var expensesByRequest = await _db.ExpenseClaims
            .Where(e => requestIds.Contains(e.RequestId) && e.Status != "Rejected")
            .GroupBy(e => e.RequestId)
            .Select(g => new { RequestId = g.Key, Total = g.Sum(e => e.Amount) })
            .ToListAsync();

        var expMap = expensesByRequest.ToDictionary(e => e.RequestId, e => e.Total);

        var data = requests
            .GroupBy(r => r.Department)
            .Select(g => new
            {
                department   = g.Key,
                requestCount = g.Count(),
                approved     = g.Count(r => r.Status == "Approved"),
                pending      = g.Count(r => r.Status == "Submitted" || r.Status == "UnderReview"),
                expenseTotal = g.Sum(r => expMap.TryGetValue(r.RequestId, out var amt) ? amt : 0m),
            })
            .OrderByDescending(x => x.requestCount)
            .ToList();

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