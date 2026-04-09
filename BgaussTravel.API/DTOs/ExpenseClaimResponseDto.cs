namespace BgaussTravel.API.DTOs;

public class ExpenseClaimResponseDto
{
    public int     ClaimId         { get; set; }
    public string  ClaimCode       { get; set; } = "";
    public int     RequestId       { get; set; }
    public string? RequestCode     { get; set; }
    public int     EmployeeId      { get; set; }
    public string  EmployeeName    { get; set; } = "";
    public string  Category        { get; set; } = "";
    public decimal Amount          { get; set; }
    public string  Currency        { get; set; } = "";
    public DateOnly ExpenseDate    { get; set; }
    public string? Description     { get; set; }
    public string? BillPath        { get; set; }
    public string? BillFileName    { get; set; }
    public string  Status          { get; set; } = "";
    public string? RejectionReason { get; set; }
    public DateTime? ApprovedAt    { get; set; }
    public DateTime? ReimbursedAt  { get; set; }
    public DateTime CreatedAt      { get; set; }
}