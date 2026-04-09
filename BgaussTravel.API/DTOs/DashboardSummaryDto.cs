namespace BgaussTravel.API.DTOs;

public class DashboardSummaryDto
{
    public int     TotalRequests    { get; set; }
    public int     PendingRequests  { get; set; }
    public int     ApprovedRequests { get; set; }
    public int     RejectedRequests { get; set; }
    public decimal TotalExpenses    { get; set; }
    public decimal PendingExpenses  { get; set; }
    public decimal ApprovedExpenses { get; set; }
    public int     TotalEmployees   { get; set; }
}