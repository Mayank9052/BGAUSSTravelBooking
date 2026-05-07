namespace BgaussTravel.API.DTOs;
public class UpdateEmployeeProfileDto
{
    public string? DisplayName      { get; set; }
    public string? Department       { get; set; }
    public string? Designation      { get; set; }
    public string? ReportingManager { get; set; }
    public string? ContactNumber    { get; set; }
    public string? AlternateEmail   { get; set; }
    public string? EmergencyContact { get; set; }
}
