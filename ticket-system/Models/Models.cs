namespace TicketSystem.Models;

// ---- Lookup Tables ----

public class Yetki
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}

public class TicketStatus
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public bool IsClosed { get; set; }
    public int OrderNo { get; set; }
}

public class TicketPriority
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int Level { get; set; }
}

public class EntityType
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}

public class EventType
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}

// ---- Entity Tables ----

public class Firm
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public bool Inactive { get; set; }
}

public class User
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Mail { get; set; } = "";
    public string Password { get; set; } = "";
    public string? Tel { get; set; }
    public int? FirmId { get; set; }
    public int YetkiId { get; set; }
}

public class Tag
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string ColorHex { get; set; } = "#6b7280";
}

public class Ticket
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public int? FirmId { get; set; }
    public int CreatedBy { get; set; }
    public int? AssignedUserId { get; set; }
    public int StatusId { get; set; }
    public int PriorityId { get; set; }
    public string? DueDate { get; set; }
    public string? CreatedAt { get; set; }
    public string? UpdatedAt { get; set; }
}

public class TicketTag
{
    public int TicketId { get; set; }
    public int TagId { get; set; }
    public int CreatedBy { get; set; }
    public string? CreatedAt { get; set; }
    public string? RemovedAt { get; set; }
    public int? RemovedBy { get; set; }
}

public class EventLog
{
    public int Id { get; set; }
    public string? CreatedAt { get; set; }
    public int EntityTypeId { get; set; }
    public int EntityId { get; set; }
    public int EventTypeId { get; set; }
    public string? Description { get; set; }
    public int CreatedBy { get; set; }
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
}

// ---- DTOs ----

public record LoginRequest(string Mail, string Password);

public record TicketCreateDto(
    string Title,
    string? Description,
    int? FirmId,
    int? AssignedUserId,
    int? PriorityId,
    string? DueDate
);

public record TicketUpdateDto(
    string? Title,
    string? Description,
    int? AssignedUserId,
    int? StatusId,
    int? PriorityId,
    string? DueDate
);

public record CommentDto(string Description);

public record UserCreateDto(
    string Name,
    string Mail,
    string Password,
    string? Tel,
    int? FirmId,
    int YetkiId
);

public record UserUpdateDto(
    string? Name,
    string? Mail,
    string? Password,
    string? Tel,
    int? FirmId,
    int? YetkiId
);

public record FirmDto(string Name);
public record TagDto(string Name, string? Description, string? ColorHex);
