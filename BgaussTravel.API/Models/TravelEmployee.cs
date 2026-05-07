using System;
using System.Collections.Generic;

namespace BgaussTravel.API.Models;

public partial class TravelEmployee
{
    public int EmployeeId { get; set; }

    public string MicrosoftOid { get; set; } = null!;

    public string Email { get; set; } = null!;

    public string DisplayName { get; set; } = null!;

    public string? Department { get; set; }

    public string? EmployeeCode { get; set; }

    public string Role { get; set; } = null!;

    public bool IsActive { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? LastLoginAt { get; set; }

    public string? Designation { get; set; }

    public string? ReportingManager { get; set; }

    public string? ContactNumber { get; set; }

    public string? AlternateEmail { get; set; }

    public string? EmergencyContact { get; set; }

    public virtual ICollection<ExpenseClaim> ExpenseClaimApprovedByNavigations { get; set; } = new List<ExpenseClaim>();

    public virtual ICollection<ExpenseClaim> ExpenseClaimEmployees { get; set; } = new List<ExpenseClaim>();

    public virtual ICollection<TravelApproval> TravelApprovals { get; set; } = new List<TravelApproval>();

    public virtual ICollection<TravelNotification> TravelNotificationRecipients { get; set; } = new List<TravelNotification>();

    public virtual ICollection<TravelNotification> TravelNotificationSenders { get; set; } = new List<TravelNotification>();

    public virtual ICollection<TravelRequest> TravelRequests { get; set; } = new List<TravelRequest>();
}
