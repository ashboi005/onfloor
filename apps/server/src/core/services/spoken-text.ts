import type { Language } from "@onfloor/contracts";

/**
 * Turns a persona's written line into the text the voice should actually speak.
 *
 * Hindi voices read Devanagari prose and Roman brand names well, but ASCII numerals
 * badly: "15% discount" can come out as fifty percent, "45 दिन" as thirty-five, and
 * "8.5%" switches to English ("eight point five percent") mid-sentence. Spelling the
 * numbers out in Devanagari words fixes every case, on every model we tried, so this
 * is not something a model swap fixes.
 *
 * In a sales call the numeral *is* the content. A customer who "hears" a discount or a
 * budget the agent never offered trains the agent on the wrong answer, and nobody can
 * tell from the transcript, which still shows "15%".
 *
 * So the digits are spelled out at the TTS boundary. The stored transcript keeps
 * its numerals, only the speech changes.
 */

/** 0-99, which Hindi does not build compositionally: each is its own word. */
const ONES = [
  "शून्य",
  "एक",
  "दो",
  "तीन",
  "चार",
  "पाँच",
  "छह",
  "सात",
  "आठ",
  "नौ",
  "दस",
  "ग्यारह",
  "बारह",
  "तेरह",
  "चौदह",
  "पंद्रह",
  "सोलह",
  "सत्रह",
  "अठारह",
  "उन्नीस",
  "बीस",
  "इक्कीस",
  "बाईस",
  "तेईस",
  "चौबीस",
  "पच्चीस",
  "छब्बीस",
  "सत्ताईस",
  "अट्ठाईस",
  "उनतीस",
  "तीस",
  "इकतीस",
  "बत्तीस",
  "तैंतीस",
  "चौंतीस",
  "पैंतीस",
  "छत्तीस",
  "सैंतीस",
  "अड़तीस",
  "उनतालीस",
  "चालीस",
  "इकतालीस",
  "बयालीस",
  "तैंतालीस",
  "चौवालीस",
  "पैंतालीस",
  "छियालीस",
  "सैंतालीस",
  "अड़तालीस",
  "उनचास",
  "पचास",
  "इक्यावन",
  "बावन",
  "तिरेपन",
  "चौवन",
  "पचपन",
  "छप्पन",
  "सत्तावन",
  "अट्ठावन",
  "उनसठ",
  "साठ",
  "इकसठ",
  "बासठ",
  "तिरेसठ",
  "चौंसठ",
  "पैंसठ",
  "छियासठ",
  "सड़सठ",
  "अड़सठ",
  "उनहत्तर",
  "सत्तर",
  "इकहत्तर",
  "बहत्तर",
  "तिहत्तर",
  "चौहत्तर",
  "पचहत्तर",
  "छिहत्तर",
  "सतहत्तर",
  "अठहत्तर",
  "उन्यासी",
  "अस्सी",
  "इक्यासी",
  "बयासी",
  "तिरासी",
  "चौरासी",
  "पचासी",
  "छियासी",
  "सत्तासी",
  "अट्ठासी",
  "नवासी",
  "नब्बे",
  "इक्यानवे",
  "बानवे",
  "तिरानवे",
  "चौरानवे",
  "पचानवे",
  "छियानवे",
  "सत्तानवे",
  "अट्ठानवे",
  "निन्यानवे",
] as const;

const word = (n: number): string => ONES[n] ?? String(n);

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${word(hundreds)} सौ`);
  if (rest > 0) parts.push(word(rest));
  return parts.join(" ");
}

/** The Indian scale (हज़ार, लाख, करोड़), not thousands and millions. */
function integerToHindi(value: number): string {
  if (value === 0) return ONES[0];
  const parts: string[] = [];
  let n = value;

  const crore = Math.floor(n / 10_000_000);
  if (crore > 0) {
    parts.push(`${integerToHindi(crore)} करोड़`);
    n %= 10_000_000;
  }
  const lakh = Math.floor(n / 100_000);
  if (lakh > 0) {
    parts.push(`${word(lakh)} लाख`);
    n %= 100_000;
  }
  const thousand = Math.floor(n / 1000);
  if (thousand > 0) {
    parts.push(`${word(thousand)} हज़ार`);
    n %= 1000;
  }
  if (n > 0) parts.push(belowThousand(n));

  return parts.join(" ");
}

const digitByDigit = (digits: string): string => [...digits].map((d) => word(Number(d))).join(" ");

/**
 * A run of ten or more plain digits is an identifier, not an amount. A phone number
 * read as "ninety-eight crore…" is worse than reading it out digit by digit. Anything
 * grouped with commas or carrying a decimal point is an amount by construction.
 */
const IDENTIFIER_DIGITS = 10;

function numberToHindi(token: string): string {
  const [whole = "", fraction] = token.replace(/,/g, "").split(".");

  if (fraction === undefined && !token.includes(",") && whole.length >= IDENTIFIER_DIGITS) {
    return digitByDigit(whole);
  }

  const spoken = integerToHindi(Number(whole));
  // Place by place, because the alternative (साढ़े, डेढ़, ढाई) depends on the scale
  // word that follows and gets it wrong more often than it gets it right.
  return fraction ? `${spoken} दशमलव ${digitByDigit(fraction)}` : spoken;
}

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/** `₹250`, `Rs. 250`, `1,25,000`, `8.5%`, `250/-`, with its unit where it has one. */
const AMOUNT = /(?:(₹|Rs\.?|रु\.?)\s*)?(\d[\d,]*(?:\.\d+)?)(?:\s*(%|\/-))?/g;

/** An amount that already says its own currency must not be given a second one. */
const ALREADY_RUPEES = /^\s*(रुपये|रुपए|रुपया|रु|rupees?\b|Rs\b)/;

/**
 * Placeholders for the operators between two numbers, which have to be recognised
 * before the numerals around them are spelled out and there are no digits left to
 * recognise them by. Bracketed so they cannot collide with a literal "plus" or "to"
 * in a Hinglish line, and free of digits, `%` and `/` so the amount pass ignores them.
 */
const PLUS = "⟦plus⟧";
const TO = "⟦to⟧";

/**
 * Spells out every numeral in a Hindi or Hinglish line.
 *
 * English is returned untouched: the English voice reads its own digits correctly,
 * and rewriting them would only add a way to be wrong.
 */
export function toSpokenText(text: string, language: Language): string {
  if (language === "en" || !text) return text;

  const ascii = text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));

  // "12+1" is a bundle, "10-15" a range: both said aloud, not read as symbols.
  const marked = ascii
    .replace(/(\d)\s*\+\s*(?=\d)/g, `$1 ${PLUS} `)
    .replace(/(\d)\s*-\s*(?=\d)/g, `$1 ${TO} `);

  const spoken = marked.replace(
    AMOUNT,
    (
      match: string,
      currency: string | undefined,
      digits: string,
      unit: string | undefined,
      offset: number,
    ) => {
      const words = numberToHindi(digits);
      if (unit === "%") return `${words} प्रतिशत`;
      if (unit === "/-") return `${words} रुपये`;
      if (!currency) return words;
      // Hindi puts the unit after the amount, so ₹ moves rather than disappears.
      return ALREADY_RUPEES.test(marked.slice(offset + match.length)) ? words : `${words} रुपये`;
    },
  );

  return spoken.split(PLUS).join("प्लस").split(TO).join("से");
}
