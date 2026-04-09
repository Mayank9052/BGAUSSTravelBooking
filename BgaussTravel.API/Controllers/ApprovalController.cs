// Controllers/ApprovalController.cs
// Serves the Admin/HR "Approvals" tab in DashboardPage
using BgaussTravel.API.Data;
using BgaussTravel.API.DTOs;
using BgaussTravel.API.Models;
using BgaussTravel.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BgaussTravel.API.Controllers;

[ApiController]
[Route("api/[controller]")]
//[Authorize(Roles = "Admin,HR")]
public class ApprovalController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITravelNotificationService _notify;

    public ApprovalController(AppDbContext db, ITravelNotificationService notify)
    { _db=db; _notify=notify; }

    int CurrentEmployeeId => int.Parse(User.FindFirstValue("EmployeeId")!);

    // GET /api/Approval/pending  → Admin DashboardPage approval queue
    [HttpGet("pending")]
    public async Task<IActionResult> Pending()
    {
        var requests = await _db.TravelRequests
            .Include(r=>r.Employee)
            .Include(r=>r.ExpenseClaims)
            .Where(r=>r.Status=="Submitted" || r.Status=="UnderReview")
            .OrderBy(r=>r.CreatedAt)
            .Select(r=>new {
                r.RequestId, r.RequestCode, r.TravelPurpose, r.Destination,
                r.TransportType, r.DepartureDate, r.ReturnDate, r.EstimatedAmount,
                r.Status, r.SubmittedAt, r.CreatedAt,
                Employee=new{ r.Employee.DisplayName, r.Employee.EmployeeCode, r.Employee.Department },
                PendingExpenses=r.ExpenseClaims.Count(e=>e.Status=="Submitted"),
            })
            .ToListAsync();

        var expenses = await _db.ExpenseClaims
            .Include(e=>e.Employee)
            .Include(e=>e.Request)
            .Where(e=>e.Status=="Submitted")
            .OrderBy(e=>e.CreatedAt)
            .Select(e=>new {
                e.ClaimId, e.ClaimCode, e.Category, e.Amount, e.Currency,
                e.ExpenseDate, e.Description, e.Status, e.CreatedAt,
                e.BillFileName, RequestCode=e.Request.RequestCode,
                Employee=new{ e.Employee.DisplayName, e.Employee.EmployeeCode },
            })
            .ToListAsync();

        return Ok(new { pendingRequests=requests, pendingExpenses=expenses });
    }

    // POST /api/Approval/request/{id}  → approve or reject a travel request
    [HttpPost("request/{id:int}")]
    public async Task<IActionResult> ActionOnRequest(int id, [FromBody] ApprovalActionDto dto)
    {
        var request = await _db.TravelRequests.Include(r=>r.Employee).FirstOrDefaultAsync(r=>r.RequestId==id);
        if (request==null) return NotFound(new{message="Request not found."});

        var action = dto.Action.Trim().ToLower();
        if (action!="approve" && action!="reject")
            return BadRequest(new{message="Action must be 'Approve' or 'Reject'."});

        // Record in TravelApprovals history
        var approval = new TravelApproval
        {
            RequestId=id, ApproverId=CurrentEmployeeId, Level=1,
            Action=action=="approve"?"Approved":"Rejected",
            Comments=dto.Comments, ActionAt=DateTime.UtcNow, CreatedAt=DateTime.UtcNow,
        };
        _db.TravelApprovals.Add(approval);

        request.Status=action=="approve"?"Approved":"Rejected";
        request.UpdatedAt=DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _notify.NotifyUserAsync(request.EmployeeId, CurrentEmployeeId, "TravelRequest",
            $"Travel Request {(action=="approve"?"Approved ✅":"Rejected ❌")}",
            $"Your request {request.RequestCode} ({request.Destination}) has been {request.Status.ToLower()}." +
            (dto.Comments!=null?$" Remarks: {dto.Comments}":""),
            requestId: request.RequestId);

        return Ok(new{request.RequestId, request.RequestCode, request.Status});
    }

    // GET /api/Approval/history/{requestId}  → approval trail per request
    [HttpGet("history/{requestId:int}")]
    public async Task<IActionResult> History(int requestId)
    {
        var rows = await _db.TravelApprovals
            .Include(a=>a.Approver)
            .Where(a=>a.RequestId==requestId)
            .OrderBy(a=>a.CreatedAt)
            .Select(a=>new ApprovalResponseDto
            {
                ApprovalId=a.ApprovalId, RequestId=a.RequestId,
                ApproverId=a.ApproverId, ApproverName=a.Approver.DisplayName,
                Level=a.Level, Action=a.Action, Comments=a.Comments,
                ActionAt=a.ActionAt, CreatedAt=a.CreatedAt,
            })
            .ToListAsync();
        return Ok(rows);
    }
}