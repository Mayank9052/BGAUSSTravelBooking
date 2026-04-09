// Hubs/NotificationHub.cs
// SignalR hub for real-time travel/expense notifications.
// Each connected user joins a group named "user_{employeeId}"
// so the server can push targeted notifications.

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace BgaussTravel.API.Hubs;

[Authorize]
public class NotificationHub : Hub
{
    /// <summary>
    /// Called automatically when a client connects.
    /// Reads EmployeeId from the JWT claim and joins the user to their
    /// personal group so the server can send targeted push messages.
    /// </summary>
    public override async Task OnConnectedAsync()
    {
        var employeeId = Context.User?.FindFirst("EmployeeId")?.Value;
        if (!string.IsNullOrEmpty(employeeId))
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{employeeId}");

        await base.OnConnectedAsync();
    }

    /// <summary>
    /// Called automatically when a client disconnects.
    /// SignalR removes the connection from all groups automatically,
    /// but we call base for clean lifecycle handling.
    /// </summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Client can call this to mark a notification as read.
    /// </summary>
    public async Task MarkRead(int notificationId)
    {
        // Broadcast back to the caller only — UI can update the badge count
        await Clients.Caller.SendAsync("NotificationRead", notificationId);
    }
}