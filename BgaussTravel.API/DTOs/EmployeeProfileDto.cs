namespace BgaussTravel.API.DTOs;
public class EmployeeProfileDto
{
    public int      EmployeeId       { get; set; }
    public string   Email            { get; set; } = "";
    public string   EmployeeCode     { get; set; } = "";
    public string   Role             { get; set; } = "";
    public string   DisplayName      { get; set; } = "";
    public string   Department       { get; set; } = "";
    public string   Designation      { get; set; } = "";
    public string   ReportingManager { get; set; } = "";
    public string   ContactNumber    { get; set; } = "";
    public string   AlternateEmail   { get; set; } = "";
    public string   EmergencyContact { get; set; } = "";
    public DateTime? LastLoginAt     { get; set; }
}
