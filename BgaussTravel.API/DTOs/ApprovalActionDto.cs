namespace BgaussTravel.API.DTOs;

public class ApprovalActionDto
{
    public string Action   { get; set; } = "";  // Approve | Reject
    public string? Comments { get; set; }
}