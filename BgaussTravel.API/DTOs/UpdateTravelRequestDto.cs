namespace BgaussTravel.API.DTOs;

public class UpdateTravelRequestDto
{
    public string?  TravelPurpose   { get; set; }
    public string?  Destination     { get; set; }
    public DateOnly? DepartureDate  { get; set; }
    public DateOnly? ReturnDate     { get; set; }
    public string?  TransportType   { get; set; }
    public decimal? EstimatedAmount { get; set; }
    public string?  Notes           { get; set; }
}