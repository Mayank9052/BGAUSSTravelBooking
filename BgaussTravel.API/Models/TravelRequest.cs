using System;
using System.Collections.Generic;

namespace BgaussTravel.API.Models;

public partial class TravelRequest
{
    public int RequestId { get; set; }

    public string RequestCode { get; set; } = null!;

    public int EmployeeId { get; set; }

    public string TravelPurpose { get; set; } = null!;

    public string Destination { get; set; } = null!;

    public DateOnly DepartureDate { get; set; }

    public DateOnly ReturnDate { get; set; }

    public string TransportType { get; set; } = null!;

    public decimal? EstimatedAmount { get; set; }

    public string Status { get; set; } = null!;

    public DateTime? SubmittedAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public string? Notes { get; set; }

    public double? OriginLatitude { get; set; }

    public double? OriginLongitude { get; set; }

    public string? OriginAddress { get; set; }

    public DateTime? LocationCapturedAt { get; set; }

    public string? Department { get; set; }

    public virtual TravelEmployee Employee { get; set; } = null!;

    public virtual ICollection<ExpenseClaim> ExpenseClaims { get; set; } = new List<ExpenseClaim>();

    public virtual ICollection<TravelApproval> TravelApprovals { get; set; } = new List<TravelApproval>();

    public virtual ICollection<TravelNotification> TravelNotifications { get; set; } = new List<TravelNotification>();
}
