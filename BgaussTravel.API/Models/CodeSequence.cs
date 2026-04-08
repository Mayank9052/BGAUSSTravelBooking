using System;
using System.Collections.Generic;

namespace BgaussTravel.API.Models;

public partial class CodeSequence
{
    public string SeqName { get; set; } = null!;

    public int LastValue { get; set; }

    public int Year { get; set; }
}
