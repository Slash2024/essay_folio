import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtemp,rm,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const dir=await mkdtemp(join(tmpdir(),'folio-appeal-workspace-'));
try{
 await symlink(resolve('node_modules'),join(dir,'node_modules'),'dir');
 await build({entryPoints:['src/components/folio/AppealWorkspace.tsx'],bundle:true,platform:'node',format:'cjs',outdir:dir,jsx:'automatic',packages:'external',loader:{'.css':'empty'}});
 const require=createRequire(import.meta.url);
 const Workspace=require(join(dir,'AppealWorkspace.js')).default;
 const original='People pay more attention to their health.\n\nEveryone benefits.';
 const note={id:'c-example',kind:'correction',original:original.split('\n')[0],explanation:'当前说明',replacement:'People attach greater importance to their health.',title:'纠错 1',position:null,categories:[]};
 const candidate={decision:{verdict:'revise',summary:'建议调整为可选优化',response:'原句成立。',evidence:['People pay more attention'],patch:{kind:'optimization',explanation:'两种表达均成立。',replacement:note.replacement}},changes:[{field:'性质',before:'实际错误',after:'可选优化'}],model:'test',expiresAt:Date.now()+60000};
 const props={review:{id:'review',markdown:'raw original'},note,candidate,materials:{original:note.original,sentence:null},original,anchor:{start:7,end:25},busy:false,error:'',onChange:()=>{},onBusyChange:()=>{},onKeep:()=>{},onRetry:()=>{},onAccept:()=>{}};
 const render=()=>renderToStaticMarkup(createElement(Workspace,props));
 let html=render();
 for(const label of ['当前批注','复核建议','个人笔记'])assert(html.includes('aria-label="'+label+'"'));
 for(const label of ['批注标题','建议性质','删改显示','批注所属范围','选取批注原文范围','句旁短批注','原文重点样式','修改稿或补充表达','批注详细说明','暂不采纳这条建议'])assert(html.includes('aria-label="'+label+'"'),label);
 assert(html.includes('精确选择词语或跨句范围'));
 assert(html.includes('保存整理'));
 assert(html.includes('取消整理'));
 assert(html.includes('curation-editor-body'));
 assert(html.includes('关联第 01 句'));
 assert(html.includes('value="0:'+note.original.length+'" selected=""'),'default note scope expands a quoted fragment to its complete sentence');
 assert(!/<button[^>]*disabled=""[^>]*>采纳修改<\/button>/.test(html));
 candidate.decision.unverifiedEvidence=1;
 assert(/<button[^>]*disabled=""[^>]*>采纳修改<\/button>/.test(render()));
 delete candidate.decision.unverifiedEvidence;
 candidate.decision.verdict='maintain';candidate.changes=[];
 html=render();
 assert(!html.includes('>采纳修改</button>'));
 assert(html.includes('保存整理'),'a personal note remains available when the model maintains the original opinion');
 assert(html.includes('保留当前批注'));
 console.log('PASS appeal workspace: full existing editor fields, sentence-scoped personal note, independent decision/note actions and blocked unverified adoption.');
}finally{
 await rm(dir,{recursive:true,force:true});
}
