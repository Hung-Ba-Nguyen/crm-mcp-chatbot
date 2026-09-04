namespace Backend_MCP.Configurations;

public class MongoDbSettings
{
    public string ConnectionString { get; set; } = string.Empty;

    public string DatabaseName { get; set; } = string.Empty;

    public string TaskItemsCollectionName { get; set; } = "task_items";

    public string DepartmentsCollectionName { get; set; } = "departments";

    public string UsersCollectionName { get; set; } = "users";

    public string TaskChatMessagesCollectionName { get; set; } = "task_chat_messages";

    public string ChatSessionsCollectionName { get; set; } = "chat_sessions";

    public string ChatMessagesCollectionName { get; set; } = "chat_messages";
}