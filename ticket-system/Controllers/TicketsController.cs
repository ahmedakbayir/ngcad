using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Dapper;
using TicketSystem.Data;
using TicketSystem.Models;

namespace TicketSystem.Controllers;

[ApiController]
[Route("api/tickets")]
[Authorize]
public class TicketsController : ControllerBase
{
    private readonly DbHelper _db;
    public TicketsController(DbHelper db) => _db = db;

    private int UserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private int YetkiId => int.Parse(User.FindFirstValue("YetkiId")!);

    [HttpGet]
    public IActionResult GetAll(
        [FromQuery] int? statusId,
        [FromQuery] int? priorityId,
        [FromQuery] int? assignedUserId,
        [FromQuery] int? firmId,
        [FromQuery] string? search)
    {
        using var conn = _db.CreateConnection();

        var sql = @"
            SELECT t.*,
                   ts.name AS status_name, ts.is_closed,
                   tp.name AS priority_name, tp.level AS priority_level,
                   u1.name AS created_by_name,
                   u2.name AS assigned_user_name,
                   f.name AS firm_name
            FROM ticket t
            LEFT JOIN ticket_status ts ON t.status_id = ts.id
            LEFT JOIN ticket_priority tp ON t.priority_id = tp.id
            LEFT JOIN user u1 ON t.created_by = u1.id
            LEFT JOIN user u2 ON t.assigned_user_id = u2.id
            LEFT JOIN firm f ON t.firm_id = f.id
            WHERE 1=1";

        var parameters = new DynamicParameters();

        // Customers only see their own firm's tickets
        if (YetkiId == 3)
        {
            var userFirmId = conn.ExecuteScalar<int?>(
                "SELECT firm_id FROM user WHERE id = @Id", new { Id = UserId });
            if (userFirmId.HasValue)
            {
                sql += " AND t.firm_id = @UserFirmId";
                parameters.Add("UserFirmId", userFirmId.Value);
            }
            else
            {
                sql += " AND t.created_by = @CreatorId";
                parameters.Add("CreatorId", UserId);
            }
        }

        if (statusId.HasValue) { sql += " AND t.status_id = @StatusId"; parameters.Add("StatusId", statusId); }
        if (priorityId.HasValue) { sql += " AND t.priority_id = @PriorityId"; parameters.Add("PriorityId", priorityId); }
        if (assignedUserId.HasValue) { sql += " AND t.assigned_user_id = @AssignedUserId"; parameters.Add("AssignedUserId", assignedUserId); }
        if (firmId.HasValue) { sql += " AND t.firm_id = @FirmId"; parameters.Add("FirmId", firmId); }
        if (!string.IsNullOrWhiteSpace(search))
        {
            sql += " AND (t.title LIKE @Search OR t.description LIKE @Search)";
            parameters.Add("Search", $"%{search}%");
        }

        sql += " ORDER BY t.created_at DESC";

        var tickets = conn.Query(sql, parameters);
        return Ok(tickets);
    }

