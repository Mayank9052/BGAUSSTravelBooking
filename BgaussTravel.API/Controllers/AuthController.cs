using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BgaussTravel.API.Data;
using BgaussTravel.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using BgaussTravel.API.DTOs;

namespace BgaussTravel.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _config;

    public AuthController(AppDbContext context, IConfiguration config)
    {
        _context = context;
        _config  = config;
    }

    // ── POST /api/Auth/ms-login ───────────────────────────────────────────────
    [HttpPost("ms-login")]
    public async Task<IActionResult> MsLogin([FromBody] MsLoginDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Email))
            return BadRequest(new { message = "Email is required." });

        var emailLower = dto.Email.ToLower().Trim();

        var employee = await _context.TravelEmployees
            .FirstOrDefaultAsync(e => e.Email != null && e.Email.ToLower() == emailLower);

        if (employee == null)
        {
            // ── New employee: create with whatever MSAL provided ──────────────
            employee = new TravelEmployee
            {
                MicrosoftOid = dto.MicrosoftOid ?? dto.Email,
                Email        = emailLower,
                DisplayName  = dto.DisplayName ?? dto.Email,
                // Only set Department if MSAL provides a non-empty value
                Department   = string.IsNullOrWhiteSpace(dto.Department) ? null : dto.Department.Trim(),
                EmployeeCode = dto.EmployeeId ?? dto.Email.Split('@')[0].ToUpper(),
                Role         = "Employee",
                IsActive     = true,
                CreatedAt    = DateTime.UtcNow,
            };
            _context.TravelEmployees.Add(employee);
        }
        else
        {
            // ── Existing employee: ONLY overwrite fields with non-empty values ─
            // This prevents MSAL returning null/empty from wiping values the
            // user or admin already set via profile edit.

            // DisplayName: update only if MSAL gives a non-empty value
            if (!string.IsNullOrWhiteSpace(dto.DisplayName))
                employee.DisplayName = dto.DisplayName.Trim();

            // Department: NEVER overwrite an existing non-empty DB value with
            // a null/empty value from MSAL. Only set if DB is empty AND MSAL provides one.
            if (string.IsNullOrWhiteSpace(employee.Department) &&
                !string.IsNullOrWhiteSpace(dto.Department))
            {
                employee.Department = dto.Department.Trim();
            }
            // If employee.Department already has a value → leave it alone.
            // The profile edit endpoint (PUT /TravelEmployee/my-profile) is the
            // correct way to change it.
        }

        employee.LastLoginAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        if (!employee.IsActive)
            return Unauthorized(new { message = "Your account has been deactivated." });

        var token = GenerateJwt(employee);

        return Ok(new
        {
            token,
            employeeId       = employee.EmployeeId,
            email            = employee.Email,
            displayName      = employee.DisplayName,
            employeeCode     = employee.EmployeeCode,
            department       = employee.Department,
            designation      = employee.Designation,
            reportingManager = employee.ReportingManager,
            contactNumber    = employee.ContactNumber,
            role             = employee.Role,
        });
    }

    // ── GET /api/Auth/me ──────────────────────────────────────────────────────
    [HttpGet("me")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<IActionResult> Me()
    {
        var idClaim = User.FindFirst("EmployeeId")?.Value;
        if (!int.TryParse(idClaim, out var id)) return Unauthorized();

        var emp = await _context.TravelEmployees.FindAsync(id);
        if (emp == null) return NotFound();

        return Ok(new
        {
            emp.EmployeeId,
            emp.Email,
            emp.DisplayName,
            emp.Department,
            emp.EmployeeCode,
            emp.Designation,
            emp.ReportingManager,
            emp.ContactNumber,
            emp.Role,
            emp.IsActive,
        });
    }

    // ── JWT generator ─────────────────────────────────────────────────────────
    private string GenerateJwt(TravelEmployee emp)
    {
        var key = _config["Jwt:Key"]
            ?? throw new InvalidOperationException("Jwt:Key missing");

        var issuer = _config["Jwt:Issuer"] ?? "BgaussTravel";

        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub,   emp.Email),
            new Claim(JwtRegisteredClaimNames.Email, emp.Email),
            new Claim(JwtRegisteredClaimNames.Name,  emp.DisplayName),
            new Claim("EmployeeId",  emp.EmployeeId.ToString()),
            new Claim("Role",        emp.Role),
            new Claim("Department",  emp.Department ?? ""),
            new Claim(ClaimTypes.Role, emp.Role),
        };

        var token = new JwtSecurityToken(
            issuer:            issuer,
            audience:          issuer,
            claims:            claims,
            expires:           DateTime.UtcNow.AddHours(10),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}