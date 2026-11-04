export interface WritingVersion { id:string; writingId:string; questionId:string; version:number; text:string; createdAt:string|null; source:'submitted'|'edit'|'legacySnapshot'|'legacyCurrent'|'recovered'; historyIncomplete?:boolean }
export interface DiffPart {value:string;type:'same'|'add'|'remove'}
export function wordDiff(before:string,after:string):DiffPart[]{
  const a=before.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*|\s+|[^A-Za-z0-9\s]/g)||[],b=after.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*|\s+|[^A-Za-z0-9\s]/g)||[];
  let prefix=0;while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;
  let endA=a.length,endB=b.length;while(endA>prefix&&endB>prefix&&a[endA-1]===b[endB-1]){endA--;endB--;}
  const x=a.slice(prefix,endA),y=b.slice(prefix,endB),out:DiffPart[]=[];
  function push(value:string,type:DiffPart['type']){if(!value)return;const p=out[out.length-1];if(p?.type===type)p.value+=value;else out.push({value,type});}
  push(a.slice(0,prefix).join(''),'same');
  // Bound memory for unusually long rewrites. The changed passage remains exact and readable.
  if(x.length*y.length>2000000){push(x.join(''),'remove');push(y.join(''),'add');}
  else {const width=y.length+1,dp=new Uint32Array((x.length+1)*width);for(let i=x.length-1;i>=0;i--)for(let j=y.length-1;j>=0;j--)dp[i*width+j]=x[i]===y[j]?dp[(i+1)*width+j+1]+1:Math.max(dp[(i+1)*width+j],dp[i*width+j+1]);let i=0,j=0;while(i<x.length||j<y.length){if(i<x.length&&j<y.length&&x[i]===y[j]){push(x[i++],'same');j++;}else if(i<x.length&&(j===y.length||dp[(i+1)*width+j]>=dp[i*width+j+1]))push(x[i++],'remove');else push(y[j++],'add');}}
  push(a.slice(endA).join(''),'same');return out;
}
