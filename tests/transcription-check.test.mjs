import assert from 'node:assert/strict';
import test from 'node:test';
import nspell from 'nspell';
import american from 'dictionary-en';
import british from 'dictionary-en-gb';
import { checkTranscription } from '../src/lib/transcription-check.ts';
import { applyPunctuationSuggestions, checkPunctuation } from '../src/lib/punctuation-check.ts';

const us = nspell(american);
const gb = nspell(british);
const check = source => checkTranscription(source, us, gb);

test('checks the accepted punctuation result and applies only selected transcription changes', () => {
  const punctuation = checkPunctuation('We recieve the the parcel，and she are pleased.\r\nI look forward hearing from you.');
  const base = applyPunctuationSuggestions(punctuation, new Set(punctuation.suggestions.map(item => item.id)));
  const result = check(base);
  assert.deepEqual(result.suggestions.map(({ before, after }) => [before, after]), [
    ['recieve', 'receive'], [' the', ''], ['are', 'is'], ['', 'to '],
  ]);
  assert.equal(result.suggestions.at(-1).line, 2);
  assert.equal(applyPunctuationSuggestions(result, new Set()), base);
  const [spelling, , , missing] = result.suggestions;
  assert.equal(applyPunctuationSuggestions(result, new Set([spelling.id, missing.id])),
    'We receive the the parcel, and she are pleased.\r\nI look forward to hearing from you.');
});

test('recognizes British and American spelling, contractions, and protected tokens', () => {
  const result = check("The colour and color are fine. They're organising and organizing it. It isn’t a problem. If it were easy, they would know that that works. Visit https://exmple.invalid/reccieve or ask a@exmple.invalid in the U.S.");
  assert.deepEqual(result.suggestions, []);
  assert.deepEqual(result.warnings, []);
  const guarded = check('I saw the https://exmple.invalid/reccieve the parcel.');
  assert.deepEqual(guarded.suggestions, []);
});

test('retains an unknown word for manual review when there is no replacement', () => {
  const result = check('One.\nQZXQZXQZXQZX.');
  assert.deepEqual(result.suggestions, []);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].line, 2);
});
