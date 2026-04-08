// Program.cs — BgaussTravel.API
using System.Text;
using BgaussTravel.API.Data;
using BgaussTravel.API.Hubs;
using BgaussTravel.API.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ── Database ──────────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// ── JWT Auth ──────────────────────────────────────────────────
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is required");

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

        // Allow SignalR to pass JWT via query string
        opt.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) &&
                    ctx.HttpContext.Request.Path.StartsWithSegments("/hubs/travel"))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// ── SignalR ───────────────────────────────────────────────────
builder.Services.AddSignalR();

// ── Services ──────────────────────────────────────────────────
builder.Services.AddScoped<NotificationService>();

// ── CORS — allow React dev + production ─────────────────────
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.WithOrigins(
        "http://localhost:5173",   // Vite dev
        "http://localhost:3000",
        builder.Configuration["AppUrl"] ?? "https://travel.bgauss.com"
    )
    .AllowAnyMethod()
    .AllowAnyHeader()
    .AllowCredentials()           // required for SignalR
));

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseStaticFiles();            // serves /TravelBills/...
app.MapControllers();
app.MapHub<TravelHub>("/hubs/travel");

app.Run();