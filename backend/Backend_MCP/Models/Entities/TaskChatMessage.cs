using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Backend_MCP.Models.Entities;

public class TaskChatMessage
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    public string TaskId { get; set; } = string.Empty;

    public string AuthorId { get; set; } = string.Empty;

    public string AuthorName { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    [BsonDateTimeOptions(Kind = DateTimeKind.Utc)]
    public DateTime CreatedAt { get; set; }
}