namespace BgaussTravel.API.DTOs;

public class ApprovalResponseDto
{
    public int     ApprovalId  { get; set; }
    public int     RequestId   { get; set; }
    public string  RequestCode { get; set; } = "";
    public int     ApproverId  { get; set; }
    public string  ApproverName{ get; set; } = "";
    public int     Level       { get; set; }
    public string  Action      { get; set; } = "";
    public string? Comments    { get; set; }
    public DateTime? ActionAt  { get; set; }
    public DateTime CreatedAt  { get; set; }
}