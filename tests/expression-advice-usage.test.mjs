import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'advice-usage-'));
try {
 await build({entryPoints:['src/lib/expression-advice-usage.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'test.mjs')});
 const {collectAdviceWritingUsage:collect,comparisonWriting:choose}=await import(join(dir,'test.mjs'));
 const sentence={id:'same',category:'test',title:'获益',template:'We benefit from {{object}}.',notes:'',substitutions:'',enabled:true};
 const word={id:'same',term:'patience',meaning:'耐心',forms:[],enabled:true};
 const library={revision:1,updatedAt:null,tolerance:'balanced',sentences:[sentence],words:[word,{...word,id:'typo',term:'cooperation'},{...word,id:'changed',term:'ecology'},{...word,id:'off',enabled:false},{...word,id:'related',term:'benefit'}]};
 const entry=(kind,id,expression)=>({entry:{kind,key:kind+':'+id,expression}});
 const advice={items:[entry('sentence','same','WE BENEFIT FROM [something]!'),entry('word','same','patience'),entry('word','typo','cooperation'),entry('word','changed','resilience'),entry('word','off','patience'),entry('word','gone','patience'),entry('word','different-id','patience'),entry('word','related','benefit')]};
 const w=(id,text,status='submitted',extra={})=>({id,text,status,questionId:'2019-large',revision:1,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',...extra});
 const writing=w('current','We benefit from reading. We benefit from exercise. We benefit from music. We benefit from nature. Patience matters. Cooperatoin helps.');
 // A single-character typo follows the existing approximate matcher.
 writing.text=writing.text.replace('Cooperatoin','Cooperatiom');
 const before=JSON.stringify({advice,writing,library});
 let r=collect(advice,writing,library,'current');
 assert.equal(r.usedCount,3);assert.equal(r.approximateCount,1);assert.equal(r.changedCount,4);
 assert.equal(r.entries['sentence:same'].occurrences,4);assert.equal(r.entries['sentence:same'].excerpts.length,3);
 assert.equal(r.entries['word:same'].status,'used','kind and ID both participate in the join');
 assert.equal(r.entries['word:typo'].status,'approximate');assert.equal(r.entries['word:changed'].status,'changed');
 for(const key of ['off','gone','different-id'])assert.equal(r.entries['word:'+key].status,'unavailable');
 assert.equal(JSON.stringify({advice,writing,library}),before,'read-time comparison cannot mutate saved data');
 for(const e of r.entries['sentence:same'].excerpts)for(const span of e.spans)assert.equal(e.text.slice(span.start,span.end),'We benefit from');
 r=collect(advice,w('mixed',writing.text+' Cooperation is useful.'),library,'latest');
 assert.equal(r.entries['word:typo'].status,'used','an accepted match takes precedence over an approximate occurrence');assert.equal(r.approximateCount,0);
 r=collect(advice,w('none','We read books from our library.'),library,'current');assert.equal(r.entries['sentence:same'].status,'unmatched','shared words alone do not prove the expression was used');
 assert.equal(collect(advice,w('family','Benefits are clear.'),library,'latest').entries['word:related'].status,'used');
 assert.equal(collect(null,writing,library,'latest').usedCount,0);
 const old=w('old','old','reviewed',{submittedAt:'2026-11-02T00:00:00Z',updatedAt:'2026-11-24T00:00:00Z'}),latest=w('latest','latest','submitted',{submittedAt:'2026-11-20T00:00:00Z'}),draft=w('draft','draft','draft',{createdAt:'2026-11-23T00:00:00Z'});
 assert.equal(choose([old,draft,latest]).id,'latest','recent edits and newer drafts must not change latest submission');
 assert.equal(choose([old,latest],'old').id,'old');assert.equal(choose([old,draft],'draft'),null);assert.equal(choose([old],'missing'),null);
 assert.equal(choose([w('legacy','legacy'),old]).id,'old','legacy submission timestamp falls back to createdAt');
 assert.equal(choose([w('blank','   '),draft]),null);
 console.log('Advice usage: exact/approximate, repeated entries, identity, snapshots, excerpt spans, immutable reads and manuscript selection passed');
} finally {await rm(dir,{recursive:true,force:true});}
