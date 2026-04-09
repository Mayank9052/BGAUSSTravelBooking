namespace BgaussTravel.API.DTOs;

public class ExpenseSummaryDto
{
    public decimal TotalPending     { get; set; }
    public decimal TotalApproved    { get; set; }
    public decimal TotalReimbursed  { get; set; }
    public int     PendingCount     { get; set; }
    public int     ApprovedCount    { get; set; }
    public int     RejectedCount    { get; set; }
    public int     ReimbursedCount  { get; set; }
}