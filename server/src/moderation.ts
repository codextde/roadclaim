const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
  "+": "t",
  "€": "e",
  "ß": "ss",
  ä: "ae",
  ö: "oe",
  ü: "ue",
};

// Matched anywhere in the text: specific enough that harmless words do not contain them.
const ANYWHERE = [
  "nigger", "nigga", "faggot", "retard", "tranny", "wetback", "motherfuck", "fuck", "shit", "bitch", "whore",
  "slut", "pussy", "penis", "vagina", "dildo", "porn", "nazi", "hitler", "siegheil", "jihad",
  "hurensohn", "wichser", "fotze", "schlampe", "missgeburt", "spast", "kanake", "kanacke", "neger", "zigeuner",
  "schwuchtel", "judensau", "untermensch", "arschloch", "arschgeige", "scheisse", "ficken", "nutte",
  "hackfresse", "vergewaltig", "auschwitz",
];

// Matched only as whole words, because they also appear inside harmless words.
const WHOLE_WORD = [
  "ass", "asshole", "arse", "cunt", "cock", "dick", "fick", "fag", "fags", "tit", "tits", "cum", "sex", "anal", "anus", "twat",
  "wank", "wanker", "piss", "rape", "rapist", "pedo", "paedo", "isis", "kkk", "kike", "chink", "spic", "hure",
  "arsch", "drecksau", "nsdap", "ss", "1488",
];

function normalize(text: string): string {
  return [...text.toLowerCase()]
    .map((ch) => LEET[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[^a-z]/g, "");
}

const stretch = (s: string) => s.replace(/(.)\1{2,}/g, "$1");

const WHOLE = new Set(WHOLE_WORD.map((w) => (/^\d+$/.test(w) ? w : normalize(w))));

export function isInappropriate(text: string): boolean {
  for (const token of text.toLowerCase().split(/[\s_.\-,;:/\\()[\]{}"'*#~]+/).filter(Boolean)) {
    if (WHOLE.has(token)) return true;
    const n = normalize(token);
    if (n && (WHOLE.has(n) || WHOLE.has(stretch(n)))) return true;
  }
  const all = normalize(text);
  const short = stretch(all);
  return ANYWHERE.some((w) => all.includes(w) || short.includes(w));
}
