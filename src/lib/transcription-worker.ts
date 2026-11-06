/// <reference types="vite/client" />

import nspell from 'nspell';
import americanAff from '../../node_modules/dictionary-en/index.aff?raw';
import americanDic from '../../node_modules/dictionary-en/index.dic?raw';
import britishAff from '../../node_modules/dictionary-en-gb/index.aff?raw';
import britishDic from '../../node_modules/dictionary-en-gb/index.dic?raw';
import { checkTranscription } from './transcription-check';

const american = nspell(americanAff, americanDic);
const british = nspell(britishAff, britishDic);

self.addEventListener('message', ({data}: MessageEvent<string>) => {
  self.postMessage(checkTranscription(data, american, british));
});
