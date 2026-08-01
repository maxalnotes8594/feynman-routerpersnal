// ============================================================
// CLOSING PHRASE DETECTOR — bahasa Indonesia
// ============================================================

const CLOSING_PATTERNS = [
  { regex: /ada\s+pertanyaan\s*(lain|lagi)?/i, weight: 0.95, label: "ada pertanyaan lain" },
  { regex: /ada\s+yang\s+(ditanyakan|ingin\s+ditanyakan|mau\s+ditanyakan)/i, weight: 0.95, label: "ada yang ditanyakan" },
  { regex: /(silakan|silahkan)\s+(bertanya|tanya)/i, weight: 0.85, label: "silakan bertanya" },
  { regex: /pertanyaan\?/i, weight: 0.5, label: "pertanyaan?" },
  { regex: /(itu|itulah)\s+saja\s+(penjelasan|dari)\s*(dari\s+)?(saya|aku|saya)?/i, weight: 0.95, label: "itu saja penjelasan dari saya" },
  { regex: /(cukup|sekian)\s+(sekian\s+)?(dari|seperti\s+itu)\s+(saya|aku|saya)?/i, weight: 0.9, label: "cukup sekian dari saya" },
  { regex: /(sekian|cukup)\s+(dari|penjelasan)\s+(saya|aku)/i, weight: 0.9, label: "sekian dari saya" },
  { regex: /itulah\s+(yang\s+)?(bisa|dapat)\s+(saya|aku)\s+jelaskan/i, weight: 0.9, label: "itulah yang bisa saya jelaskan" },
  { regex: /segitu\s+saja\s+(dari\s+)?(saya|aku)/i, weight: 0.85, label: "segitu saja dari saya" },
  { regex: /(mungkin|kira-kira)\s+(itu|segitu)\s+saja/i, weight: 0.8, label: "mungkin itu saja" },
  { regex: /(itu|ini)\s+(semua|yang)\s+(bisa|dapat)\s+(saya|aku)\s+(sampaikan|jelaskan|bagikan)/i, weight: 0.9, label: "itu yang bisa saya sampaikan" },
  { regex: /(terima\s+kasih|makasih|trims)\s*(.*)(selesai|cukup|akhir)/i, weight: 0.85, label: "terima kasih, selesai" },
  { regex: /selesai\s+(sudah|sudah\s+)?(saya|aku)\s+jelaskan/i, weight: 0.9, label: "selesai sudah saya jelaskan" },
  { regex: /(saya|aku)\s+(sudah|selesai)\s+(selesai\s+)?(menjelaskan|menyampaikan|menjelaskan\s+semua)/i, weight: 0.9, label: "saya sudah selesai menjelaskan" },
  { regex: /(mungkin|kayaknya|kurang\s+lebih)\s+(begitu|seperti\s+itu)\s*saja/i, weight: 0.75, label: "mungkin begitu saja" },
  { regex: /kurang\s+lebih\s+(seperti|begitu)\s+itu/i, weight: 0.75, label: "kurang lebih seperti itu" },
  { regex: /(begitu|gitu)\s+saja\s+(dari\s+)?(saya|aku|me)/i, weight: 0.7, label: "begitu saja dari saya" },
  { regex: /(mungkin\s+)?(itu\s+)?saja\s+yang\s+(bisa|dapat)\s+(saya|aku)\s+(jelaskan|sampaikan|bagikan)/i, weight: 0.9, label: "itu saja yang bisa saya jelaskan" },
  { regex: /(dan|atau)\s+(lain-lain|sebagainya|dsb\.?|dll\.?)/i, weight: 0.3, label: "dan lain-lain" },
  { regex: /\b(dsb|dll)\b/i, weight: 0.3, label: "dll/dsb" },
  { regex: /(itulah|itu)\s+penjelasan\s*(dari|saya|aku)?/i, weight: 0.8, label: "itulah penjelasan dari saya" },
  { regex: /(itulah|itu)\s+(saya|aku)\s+sampaikan/i, weight: 0.8, label: "itulah saya sampaikan" },
  { regex: /(mungkin|kayaknya)\s+(cukup|begitu)\s+(sampai|segitu)\s+sini/i, weight: 0.75, label: "mungkin cukup sampai sini" },
  { regex: /sampai\s+sini\s+saja/i, weight: 0.8, label: "sampai sini saja" },
];

const NOT_CLOSING_PATTERNS = [
  /^\s*(?:bagaimana\s+menurut|apa\s+pendapat|menurut\s+mu|menurut\s+kamu|kira-kira\s+apa|boleh\s+kah|apakah\s+kamu)/i,
  /^\s*(?:lanjut|selanjutnya|tapi\s+sebelum\s+itu|oh\s+iya|sebelum\s+selesai|pertama-tama|awalnya|mulai\s+dari)/i,
  /^\s*(?:jadi\s+begini|maksud\s+saya|yang\s+saya\s+maksud|sebenernya|sebenarnya)/i,
];

function detectClosingPhrase(text) {
  if (!text || text.trim().length < 5) return { isClosing: false, matchedPhrase: null, confidence: 0 };

  let totalWeight = 0;
  let bestLabel = null;
  let bestWeight = 0;

  for (const { regex, weight, label } of CLOSING_PATTERNS) {
    if (regex.test(text)) {
      totalWeight += weight;
      if (weight > bestWeight) { bestWeight = weight; bestLabel = label; }
    }
  }

  if (totalWeight === 0) return { isClosing: false, matchedPhrase: null, confidence: 0 };

  if (bestWeight < 0.85) {
    for (const pattern of NOT_CLOSING_PATTERNS) {
      if (pattern.test(text)) return { isClosing: false, matchedPhrase: null, confidence: 0 };
    }
  }

  const confidence = Math.min(bestWeight >= 0.85 ? bestWeight : totalWeight * 0.7, 1.0);
  return { isClosing: confidence >= 0.6, matchedPhrase: bestLabel, confidence };
}

function dedupeTranscript(text) {
  if (!text) return text;
  let cleaned = text.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/\b(\w+)(?:\s+\1\b)+/gi, "$1");
  cleaned = cleaned.replace(/\b(\w+)(?:\s+\1\b)+/gi, "$1");
  return cleaned;
}
