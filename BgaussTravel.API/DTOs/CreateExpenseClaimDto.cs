namespace BgaussTravel.API.DTOs;

public class CreateExpenseClaimDto
{
    public int     RequestId   { get; set; }
    public string  Category    { get; set; } = "";  // Flight|Train|Cab|Hotel|Food|Other
    public decimal Amount      { get; set; }
    public string  Currency    { get; set; } = "INR";
    public DateOnly ExpenseDate { get; set; }
    public string? Description { get; set; }
}