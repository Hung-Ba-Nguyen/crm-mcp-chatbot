# Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj va restore dependencies
COPY ["Backend_MCP.csproj", "./"]
RUN dotnet restore "Backend_MCP.csproj"

# Copy toan bo source code va publish
COPY . .
RUN dotnet publish "Backend_MCP.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Stage 2: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Cấu hình để ASP.NET Core lắng nghe đúng cổng PORT do Render cấp phát
ENV DOTNET_USE_POLLING_FILE_WATCHER=true
ENV ASPNETCORE_URLS=http://+:${PORT:-8080}

ENTRYPOINT ["dotnet", "Backend_MCP.dll"]