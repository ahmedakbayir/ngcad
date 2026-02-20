using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Dapper;
using TicketSystem.Data;
using TicketSystem.Models;

namespace TicketSystem.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly DbHelper _db;
    public AuthController(DbHelper db) => _db = db;

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        using var conn = _db.CreateConnection();
        var user = conn.QueryFirstOrDefault<User>(
            "SELECT * FROM user WHERE mail = @Mail", new { req.Mail });

        if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.Password))
            return Unauthorized(new { message = "Geçersiz e-posta veya şifre" });

        var yetki = conn.QueryFirstOrDefault<Yetki>(
            "SELECT * FROM yetki WHERE id = @Id", new { Id = user.YetkiId });

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Email, user.Mail),
            new("YetkiId", user.YetkiId.ToString()),
            new(ClaimTypes.Role, yetki?.Name ?? "customer")
        };

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity));

        return Ok(new
        {
            user.Id,
            user.Name,
            user.Mail,
            user.YetkiId,
            Yetki = yetki?.Name,
            user.FirmId
        });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Ok(new { message = "Çıkış yapıldı" });
    }

    [Authorize]
    [HttpGet("me")]
    public IActionResult Me()
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        using var conn = _db.CreateConnection();

        var user = conn.QueryFirstOrDefault<User>(
            "SELECT id, name, mail, tel, firm_id, yetki_id FROM user WHERE id = @Id",
            new { Id = userId });

        if (user == null) return NotFound();

        var yetki = conn.QueryFirstOrDefault<Yetki>(
            "SELECT * FROM yetki WHERE id = @Id", new { Id = user.YetkiId });

        return Ok(new
        {
            user.Id,
            user.Name,
            user.Mail,
            user.Tel,
            user.FirmId,
            user.YetkiId,
            Yetki = yetki?.Name
        });
    }
}
