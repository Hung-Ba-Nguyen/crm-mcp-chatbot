namespace Backend_MCP.Data;

public static class DataSeeder
{
    public static async Task SeedAsync(IMongoDatabase database, IOptions<MongoDbSettings> options)
    {
        var mongoSettings = options.Value;
        var usersCollection = database.GetCollection<User>(mongoSettings.UsersCollectionName);
        var departmentsCollection = database.GetCollection<Department>(mongoSettings.DepartmentsCollectionName);
        var tasksCollection = database.GetCollection<TaskItem>(mongoSettings.TaskItemsCollectionName);
        var taskChatCollection = database.GetCollection<TaskChatMessage>(mongoSettings.TaskChatMessagesCollectionName);

        if (await usersCollection.CountDocumentsAsync(FilterDefinition<User>.Empty) > 0)
        {
            return;
        }

        var deptDevId = ObjectId.GenerateNewId().ToString();
        var deptHrId = ObjectId.GenerateNewId().ToString();

        var userAdminId = ObjectId.GenerateNewId().ToString();
        var userDev1Id = ObjectId.GenerateNewId().ToString();
        var userDev2Id = ObjectId.GenerateNewId().ToString();

        var departments = new List<Department>
        {
            new Department
            {
                Id = deptDevId,
                Name = "Phòng Phát Triển Phần Mềm",
                Code = "DEV",
                Description = "Chịu trách nhiệm phát triển phần mềm và hệ thống.",
                ManagerId = userAdminId,
                MemberIds = new List<string> { userDev1Id, userDev2Id },
                CreatedAt = DateTime.UtcNow.AddMonths(-6)
            },
            new Department
            {
                Id = deptHrId,
                Name = "Phòng Nhân Sự",
                Code = "HR",
                Description = "Quản lý nhân sự và tuyển dụng.",
                ManagerId = userAdminId,
                MemberIds = new List<string>(),
                CreatedAt = DateTime.UtcNow.AddMonths(-6)
            }
        };
        await departmentsCollection.InsertManyAsync(departments);

        //Password mặc định là "Password123@"
        var defaultPasswordHash = BCrypt.Net.BCrypt.HashPassword("Password123@");
        var users = new List<User>
        {
            new User
            {
                Id = userAdminId,
                FullName = "Nguyễn Văn Quản Lý",
                Email = "admin@company.com",
                PasswordHash = defaultPasswordHash,
                Role = "Admin",
                DepartmentId = deptDevId,
                IsActive = true,
                CreatedAt = DateTime.UtcNow.AddMonths(-6)
            },
            new User
            {
                Id = userDev1Id,
                FullName = "Trần Thị Lập Trình",
                Email = "dev1@company.com",
                PasswordHash = defaultPasswordHash,
                Role = "User",
                DepartmentId = deptDevId,
                IsActive = true,
                CreatedAt = DateTime.UtcNow.AddMonths(-5)
            },
            new User
            {
                Id = userDev2Id,
                FullName = "Lê Văn Kiểm Thử",
                Email = "dev2@company.com",
                PasswordHash = defaultPasswordHash,
                Role = "User",
                DepartmentId = deptDevId,
                IsActive = true,
                CreatedAt = DateTime.UtcNow.AddMonths(-4)
            }
        };
        await usersCollection.InsertManyAsync(users);

        var taskId1 = ObjectId.GenerateNewId().ToString();
        var taskId2 = ObjectId.GenerateNewId().ToString();

        var tasks = new List<TaskItem>
        {
            new TaskItem
            {
                Id = taskId1,
                Title = "Tích hợp AI Chatbot MCP",
                Description = "Xây dựng AI Chatbot cho phép truy vấn task và KPI thông qua MCP Protocol.",
                Status = TaskStatus.InProgress,
                Priority = TaskPriority.High,
                DepartmentId = deptDevId,
                AssigneeId = userDev1Id,
                SupervisorIds = new List<string> { userAdminId },
                DueDate = DateTime.UtcNow.AddDays(7),
                CreatedAt = DateTime.UtcNow.AddDays(-3)
            },
            new TaskItem
            {
                Id = taskId2,
                Title = "Tối ưu hóa Query MongoDB",
                Description = "Đánh Index cho các trường thường xuyên truy vấn trong MongoDB.",
                Status = TaskStatus.Completed,
                Priority = TaskPriority.Critical,
                DepartmentId = deptDevId,
                AssigneeId = userDev1Id,
                SupervisorIds = new List<string> { userAdminId },
                DueDate = DateTime.UtcNow.AddDays(-1),
                CreatedAt = DateTime.UtcNow.AddDays(-10),
                CompletedAt = DateTime.UtcNow.AddDays(-1)
            }
        };
        await tasksCollection.InsertManyAsync(tasks);

        var messages = new List<TaskChatMessage>
        {
            new TaskChatMessage
            {
                Id = ObjectId.GenerateNewId().ToString(),
                TaskId = taskId1,
                AuthorId = userAdminId,
                AuthorName = "Nguyễn Văn Quản Lý",
                Message = "Cần hoàn thiện module này đúng hạn trước tuần sau nhé.",
                CreatedAt = DateTime.UtcNow.AddDays(-2)
            },
            new TaskChatMessage
            {
                Id = ObjectId.GenerateNewId().ToString(),
                TaskId = taskId1,
                AuthorId = userDev1Id,
                AuthorName = "Trần Thị Lập Trình",
                Message = "Dạ vâng, em đang tiến hành tích hợp Gemini API vào MCP Service.",
                CreatedAt = DateTime.UtcNow.AddDays(-1)
            }
        };
        await taskChatCollection.InsertManyAsync(messages);
    }
}