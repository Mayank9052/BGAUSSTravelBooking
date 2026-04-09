// Controllers/UserController.cs
// Admin user management — list, promote/demote, activate/deactivate
using BgaussTravel.API.Data;
using BgaussTravel.API.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BgaussTravel.API.Controllers;

[ApiController]
[Route("api/[controller]")]
//[Authorize(Roles="Admin,HR")]
public class UserController : ControllerBase
{
    private readonly AppDbContext _db;
    public UserController(AppDbContext db) => _db=db;

    // GET /api/User
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? role, [FromQuery] string? search)
    {
        var q = _db.TravelEmployees.AsQueryable();
        if (!string.IsNullOrWhiteSpace(role))   q=q.Where(u=>u.Role==role);
        if (!string.IsNullOrWhiteSpace(search))
            q=q.Where(u=>u.DisplayName.Contains(search) || (u.Email != null && u.Email.Contains(search)));
        var users = await q.OrderBy(u=>u.DisplayName)
            .Select(u=>new{
                u.EmployeeId, u.DisplayName, u.Email, u.EmployeeCode,
                u.Department, u.Role, u.IsActive, u.CreatedAt, u.LastLoginAt,
            }).ToListAsync();
        return Ok(users);
    }

    // PUT /api/User/{id}/role
    [HttpPut("{id:int}/role")]
    //[Authorize(Roles="Admin")]
    public async Task<IActionResult> UpdateRole(int id, [FromBody] UpdateRoleDto dto)
    {
        var allowed = new[]{"Employee","HR","Admin"};
        if (!allowed.Contains(dto.Role)) return BadRequest(new{message="Invalid role."});
        var user = await _db.TravelEmployees.FindAsync(id);
        if (user==null) return NotFound();
        user.Role=dto.Role;
        await _db.SaveChangesAsync();
        return Ok(new{user.EmployeeId, user.Role});
    }

    // PUT /api/User/{id}/toggle-active
    [HttpPut("{id:int}/toggle-active")]
    [Authorize(Roles="Admin")]
    public async Task<IActionResult> ToggleActive(int id)
    {
        var user = await _db.TravelEmployees.FindAsync(id);
        if (user==null) return NotFound();
        user.IsActive=!user.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new{user.EmployeeId, user.IsActive});
    }
}
