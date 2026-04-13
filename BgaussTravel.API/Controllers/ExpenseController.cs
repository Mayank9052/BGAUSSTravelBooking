// Controllers/ExpenseController.cs
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
public class ExpenseController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ICodeSequenceService _seq;
    private readonly ITravelNotificationService _notify;
    private readonly IWebHostEnvironment _env;

    public ExpenseController(AppDbContext db, ICodeSequenceService seq,
                             ITravelNotificationService notify, IWebHostEnvironment env)
    { _db = db; _seq = seq; _notify = notify; _env = env; }

    // SAFE helpers — never throw even if claim is missing
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

    static ExpenseClaimResponseDto ToDto(ExpenseClaim e, string? requestCode = null) => new()
    {
        ClaimId = e.ClaimId, ClaimCode = e.ClaimCode, RequestId = e.RequestId,
        RequestCode = requestCode ?? e.Request?.RequestCode, EmployeeId = e.EmployeeId,
        EmployeeName = e.Employee?.DisplayName ?? "", Category = e.Category,
        Amount = e.Amount, Currency = e.Currency, ExpenseDate = e.ExpenseDate,
        Description = e.Description, BillPath = e.BillPath, BillFileName = e.BillFileName,
        Status = e.Status, RejectionReason = e.RejectionReason,
        ApprovedAt = e.ApprovedAt, ReimbursedAt = e.ReimbursedAt, CreatedAt = e.CreatedAt,
    };

    [HttpGet("summary")]
    public async Task<IActionResult> Summary()
    {
        var empId = CurrentEmployeeId;
        if (empId == 0) return Unauthorized(new { message = "Invalid token." });

        var isEmployee = CurrentRole == "Employee";

        // ONE query: group by status, get count + sum together
        var grouped = await _db.ExpenseClaims
            .Where(e => !isEmployee || e.EmployeeId == empId)
            .GroupBy(e => e.Status)
            .Select(g => new
            {
                Status = g.Key,
                Count  = g.Count(),
                Total  = g.Sum(e => e.Amount),
            })
            .ToListAsync();

        decimal Get(string s)  => grouped.FirstOrDefault(g => g.Status == s)?.Total ?? 0;
        int     Count(string s) => grouped.FirstOrDefault(g => g.Status == s)?.Count ?? 0;

        return Ok(new ExpenseSummaryDto
        {
            TotalPending    = Get("Submitted"),
            TotalApproved   = Get("Approved"),
            TotalReimbursed = Get("Reimbursed"),
            PendingCount    = Count("Submitted"),
            ApprovedCount   = Count("Approved"),
            RejectedCount   = Count("Rejected"),
            ReimbursedCount = Count("Reimbursed"),
        });
    }

    // GET /api/Expense/my
    [HttpGet("my")]
    public async Task<IActionResult> GetMy([FromQuery] string? status)
    {
        var empId = CurrentEmployeeId;
        if (empId == 0) return Unauthorized();

        var q = _db.ExpenseClaims.Include(e => e.Employee).Include(e => e.Request)
                   .Where(e => e.EmployeeId == empId);
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(e => e.Status == status);

        var rows = await q.OrderByDescending(e => e.CreatedAt).ToListAsync();
        return Ok(rows.Select(e => ToDto(e, e.Request?.RequestCode)));
    }

    // GET /api/Expense  (Admin/HR — role checked on frontend)
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status,
                                            [FromQuery] int page = 1,
                                            [FromQuery] int pageSize = 50)  // ← cap default
    {
        var q = _db.ExpenseClaims
            .Where(e => string.IsNullOrWhiteSpace(status) || e.Status == status)
            .Select(e => new ExpenseClaimResponseDto
            {
                ClaimId         = e.ClaimId,
                ClaimCode       = e.ClaimCode,
                RequestId       = e.RequestId,
                RequestCode     = e.Request.RequestCode,    // EF projects this without full Include
                EmployeeId      = e.EmployeeId,
                EmployeeName    = e.Employee.DisplayName,   // same — projected only
                Category        = e.Category,
                Amount          = e.Amount,
                Currency        = e.Currency,
                ExpenseDate     = e.ExpenseDate,
                Description     = e.Description,
                BillPath        = e.BillPath,
                BillFileName    = e.BillFileName,
                Status          = e.Status,
                RejectionReason = e.RejectionReason,
                ApprovedAt      = e.ApprovedAt,
                ReimbursedAt    = e.ReimbursedAt,
                CreatedAt       = e.CreatedAt,
            });

        var total = await q.CountAsync();
        var items = await q
            .OrderByDescending(e => e.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    // GET /api/Expense/{id}
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var empId = CurrentEmployeeId;
        var e = await _db.ExpenseClaims.Include(x => x.Employee).Include(x => x.Request)
                    .FirstOrDefaultAsync(x => x.ClaimId == id);
        if (e == null) return NotFound(new { message = "Claim not found." });
        if (CurrentRole == "Employee" && e.EmployeeId != empId) return Forbid();
        return Ok(ToDto(e, e.Request?.RequestCode));
    }

    // POST /api/Expense
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateExpenseClaimDto dto)
    {
        var empId = CurrentEmployeeId;
        if (empId == 0) return Unauthorized();
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var request = await _db.TravelRequests.FindAsync(dto.RequestId);
        if (request == null) return BadRequest(new { message = "Travel request not found." });
        if (CurrentRole == "Employee" && request.EmployeeId != empId) return Forbid();

        var code = await _seq.NextAsync("EXP");
        var claim = new ExpenseClaim
        {
            RequestId = dto.RequestId, EmployeeId = empId, ClaimCode = code,
            Category = dto.Category, Amount = dto.Amount, Currency = dto.Currency,
            ExpenseDate = dto.ExpenseDate, Description = dto.Description,
            Status = "Submitted", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
        };
        _db.ExpenseClaims.Add(claim);
        await _db.SaveChangesAsync();

        var emp = await _db.TravelEmployees.FindAsync(empId);
        await _notify.NotifyAdminsAndHrAsync(empId, "ExpenseClaim",
            "New Expense Claim",
            $"{emp?.DisplayName} submitted {code} ₹{dto.Amount:N0} ({dto.Category})",
            claimId: claim.ClaimId);

        return CreatedAtAction(nameof(GetById), new { id = claim.ClaimId },
                               new { claim.ClaimId, claim.ClaimCode });
    }

    // POST /api/Expense/{id}/upload-bill
    [HttpPost("{id:int}/upload-bill")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadBill(int id, IFormFile file)
    {
        var empId = CurrentEmployeeId;
        var claim = await _db.ExpenseClaims.FindAsync(id);
        if (claim == null) return NotFound(new { message = "Claim not found." });
        if (CurrentRole == "Employee" && claim.EmployeeId != empId) return Forbid();
        if (file == null || file.Length == 0) return BadRequest(new { message = "No file provided." });

        var allowed = new[] { ".jpg", ".jpeg", ".png", ".pdf", ".webp" };
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!allowed.Contains(ext)) return BadRequest(new { message = $"File type '{ext}' not allowed." });

        var dir = Path.Combine(_env.WebRootPath ?? "wwwroot", "uploads", "bills");
        Directory.CreateDirectory(dir);
        var unique = $"{Guid.NewGuid()}{ext}";
        await using (var s = new FileStream(Path.Combine(dir, unique), FileMode.Create))
            await file.CopyToAsync(s);

        claim.BillPath     = $"/uploads/bills/{unique}";
        claim.BillFileName = file.FileName;
        claim.UpdatedAt    = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { claim.ClaimId, claim.BillPath, claim.BillFileName });
    }

    // PUT /api/Expense/{id}/approve  (Admin/HR — role checked on frontend)
    [HttpPut("{id:int}/approve")]
    public async Task<IActionResult> Approve(int id, [FromBody] ApprovalActionDto dto)
    {
        var empId = CurrentEmployeeId;
        if (empId == 0) return Unauthorized(new { message = "Invalid token." });

        var claim = await _db.ExpenseClaims.Include(e => e.Employee).FirstOrDefaultAsync(e => e.ClaimId == id);
        if (claim == null) return NotFound();

        var action = dto.Action.Trim().ToLower();
        if (action != "approve" && action != "reject")
            return BadRequest(new { message = "Action must be 'approve' or 'reject'." });

        claim.Status          = action == "approve" ? "Approved" : "Rejected";
        claim.ApprovedBy      = empId;
        claim.ApprovedAt      = DateTime.UtcNow;
        claim.RejectionReason = action == "reject" ? dto.Comments : null;
        claim.UpdatedAt       = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _notify.NotifyUserAsync(claim.EmployeeId, empId, "ExpenseClaim",
            $"Expense {(action == "approve" ? "Approved ✅" : "Rejected ❌")}",
            $"Your claim {claim.ClaimCode} ₹{claim.Amount:N0} has been {claim.Status.ToLower()}." +
            (dto.Comments != null ? $" Remarks: {dto.Comments}" : ""),
            claimId: claim.ClaimId);

        return Ok(new { claim.ClaimId, claim.Status });
    }

    // PUT /api/Expense/{id}/reimburse  (Admin/HR — role checked on frontend)
    [HttpPut("{id:int}/reimburse")]
    public async Task<IActionResult> Reimburse(int id)
    {
        var empId = CurrentEmployeeId;
        if (empId == 0) return Unauthorized(new { message = "Invalid token." });

        var claim = await _db.ExpenseClaims.FindAsync(id);
        if (claim == null) return NotFound();
        if (claim.Status != "Approved")
            return BadRequest(new { message = "Only approved claims can be reimbursed." });

        claim.Status       = "Reimbursed";
        claim.ReimbursedAt = DateTime.UtcNow;
        claim.UpdatedAt    = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _notify.NotifyUserAsync(claim.EmployeeId, empId, "Reimbursement",
            "Reimbursement Processed 💰",
            $"Your claim {claim.ClaimCode} of ₹{claim.Amount:N0} has been reimbursed.",
            claimId: claim.ClaimId);

        return Ok(new { claim.ClaimId, claim.Status, claim.ReimbursedAt });
    }
}