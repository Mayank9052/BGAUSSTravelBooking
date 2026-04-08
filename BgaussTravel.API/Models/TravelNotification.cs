using System;
using System.Collections.Generic;

namespace BgaussTravel.API.Models;

public partial class TravelNotification
{
    public int NotificationId { get; set; }

    public int RecipientId { get; set; }

    public int? SenderId { get; set; }

    public int? RequestId { get; set; }

    public int? ClaimId { get; set; }

    public string Type { get; set; } = null!;

    public string Title { get; set; } = null!;

    public string Message { get; set; } = null!;

    public bool IsRead { get; set; }

    public bool EmailSent { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual ExpenseClaim? Claim { get; set; }

    public virtual TravelEmployee Recipient { get; set; } = null!;

    public virtual TravelRequest? Request { get; set; }

    public virtual TravelEmployee? Sender { get; set; }
}
