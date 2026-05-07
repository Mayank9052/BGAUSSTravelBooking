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
        // Prefer the parsed ClaimsPrincipal (already validated by JWT middleware)
        var claim = User.FindFirst("EmployeeId")?.Value;
        if (int.TryParse(claim, out var id)) return id;

        // Fallback: read raw header
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

        // ✅ FIX: Only update a field if the DTO value is non-null and non-empty.
        //    Previously Department was assigned TWICE — the second unconditional assignment
        //    `emp.Department = dto.Department?.Trim()` could write null/empty and wipe the
        //    existing value even when the caller didn't intend to change it.
        //    Now every field follows the same pattern: only overwrite when a real value is provided.
        if (!string.IsNullOrWhiteSpace(dto.DisplayName))
            emp.DisplayName = dto.DisplayName.Trim();

        if (!string.IsNullOrWhiteSpace(dto.Department))
            emp.Department = dto.Department.Trim();

        // These fields CAN be cleared intentionally (e.g. user deletes their phone number),
        // so we allow null/empty writes — but only when the DTO key was explicitly supplied.
        // dto properties being null means "not sent" (JSON omitted) vs "" meaning "cleared".
        // Use null-check rather than IsNullOrWhiteSpace so explicit empty-string clears work.
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
}