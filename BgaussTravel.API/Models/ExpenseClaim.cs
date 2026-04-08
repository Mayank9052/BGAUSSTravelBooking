using System;
using System.Collections.Generic;

namespace BgaussTravel.API.Models;

public partial class ExpenseClaim
{
    public int ClaimId { get; set; }

    public int RequestId { get; set; }

    public int EmployeeId { get; set; }

    public string ClaimCode { get; set; } = null!;

    public string Category { get; set; } = null!;

    public decimal Amount { get; set; }

    public string Currency { get; set; } = null!;

    public DateOnly ExpenseDate { get; set; }

    public string? Description { get; set; }

    public string? BillPath { get; set; }

    public string? BillFileName { get; set; }

    public string Status { get; set; } = null!;

    public int? ApprovedBy { get; set; }

    public DateTime? ApprovedAt { get; set; }

    public string? RejectionReason { get; set; }

    public DateTime? ReimbursedAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public virtual TravelEmployee? ApprovedByNavigation { get; set; }

    public virtual TravelEmployee Employee { get; set; } = null!;

    public virtual TravelRequest Request { get; set; } = null!;

    public virtual ICollection<TravelNotification> TravelNotifications { get; set; } = new List<TravelNotification>();
}
