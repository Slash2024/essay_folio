// Same elevated, session-gated CMS operations as the deployed archive; a separate private collection.
import {items} from '@wix/data';
import {auth} from '@wix/essentials';
const COLLECTION='TranslationArchive';
const query=auth.elevate(items.query),insert=auth.elevate(items.insert),remove=auth.elevate(items.remove);
export interface TranslationRow {_id:string;kind:string;writingId:string;questionId:string;revision:number;modified:string;payload:string}
export async function rows(kind:string,writingId='',offset=0,limit=30){
 const r=await query(COLLECTION,{filter:{kind,...(writingId?{writingId}:{})},sort:[{fieldName:kind==='practiceVersion'?'revision':'modified',order:'DESC'}],paging:{limit,offset}},{consistentRead:true,returnTotalCount:true});return {rows:r.items as TranslationRow[],total:r.pagingMetadata?.total??0};
}
export async function findRow(id:string){const r=await query(COLLECTION,{filter:{_id:id},paging:{limit:1}},{consistentRead:true});return r.items?.[0] as TranslationRow|undefined;}
export function unpack<T>(r:TranslationRow):T{return JSON.parse(r.payload);}
export async function addRow(id:string,kind:string,payload:any){const text=JSON.stringify(payload);if(new TextEncoder().encode(text).length>370000)throw new Error('内容超过单条保存上限，请缩短批阅或减少图片大小。');return insert(COLLECTION,{_id:id,kind,payload:text,writingId:payload.writingId||payload.id||'',questionId:payload.questionId||'',revision:payload.revision||0,status:payload.status||'',modified:payload.updatedAt||new Date().toISOString()});}
export const removeRow=(id:string)=>remove(COLLECTION,id);
