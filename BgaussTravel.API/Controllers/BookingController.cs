// Controllers/BookingController.cs

using BgaussTravel.API.Data;
using BgaussTravel.API.DTOs;
using BgaussTravel.API.Models;
using BgaussTravel.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace BgaussTravel.API.Controllers;

[ApiController]
[Route("api/[controller]")]
// NOTE: [Authorize] removed — EmployeeId is passed from frontend in request payload
public class BookingController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ICodeSequenceService _seq;
    private readonly ITravelNotificationService _notify;

    public BookingController(AppDbContext db, ICodeSequenceService seq, ITravelNotificationService notify)
    { _db = db; _seq = seq; _notify = notify; }

    // SAFE helpers — never throw even if claim is missing
    // CurrentEmployeeId now extracts from claims if available (for backward compatibility)
    int CurrentEmployeeId
    {
        get
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
    }

    string CurrentRole => User.FindFirstValue("Role") ?? "Employee";

    static TravelRequestResponseDto ToDto(TravelRequest r) => new()
    {
        RequestId       = r.RequestId,
        RequestCode     = r.RequestCode,
        EmployeeId      = r.EmployeeId,
        EmployeeName    = r.Employee?.DisplayName ?? "",
        EmployeeCode    = r.Employee?.EmployeeCode ?? "",
        Department      = r.Employee?.Department ?? "",
        TravelPurpose   = r.TravelPurpose,
        Destination     = r.Destination,
        DepartureDate   = r.DepartureDate,
        ReturnDate      = r.ReturnDate,
        TransportType   = r.TransportType,
        EstimatedAmount = r.EstimatedAmount,
        Status          = r.Status,
        SubmittedAt     = r.SubmittedAt,
        CreatedAt       = r.CreatedAt,
        Notes           = r.Notes,
        ExpenseClaims   = r.ExpenseClaims.Select(e => new ExpenseClaimResponseDto
        {
            ClaimId      = e.ClaimId,   ClaimCode    = e.ClaimCode,
            RequestId    = e.RequestId, RequestCode  = r.RequestCode,
            EmployeeId   = e.EmployeeId, EmployeeName = e.Employee?.DisplayName ?? "",
            Category     = e.Category,  Amount       = e.Amount,
            Currency     = e.Currency,  ExpenseDate  = e.ExpenseDate,
            Description  = e.Description, BillPath   = e.BillPath,
            BillFileName = e.BillFileName, Status    = e.Status,
            ApprovedAt   = e.ApprovedAt, ReimbursedAt = e.ReimbursedAt,
            CreatedAt    = e.CreatedAt,
        }).ToList(),
    };

    // GET /api/Booking/my
    [HttpGet("my")]
    public async Task<IActionResult> GetMy()
    {
        var empId = CurrentEmployeeId;
        if (empId == 0) return Unauthorized(new { message = "Invalid token — EmployeeId claim missing." });

        var rows = await _db.TravelRequests
            .Include(r => r.Employee)
            .Include(r => r.ExpenseClaims).ThenInclude(e => e.Employee)
            .Where(r => r.EmployeeId == empId)
            .OrderByDescending(r => r.CreatedAt).ToListAsync();

        return Ok(rows.Select(ToDto));
    }

    // GET /api/Booking  (Admin/HR — role checked on frontend)
    [HttpGet("all")]
    //[Authorize(Roles = "Admin,HR")]
    public async Task<IActionResult> GetAll([FromQuery] string? status, [FromQuery] string? transport,
                                            [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var q = _db.TravelRequests
            .Include(r => r.Employee)
            .Include(r => r.ExpenseClaims).ThenInclude(e => e.Employee)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))    q = q.Where(r => r.Status == status);
        if (!string.IsNullOrWhiteSpace(transport)) q = q.Where(r => r.TransportType == transport);

        var total = await q.CountAsync();
        var items = await q.OrderByDescending(r => r.CreatedAt)
                           .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

        return Ok(new { total, page, pageSize, items = items.Select(ToDto) });
    }

    // GET /api/Booking/{id}
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var r = await _db.TravelRequests
            .Include(x => x.Employee)
            .Include(x => x.ExpenseClaims).ThenInclude(e => e.Employee)
            .Include(x => x.TravelApprovals).ThenInclude(a => a.Approver)
            .FirstOrDefaultAsync(x => x.RequestId == id);

        if (r == null) return NotFound(new { message = "Request not found." });

        var empId = CurrentEmployeeId;
        if (CurrentRole == "Employee" && r.EmployeeId != empId) return Forbid();

        return Ok(ToDto(r));
    }

    // POST /api/Booking
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTravelRequestDto dto)
    {
        // ✅ Use EmployeeId from request payload (sent by frontend from session)
        var empId = dto.EmployeeId;
        if (empId == 0) return BadRequest(new { message = "EmployeeId is required." });
        if (!ModelState.IsValid) return BadRequest(ModelState);
        if (dto.ReturnDate < dto.DepartureDate)
            return BadRequest(new { message = "Return date cannot be before departure date." });

        var code = await _seq.NextAsync("TRV");
        var request = new TravelRequest
        {
            RequestCode   = code,        EmployeeId    = empId,
            TravelPurpose = dto.TravelPurpose, Destination = dto.Destination,
            DepartureDate = dto.DepartureDate, ReturnDate  = dto.ReturnDate,
            TransportType = dto.TransportType, EstimatedAmount = dto.EstimatedAmount,
            Status        = "Submitted",  SubmittedAt = DateTime.UtcNow,
            Notes         = dto.Notes,    CreatedAt   = DateTime.UtcNow,
            UpdatedAt     = DateTime.UtcNow,
        };
        _db.TravelRequests.Add(request);
        await _db.SaveChangesAsync();

        var emp = await _db.TravelEmployees.FindAsync(empId);
        await _notify.NotifyAdminsAndHrAsync(empId, "TravelRequest",
            "New Travel Request",
            $"{emp?.DisplayName} submitted {code} → {dto.Destination} ({dto.TransportType})",
            requestId: request.RequestId);

        return CreatedAtAction(nameof(GetById), new { id = request.RequestId },
                               new { request.RequestId, request.RequestCode });
    }

    // PUT /api/Booking/{id}
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateTravelRequestDto dto)
    {
        var empId = CurrentEmployeeId;
        var r = await _db.TravelRequests.FindAsync(id);
        if (r == null) return NotFound(new { message = "Request not found." });
        if (CurrentRole == "Employee" && r.EmployeeId != empId) return Forbid();
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

    // DELETE /api/Booking/{id}
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var empId = CurrentEmployeeId;
        var r = await _db.TravelRequests.FindAsync(id);
        if (r == null) return NotFound();
        if (CurrentRole == "Employee" && r.EmployeeId != empId) return Forbid();
        if (r.Status != "Draft") return BadRequest(new { message = "Only draft requests can be deleted." });

        _db.TravelRequests.Remove(r);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}