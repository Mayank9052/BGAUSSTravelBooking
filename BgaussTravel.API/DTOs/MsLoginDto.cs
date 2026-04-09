// DTOs/MsLoginDto.cs

namespace BgaussTravel.API.DTOs;

public class MsLoginDto
{
    public string  Email        { get; set; } = null!;
    public string? DisplayName  { get; set; }
    public string? EmployeeId   { get; set; }   // employee code from Azure AD
    public string? Department   { get; set; }
    public string? MicrosoftOid { get; set; }   // Azure AD object ID (optional)
    public string? MsToken      { get; set; }   // MS Graph access token (optional, for server-side validation)
}