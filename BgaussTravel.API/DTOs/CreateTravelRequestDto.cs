namespace BgaussTravel.API.DTOs;
public class CreateTravelRequestDto
{
    public int EmployeeId { get; set; }   // ← NEW: sent from frontend with session user's employee record ID
    public string TravelPurpose  { get; set; } = "";
    public string Destination    { get; set; } = "";
    public DateOnly DepartureDate { get; set; }
    public DateOnly ReturnDate    { get; set; }
    public string TransportType  { get; set; } = "";   // Flight|Train|Cab|Hotel
    public decimal? EstimatedAmount { get; set; }
    public string?  Notes           { get; set; }
}