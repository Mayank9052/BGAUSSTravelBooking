// BgaussTravel.API/Program.cs
// .NET 10 — uses built-in OpenAPI + Scalar (no Swashbuckle needed)

using System.Text;
using BgaussTravel.API.Data;
using BgaussTravel.API.Hubs;
using BgaussTravel.API.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// ── Database ──────────────────────────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sql => sql.EnableRetryOnFailure(3)));

// ── JWT Auth ──────────────────────────────────────────────────────────────────
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is required in appsettings.json");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuer           = true,
            ValidIssuer              = builder.Configuration["Jwt:Issuer"] ?? "BgaussTravel",
            ValidateAudience         = true,
            ValidAudience            = builder.Configuration["Jwt:Issuer"] ?? "BgaussTravel",
            ValidateLifetime         = true,
        };
        // SignalR: read JWT from query string on /hubs/* paths
        opt.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"].ToString();
                if (!string.IsNullOrEmpty(token) &&
                    ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// ── SignalR ───────────────────────────────────────────────────────────────────
builder.Services.AddSignalR();

// ── App Services ──────────────────────────────────────────────────────────────
builder.Services.AddScoped<ICodeSequenceService, CodeSequenceService>();
builder.Services.AddScoped<ITravelNotificationService, TravelNotificationService>();

// ── CORS ──────────────────────────────────────────────────────────────────────
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.WithOrigins(
        "http://localhost:5173",
        "http://localhost:3000",
        builder.Configuration["AppUrl"] ?? "https://travel.bgauss.com"
    )
    .AllowAnyMethod()
    .AllowAnyHeader()
    .AllowCredentials()));

// ── Controllers + built-in OpenAPI (.NET 10) ──────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddOpenApi(opt =>
{
    opt.AddDocumentTransformer((doc, _, _) =>
    {
        doc.Info.Title       = "BGauss Travel API";
        doc.Info.Version     = "v1";
        doc.Info.Description = "Travel booking and expense management API for BGauss employees";
        return Task.CompletedTask;
    });
});

var app = builder.Build();

// ── Middleware pipeline ───────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    // Exposes /openapi/v1.json
    app.MapOpenApi();

    // Scalar UI — same experience as Swagger UI but .NET 10 compatible
    // Access at: https://localhost:7136/scalar/v1
    app.MapScalarApiReference(opt =>
    {
        opt.Title              = "BGauss Travel API";
        opt.DefaultHttpClient  = new(ScalarTarget.CSharp, ScalarClient.HttpClient);
        opt.Authentication     = new ScalarAuthenticationOptions
        {
            PreferredSecurityScheme = "Bearer",
        };
    });
}

app.UseHttpsRedirection(); // ✅ ADD THIS
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseStaticFiles();           // serves /uploads/bills/...
app.MapControllers();
app.MapHub<TravelHub>("/hubs/travel");
app.MapHub<NotificationHub>("/hubs/notifications");

app.Run();