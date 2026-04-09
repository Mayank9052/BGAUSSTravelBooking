// Services/TravelNotificationService.cs
using BgaussTravel.API.Data;
using BgaussTravel.API.Hubs;
using BgaussTravel.API.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace BgaussTravel.API.Services;

public interface ITravelNotificationService
{
    Task NotifyUserAsync(int recipientId, int? senderId, string type,
                         string title, string message,
                         int? requestId = null, int? claimId = null);

    Task NotifyAdminsAndHrAsync(int? senderId, string type,
                                string title, string message,
                                int? requestId = null, int? claimId = null);
}

public class TravelNotificationService : ITravelNotificationService
{
    private readonly AppDbContext _db;
    private readonly IHubContext<NotificationHub> _hub;

    public TravelNotificationService(AppDbContext db, IHubContext<NotificationHub> hub)
    {
        _db  = db;
        _hub = hub;
    }

    public async Task NotifyUserAsync(int recipientId, int? senderId, string type,
                                      string title, string message,
                                      int? requestId = null, int? claimId = null)
    {
        var notif = new TravelNotification
        {
            RecipientId = recipientId,
            SenderId    = senderId,
            RequestId   = requestId,
            ClaimId     = claimId,
            Type        = type,
            Title       = title,
            Message     = message,
            IsRead      = false,
            EmailSent   = false,
            CreatedAt   = DateTime.UtcNow,
        };

        _db.TravelNotifications.Add(notif);
        await _db.SaveChangesAsync();

        // Real-time push via SignalR
        await _hub.Clients.Group($"user_{recipientId}").SendAsync("ReceiveNotification", new
        {
            notif.NotificationId,
            notif.Type,
            notif.Title,
            notif.Message,
            notif.RequestId,
            notif.ClaimId,
            notif.IsRead,
            notif.CreatedAt,
        });
    }

    public async Task NotifyAdminsAndHrAsync(int? senderId, string type,
                                             string title, string message,
                                             int? requestId = null, int? claimId = null)
    {
        var adminIds = await _db.TravelEmployees
            .Where(e => (e.Role == "Admin" || e.Role == "HR") && e.IsActive)
            .Select(e => e.EmployeeId)
            .ToListAsync();

        foreach (var id in adminIds)
            await NotifyUserAsync(id, senderId, type, title, message, requestId, claimId);
    }
}