    [HttpGet("{id:int}")]
    public IActionResult GetById(int id)
    {
        using var conn = _db.CreateConnection();

        var ticket = conn.QueryFirstOrDefault(@"
            SELECT t.*,
                   ts.name AS status_name, ts.is_closed,
                   tp.name AS priority_name, tp.level AS priority_level,
                   u1.name AS created_by_name,
                   u2.name AS assigned_user_name,
                   f.name AS firm_name
            FROM ticket t
            LEFT JOIN ticket_status ts ON t.status_id = ts.id
            LEFT JOIN ticket_priority tp ON t.priority_id = tp.id
            LEFT JOIN user u1 ON t.created_by = u1.id
            LEFT JOIN user u2 ON t.assigned_user_id = u2.id
            LEFT JOIN firm f ON t.firm_id = f.id
            WHERE t.id = @Id", new { Id = id });

        if (ticket == null) return NotFound();

        // Get tags
        var tags = conn.Query(@"
            SELECT tg.id, tg.name, tg.color_hex
            FROM ticket_tag tt
            JOIN tag tg ON tt.tag_id = tg.id
            WHERE tt.ticket_id = @TicketId AND tt.removed_at IS NULL",
            new { TicketId = id });

        // Get events
        var events = conn.Query(@"
            SELECT el.*, et.name AS event_type_name, u.name AS user_name
            FROM event_log el
            LEFT JOIN event_type et ON el.event_type_id = et.id
            LEFT JOIN user u ON el.created_by = u.id
            WHERE el.entity_type_id = 3 AND el.entity_id = @EntityId
            ORDER BY el.created_at DESC",
            new { EntityId = id });

        return Ok(new { ticket, tags, events });
    }

    [HttpPost]
    public IActionResult Create([FromBody] TicketCreateDto dto)
    {
        using var conn = _db.CreateConnection();

        // If customer, use their firm
        var firmId = dto.FirmId;
        if (YetkiId == 3 && !firmId.HasValue)
        {
            firmId = conn.ExecuteScalar<int?>(
                "SELECT firm_id FROM user WHERE id = @Id", new { Id = UserId });
        }

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO ticket (title, description, firm_id, created_by, assigned_user_id, status_id, priority_id, due_date)
            VALUES (@Title, @Description, @FirmId, @CreatedBy, @AssignedUserId, 1, @PriorityId, @DueDate);
            SELECT last_insert_rowid();",
            new
            {
                dto.Title,
                dto.Description,
                FirmId = firmId,
                CreatedBy = UserId,
                dto.AssignedUserId,
                PriorityId = dto.PriorityId ?? 2,
                dto.DueDate
            });

        // Log event
        conn.Execute(@"
            INSERT INTO event_log (entity_type_id, entity_id, event_type_id, description, created_by)
            VALUES (3, @EntityId, 1, @Desc, @UserId)",
            new { EntityId = id, Desc = $"Ticket oluşturuldu: {dto.Title}", UserId });

        return Ok(new { id, message = "Ticket oluşturuldu" });
    }

    [HttpPut("{id:int}")]
    public IActionResult Update(int id, [FromBody] TicketUpdateDto dto)
    {
        using var conn = _db.CreateConnection();

        var existing = conn.QueryFirstOrDefault<Ticket>(
            "SELECT * FROM ticket WHERE id = @Id", new { Id = id });
        if (existing == null) return NotFound();

        // Track changes for event log
        if (dto.StatusId.HasValue && dto.StatusId != existing.StatusId)
        {
            var oldStatus = conn.ExecuteScalar<string>("SELECT name FROM ticket_status WHERE id = @Id", new { Id = existing.StatusId });
            var newStatus = conn.ExecuteScalar<string>("SELECT name FROM ticket_status WHERE id = @Id", new { Id = dto.StatusId });
            var eventTypeId = dto.StatusId == 5 ? 4 : (dto.StatusId == 1 && existing.StatusId == 5 ? 10 : 5);
            conn.Execute(@"
                INSERT INTO event_log (entity_type_id, entity_id, event_type_id, description, created_by, old_value, new_value)
                VALUES (3, @EntityId, @EventTypeId, @Desc, @UserId, @Old, @New)",
                new { EntityId = id, EventTypeId = eventTypeId,
                      Desc = $"Durum değiştirildi: {oldStatus} → {newStatus}",
                      UserId, Old = oldStatus, New = newStatus });
        }

        if (dto.PriorityId.HasValue && dto.PriorityId != existing.PriorityId)
        {
            var oldPri = conn.ExecuteScalar<string>("SELECT name FROM ticket_priority WHERE id = @Id", new { Id = existing.PriorityId });
            var newPri = conn.ExecuteScalar<string>("SELECT name FROM ticket_priority WHERE id = @Id", new { Id = dto.PriorityId });
            conn.Execute(@"
                INSERT INTO event_log (entity_type_id, entity_id, event_type_id, description, created_by, old_value, new_value)
                VALUES (3, @EntityId, 6, @Desc, @UserId, @Old, @New)",
                new { EntityId = id, Desc = $"Öncelik değiştirildi: {oldPri} → {newPri}", UserId, Old = oldPri, New = newPri });
        }

        if (dto.AssignedUserId != null && dto.AssignedUserId != existing.AssignedUserId)
        {
            var newUser = conn.ExecuteScalar<string>("SELECT name FROM user WHERE id = @Id", new { Id = dto.AssignedUserId });
            var eventType = dto.AssignedUserId == 0 ? 11 : 3;
            conn.Execute(@"
                INSERT INTO event_log (entity_type_id, entity_id, event_type_id, description, created_by, new_value)
                VALUES (3, @EntityId, @EventType, @Desc, @UserId, @New)",
                new { EntityId = id, EventType = eventType,
                      Desc = dto.AssignedUserId == 0 ? "Atama kaldırıldı" : $"Atandı: {newUser}",
                      UserId, New = newUser });
        }

        conn.Execute(@"
            UPDATE ticket SET
                title = COALESCE(@Title, title),
                description = COALESCE(@Description, description),
                assigned_user_id = CASE WHEN @AssignedUserId = 0 THEN NULL ELSE COALESCE(@AssignedUserId, assigned_user_id) END,
                status_id = COALESCE(@StatusId, status_id),
                priority_id = COALESCE(@PriorityId, priority_id),
                due_date = COALESCE(@DueDate, due_date),
                updated_at = datetime('now', 'localtime')
            WHERE id = @Id",
            new { dto.Title, dto.Description, dto.AssignedUserId, dto.StatusId, dto.PriorityId, dto.DueDate, Id = id });

        return Ok(new { message = "Ticket güncellendi" });
    }

