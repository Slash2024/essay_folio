export const CURATION_GUIDE_VERSION=1;
export type GuideStatus='unseen'|'completed'|'skipped';
export interface CurationGuidePreference {version:number;status:GuideStatus;updatedAt:string}
export const GUIDE_STEPS=['认识整理稿','判断建议性质','提炼短批注','关联与标重点','添加个人补充','保存与恢复'] as const;
// Teaching excerpts adapted from the user's shared Mubu notes. Never used as real review data.
export const GUIDE_EXAMPLES={
 trend:{original:'Specifically, an upward trend is observed in the three types.',revision:'Specifically, an upward trend is observed across all three categories.',shortNote:'原句正确，仅积累'},
 expression:{original:"The event offers nuanced insights into the craftsmen's work and their thoughts of creating artworks.",revision:"The event offers nuanced insights into the craftsmen's work and the ideas behind their work.",explanation:'原表达可以理解，但 the ideas behind their work 更自然；以后介绍作品、活动或创作者时也能使用。',shortNote:'可迁移，需积累'},
 anchor:{original:'First and foremost, as household incomes rise, stronger purchasing power enables consumers to afford goods and services previously beyond their reach.',target:'goods and services',replacement:'appliances',shortNote:'把泛指对象落实到家电'},
 supplement:{original:"The event offers nuanced insights into the craftsmen's work.",sentence:'The craftsmen will demonstrate paper cutting with modern designs.',method:'先具体回答题目问什么，再补充意义。'},
 sources:[{label:'小作文手工笔记',url:'https://share.mubu.com/doc/09QkQ1uPLZk#cSnM9U3dt4'},{label:'大作文手工笔记',url:'https://share.mubu.com/doc/44P-0_GNzg#kSLrCiRe6V'}]
};
