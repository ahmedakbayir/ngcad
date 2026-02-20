using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Dapper;
using TicketSystem.Data;

namespace TicketSystem.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly DbHelper _db;
    public DashboardController(DbHelper db) => _db = db;

    private int UserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("stats")]
    public IActionResult Stats()
    {
        using var conn = _db.CreateConnection();

        var total = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM ticket");
        var open = conn.ExecuteScalar<int>(
            "SELECT COUNT(*) FROM ticket t JOIN ticket_status ts ON t.status_id = ts.id WHERE ts.is_closed = 0");
        var myTickets = conn.ExecuteScalar<int>(
            "SELECT COUNT(*) FROM ticket WHERE assigned_user_id = @Id AND status_id != 5", new { Id = UserId });
        var critical = conn.ExecuteScalar<int>(
            "SELECT COUNT(*) FROM ticket WHERE priority_id = 4 AND status_id != 5");

        var byStatus = conn.Query(@"
            SELECT ts.name, ts.id, COUNT(t.id) AS count
            FROM ticket_status ts
            LEFT JOIN ticket t ON t.status_id = ts.id
            GROUP BY ts.id, ts.name
            ORDER BY ts.order_no");

        var byPriority = conn.Query(@"
            SELECT tp.name, tp.id, COUNT(t.id) AS count
            FROM ticket_priority tp
            LEFT JOIN ticket t ON t.priority_id = tp.id
            GROUP BY tp.id, tp.name
            ORDER BY tp.level");

        var recentTickets = conn.Query(@"
            SELECT t.id, t.title, t.created_at, t.updated_at,
                   ts.name AS status_name,
                   tp.name AS priority_name,
                   u.name AS assigned_user_name,
                   f.name AS firm_name
            FROM ticket t
            LEFT JOIN ticket_status ts ON t.status_id = ts.id
            LEFT JOIN ticket_priority tp ON t.priority_id = tp.id
            LEFT JOIN user u ON t.assigned_user_id = u.id
            LEFT JOIN firm f ON t.firm_id = f.id
            ORDER BY t.updated_at DESC
            LIMIT 10");

        return Ok(new { total, open, myTickets, critical, byStatus, byPriority, recentTickets });
    }

    [HttpGet("lookups")]
    public IActionResult Lookups()
    {
        using var conn = _db.CreateConnection();
        var statuses = conn.Query("SELECT * FROM ticket_status ORDER BY order_no");
        var priorities = conn.Query("SELECT * FROM ticket_priority ORDER BY level");
        var firms = conn.Query("SELECT id, name FROM firm WHERE inactive = 0 ORDER BY name");
        var agents = conn.Query("SELECT id, name FROM user WHERE yetki_id IN (1, 2) ORDER BY name");
        var tags = conn.Query("SELECT * FROM tag ORDER BY name");
        return Ok(new { statuses, priorities, firms, agents, tags });
    }
}
