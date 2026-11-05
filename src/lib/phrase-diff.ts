import type {DiffPart} from './revisions';

type Unit={kind:'same';value:string}|{kind:'edit';before:string;after:string};
const words=(text:string)=>text.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g)||[];
const glue=new Set('a an the to of in on at by for from with as than into onto upon about over under through'.split(' '));
const boundaries=/[\r\n,，;；:：.!?。！？]|\b(?:and|but|or|yet|whereas|while|although|because|which|that|who|if|when)\b/i;
const complementHeads=new Set('attention importance awareness number range series role access contribution impact focus concern interest ability opportunity way means'.split(' '));
function isReplacement(unit:Unit):unit is Extract<Unit,{kind:'edit'}>{return unit.kind==='edit'&&!!words(unit.before).length&&!!words(unit.after).length;}

/** Presentation-only grouping: both original and revised text must reconstruct exactly. */
export function groupPhraseChanges(parts:DiffPart[]):DiffPart[]{
 const units:Unit[]=[];
 for(const part of parts){
  if(!part.value)continue;
  const last=units.at(-1);
  if(part.type==='same'){if(last?.kind==='same')last.value+=part.value;else units.push({kind:'same',value:part.value});}
  else {const edit=last?.kind==='edit'?last:{kind:'edit' as const,before:'',after:''};if(last!==edit)units.push(edit);edit[part.type==='remove'?'before':'after']+=part.value;}
 }
 // Shared spaces and short grammatical glue do not split a single replacement.
 // Keep conjunctions, clause punctuation and substantial unchanged phrases as anchors.
 for(let i=1;i<units.length-1;){
  const left=units[i-1],middle=units[i],right=units[i+1];
  if(left.kind!=='edit'||middle.kind!=='same'||right.kind!=='edit'){i++;continue;}
  const shared=words(middle.value),smallRight=[...words(right.before),...words(right.after)];
  const spaces=/^[\t ]+$/.test(middle.value);
  const grammatical=!boundaries.test(middle.value)&&shared.length>0&&shared.length<=2&&shared.every(w=>glue.has(w.toLowerCase()))&&isReplacement(left)&&isReplacement(right);
  // A changed verb phrase plus an edited final preposition is one component:
  // “calling on people to take part in” → “invite others to take part”.
  const complement=!boundaries.test(middle.value)&&/^\s*to\b/i.test(middle.value)&&shared.length<=5&&isReplacement(left)&&words(left.before).length>=2&&words(left.after).length>=2&&smallRight.length>0&&smallRight.length<=2&&smallRight.every(w=>glue.has(w.toLowerCase()));
  if(spaces||grammatical||complement){left.before+=middle.value+right.before;left.after+=middle.value+right.after;units.splice(i,2);i=Math.max(1,i-1);}else i++;
 }
 // Keep the complement preposition with familiar noun-headed collocations.
 // This is a small boundary lexicon, not a list of complete example sentences.
 for(let i=0;i<units.length-1;i++){
  const edit=units[i],next=units[i+1];if(!isReplacement(edit)||next.kind!=='same')continue;
  const a=words(edit.before),b=words(edit.after),m=next.value.match(/^([\t ]+(?:to|of|for|on|with))(?=\s+[A-Za-z])/i);
  if(m&&a.length>=2&&b.length>=2&&complementHeads.has(a.at(-1)!.toLowerCase())&&complementHeads.has(b.at(-1)!.toLowerCase())){edit.before+=m[1];edit.after+=m[1];next.value=next.value.slice(m[1].length);}
 }
 const result:DiffPart[]=[];
 const push=(value:string,type:DiffPart['type'])=>{if(!value)return;const last=result.at(-1);if(last?.type===type)last.value+=value;else result.push({value,type});};
 for(const unit of units){if(unit.kind==='same')push(unit.value,'same');else{push(unit.before,'remove');push(unit.after,'add');}}
 const reconstruct=(list:DiffPart[],exclude:DiffPart['type'])=>list.filter(p=>p.type!==exclude).map(p=>p.value).join('');
 return reconstruct(result,'add')===reconstruct(parts,'add')&&reconstruct(result,'remove')===reconstruct(parts,'remove')?result:parts;
}
