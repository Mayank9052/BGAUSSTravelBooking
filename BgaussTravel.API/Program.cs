// BgaussTravel.API/Program.cs

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
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlOptions => sqlOptions.CommandTimeout(60)  // ← 60 seconds instead of default 30
    )
);

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

// ── JWT Authentication ────────────────────────────────────────────────────────
// Read config BEFORE using the values
var jwtKey    = builder.Configuration["Jwt:Key"]    ?? throw new InvalidOperationException("Jwt:Key is missing from appsettings.json");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "BgaussTravel";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false; // prevents ASP.NET remapping "EmployeeId" to a URI

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = jwtIssuer,
            ValidAudience            = jwtIssuer, // AuthController sets audience = issuer
            IssuerSigningKey         = new SymmetricSecurityKey(
                                           Encoding.UTF8.GetBytes(jwtKey)),
            NameClaimType            = "name",
            RoleClaimType            = "Role",
        };
    });

builder.Services.AddAuthorization();

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
    app.MapOpenApi();
    app.MapScalarApiReference(opt =>
    {
        opt.Title             = "BGauss Travel API";
        opt.DefaultHttpClient = new(ScalarTarget.CSharp, ScalarClient.HttpClient);
    });
}

app.UseHttpsRedirection();
app.UseCors();
app.UseStaticFiles();

// ⚠️ ORDER MATTERS — must be in this exact sequence
app.UseAuthentication();   // ← reads + validates the JWT
app.UseAuthorization();    // ← enforces [Authorize] attributes

app.MapControllers();
app.MapHub<TravelHub>("/hubs/travel");
app.MapHub<NotificationHub>("/hubs/notifications");

app.Run();