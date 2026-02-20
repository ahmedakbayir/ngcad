using Microsoft.Data.Sqlite;
using Dapper;

namespace TicketSystem.Data;

public class DbHelper
{
    private readonly string _connectionString;

    public DbHelper(IConfiguration config)
    {
        _connectionString = config.GetConnectionString("DefaultConnection")
            ?? "Data Source=tickets.db";
    }

    public SqliteConnection CreateConnection()
    {
        var conn = new SqliteConnection(_connectionString);
        conn.Open();
        conn.Execute("PRAGMA foreign_keys = ON;");
        return conn;
    }

    public void Initialize()
    {
        using var conn = CreateConnection();

        var schemaPath = Path.Combine(AppContext.BaseDirectory, "schema.sql");
        if (!File.Exists(schemaPath))
            schemaPath = "schema.sql";

        var schema = File.ReadAllText(schemaPath);
        conn.Execute(schema);

        // Create default admin user if no users exist
        var userCount = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM user");
        if (userCount == 0)
        {
            // Default firm
            conn.Execute(
                "INSERT INTO firm (name) VALUES (@Name)",
                new { Name = "Sistem" });

            // Default admin: admin@admin.com / admin123
            var hash = BCrypt.Net.BCrypt.HashPassword("admin123");
            conn.Execute(
                @"INSERT INTO user (name, mail, password, tel, firm_id, yetki_id)
                  VALUES (@Name, @Mail, @Password, @Tel, 1, 1)",
                new { Name = "Admin", Mail = "admin@admin.com", Password = hash, Tel = "" });

            // Sample tags
            conn.Execute("INSERT INTO tag (name, description, color_hex) VALUES ('Bug', 'Hata bildirimi', '#ef4444')");
            conn.Execute("INSERT INTO tag (name, description, color_hex) VALUES ('Özellik', 'Yeni özellik talebi', '#3b82f6')");
            conn.Execute("INSERT INTO tag (name, description, color_hex) VALUES ('İyileştirme', 'Mevcut özellik iyileştirme', '#10b981')");
            conn.Execute("INSERT INTO tag (name, description, color_hex) VALUES ('Acil', 'Acil müdahale gerekli', '#f59e0b')");
        }
    }
}
