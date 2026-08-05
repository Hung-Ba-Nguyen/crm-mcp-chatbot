# Stage 1: Base Runtime (Chạy trên Linux)
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

# Stage 2: Build SDK
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src

# Copy duy nhất file csproj vào để restore nuget
COPY ["Backend_MCP.csproj", "./"]
RUN dotnet restore "Backend_MCP.csproj"

# Copy toàn bộ source code vào
COPY . .
RUN dotnet build "Backend_MCP.csproj" -c $BUILD_CONFIGURATION -o /app/build

# Stage 3: Publish
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "Backend_MCP.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# Stage 4: Final Image
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Backend_MCP.dll"]