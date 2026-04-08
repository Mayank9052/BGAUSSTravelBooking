using System;
using System.Collections.Generic;

namespace BgaussTravel.API.Models;

public partial class TravelApproval
{
    public int ApprovalId { get; set; }

    public int RequestId { get; set; }

    public int ApproverId { get; set; }

    public int Level { get; set; }

    public string Action { get; set; } = null!;

    public string? Comments { get; set; }

    public DateTime? ActionAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual TravelEmployee Approver { get; set; } = null!;

    public virtual TravelRequest Request { get; set; } = null!;
}
