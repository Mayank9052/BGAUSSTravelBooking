namespace BgaussTravel.API.DTOs;
public class CreateBookingDto
{
    public int     EmployeeId    { get; set; }
    public string Department    { get; set; }   // fallback if employee lookup fails
    public string  TransportType { get; set; } = null!;
    public string  Destination   { get; set; } = null!;
    public string  TravelPurpose { get; set; } = null!;
    public string  DepartureDate { get; set; } = null!;
    public string  ReturnDate    { get; set; } = null!;
    public decimal? EstimatedAmount { get; set; }
    public string?  Notes           { get; set; }
    public double?  OriginLatitude  { get; set; }
    public double?  OriginLongitude { get; set; }
    public string?  OriginAddress   { get; set; }
    public DateTime? LocationCapturedAt { get; set; }
}
