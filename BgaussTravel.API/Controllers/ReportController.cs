// Controllers/ReportController.cs
// Admin dashboard summary + per-transport and per-employee breakdown

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

    // GET /api/Report/dashboard  → Admin DashboardPage top stats
    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddMonths(-1);
        var end   = to   ?? DateTime.UtcNow;

        return Ok(new DashboardSummaryDto
        {
            TotalRequests    = await _db.TravelRequests.CountAsync(r => r.CreatedAt >= start && r.CreatedAt <= end),
            PendingRequests  = await _db.TravelRequests.CountAsync(r => r.Status == "Submitted"),
            ApprovedRequests = await _db.TravelRequests.CountAsync(r => r.Status == "Approved"),
            RejectedRequests = await _db.TravelRequests.CountAsync(r => r.Status == "Rejected"),
            TotalExpenses    = await _db.ExpenseClaims.Where(e => e.CreatedAt >= start && e.CreatedAt <= end).SumAsync(e => e.Amount),
            PendingExpenses  = await _db.ExpenseClaims.Where(e => e.Status == "Submitted").SumAsync(e => e.Amount),
            ApprovedExpenses = await _db.ExpenseClaims.Where(e => e.Status == "Approved" || e.Status == "Reimbursed").SumAsync(e => e.Amount),
            TotalEmployees   = await _db.TravelEmployees.CountAsync(e => e.IsActive && e.Role == "Employee"),
        });
    }

    // GET /api/Report/by-transport
    [HttpGet("by-transport")]
    public async Task<IActionResult> ByTransport()
    {
        var data = await _db.TravelRequests
            .GroupBy(r => r.TransportType)
            .Select(g => new { Transport = g.Key, Count = g.Count(), TotalAmount = g.Sum(r => r.EstimatedAmount ?? 0) })
            .OrderByDescending(x => x.Count)
            .ToListAsync();

        return Ok(data);
    }

    // GET /api/Report/by-employee
    [HttpGet("by-employee")]
    public async Task<IActionResult> ByEmployee([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow.AddMonths(-3);
        var end   = to   ?? DateTime.UtcNow;

        var data = await _db.ExpenseClaims
            .Include(e => e.Employee)
            .Where(e => e.CreatedAt >= start && e.CreatedAt <= end)
            .GroupBy(e => new { e.EmployeeId, e.Employee.DisplayName, e.Employee.EmployeeCode })
            .Select(g => new {
                g.Key.DisplayName, g.Key.EmployeeCode,
                TotalAmount = g.Sum(e => e.Amount), ClaimCount = g.Count(),
                Approved = g.Count(e => e.Status == "Approved" || e.Status == "Reimbursed"),
                Pending  = g.Count(e => e.Status == "Submitted"),
            })
            .OrderByDescending(x => x.TotalAmount)
            .ToListAsync();

        return Ok(data);
    }

    // GET /api/Report/by-status
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