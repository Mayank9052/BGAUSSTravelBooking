namespace BgaussTravel.API.DTOs;

public class TravelRequestResponseDto
{
    public int     RequestId       { get; set; }
    public string  RequestCode     { get; set; } = "";
    public int     EmployeeId      { get; set; }
    public string  EmployeeName    { get; set; } = "";
    public string  EmployeeCode    { get; set; } = "";
    public string  Department      { get; set; } = "";
    public string  TravelPurpose   { get; set; } = "";
    public string  Destination     { get; set; } = "";
    public DateOnly DepartureDate  { get; set; }
    public DateOnly ReturnDate     { get; set; }
    public string  TransportType   { get; set; } = "";
    public decimal? EstimatedAmount { get; set; }
    public string  Status          { get; set; } = "";
    public DateTime? SubmittedAt   { get; set; }
    public DateTime CreatedAt      { get; set; }
    public string?  Notes          { get; set; }

     public double? OriginLatitude { get; set; }

    public double? OriginLongitude { get; set; }

    public string? OriginAddress { get; set; }

    public DateTime? LocationCapturedAt { get; set; }
    public List<ExpenseClaimResponseDto> ExpenseClaims { get; set; } = new();
}