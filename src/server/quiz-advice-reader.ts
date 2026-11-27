// Read-only boundary. Do not import advice generation/repair handlers or archive
// writers here: importing a cue must never generate, repair or update its source.
import { all, decode } from './archive';
import { CUE_VERSION, type AdviceTask } from '../lib/expression-advice';
import type { QuizPromptOrigin, QuizSource } from '../lib/expression-quiz';
import { interactionId } from '../lib/review-interactions';
const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim();
const cueKey = (text: string) => text.replace(/\s+/g, '');

// Conservative exclusions, not a claim to understand every possible sentence.
// Uncertain cues retain the independently reviewed original quiz prompt.
export function usableAdviceCue(cue: unknown, source: QuizSource): cue is string {
  if (typeof cue !== 'string' || cue.trim().length < 12 || cue.length > 80 || !/[\u3400-\u9fff]/.test(cue) || /[A-Za-z\r\n]|\{\{|\}\}|_{2,}/.test(cue)) return false;
  if (/^(?:当你想|需要|当你需要)?(?:表达观点|写得更好|使用高级表达|表达某种意思)(?:的时候|时)?[。！？]?$/u.test(cue)) return false;
  const fixed = source.text.replace(/\{\{[\s\S]*?\}\}|\[[^\]\n]+\]/g, ' ');
  const upward = /\b(?:increase|increased|increasing|growth|rise|rises|rising|grew|grow|surge|upward|higher)\b/i.test(fixed);
  const downward = /\b(?:decrease|decreased|decreasing|decline|declined|fall|falling|drop|dropped|downward|lower)\b/i.test(fixed);
  const upCue = /增长|上升|增加|增幅|攀升/.test(cue), downCue = /下降|减少|下跌|降幅/.test(cue);
  if (upward !== downward && (/升降|增减/.test(cue) || upward && downCue || downward && upCue)) return false;
  if (source.kind === 'word') {
    // Require a meaning anchor, not merely "some spirit/attitude/quality". A
    // rejected synonym is safe: it falls back rather than inventing a cue.
    const meaning = source.meaning.replace(/[（(]来源[：:][\s\S]*$/, '').replace(/精神|态度|品质|某种|某个|一种|事物|的|。|[，；：、]/g, ' ').trim();
    const anchors = meaning.match(/[\u3400-\u9fff]{2,}/g) ?? [];
    if (!anchors.some(anchor => cue.includes(anchor) || anchor === '参加' && /参与/.test(cue))) return false;
  }
  return true;
}

export async function readQuizAdviceCues(pool: QuizSource[], customKeys: ReadonlySet<string>) {
  const fetched = await Promise.allSettled([all('expressionAdviceRun'), all('expressionAdviceStrongRun')]);
  // Avoid making a partial outage look like a successful complete selection.
  if (fetched.some(result => result.status === 'rejected')) return { pool, failed: true };
  const sources = new Map(pool.map(source => [source.key, source]));
  const candidates = new Map<string, { prompt: string; origin: QuizPromptOrigin }[]>();
  for (let modeIndex = 0; modeIndex < fetched.length; modeIndex++) {
    const result = fetched[modeIndex]; if (result.status !== 'fulfilled') continue;
    const latest = new Map<string, { task: AdviceTask; recordId: string }>();
    for (const row of result.value) {
      let task: AdviceTask; try { task = decode<AdviceTask>(row); } catch { continue; }
      if (task.status !== 'ready' || !task.result || typeof task.questionId !== 'string' || typeof task.createdAt !== 'string') continue;
      const old = latest.get(task.questionId);
      if (!old || task.createdAt > old.task.createdAt || task.createdAt === old.task.createdAt && row._id > old.recordId) latest.set(task.questionId, { task, recordId: row._id });
    }
    for (const { task, recordId } of latest.values()) {
      const card = task.result!;
      if (card.cueVersion !== CUE_VERSION || !Array.isArray(card.items)) continue;
      card.items.forEach((item, itemIndex) => {
        const entry = item?.entry, source = sources.get(entry?.key);
        if (!source || customKeys.has(source.key) || entry.kind !== source.kind || typeof entry.expression !== 'string' || normalize(entry.expression) !== normalize(source.text) || !usableAdviceCue(item.cue, source)) return;
        const prompt = item.cue.trim();
        const origin: QuizPromptOrigin = { type: 'advice', recordId, resultId: card.id || recordId, questionId: task.questionId, itemIndex, mode: modeIndex ? 'strong' : 'normal', cueVersion: card.cueVersion!, updatedAt: card.cueUpdatedAt || task.createdAt, fingerprint: interactionId('quiz-advice-cue', JSON.stringify([recordId, itemIndex, source.key, entry.expression, prompt, card.cueVersion])) };
        const list = candidates.get(source.key) ?? []; list.push({ prompt, origin }); candidates.set(source.key, list);
      });
    }
  }
  // A candidate must not collide with another entry's cue or original prompt.
  // This also keeps overview counts stable when a round selects another variant.
  const owners = new Map<string, Set<string>>();
  const add = (prompt: string, key: string) => { if (!prompt) return; const set = owners.get(cueKey(prompt)) ?? new Set<string>(); set.add(key); owners.set(cueKey(prompt), set); };
  for (const source of pool) add(source.scenario, source.key);
  for (const [key, list] of candidates) for (const cue of list) add(cue.prompt, key);
  return { failed: false, pool: pool.map(source => {
    const sorted = [...(candidates.get(source.key) ?? [])].sort((a, b) => {
      if (a.origin.type !== 'advice' || b.origin.type !== 'advice') return 0;
      return b.origin.updatedAt.localeCompare(a.origin.updatedAt) || a.origin.recordId.localeCompare(b.origin.recordId) || a.origin.itemIndex - b.origin.itemIndex;
    });
    const unique = new Map<string, typeof sorted[number]>();
    for (const cue of sorted) if (owners.get(cueKey(cue.prompt))?.size === 1 && !unique.has(cueKey(cue.prompt))) unique.set(cueKey(cue.prompt), cue);
    const variants = [...unique.values()];
    return variants.length ? { ...source, scenario: variants[0].prompt, scenarioOrigin: variants[0].origin, scenarioVariants: variants } : source;
  }) };
}
