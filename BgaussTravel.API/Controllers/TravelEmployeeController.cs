using BgaussTravel.API.Data;
using BgaussTravel.API.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;

namespace BgaussTravel.API.Controllers;

[ApiController]
[Route("api/[controller]")]
//[Authorize]
public class TravelEmployeeController : ControllerBase
{
    private readonly AppDbContext _db;

    public TravelEmployeeController(AppDbContext db) => _db = db;

    private int GetEmployeeIdFromJwt()
    {
        var claim = User.FindFirst("EmployeeId")?.Value;
        if (int.TryParse(claim, out var id)) return id;

        try
        {
            var authHeader = Request.Headers["Authorization"].FirstOrDefault();
            if (string.IsNullOrWhiteSpace(authHeader) || !authHeader.StartsWith("Bearer "))
                return 0;
            var jwt = new JwtSecurityTokenHandler()
                        .ReadJwtToken(authHeader["Bearer ".Length..].Trim());
            var val = jwt.Claims.FirstOrDefault(c => c.Type == "EmployeeId")?.Value;
            return int.TryParse(val, out var id2) ? id2 : 0;
        }
        catch { return 0; }
    }

    private string GetRoleFromJwt()
    {
        try
        {
            var authHeader = Request.Headers["Authorization"].FirstOrDefault();
            if (string.IsNullOrWhiteSpace(authHeader) || !authHeader.StartsWith("Bearer "))
                return "Employee";
            var jwt = new JwtSecurityTokenHandler()
                        .ReadJwtToken(authHeader["Bearer ".Length..].Trim());
            return jwt.Claims.FirstOrDefault(c => c.Type == "Role")?.Value ?? "Employee";
        }
        catch { return "Employee"; }
    }

    private bool IsAdminOrHr()
    {
        var role = GetRoleFromJwt();
        return role.Equals("Admin", StringComparison.OrdinalIgnoreCase) ||
               role.Equals("HR",    StringComparison.OrdinalIgnoreCase);
    }

    // ── GET /api/TravelEmployee/my-profile ────────────────────────────────────
    [HttpGet("my-profile")]
    public async Task<IActionResult> GetMyProfile()
    {
        var empId = GetEmployeeIdFromJwt();
        if (empId == 0) return Unauthorized(new { message = "Invalid token." });

        var emp = await _db.TravelEmployees.FindAsync(empId);
        if (emp == null) return NotFound(new { message = "Employee not found." });

        return Ok(new
        {
            employeeId       = emp.EmployeeId,
            email            = emp.Email,
            employeeCode     = emp.EmployeeCode     ?? "",
            role             = emp.Role,
            displayName      = emp.DisplayName,
            department       = emp.Department       ?? "",
            designation      = emp.Designation      ?? "",
            reportingManager = emp.ReportingManager ?? "",
            contactNumber    = emp.ContactNumber    ?? "",
            alternateEmail   = emp.AlternateEmail   ?? "",
            emergencyContact = emp.EmergencyContact ?? "",
            lastLoginAt      = emp.LastLoginAt,
        });
    }

    // ── PUT /api/TravelEmployee/my-profile ────────────────────────────────────
    [HttpPut("my-profile")]
    public async Task<IActionResult> UpdateMyProfile([FromBody] UpdateEmployeeProfileDto dto)
    {
        var empId = GetEmployeeIdFromJwt();
        if (empId == 0) return Unauthorized(new { message = "Invalid token." });

        var emp = await _db.TravelEmployees.FindAsync(empId);
        if (emp == null) return NotFound(new { message = "Employee not found." });

        if (!string.IsNullOrWhiteSpace(dto.DisplayName))
            emp.DisplayName = dto.DisplayName.Trim();

        if (!string.IsNullOrWhiteSpace(dto.Department))
            emp.Department = dto.Department.Trim();

        if (dto.Designation      != null) emp.Designation      = dto.Designation.Trim();
        if (dto.ReportingManager != null) emp.ReportingManager = dto.ReportingManager.Trim();
        if (dto.ContactNumber    != null) emp.ContactNumber    = dto.ContactNumber.Trim();
        if (dto.AlternateEmail   != null) emp.AlternateEmail   = dto.AlternateEmail.Trim();
        if (dto.EmergencyContact != null) emp.EmergencyContact = dto.EmergencyContact.Trim();

        await _db.SaveChangesAsync();

        return Ok(new
        {
            message          = "Profile updated successfully.",
            employeeId       = emp.EmployeeId,
            displayName      = emp.DisplayName,
            department       = emp.Department       ?? "",
            designation      = emp.Designation      ?? "",
            reportingManager = emp.ReportingManager ?? "",
            contactNumber    = emp.ContactNumber    ?? "",
        });
    }

    // ── GET /api/TravelEmployee  (Admin/HR — list all active employees) ───────
    // Supports: ?isActive=true&pageSize=500
    // Used by the Reports page "Active Employees" KPI drill-down card.
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] bool?   isActive = null,
        [FromQuery] string? role     = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     pageSize = 50)
    {
        if (!IsAdminOrHr())
            return Forbid();

        var q = _db.TravelEmployees.AsQueryable();

        if (isActive.HasValue)
            q = q.Where(e => e.IsActive == isActive.Value);

        if (!string.IsNullOrWhiteSpace(role))
            q = q.Where(e => e.Role.ToLower() == role.ToLower());

        var total = await q.CountAsync();

        var employees = await q
            .OrderBy(e => e.DisplayName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(e => new
            {
                employeeId   = e.EmployeeId,
                displayName  = e.DisplayName,
                employeeCode = e.EmployeeCode  ?? "",
                department   = e.Department    ?? "",
                designation  = e.Designation   ?? "",
                email        = e.Email,
                role         = e.Role,
                contactNumber= e.ContactNumber ?? "",
                isActive     = e.IsActive,
            })
            .ToListAsync();

        return Ok(new
        {
            total,
            page,
            pageSize,
            items = employees,
        });
    }

    // ── GET /api/TravelEmployee/all (Admin/HR — convenience alias) ────────────
    [HttpGet("all")]
    public Task<IActionResult> GetAllAlias(
        [FromQuery] bool?   isActive = null,
        [FromQuery] string? role     = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     pageSize = 50)
        => GetAll(isActive, role, page, pageSize);
}