// Hubs/TravelHub.cs
// Real-time notifications for BGauss Travel Booking
// Each connected client joins group "employee_{id}" on connect.

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;

namespace BgaussTravel.API.Hubs;

[Authorize]
public class TravelHub : Hub
{
    // When a client connects, add them to their personal group
    public override async Task OnConnectedAsync()
    {
        var empId = Context.User?.FindFirst("EmployeeId")?.Value;
        if (!string.IsNullOrEmpty(empId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"employee_{empId}");

            var role = Context.User?.FindFirst("Role")?.Value ?? "";
            // HR and Admin also join a broadcast group for all new claims
            if (role is "HR" or "Admin")
                await Groups.AddToGroupAsync(Context.ConnectionId, "hr_broadcast");
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var empId = Context.User?.FindFirst("EmployeeId")?.Value;
        if (!string.IsNullOrEmpty(empId))
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"employee_{empId}");

        await base.OnDisconnectedAsync(exception);
    }

    // Client can call this to mark notifications read
    public async Task MarkRead(int notificationId)
    {
        // Controller handles DB update; hub just acknowledges
        await Clients.Caller.SendAsync("NotificationRead", notificationId);
    }
}