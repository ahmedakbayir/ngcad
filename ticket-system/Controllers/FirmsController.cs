using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Dapper;
using TicketSystem.Data;
using TicketSystem.Models;

namespace TicketSystem.Controllers;

[ApiController]
[Route("api/firms")]
[Authorize]
public class FirmsController : ControllerBase
{
    private readonly DbHelper _db;
    public FirmsController(DbHelper db) => _db = db;

    [HttpGet]
    public IActionResult GetAll()
    {
        using var conn = _db.CreateConnection();
        var firms = conn.Query(@"
            SELECT f.*,
                   (SELECT COUNT(*) FROM user WHERE firm_id = f.id) AS user_count,
                   (SELECT COUNT(*) FROM ticket WHERE firm_id = f.id) AS ticket_count
            FROM firm f
            ORDER BY f.name");
        return Ok(firms);
    }

    [HttpGet("{id:int}")]
    public IActionResult GetById(int id)
    {
        using var conn = _db.CreateConnection();
        var firm = conn.QueryFirstOrDefault("SELECT * FROM firm WHERE id = @Id", new { Id = id });
        if (firm == null) return NotFound();
        return Ok(firm);
    }

    [HttpPost]
    [Authorize(Roles = "admin")]
    public IActionResult Create([FromBody] FirmDto dto)
    {
        using var conn = _db.CreateConnection();
        var id = conn.ExecuteScalar<long>(
            "INSERT INTO firm (name) VALUES (@Name); SELECT last_insert_rowid();",
            new { dto.Name });
        return Ok(new { id, message = "Firma oluşturuldu" });
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "admin")]
    public IActionResult Update(int id, [FromBody] FirmDto dto)
    {
        using var conn = _db.CreateConnection();
        conn.Execute("UPDATE firm SET name = @Name WHERE id = @Id",
            new { dto.Name, Id = id });
        return Ok(new { message = "Firma güncellendi" });
    }

    [HttpPut("{id:int}/toggle")]
    [Authorize(Roles = "admin")]
    public IActionResult Toggle(int id)
    {
        using var conn = _db.CreateConnection();
        conn.Execute("UPDATE firm SET inactive = 1 - inactive WHERE id = @Id", new { Id = id });
        return Ok(new { message = "Firma durumu güncellendi" });
    }
}
