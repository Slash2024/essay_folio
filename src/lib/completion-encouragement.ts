import {applyPunctuationSuggestions, checkPunctuation} from './punctuation-check';

export interface CompletionMessage {
  zh: string;
  en: string;
}

export const COMPLETION_FALLBACK: CompletionMessage = {
  zh: '你把想法写成了文字，也为下一次表达积累了一份底气。',
  en: 'With every word you write, your ideas find a clearer voice.',
};

// Punctuation choices in the first check keep the same manuscript identity.
export function completionSource(source: string): string {
  const checked = checkPunctuation(source);
  return applyPunctuationSuggestions(checked, new Set(checked.suggestions.map(item => item.id)));
}

const normalized = (text: string) => text.replaceAll('’', "'").replace(/\s+/g, ' ').trim().toLowerCase();
const words = (text: string) => text.match(/[a-z]+(?:['’][a-z]+)*/gi) || [];

export function validateCompletionMessage(value: unknown, source: string): CompletionMessage {
  if (!value || typeof value !== 'object') throw new Error('Missing completion message');
  const {zh, en, sourcePhrase} = value as Record<string, unknown>;
  if (typeof zh !== 'string' || typeof en !== 'string' || typeof sourcePhrase !== 'string') {
    throw new Error('Missing bilingual text or manuscript phrase');
  }
  const chinese = zh.trim();
  const english = en.trim();
  const phrase = normalized(sourcePhrase);
  if (chinese.length < 12 || chinese.length > 120 || !/\p{Script=Han}/u.test(chinese)
    || words(english).length < 6 || words(english).length > 55
    || /[\r\n<>]/.test(chinese + english) || english.length > 450) {
    throw new Error('Invalid completion message length or language');
  }
  // Require a complete phrase from the manuscript in the English blessing.
  if (words(phrase).length < 3 || words(phrase).length > 16
    || !normalized(source).includes(phrase) || !normalized(english).includes(phrase)) {
    throw new Error('The encouragement must reuse the manuscript itself');
  }
  return {zh: chinese, en: english};
}
