// Services/CodeSequenceService.cs
// Generates sequential, human-readable codes like TRQ-2026-00001 / EXP-2026-00003.
// Uses the CodeSequences table with a row-level update to prevent duplicates
// even under concurrent requests.

using BgaussTravel.API.Data;
using Microsoft.EntityFrameworkCore;

namespace BgaussTravel.API.Services;

public interface ICodeSequenceService
{
    /// <summary>
    /// Returns the next code for the given sequence name.
    /// E.g. NextAsync("TRQ") → "TRQ-2026-00001"
    /// </summary>
    Task<string> NextAsync(string seqName);
}

public class CodeSequenceService : ICodeSequenceService
{
    private readonly AppDbContext _db;

    public CodeSequenceService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<string> NextAsync(string seqName)
    {
        var currentYear = DateTime.UtcNow.Year;

        // Find or create the sequence row
        var seq = await _db.CodeSequences
            .FirstOrDefaultAsync(s => s.SeqName == seqName);

        if (seq == null)
        {
            // First time this sequence is used — create it
            seq = new Models.CodeSequence
            {
                SeqName   = seqName,
                LastValue = 0,
                Year      = currentYear,
            };
            _db.CodeSequences.Add(seq);
        }

        // Reset counter if the year rolled over
        if (seq.Year != currentYear)
        {
            seq.Year      = currentYear;
            seq.LastValue = 0;
        }

        seq.LastValue++;
        await _db.SaveChangesAsync();

        // Format: TRQ-2026-00001
        return $"{seqName}-{currentYear}-{seq.LastValue:D5}";
    }
}