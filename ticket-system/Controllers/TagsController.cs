using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Dapper;
using TicketSystem.Data;
using TicketSystem.Models;

namespace TicketSystem.Controllers;

[ApiController]
[Route("api/tags")]
[Authorize]
public class TagsController : ControllerBase
{
    private readonly DbHelper _db;
    public TagsController(DbHelper db) => _db = db;

    [HttpGet]
    public IActionResult GetAll()
    {
        using var conn = _db.CreateConnection();
        var tags = conn.Query(@"
            SELECT t.*,
                   (SELECT COUNT(*) FROM ticket_tag WHERE tag_id = t.id AND removed_at IS NULL) AS usage_count
            FROM tag t
            ORDER BY t.name");
        return Ok(tags);
    }

    [HttpPost]
    [Authorize(Roles = "admin,agent")]
    public IActionResult Create([FromBody] TagDto dto)
    {
        using var conn = _db.CreateConnection();
        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO tag (name, description, color_hex) VALUES (@Name, @Description, @ColorHex);
            SELECT last_insert_rowid();",
            new { dto.Name, dto.Description, ColorHex = dto.ColorHex ?? "#6b7280" });
        return Ok(new { id, message = "Etiket oluşturuldu" });
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "admin,agent")]
    public IActionResult Update(int id, [FromBody] TagDto dto)
    {
        using var conn = _db.CreateConnection();
        conn.Execute(@"
            UPDATE tag SET name = @Name, description = @Description, color_hex = @ColorHex
            WHERE id = @Id",
            new { dto.Name, dto.Description, ColorHex = dto.ColorHex ?? "#6b7280", Id = id });
        return Ok(new { message = "Etiket güncellendi" });
    }
}
