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
 await build({entryPoints:['src/components/folio/AppealWorkspace.tsx'],bundle:true,platform:'node',format:'cjs',outdir:dir,jsx:'automatic',packages:'external',loader:{'.css':'empty'},plugins:[{
  name:'synchronous-markdown-for-component-test',setup(build){
   build.onResolve({filter:/\/MarkdownView$/},()=>({path:'markdown',namespace:'component-test'}));
   build.onLoad({filter:/.*/,namespace:'component-test'},()=>({contents:"import {createElement} from 'react'; export default function Markdown({markdown}){return createElement('div',{className:'markdown'},markdown)}",loader:'js',resolveDir:resolve('.')}));
  }
 }]});
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
 assert(html.includes('笔记单独保存'));
 assert(html.includes('aria-label="意见对照"'));
 assert.equal((html.match(/class="appeal-shared-source"/g)||[]).length,1,'original source is shared, never presented as an LLM-editable field');
 assert.equal((html.match(/class="appeal-comparison-body"/g)||[]).length,1,'both opinions are in one scroll container');
 assert(html.includes('回应申诉：</strong>原句成立。'));
 assert(html.includes('aria-label="当前批注 · 修改说明"><div><div class="markdown">当前说明'));
 assert(html.includes('aria-label="复核建议 · 修改说明"><div><div class="markdown">两种表达均成立。'));
 assert(html.includes('查看模型引用依据'));
 assert(html.includes('查看逐项改动'));
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
 candidate.decision.verdict='insufficient';candidate.decision.patch=null;candidate.decision.neededContext='请补充题目要求。';
 html=render();
 assert(html.includes('证据不足，尚未形成可采纳的新批注。'));
 assert(html.includes('需要补充 请补充题目要求。'));
 assert(!html.includes('>采纳修改</button>'));
 candidate.decision.verdict='withdraw';candidate.decision.neededContext=null;candidate.changes=[{field:'暂不采纳',before:'否',after:'是'}];
 html=render();
 assert(html.includes('确认撤回这条意见'));
 assert(html.includes('撤回后不再应用此建议表达。'));
 assert.equal((html.match(/People attach greater importance/g)||[]).length,1,'withdrawal does not misrepresent the old replacement as an active proposed expression');
 candidate.expiresAt=Date.now()-1000;
 assert(/<button[^>]*disabled=""[^>]*>确认撤回这条意见<\/button>/.test(render()));
 candidate.decision.verdict='revise';candidate.decision.patch={kind:'keep',explanation:'可以保留原句。',replacement:null};candidate.expiresAt=Date.now()+60000;
 html=render();
 assert(html.includes('原句可保留'));
 assert(html.includes('aria-label="复核建议 · 建议表达"><p class="caption">未提供</p>'),'a missing replacement must not be filled with the original suggestion');
 props.busy=true;
 assert(/<button[^>]*disabled=""[^>]*>保存整理<\/button>/.test(render()));
 console.log('PASS appeal workspace: shared source and aligned opinion fields, full personal-note editor, independent actions, all verdict states and adoption guards.');
}finally{
 await rm(dir,{recursive:true,force:true});
}
