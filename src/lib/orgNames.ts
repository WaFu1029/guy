// Org name normalization. Two people typing "Columbia" and "Columbia
// University" mean the same place, so hub membership is keyed on a canonical
// form rather than the raw text. What's stored on the person is never
// rewritten — this runs at derive time only.

// The short name people actually use, keyed by the normalized form of every
// spelling worth catching. Value is the label the hub renders.
const ALIASES: Record<string, string> = {
  // Ivies + peers
  "columbia": "Columbia",
  "columbia university": "Columbia",
  "columbia college": "Columbia",
  "cu": "Columbia",
  "harvard": "Harvard",
  "harvard university": "Harvard",
  "harvard college": "Harvard",
  "yale": "Yale",
  "yale university": "Yale",
  "princeton": "Princeton",
  "princeton university": "Princeton",
  "cornell": "Cornell",
  "cornell university": "Cornell",
  "brown": "Brown",
  "brown university": "Brown",
  "dartmouth": "Dartmouth",
  "dartmouth college": "Dartmouth",
  "penn": "Penn",
  "upenn": "Penn",
  "university of pennsylvania": "Penn",
  "stanford": "Stanford",
  "stanford university": "Stanford",
  "duke": "Duke",
  "duke university": "Duke",
  "northwestern": "Northwestern",
  "northwestern university": "Northwestern",
  "johns hopkins": "Johns Hopkins",
  "johns hopkins university": "Johns Hopkins",
  "jhu": "Johns Hopkins",
  "rice": "Rice",
  "rice university": "Rice",
  "vanderbilt": "Vanderbilt",
  "vanderbilt university": "Vanderbilt",

  // Tech
  "mit": "MIT",
  "massachusetts institute of technology": "MIT",
  "caltech": "Caltech",
  "california institute of technology": "Caltech",
  "cmu": "CMU",
  "carnegie mellon": "CMU",
  "carnegie mellon university": "CMU",
  "georgia tech": "Georgia Tech",
  "gatech": "Georgia Tech",
  "georgia institute of technology": "Georgia Tech",
  "virginia tech": "Virginia Tech",
  "virginia polytechnic institute and state university": "Virginia Tech",

  // UC system
  "uc berkeley": "UC Berkeley",
  "ucb": "UC Berkeley",
  "berkeley": "UC Berkeley",
  "cal": "UC Berkeley",
  "university of california berkeley": "UC Berkeley",
  "university of california at berkeley": "UC Berkeley",
  "ucla": "UCLA",
  "university of california los angeles": "UCLA",
  "ucsd": "UC San Diego",
  "uc san diego": "UC San Diego",
  "university of california san diego": "UC San Diego",
  "ucsb": "UC Santa Barbara",
  "uc santa barbara": "UC Santa Barbara",
  "uci": "UC Irvine",
  "uc irvine": "UC Irvine",
  "ucd": "UC Davis",
  "uc davis": "UC Davis",

  // Other US publics + big privates
  "nyu": "NYU",
  "new york university": "NYU",
  "usc": "USC",
  "university of southern california": "USC",
  "uiuc": "UIUC",
  "university of illinois": "UIUC",
  "university of illinois urbana champaign": "UIUC",
  "umich": "Michigan",
  "university of michigan": "Michigan",
  "ut austin": "UT Austin",
  "utexas": "UT Austin",
  "university of texas": "UT Austin",
  "university of texas at austin": "UT Austin",
  "uw": "UW",
  "university of washington": "UW",
  "uchicago": "UChicago",
  "university of chicago": "UChicago",
  "unc": "UNC",
  "university of north carolina": "UNC",
  "uva": "UVA",
  "university of virginia": "UVA",
  "bu": "BU",
  "boston university": "BU",
  "boston college": "BC",
  "bc": "BC",
  "northeastern": "Northeastern",
  "northeastern university": "Northeastern",
  "purdue": "Purdue",
  "purdue university": "Purdue",
  "ohio state": "Ohio State",
  "the ohio state university": "Ohio State",
  "penn state": "Penn State",
  "pennsylvania state university": "Penn State",
  "asu": "ASU",
  "arizona state university": "ASU",
  "gt": "Georgia Tech",

  // Canada / UK / other
  "waterloo": "Waterloo",
  "university of waterloo": "Waterloo",
  "utoronto": "Toronto",
  "university of toronto": "Toronto",
  "mcgill": "McGill",
  "mcgill university": "McGill",
  "ubc": "UBC",
  "university of british columbia": "UBC",
  "oxford": "Oxford",
  "university of oxford": "Oxford",
  "cambridge": "Cambridge",
  "university of cambridge": "Cambridge",
  "imperial": "Imperial",
  "imperial college london": "Imperial",
  "lse": "LSE",
  "london school of economics": "LSE",
  "ucl": "UCL",
  "university college london": "UCL",
  "eth": "ETH Zurich",
  "eth zurich": "ETH Zurich",
  "nus": "NUS",
  "national university of singapore": "NUS",
  "tsinghua": "Tsinghua",
  "tsinghua university": "Tsinghua",
  "iit": "IIT",

  // A few company names that are commonly written two ways.
  "alphabet": "Google",
  "google llc": "Google",
  "meta platforms": "Meta",
  "facebook": "Meta",
  "amazon web services": "AWS",
  "aws": "AWS",
  "jpmorgan": "JPMorgan",
  "jp morgan": "JPMorgan",
  "jpmorgan chase": "JPMorgan",
  "goldman": "Goldman Sachs",
  "goldman sachs": "Goldman Sachs",
  "ibm": "IBM",
  "international business machines": "IBM",
};

// Lowercase, punctuation stripped, whitespace collapsed. The lookup key for
// the alias table and the hub id — never shown to the user.
function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Trim the generic parts an alias would drop, preserving the user's casing so
// an unlisted org still renders the way they wrote it.
function stripGenerics(raw: string, kind: "company" | "school"): string {
  let s = raw.trim().replace(/^the\s+/i, "");
  if (kind === "school") {
    // "University of Michigan" → "Michigan"; "Michigan State University" →
    // "Michigan State". Both are the name people say out loud.
    s = s.replace(/^universit(y|e)\s+of\s+(the\s+)?/i, "");
    s = s.replace(/[,\s]+(university|college|school)$/i, "");
  } else {
    s = s.replace(/[,\s]+(inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|sa|nv|bv)\.?$/i, "");
  }
  return s.trim();
}

export type CanonicalOrg = { key: string; label: string };

// Canonicalize one raw org string. Returns null for blank input. `key` is what
// buckets people together; `label` is what the hub is called — the alias when
// there is one, otherwise the user's own text minus the generic suffix.
export function canonicalOrg(raw: string, kind: "company" | "school"): CanonicalOrg | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const rawKey = normalizeKey(trimmed);
  if (!rawKey) return null;
  const direct = ALIASES[rawKey];
  if (direct) return { key: normalizeKey(direct), label: direct };

  const stripped = stripGenerics(trimmed, kind);
  const strippedKey = normalizeKey(stripped);
  // Stripping can itself land on an alias ("Columbia University" already hits
  // above, but "Univ. of Michigan" only matches once the prefix is gone).
  const viaStrip = ALIASES[strippedKey];
  if (viaStrip) return { key: normalizeKey(viaStrip), label: viaStrip };

  if (!strippedKey) return { key: rawKey, label: trimmed };
  return { key: strippedKey, label: stripped };
}
