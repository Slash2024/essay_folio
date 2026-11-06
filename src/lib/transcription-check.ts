import type NSpell from 'nspell';
import type { PunctuationCheck as TextCheck } from './punctuation-check';

const skippedText = /https?:\/\/[^\s<>]+|\bwww\.[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\b[a-z]\.){2,}/gi;
const englishWord = /\p{L}[\p{L}\p{M}\d]*(?:['’][\p{L}\p{M}]+)*/gu;
const englishSpelling = /^[a-z]+(?:'[a-z]+)*$/i;
const grammarRules = [
  { pattern: /\b(?:he|she|it)[ \t]+(are)\b/gi, replacement: () => 'is' },
  { pattern: /\b(?:we|they|you)[ \t]+(is|was)\b/gi, replacement: (word: string) => word.toLowerCase() === 'is' ? 'are' : 'were' },
];
const missingTo = /\blook(?:s|ed|ing)?[ \t]+forward[ \t]+(?=(?:hearing[ \t]+from|seeing[ \t]+you|meeting[ \t]+you|working[ \t]+with|learning[ \t]+more)\b)/gi;
const duplicate = /(?<![\p{L}\p{M}\d'’])([a-z]+(?:['’][a-z]+)*)(?:[ \t]+\1(?![\p{L}\p{M}\d'’]))+/giu;

// Bound replacement generation on long pasted text while still checking every token.
const replacementBudget = 40;

export function checkTranscription(source: string, american: NSpell, british: NSpell): TextCheck {
  const suggestions: TextCheck['suggestions'] = [];
  const warnings: TextCheck['warnings'] = [];
  const lineStarts = [0, ...Array.from(source.matchAll(/\r\n|\n|\r/g), match => match.index + match[0].length)];
  const searchable = source.replace(skippedText, value => '\0'.repeat(value.length));
  const replacements = new Map<string, string | undefined>();
  const occupied = new Set<number>();

  function location(start: number) {
    let low = 0;
    let high = lineStarts.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (lineStarts[middle] <= start) low = middle;
      else high = middle;
    }
    return { line: low + 1, column: start - lineStarts[low] + 1 };
  }

  function suggest(start: number, end: number, after: string, reason: string) {
    const before = source.slice(start, end);
    suggestions.push({ id: `transcription-${start}-${end}`, start, end, before, after, reasons: [reason], ...location(start) });
    for (let index = start; index < end; index++) occupied.add(index);
  }

  for (const match of searchable.matchAll(duplicate)) {
    if (/^(?:had|that)$/i.test(match[1])) continue;
    // Keep the first occurrence available for a separate spelling correction.
    suggest(match.index + match[1].length, match.index + match[0].length, '', `疑似重复录入“${match[1]}”`);
  }
  for (const { pattern, replacement } of grammarRules) {
    for (const match of searchable.matchAll(pattern)) {
      if (occupied.has(match.index)) continue;
      const word = match[1];
      const start = match.index + match[0].length - word.length;
      const after = word === word.toUpperCase() ? replacement(word).toUpperCase() : replacement(word);
      suggest(start, start + word.length, after, '请核对主语与动词是否抄录一致');
    }
  }
  for (const match of searchable.matchAll(missingTo)) {
    const start = match.index + match[0].length;
    suggest(start, start, 'to ', '固定搭配 look forward to 可能漏录了 to');
  }

  for (const match of searchable.matchAll(englishWord)) {
    const original = match[0];
    const start = match.index;
    const word = original.replaceAll('’', "'");
    if (occupied.has(start) || !englishSpelling.test(word)) continue;
    if (american.correct(word) || british.correct(word)) continue;

    // Ambiguous initialisms still appear as manual checks.
    if (word.length <= 30 && !/^[A-Z]{2,4}$/.test(word) && !replacements.has(word) && replacements.size < replacementBudget) {
      replacements.set(word, american.suggest(word)[0] ?? british.suggest(word)[0]);
    }
    const candidate = replacements.get(word);
    const replacement = original.includes('’') ? candidate?.replaceAll("'", '’') : candidate;
    if (replacement && replacement !== original) {
      suggest(start, start + original.length, replacement, '英美词典均未识别，请核对拼写');
    } else {
      const excerpt = original.length > 40 ? original.slice(0, 40) + '…' : original;
      warnings.push({ start, line: location(start).line, message: `英美词典未识别“${excerpt}”，请对照手稿核对拼写或专名。` });
    }
  }

  suggestions.sort((a, b) => a.start - b.start || a.end - b.end);
  return { source, suggestions, warnings };
}
