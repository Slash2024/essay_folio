// Private caller-validated operations. SDK methods are from the shipped CMS data layer
// and the documented direct query/elevation signature. Never imported by client code.
import { items } from '@wix/data';
import { auth } from '@wix/essentials';
const COLLECTION='EssayArchive';
const query=auth.elevate(items.query),insert=auth.elevate(items.insert),update=auth.elevate(items.update),remove=auth.elevate(items.remove);
export interface Row { _id: string; kind: string; questionId: string; writingId: string; status: string; modified: string; payload: string; [key:string]:unknown }
export async function list(kind:string,{offset=0,limit=50,questionId='',writingId='',status=''}={}) {
  const filter:Record<string,unknown>={kind};if(questionId)filter.questionId=questionId;if(writingId)filter.writingId=writingId;if(status)filter.status=status;
  const r=await query(COLLECTION,{filter,sort:[{fieldName:'modified',order:'DESC'}],paging:{limit,offset}},{consistentRead:true,returnTotalCount:true});
  return {rows:r.items as Row[],total:r.pagingMetadata?.total??0,hasNext:!!r.pagingMetadata?.hasNext};
}
export async function find(id:string) { const r=await query(COLLECTION,{filter:{_id:id},paging:{limit:1}},{consistentRead:true});return (r.items?.[0] as Row)||null; }
export function decode<T>(row:Row):T { return JSON.parse(row.payload); }
export async function put(id:string,kind:string,payload:any,existing?:Row|null) {
  const data={_id:id,kind,payload:JSON.stringify(payload),questionId:payload.questionId||'',writingId:payload.writingId||'',status:payload.status||payload.state||'',modified:new Date().toISOString()};
  if(new TextEncoder().encode(data.payload).length>380000)throw new Error('单条内容过大，请控制在380 KB以内');
  return existing ? await update(COLLECTION,{...existing,...data}) : await insert(COLLECTION,data);
}
export async function all(kind:string) {const result:Row[]=[];for(let offset=0;;offset+=100){const p=await list(kind,{offset,limit:100});result.push(...p.rows);if(p.rows.length<100)break;}return result;}
export async function deleteRow(id:string) {return remove(COLLECTION,id);}
