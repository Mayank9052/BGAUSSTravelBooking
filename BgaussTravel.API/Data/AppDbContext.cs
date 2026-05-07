using System;
using System.Collections.Generic;
using BgaussTravel.API.Models;
using Microsoft.EntityFrameworkCore;

namespace BgaussTravel.API.Data;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<CodeSequence> CodeSequences { get; set; }

    public virtual DbSet<ExpenseClaim> ExpenseClaims { get; set; }

    public virtual DbSet<TravelApproval> TravelApprovals { get; set; }

    public virtual DbSet<TravelEmployee> TravelEmployees { get; set; }

    public virtual DbSet<TravelNotification> TravelNotifications { get; set; }

    public virtual DbSet<TravelRequest> TravelRequests { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CodeSequence>(entity =>
        {
            entity.HasKey(e => e.SeqName).HasName("PK__CodeSequ__9FBA12DCE6DA8C99");

            entity.Property(e => e.SeqName).HasMaxLength(32);
        });

        modelBuilder.Entity<ExpenseClaim>(entity =>
        {
            entity.HasKey(e => e.ClaimId).HasName("PK__ExpenseC__EF2E139BFCEFA66B");

            entity.HasIndex(e => new { e.RequestId, e.Status }, "IX_ExpenseClaims_Request");

            entity.HasIndex(e => e.ClaimCode, "UQ__ExpenseC__17537BFC599A96BE").IsUnique();

            entity.Property(e => e.Amount).HasColumnType("decimal(12, 2)");
            entity.Property(e => e.BillFileName).HasMaxLength(256);
            entity.Property(e => e.BillPath).HasMaxLength(1024);
            entity.Property(e => e.Category).HasMaxLength(64);
            entity.Property(e => e.ClaimCode).HasMaxLength(32);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(getutcdate())");
            entity.Property(e => e.Currency)
                .HasMaxLength(8)
                .HasDefaultValue("INR");
            entity.Property(e => e.Description).HasMaxLength(512);
            entity.Property(e => e.RejectionReason).HasMaxLength(512);
            entity.Property(e => e.Status)
                .HasMaxLength(32)
                .HasDefaultValue("Pending");
            entity.Property(e => e.UpdatedAt).HasDefaultValueSql("(getutcdate())");

            entity.HasOne(d => d.ApprovedByNavigation).WithMany(p => p.ExpenseClaimApprovedByNavigations)
                .HasForeignKey(d => d.ApprovedBy)
                .HasConstraintName("FK__ExpenseCl__Appro__49C3F6B7");

            entity.HasOne(d => d.Employee).WithMany(p => p.ExpenseClaimEmployees)
                .HasForeignKey(d => d.EmployeeId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__ExpenseCl__Emplo__46E78A0C");

            entity.HasOne(d => d.Request).WithMany(p => p.ExpenseClaims)
                .HasForeignKey(d => d.RequestId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__ExpenseCl__Reque__45F365D3");
        });

        modelBuilder.Entity<TravelApproval>(entity =>
        {
            entity.HasKey(e => e.ApprovalId).HasName("PK__TravelAp__328477F45026F456");

            entity.Property(e => e.Action).HasMaxLength(32);
            entity.Property(e => e.Comments).HasMaxLength(512);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(getutcdate())");
            entity.Property(e => e.Level).HasDefaultValue(1);

            entity.HasOne(d => d.Approver).WithMany(p => p.TravelApprovals)
                .HasForeignKey(d => d.ApproverId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__TravelApp__Appro__5165187F");

            entity.HasOne(d => d.Request).WithMany(p => p.TravelApprovals)
                .HasForeignKey(d => d.RequestId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__TravelApp__Reque__5070F446");
        });

        modelBuilder.Entity<TravelEmployee>(entity =>
        {
            entity.HasKey(e => e.EmployeeId).HasName("PK__TravelEm__7AD04F11A39C2105");

            entity.HasIndex(e => e.MicrosoftOid, "UQ__TravelEm__A18B465ACB083678").IsUnique();

            entity.HasIndex(e => e.Email, "UQ__TravelEm__A9D10534B9E4012C").IsUnique();

            entity.Property(e => e.AlternateEmail).HasMaxLength(150);
            entity.Property(e => e.ContactNumber).HasMaxLength(30);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(getutcdate())");
            entity.Property(e => e.Department).HasMaxLength(128);
            entity.Property(e => e.Designation).HasMaxLength(120);
            entity.Property(e => e.DisplayName).HasMaxLength(256);
            entity.Property(e => e.Email).HasMaxLength(256);
            entity.Property(e => e.EmergencyContact).HasMaxLength(150);
            entity.Property(e => e.EmployeeCode).HasMaxLength(64);
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.MicrosoftOid).HasMaxLength(128);
            entity.Property(e => e.ReportingManager).HasMaxLength(120);
            entity.Property(e => e.Role)
                .HasMaxLength(32)
                .HasDefaultValue("Employee");
        });

        modelBuilder.Entity<TravelNotification>(entity =>
        {
            entity.HasKey(e => e.NotificationId).HasName("PK__TravelNo__20CF2E120973EE3E");

            entity.HasIndex(e => new { e.RecipientId, e.IsRead, e.CreatedAt }, "IX_Notifications_Recipient_Unread").IsDescending(false, false, true);

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(getutcdate())");
            entity.Property(e => e.Message).HasMaxLength(1024);
            entity.Property(e => e.Title).HasMaxLength(256);
            entity.Property(e => e.Type).HasMaxLength(64);

            entity.HasOne(d => d.Claim).WithMany(p => p.TravelNotifications)
                .HasForeignKey(d => d.ClaimId)
                .HasConstraintName("FK__TravelNot__Claim__59FA5E80");

            entity.HasOne(d => d.Recipient).WithMany(p => p.TravelNotificationRecipients)
                .HasForeignKey(d => d.RecipientId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__TravelNot__Recip__571DF1D5");

            entity.HasOne(d => d.Request).WithMany(p => p.TravelNotifications)
                .HasForeignKey(d => d.RequestId)
                .HasConstraintName("FK__TravelNot__Reque__59063A47");

            entity.HasOne(d => d.Sender).WithMany(p => p.TravelNotificationSenders)
                .HasForeignKey(d => d.SenderId)
                .HasConstraintName("FK__TravelNot__Sende__5812160E");
        });

        modelBuilder.Entity<TravelRequest>(entity =>
        {
            entity.HasKey(e => e.RequestId).HasName("PK__TravelRe__33A8517A5C22C2AF");

            entity.HasIndex(e => new { e.EmployeeId, e.Status, e.CreatedAt }, "IX_TravelRequests_Employee")
                .IsDescending(false, false, true)
                .HasFilter("([Status]<>'Draft')");

            entity.HasIndex(e => e.RequestCode, "UQ__TravelRe__CBAB82F65368D772").IsUnique();

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(getutcdate())");
            entity.Property(e => e.Department).HasMaxLength(100);
            entity.Property(e => e.Destination).HasMaxLength(256);
            entity.Property(e => e.EstimatedAmount).HasColumnType("decimal(12, 2)");
            entity.Property(e => e.OriginAddress).HasMaxLength(500);
            entity.Property(e => e.RequestCode).HasMaxLength(32);
            entity.Property(e => e.Status)
                .HasMaxLength(32)
                .HasDefaultValue("Draft");
            entity.Property(e => e.TransportType).HasMaxLength(64);
            entity.Property(e => e.TravelPurpose).HasMaxLength(512);
            entity.Property(e => e.UpdatedAt).HasDefaultValueSql("(getutcdate())");

            entity.HasOne(d => d.Employee).WithMany(p => p.TravelRequests)
                .HasForeignKey(d => d.EmployeeId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__TravelReq__Emplo__3E52440B");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
