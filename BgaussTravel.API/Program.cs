using System.Text;
using BgaussTravel.API.Data;
using BgaussTravel.API.Hubs;
using BgaussTravel.API.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// ── DATABASE ─────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlOptions => sqlOptions.CommandTimeout(60)
    )
);

// ── SIGNALR ─────────────────────────────────────────────
builder.Services.AddSignalR();

// ── SERVICES ────────────────────────────────────────────
builder.Services.AddScoped<ICodeSequenceService, CodeSequenceService>();
builder.Services.AddScoped<ITravelNotificationService, TravelNotificationService>();

// ── CORS ───────────────────────────────────────────────
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
{
    var allowedOrigins = builder.Configuration
        .GetSection("AllowedOrigins")
        .Get<string[]>()
        ?? new[] { "http://localhost:5173" };

    p.WithOrigins(allowedOrigins)
     .AllowAnyMethod()
     .AllowAnyHeader()
     .AllowCredentials();
}));

// ── JWT AUTH ───────────────────────────────────────────
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is missing");

var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "BgaussTravel";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtIssuer,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtKey)
            ),
            NameClaimType = "name",
            RoleClaimType = "Role",
        };

        // ✅ REQUIRED FOR SIGNALR (VERY IMPORTANT)
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;

                if (!string.IsNullOrEmpty(accessToken) &&
                    path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// ── CONTROLLERS ────────────────────────────────────────
builder.Services.AddControllers();

// ── SWAGGER ───────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "BGauss Travel API",
        Version = "v1"
    });
});

var app = builder.Build();

// 🔥 CRITICAL FIX FOR IIS (DON’T REMOVE)
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor
});


// ✅ ENABLE SWAGGER ALWAYS (for debugging server)
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "BGauss Travel API v1");
    c.RoutePrefix = "swagger";
});


// ❌ DO NOT USE THIS IN IIS (causes your HTTPS errors)
// app.UseHttpsRedirection();


app.UseStaticFiles();

app.UseRouting();   // ✅ MUST BE BEFORE CORS

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();


// ── ROUTES ─────────────────────────────────────────────
app.MapControllers();

app.MapHub<TravelHub>("/hubs/travel");
app.MapHub<NotificationHub>("/hubs/notifications");

app.MapFallbackToFile("index.html");

app.Run();