using BgaussTravel.API.Data;
using BgaussTravel.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using BgaussTravel.API.DTOs;

namespace BgaussTravel.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BookingController : ControllerBase
{
    private readonly AppDbContext _db;
    public BookingController(AppDbContext db) => _db = db;

    // Helper: extract EmployeeId from Bearer JWT
    private int GetEmployeeIdFromJwt()
    {
        try
        {
            var authHeader = Request.Headers["Authorization"].FirstOrDefault();
            if (string.IsNullOrWhiteSpace(authHeader) || !authHeader.StartsWith("Bearer ")) return 0;
            var jwt = new JwtSecurityTokenHandler().ReadJwtToken(authHeader["Bearer ".Length..].Trim());
            int.TryParse(jwt.Claims.FirstOrDefault(c => c.Type == "EmployeeId")?.Value, out int id);
            return id;
        }
        catch { return 0; }
    }

    // ── GET /api/Booking/my ────────────────────────────────────────────────────
    [HttpGet("my")]
    public async Task<IActionResult> GetMyRequests()
    {
        var empId = GetEmployeeIdFromJwt();
        if (empId == 0) return Unauthorized();

        var requests = await _db.TravelRequests
            .Include(r => r.Employee)
            .Where(r => r.EmployeeId == empId)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new
            {
                r.RequestId,
                r.RequestCode,
                r.EmployeeId,
                EmployeeName = r.Employee.DisplayName,
                Department   = r.Department ?? r.Employee.Department ?? "",   // ← snapshot or live
                r.TransportType,
                r.Destination,
                r.TravelPurpose,
                DepartureDate = r.DepartureDate.ToString("yyyy-MM-dd"),
                ReturnDate    = r.ReturnDate.ToString("yyyy-MM-dd"),
                r.EstimatedAmount,
                r.Notes,
                r.Status,
                r.OriginLatitude,
                r.OriginLongitude,
                r.OriginAddress,
                r.LocationCapturedAt,
                r.CreatedAt,
            })
            .ToListAsync();

        return Ok(requests);
    }

    // ── GET /api/Booking/all ───────────────────────────────────────────────────
    [HttpGet("all")]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? transport, [FromQuery] string? status,
        [FromQuery] int pageSize = 200, [FromQuery] int page = 1)
    {
        var query = _db.TravelRequests
            .Include(r => r.Employee)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(transport))
            query = query.Where(r => r.TransportType == transport);
        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(r => r.Status == status);

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(r => r.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new
            {
                r.RequestId,
                r.RequestCode,
                r.EmployeeId,
                EmployeeName = r.Employee.DisplayName,
                EmployeeCode = r.Employee.EmployeeCode,
                Department   = r.Department ?? r.Employee.Department ?? "",   // ← snapshot or live
                r.TransportType,
                r.Destination,
                r.TravelPurpose,
                DepartureDate = r.DepartureDate.ToString("yyyy-MM-dd"),
                ReturnDate    = r.ReturnDate.ToString("yyyy-MM-dd"),
                r.EstimatedAmount,
                r.Notes,
                r.Status,
                r.OriginLatitude,
                r.OriginLongitude,
                r.OriginAddress,
                r.CreatedAt,
            })
            .ToListAsync();

        return Ok(new { total, items });
    }

    // ── POST /api/Booking ─────────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateBookingDto dto)
    {
        var employee = await _db.TravelEmployees.FindAsync(dto.EmployeeId);
        if (employee == null) return NotFound(new { message = "Employee not found." });

        // Generate request code
        var count = await _db.TravelRequests.CountAsync() + 1;
        var code  = $"TR-{DateTime.UtcNow:yyyyMM}-{count:D4}";
        var department = !string.IsNullOrWhiteSpace(employee.Department)
                        ? employee.Department
                        : dto.Department;

        var request = new TravelRequest
        {
            RequestCode  = code,
            EmployeeId   = dto.EmployeeId,
            Department   = department ?? "",  // ← SNAPSHOT from employee
            TransportType      = dto.TransportType,
            Destination        = dto.Destination,
            TravelPurpose      = dto.TravelPurpose,
            DepartureDate      = DateOnly.Parse(dto.DepartureDate),
            ReturnDate         = DateOnly.Parse(dto.ReturnDate),
            EstimatedAmount    = dto.EstimatedAmount,
            Notes              = dto.Notes,
            Status             = "Submitted",
            OriginLatitude     = dto.OriginLatitude,
            OriginLongitude    = dto.OriginLongitude,
            OriginAddress      = dto.OriginAddress,
            LocationCapturedAt = dto.LocationCapturedAt.HasValue
                ? dto.LocationCapturedAt.Value.ToUniversalTime()
                : null,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        _db.TravelRequests.Add(request);
        await _db.SaveChangesAsync();

        // Send notification (if NotificationService is injected)
        // await _notifService.NotifyAdmins("New Travel Request", $"{employee.DisplayName} submitted {code}");

        return Ok(new { requestId = request.RequestId, requestCode = request.RequestCode });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateTravelRequestDto dto)
    {
        var empId = GetEmployeeIdFromJwt();  // ✅ FIX
        var r = await _db.TravelRequests.FindAsync(id);

        if (r == null) return NotFound(new { message = "Request not found." });

        if (empId > 0 && r.EmployeeId != empId)
            return Forbid();

        if (r.Status != "Draft" && r.Status != "Submitted")
            return BadRequest(new { message = $"Cannot edit a request with status '{r.Status}'." });

        if (dto.TravelPurpose   != null)  r.TravelPurpose   = dto.TravelPurpose;
        if (dto.Destination     != null)  r.Destination     = dto.Destination;
        if (dto.DepartureDate.HasValue)   r.DepartureDate   = dto.DepartureDate.Value;
        if (dto.ReturnDate.HasValue)      r.ReturnDate      = dto.ReturnDate.Value;
        if (dto.TransportType   != null)  r.TransportType   = dto.TransportType;
        if (dto.EstimatedAmount.HasValue) r.EstimatedAmount = dto.EstimatedAmount;
        if (dto.Notes           != null)  r.Notes           = dto.Notes;

        r.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(new { r.RequestId, r.Status });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var empId = GetEmployeeIdFromJwt();  // ✅ FIX
        var r = await _db.TravelRequests.FindAsync(id);

        if (r == null) return NotFound();

        if (empId > 0 && r.EmployeeId != empId)
            return Forbid();

        if (r.Status != "Draft")
            return BadRequest(new { message = "Only draft requests can be deleted." });

        _db.TravelRequests.Remove(r);
        await _db.SaveChangesAsync();

        return NoContent();
    }
}