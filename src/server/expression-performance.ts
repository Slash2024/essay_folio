import {all,decode} from './archive';
import type {RecitationRecords} from '../lib/expression-performance';

// Reporting must stay read-only. quizProgress() can materialize report snapshots,
// so read the durable source records directly instead of calling that route.
export async function readRecitationRecords():Promise<RecitationRecords>{
  const kinds=['labQuizSession','labQuizAnswer','labQuizReview','labQuizCorrection','labQuizPractice'] as const;
  const rows=await Promise.all(kinds.map(kind=>all(kind)));
  return {sessions:rows[0].map(row=>decode(row)),answers:rows[1].map(row=>decode(row)),reviews:rows[2].map(row=>decode(row)),corrections:rows[3].map(row=>decode(row)),practices:rows[4].map(row=>decode(row))};
}
