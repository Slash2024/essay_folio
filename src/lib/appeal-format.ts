import {Lexer} from 'marked';

// Formatting is derived for display only; never persist it as a model decision/patch.
function proseItems(raw:string):string[] {
 const items:string[]=[];
 const stack:string[]=[];
 const closing:Record<string,string>={'（':'）','(' : ')','[':']','【':'】','“':'”','「':'」','『':'』','"':'"'};
 let current='';
 for(const token of Lexer.lexInline(raw)){
  // Never split inside Markdown emphasis, code, links or HTML.
  if(token.type!=='text'){current+=token.raw;continue;}
  for(const char of token.raw){
   current+=char;
   if(stack.at(-1)===char){stack.pop();continue;}
   if(closing[char]){stack.push(closing[char]);continue;}
   if(!stack.length&&/[。！？；;\n]/.test(char)){
    if(current.trim())items.push(current.trim());
    current='';
   }
  }
 }
 if(current.trim())items.push(current.trim());
 return items;
}
function emphasizeEnglish(raw:string):string {
 if(!/\p{Script=Han}/u.test(raw))return raw;
 return Lexer.lexInline(raw).map(token=>token.type==='text'
  ?token.raw.replace(/[A-Za-z][A-Za-z0-9]*(?:['’][A-Za-z]+)?(?:[ \t\-/]+[A-Za-z][A-Za-z0-9]*(?:['’][A-Za-z]+)?)*/g,word=>`**${word}**`)
  :token.raw).join('');
}
export function formatAppealText(value:string):string {
 return Lexer.lex(value).map(token=>{
  if(token.type!=='paragraph')return token.raw;
  return proseItems(token.raw).map(item=>'- '+emphasizeEnglish(item).replace(/\n/g,'\n  ')).join('\n\n')+'\n\n';
 }).join('');
}
