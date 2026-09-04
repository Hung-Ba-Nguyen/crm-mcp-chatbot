using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Backend_MCP.Models.Entities;

public class ChatMessage
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    public string SessionId { get; set; } = string.Empty;

    public string Sender { get; set; } = "user";

    public string Content { get; set; } = string.Empty;

    [BsonDateTimeOptions(Kind = DateTimeKind.Utc)]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    public List<McpToolCallLog> McpToolCalls { get; set; } = [];
}
