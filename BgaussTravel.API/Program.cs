// BgaussTravel.API/Program.cs
// ADDED: explicit MIME type mappings for images and PDFs served from /uploads
// This fixes "unsupported format" when clicking download on IIS.

using System.Text;
using BgaussTravel.API.Data;
using BgaussTravel.API.Hubs;
using BgaussTravel.API.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// ── Database ──────────────────────────────────────────────────────────────────
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
builder.Services.AddScoped<ITravelEmailService, TravelEmailService>();

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
    ?? throw new InvalidOperationException("Jwt:Key is missing from appsettings.json");

var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "BgaussTravel";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = jwtIssuer,
            ValidAudience            = jwtIssuer,
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            NameClaimType            = "name",
            RoleClaimType            = "Role",
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();

// ── SWAGGER ───────────────────────────────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "BGauss Travel API", Version = "v1" });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization", Type = SecuritySchemeType.Http,
        Scheme = "bearer", BearerFormat = "JWT", In = ParameterLocation.Header,
        Description = "Enter: Bearer {your token}"
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {{
        new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
        new string[] {}
    }});
});

var app = builder.Build();

// ── PIPELINE ─────────────────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "BGauss Travel API v1");
        c.RoutePrefix = "swagger";
    });
}
// ❌ DO NOT USE THIS IN IIS (causes your HTTPS errors)
// app.UseHttpsRedirection();

app.UseCors();

// ── STATIC FILES with explicit MIME types ─────────────────────────────────────
// This fixes "unsupported format" downloads — IIS needs explicit MIME mappings.
var contentTypeProvider = new FileExtensionContentTypeProvider();
contentTypeProvider.Mappings[".png"]   = "image/png";
contentTypeProvider.Mappings[".jpg"]   = "image/jpeg";
contentTypeProvider.Mappings[".jpeg"]  = "image/jpeg";
contentTypeProvider.Mappings[".webp"]  = "image/webp";
contentTypeProvider.Mappings[".pdf"]   = "application/pdf";
contentTypeProvider.Mappings[".svg"]   = "image/svg+xml";
contentTypeProvider.Mappings[".woff"]  = "font/woff";
contentTypeProvider.Mappings[".woff2"] = "font/woff2";

// Serve wwwroot (React build + uploads folder)
app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = contentTypeProvider,
});

// ── EXPLICIT /uploads path (belt-and-suspenders for IIS) ─────────────────────
// Even if /uploads is inside wwwroot, this ensures the MIME types are correct
// when IIS intercepts the request before ASP.NET Core does.
var uploadsPath = Path.Combine(app.Environment.ContentRootPath, "wwwroot", "uploads");
if (Directory.Exists(uploadsPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider        = new PhysicalFileProvider(uploadsPath),
        RequestPath         = "/uploads",
        ContentTypeProvider = contentTypeProvider,
    });
}

app.UseAuthentication();
app.UseAuthorization();


// ── ROUTES ─────────────────────────────────────────────
app.MapControllers();

app.MapHub<TravelHub>("/hubs/travel");
app.MapHub<NotificationHub>("/hubs/notifications");

app.MapFallbackToFile("index.html");

app.Run();