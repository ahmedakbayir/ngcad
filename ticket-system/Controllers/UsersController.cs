using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Dapper;
using TicketSystem.Data;
using TicketSystem.Models;

namespace TicketSystem.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly DbHelper _db;
    public UsersController(DbHelper db) => _db = db;

    [HttpGet]
    public IActionResult GetAll()
    {
        using var conn = _db.CreateConnection();
        var users = conn.Query(@"
            SELECT u.id, u.name, u.mail, u.tel, u.firm_id, u.yetki_id,
                   f.name AS firm_name, y.name AS yetki_name
            FROM user u
            LEFT JOIN firm f ON u.firm_id = f.id
            LEFT JOIN yetki y ON u.yetki_id = y.id
            ORDER BY u.name");
        return Ok(users);
    }

    [HttpGet("{id:int}")]
    public IActionResult GetById(int id)
    {
        using var conn = _db.CreateConnection();
        var user = conn.QueryFirstOrDefault(@"
            SELECT u.id, u.name, u.mail, u.tel, u.firm_id, u.yetki_id,
                   f.name AS firm_name, y.name AS yetki_name
            FROM user u
            LEFT JOIN firm f ON u.firm_id = f.id
            LEFT JOIN yetki y ON u.yetki_id = y.id
            WHERE u.id = @Id", new { Id = id });

        if (user == null) return NotFound();
        return Ok(user);
    }

    [HttpPost]
    [Authorize(Roles = "admin")]
    public IActionResult Create([FromBody] UserCreateDto dto)
    {
        using var conn = _db.CreateConnection();

        var exists = conn.ExecuteScalar<int>(
            "SELECT COUNT(*) FROM user WHERE mail = @Mail", new { dto.Mail });
        if (exists > 0)
            return BadRequest(new { message = "Bu e-posta adresi zaten kullanılıyor" });

        var hash = BCrypt.Net.BCrypt.HashPassword(dto.Password);
        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO user (name, mail, password, tel, firm_id, yetki_id)
            VALUES (@Name, @Mail, @Password, @Tel, @FirmId, @YetkiId);
            SELECT last_insert_rowid();",
            new { dto.Name, dto.Mail, Password = hash, dto.Tel, dto.FirmId, dto.YetkiId });

        return Ok(new { id, message = "Kullanıcı oluşturuldu" });
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "admin")]
    public IActionResult Update(int id, [FromBody] UserUpdateDto dto)
    {
        using var conn = _db.CreateConnection();

        var existing = conn.QueryFirstOrDefault<User>(
            "SELECT * FROM user WHERE id = @Id", new { Id = id });
        if (existing == null) return NotFound();

        string? passwordHash = null;
        if (!string.IsNullOrWhiteSpace(dto.Password))
            passwordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);

        conn.Execute(@"
            UPDATE user SET
                name = COALESCE(@Name, name),
                mail = COALESCE(@Mail, mail),
                password = COALESCE(@Password, password),
                tel = COALESCE(@Tel, tel),
                firm_id = COALESCE(@FirmId, firm_id),
                yetki_id = COALESCE(@YetkiId, yetki_id)
            WHERE id = @Id",
            new { dto.Name, dto.Mail, Password = passwordHash, dto.Tel, dto.FirmId, dto.YetkiId, Id = id });

        return Ok(new { message = "Kullanıcı güncellendi" });
    }

    [HttpGet("agents")]
    public IActionResult GetAgents()
    {
        using var conn = _db.CreateConnection();
        var agents = conn.Query(
            "SELECT id, name, mail FROM user WHERE yetki_id IN (1, 2) ORDER BY name");
        return Ok(agents);
    }
}