    [HttpPost("{id:int}/comments")]
    public IActionResult AddComment(int id, [FromBody] CommentDto dto)
    {
        using var conn = _db.CreateConnection();

        var exists = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM ticket WHERE id = @Id", new { Id = id });
        if (exists == 0) return NotFound();

        conn.Execute(@"
            INSERT INTO event_log (entity_type_id, entity_id, event_type_id, description, created_by)
            VALUES (3, @EntityId, 9, @Desc, @UserId)",
            new { EntityId = id, Desc = dto.Description, UserId });

        // Update ticket's updated_at
        conn.Execute("UPDATE ticket SET updated_at = datetime('now', 'localtime') WHERE id = @Id", new { Id = id });

        return Ok(new { message = "Yorum eklendi" });
    }

    [HttpGet("{id:int}/events")]
    public IActionResult GetEvents(int id)
    {
        using var conn = _db.CreateConnection();
        var events = conn.Query(@"
            SELECT el.*, et.name AS event_type_name, u.name AS user_name
            FROM event_log el
            LEFT JOIN event_type et ON el.event_type_id = et.id
            LEFT JOIN user u ON el.created_by = u.id
            WHERE el.entity_type_id = 3 AND el.entity_id = @EntityId
            ORDER BY el.created_at DESC",
            new { EntityId = id });
        return Ok(events);
    }

    [HttpPost("{id:int}/tags")]
    public IActionResult AddTag(int id, [FromQuery] int tagId)
    {
        using var conn = _db.CreateConnection();
        try
        {
            conn.Execute(@"
                INSERT OR REPLACE INTO ticket_tag (ticket_id, tag_id, created_by, created_at, removed_at, removed_by)
                VALUES (@TicketId, @TagId, @UserId, datetime('now', 'localtime'), NULL, NULL)",
                new { TicketId = id, TagId = tagId, UserId });

            var tagName = conn.ExecuteScalar<string>("SELECT name FROM tag WHERE id = @Id", new { Id = tagId });
            conn.Execute(@"
                INSERT INTO event_log (entity_type_id, entity_id, event_type_id, description, created_by, new_value)
                VALUES (3, @EntityId, 7, @Desc, @UserId, @New)",
                new { EntityId = id, Desc = $"Etiket eklendi: {tagName}", UserId, New = tagName });

            return Ok(new { message = "Etiket eklendi" });
        }
        catch { return BadRequest(new { message = "Etiket eklenemedi" }); }
    }

    [HttpDelete("{id:int}/tags/{tagId:int}")]
    public IActionResult RemoveTag(int id, int tagId)
    {
        using var conn = _db.CreateConnection();

        conn.Execute(@"
            UPDATE ticket_tag SET removed_at = datetime('now', 'localtime'), removed_by = @UserId
            WHERE ticket_id = @TicketId AND tag_id = @TagId",
            new { TicketId = id, TagId = tagId, UserId });

        var tagName = conn.ExecuteScalar<string>("SELECT name FROM tag WHERE id = @Id", new { Id = tagId });
        conn.Execute(@"
            INSERT INTO event_log (entity_type_id, entity_id, event_type_id, description, created_by, old_value)
            VALUES (3, @EntityId, 8, @Desc, @UserId, @Old)",
            new { EntityId = id, Desc = $"Etiket kaldırıldı: {tagName}", UserId, Old = tagName });

        return Ok(new { message = "Etiket kaldırıldı" });
    }
}
