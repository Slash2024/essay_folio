export type MilestoneId = 'A01'|'A02'|'A03'|'A04'|'A05'|'A06'|'A07'|'B01'|'B02'|'B03'|'B04'|'B05'|'B06'|'B07'|'B08'|'C01'|'C02'|'C03'|'C04'|'C05'|'D01'|'D02'|'D03'|'D04'|'D05'|'D06';
export interface EarnedMilestone { id: MilestoneId; title: string; detail: string; group: string; family: string; rank: number }
// Presentation only: thresholds and unearned definitions stay on the server.
export function milestoneDisplay(earned: EarnedMilestone[]) {
  const highest=new Map<string,EarnedMilestone>();
  for(const m of earned)if(!highest.has(m.family)||m.rank>highest.get(m.family)!.rank)highest.set(m.family,m);
  const featured=earned.filter(m=>highest.get(m.family)?.id===m.id);
  const earlier=earned.filter(m=>highest.get(m.family)?.id!==m.id);
  return {featured,earlier};
}
