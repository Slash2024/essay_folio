export interface PunctuationSuggestion {id:string;start:number;end:number;before:string;after:string;reasons:string[];line:number;column:number}
export interface PunctuationWarning {start:number;line:number;message:string}
export interface PunctuationCheck {source:string;suggestions:PunctuationSuggestion[];warnings:PunctuationWarning[]}
// Deliberately explicit: NFKC would also change letters, digits and other content.
const WIDTH:Record<string,string>={'，':',','。':'.','．':'.','；':';','：':':','！':'!','？':'?','（':'(','）':')','［':'[','］':']','｛':'{','｝':'}','“':'"','”':'"','‘':"'",'’':"'",'＂':'"','＇':"'",'％':'%','／':'/','＼':'\\','＠':'@','＃':'#','＄':'$','＆':'&','＊':'*','＋':'+','＝':'=','＜':'<','＞':'>','＾':'^','＿':'_','｀':'`','｜':'|','～':'~','－':'-'};
const horizontal=(s:string)=>/^[ \t\u00a0\u3000]+$/.test(s);
interface Unit {start:number;end:number;raw:string;base:string;value:string;reasons:Set<string>}
export function checkPunctuation(source:string):PunctuationCheck {
 const units:Unit[]=[...source.matchAll(/[ \t\u00a0\u3000]+|\r\n|[^]/g)].map(m=>{const base=WIDTH[m[0]]||m[0];return {start:m.index!,end:m.index!+m[0].length,raw:m[0],base,value:base,reasons:new Set(base!==m[0]?['中文标点转对应英文标点']:[])};});
 const canonical=units.map(u=>u.base).join(''),protectedAt=new Set<number>(),apostrophes=new Set<number>(),quotes=new Map<number,'open'|'close'>(),warnings:PunctuationWarning[]=[];
 const lineStarts=[0];for(const m of source.matchAll(/\r\n|\r|\n/g))lineStarts.push(m.index!+m[0].length);
 const lineAt=(at:number)=>{let low=0,high=lineStarts.length;while(low<high){const mid=(low+high)>>>1;if(lineStarts[mid]<=at)low=mid+1;else high=mid;}return low;};
 const byStart=new Map(units.map(u=>[u.start,u]));
 const warn=(start:number,message:string)=>warnings.push({start,line:lineAt(start),message});
 function protect(pattern:RegExp,trim=false){for(const m of canonical.matchAll(pattern)){const value=trim?m[0].replace(/[.,;!?]+$/,''):m[0];for(let i=m.index!;i<m.index!+value.length;i++)protectedAt.add(i);}}
 protect(/\b(?:https?:\/\/|www\.)[^\s<>"，。！？；（）]+/gi,true);
 protect(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi);
 protect(/\b\d+(?:\.\d+)+\b/g);protect(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g);protect(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g);
 protect(/\b(?:e\.g\.|i\.e\.|a\.m\.|p\.m\.|(?:[A-Za-z]\.){2,}|(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|No|Fig|Vol|etc)\.)/gi);
 const change=(u:Unit,value:string,reason:string)=>{u.value=value;u.reasons.add(reason);};
 // Join only recognizable suffixes. Never add an apostrophe or change a word.
 for(const m of canonical.matchAll(/\b([A-Za-z]+)([ \t\u00a0\u3000]*)(')([ \t\u00a0\u3000]*)(s|t|re|ve|ll|d|m)\b/gi)){
  const quote=m.index!+m[1].length+m[2].length;if(protectedAt.has(quote))continue;apostrophes.add(quote);
  for(const at of [m.index!+m[1].length,quote+1]){const u=byStart.get(at);if(u&&horizontal(u.base))change(u,'','删除所有格或缩略形式内部的空格');}
 }
 // Internal apostrophes and plural possessives are not quotation boundaries.
 for(let i=0;i<units.length;i++){const u=units[i];if(u.base!=="'")continue;const prev=canonical[u.start-1]||'',next=canonical[u.end]||'';if(/[A-Za-z]/.test(prev)&&/[A-Za-z]/.test(next)||prev.toLowerCase()==='s'&&!/[A-Za-z]/.test(next)&&!canonical.slice(0,u.start).match(/(?:^|[\s(])'[^'\r\n]*$/))apostrophes.add(u.start);}
 for(const mark of ['"',"'"]){let open:Unit|undefined;for(const u of units){if(/[\r\n]/.test(u.base)){if(open)warn(open.start,'引号未成对，不补删引号，请人工核对。');open=undefined;continue;}if(u.base!==mark||apostrophes.has(u.start)||protectedAt.has(u.start))continue;if(open){quotes.set(open.start,'open');quotes.set(u.start,'close');open=undefined;}else open=u;}if(open)warn(open.start,'引号用途或配对不明确，不补删引号，请人工核对。');}
 for(const m of source.matchAll(/[、…—【】《》〈〉「」『』]+/g))warn(m.index!,'此处标点没有采用直接半角替换，请人工核对；不会替换标点类型。');
 for(const m of canonical.matchAll(/[.,;:!?]{2,}/g))warn(m.index!,'此处有连续标点，保留标点数量与类型，请人工核对。');
 function left(i:number){let j=i-1;while(j>=0&&horizontal(units[j].base))j--;return j;}
 function right(i:number){let j=i+1;while(j<units.length&&horizontal(units[j].base))j++;return j;}
 // Normalize horizontal spaces only. Line endings and leading indentation stay exact.
 for(let i=0;i<units.length;i++){const u=units[i];if(!horizontal(u.base)||u.value===''||protectedAt.has(u.start))continue;const l=left(i),r=right(i),a=units[l],b=units[r];if(!a||/[\r\n]/.test(a.base))continue;
  if(!b||/[\r\n]/.test(b.base)){change(u,'','删除行末多余空格');continue;}
  if(/[.,;:!?%\])}]/.test(b.base)||quotes.get(b.start)==='close'||/[([{]/.test(a.base)||quotes.get(a.start)==='open')change(u,'','删除标点内侧或标点前的多余空格');
  else if(u.base!==' ')change(u,' ','单词或标点之间保留一个半角空格');
 }
 for(let i=0;i<units.length;i++){const u=units[i],n=units[i+1];if(!n||horizontal(n.base)||/[\r\n]/.test(n.base)||apostrophes.has(u.start))continue;
  if(protectedAt.has(u.start)&&protectedAt.has(n.start))continue;
  const nextWord=/^[A-Za-z0-9]/.test(n.base),nextOpening=/^[([{]$/.test(n.base)||quotes.get(n.start)==='open';
  if((/^[.,;:!?%]$/.test(u.base)||/^[\])}]$/.test(u.base)||quotes.get(u.start)==='close')&&(nextWord||nextOpening))change(u,u.value+' ','补齐标点后的空格');
  else if(quotes.get(n.start)==='open'&&/[A-Za-z0-9]/.test(u.base)&&!protectedAt.has(u.start))change(u,u.value+' ','补齐引号前的空格');
 }
 const suggestions:PunctuationSuggestion[]=[];
 for(let i=0;i<units.length;i++){const first=units[i];if(first.raw===first.value)continue;let end=first.end,after=first.value;const reasons=new Set(first.reasons);while(i+1<units.length&&units[i+1].raw!==units[i+1].value){const u=units[++i];end=u.end;after+=u.value;for(const reason of u.reasons)reasons.add(reason);}const before=source.slice(first.start,end);if(before===after)continue;suggestions.push({id:`punct-${first.start}-${end}`,start:first.start,end,before,after,reasons:[...reasons],line:lineAt(first.start),column:first.start-lineStarts[lineAt(first.start)-1]+1});}
 return {source,suggestions,warnings};
}
export function applyPunctuationSuggestions(check:PunctuationCheck,selected:ReadonlySet<string>):string {
 let text='',position=0;for(const s of check.suggestions){if(!selected.has(s.id))continue;if(s.start<position||check.source.slice(s.start,s.end)!==s.before)throw new Error('检查内容已变化，请重新检查');text+=check.source.slice(position,s.start)+s.after;position=s.end;}return text+check.source.slice(position);
}
