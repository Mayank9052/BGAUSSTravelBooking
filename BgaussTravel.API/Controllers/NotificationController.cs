// Controllers/NotificationController.cs
// Serves the bell icon unread count + dropdown in every page
using BgaussTravel.API.Data;
using BgaussTravel.API.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BgaussTravel.API.Controllers;

[ApiController]
[Route("api/[controller]")]
//[Authorize]
public class NotificationController : ControllerBase
{
    private readonly AppDbContext _db;
    public NotificationController(AppDbContext db) => _db=db;

    int CurrentEmployeeId => int.Parse(User.FindFirstValue("EmployeeId")!);

    // GET /api/Notification  → bell dropdown list
    [HttpGet]
    public async Task<IActionResult> GetMine([FromQuery] bool unreadOnly=false)
    {
        var q = _db.TravelNotifications.Where(n=>n.RecipientId==CurrentEmployeeId);
        if (unreadOnly) q = q.Where(n=>!n.IsRead);
        var items = await q.OrderByDescending(n=>n.CreatedAt).Take(50)
            .Select(n=>new NotificationResponseDto
            {
                NotificationId=n.NotificationId, Type=n.Type,
                Title=n.Title, Message=n.Message, IsRead=n.IsRead,
                RequestId=n.RequestId, ClaimId=n.ClaimId, CreatedAt=n.CreatedAt,
            }).ToListAsync();
        var unread = await _db.TravelNotifications.CountAsync(n=>n.RecipientId==CurrentEmployeeId && !n.IsRead);
        return Ok(new{unreadCount=unread, items});
    }

    // PUT /api/Notification/{id}/read
    [HttpPut("{id:int}/read")]
    public async Task<IActionResult> MarkRead(int id)
    {
        var n = await _db.TravelNotifications
            .FirstOrDefaultAsync(x=>x.NotificationId==id && x.RecipientId==CurrentEmployeeId);
        if (n==null) return NotFound();
        n.IsRead=true;
        await _db.SaveChangesAsync();
        return Ok();
    }

    // PUT /api/Notification/read-all
    [HttpPut("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        await _db.TravelNotifications
            .Where(n=>n.RecipientId==CurrentEmployeeId && !n.IsRead)
            .ExecuteUpdateAsync(s=>s.SetProperty(n=>n.IsRead, true));
        return Ok();
    }
}
