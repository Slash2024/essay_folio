export type TranslationVerdict='correct'|'optional'|'error';

// Classify the reviewer's verdict, not its later explanation or the student's wording.
export function translationVerdict(value:string):TranslationVerdict|null {
 const main=value.replace(/[*_`]/g,'').trim().split(/[，,。；;\n]/,1)[0].trim();
 if(!main||/无法判定|待核实|待确认|不确定|需核对/.test(main))return null;
 if(/无需修改|不需要修改|没有(?:实质)?错误|不(?:算|属于|构成)(?:错译|漏译|错误)/.test(main))return 'correct';
 if(/错误|错译|误译|漏译|遗漏|不(?:够)?(?:准确|正确)|需(?:要)?(?:修改|调整|纠正|补足)|影响得分/.test(main))return 'error';
 if(/可(?:以)?接受|建议优化|可优化/.test(main))return 'optional';
 if(/正确|等值|等义/.test(main))return 'correct';
 if(/不(?:单独)?扣分|不因.+扣分/.test(main))return 'optional';
 return null;
}
