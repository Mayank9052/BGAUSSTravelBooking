namespace BgaussTravel.API.DTOs;

public class NotificationResponseDto
{
    public int    NotificationId { get; set; }
    public string Type           { get; set; } = "";
    public string Title          { get; set; } = "";
    public string Message        { get; set; } = "";
    public bool   IsRead         { get; set; }
    public int?   RequestId      { get; set; }
    public int?   ClaimId        { get; set; }
    public DateTime CreatedAt    { get; set; }
}