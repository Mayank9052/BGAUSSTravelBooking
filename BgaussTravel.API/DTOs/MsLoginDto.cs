namespace BgaussTravel.API.DTOs;
public class MsLoginDto
{
    public string? MicrosoftOid { get; set; }
    public string? Email        { get; set; }
    public string? DisplayName  { get; set; }
    public string? EmployeeId   { get; set; }
    public string? Department   { get; set; }
    public string? MsToken      { get; set; }
}