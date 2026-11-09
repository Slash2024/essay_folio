import {build} from 'esbuild';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
const dir=await mkdtemp(join(tmpdir(),'folio-sentences-'));
try{
 await build({entryPoints:['src/lib/sentence-reading.ts','src/lib/revisions.ts','src/lib/review-curation.ts','src/lib/phrase-diff.ts'],bundle:true,platform:'node',format:'esm',outdir:dir});const {readingRows,sentenceDisplays,validateReadingLayout,isSentenceRewrite,locateReviewNotes}=await import(join(dir,'sentence-reading.js'));
 const text='Dr. Smith said, "Great! The park is near my home!" Meanwhile, the number rose from 75.2 to 145.9.\nResidents\' homes are nearby. Parks help them.\nIn a larger sense, parks serves as a catalyst for public well-being.';
 const parsed=readingRows(text);assert.equal(parsed.rows.length,5);assert.deepEqual(parsed.rows.map(r=>r.section),['opening','opening','body','body','ending']);assert.equal(parsed.needsGrouping,false);for(const row of parsed.rows)assert.equal(text.slice(row.start,row.end),row.text);
 const contest='The contest is scheduled to take place at my university from Nov. 11 to Nov. 13.';
 assert.deepEqual(readingRows(contest).rows.map(r=>r.text),[contest]);
 assert.deepEqual(readingRows(contest+' Please arrive on time.').rows.map(r=>r.text),[contest,'Please arrive on time.']);
 assert.deepEqual(readingRows('It starts in Nov. And you can join us.').rows.map(r=>r.text),['It starts in Nov.','And you can join us.']);
 for(const month of ['Jan','Feb','Mar','Apr','May','Jun','June','Jul','July','Aug','Sep','Sept','Oct','Nov','Dec']){
  const date=`The event runs from ${month}. 11 to ${month}. 13.`;
  assert.deepEqual(readingRows(date+' Everyone is welcome.').rows.map(r=>r.text),[date,'Everyone is welcome.']);
  const terminal=`The event is in ${month}.`;
  assert.deepEqual(readingRows(terminal+' Please join us.').rows.map(r=>r.text),[terminal,'Please join us.']);
 }
 for(const date of ['It starts on nov. 11th at 9.30.','It starts on Sept. 3, 2026.','It starts in Nov. 2026.','It runs from Nov. to Dec.','It starts in Nov. and ends in Dec.']){
  const dated=readingRows(date+' Please attend.');assert.deepEqual(dated.rows.map(r=>r.text),[date,'Please attend.']);
  for(const r of dated.rows)assert.equal((date+' Please attend.').slice(r.start,r.end),r.text);
 }
 assert.deepEqual(readingRows('The contest runs from Nov. 11 to Nov. 13.\n\nPlease attend.').rows.map(r=>r.text),['The contest runs from Nov. 11 to Nov. 13.','Please attend.']);
 const spacedPossessive="First, China 's rich cultural heritage thrives not merely through preservation, but through creative reinterpretation, making folk customs like dragon boat racing speak to each new generation. Moreover, many families place a high premium on Chinese traditional culture, which naturally manifests as persistent encouragement for children to participate in dragon boat racing. Finally, media coverage sheds light on intangible cultural heritage, reshaping public perceptions and encouraging individuals to translate heightened awareness into concrete actions like holding more competitions regarding traditional folk cultural customs and calling on more people to take part in.";
 const fixedPossessive=readingRows(spacedPossessive);assert.equal(fixedPossessive.rows.length,3,'spaced possessive must not swallow following sentence boundaries');assert(fixedPossessive.rows[0].text.endsWith('generation.'));assert(fixedPossessive.rows[1].text.startsWith('Moreover,'));assert(fixedPossessive.rows[2].text.startsWith('Finally,'));assert.equal(fixedPossessive.rows.map(r=>r.text).join(' '),spacedPossessive);for(const r of fixedPossessive.rows)assert.equal(spacedPossessive.slice(r.start,r.end),r.text);
 for(const possessive of ["China's","China ’s","China ‘s","residents'","residents ’","don 't"]){const input=`${possessive} culture matters. Another sentence. A final sentence.`;assert.equal(readingRows(input).rows.length,3,possessive);}
 for(const quote of ['"',"'",'“','‘'])assert.equal(readingRows(`She wrote ${quote}a message. Another sentence. A final sentence.`).rows.length,3,'unclosed quote must not swallow periods');
 assert.deepEqual(readingRows('She said, "The first sentence. The second sentence." Then she left.').rows.map(r=>r.text),['She said, "The first sentence.','The second sentence."','Then she left.']);
 assert.deepEqual(readingRows("She said, 'A park helps.' Then she left.").rows.map(r=>r.text),["She said, 'A park helps.'",'Then she left.']);
 assert.equal(readingRows('He said “Great!” and smiled. Another sentence.').rows.length,2,'quoted exclamation with a continuation remains in the same sentence');
 const wrapped=readingRows('This is a long\nfirst sentence. Another sentence.\n\nThe middle paragraph has a sentence.\n\nThe final sentence.');assert.equal(wrapped.rows.length,4);assert.deepEqual(wrapped.rows.map(r=>r.section),['opening','opening','body','ending']);
 const letter=readingRows('Dear Paul,\n\nThank you for your trust. I am writing to help.\n\nThe event starts at 9.30. Please attend.\n\nPlease contact me.\n\nYours,\nLi Ming');assert.equal(letter.rows.filter(r=>r.kind==='format').length,3);assert.equal(letter.rows.filter(r=>r.kind==='sentence').length,5);assert.equal(letter.rows[0].section,'opening');assert.equal(letter.rows.at(-1).section,'ending');assert.equal(letter.rows.at(-1).formatLabel,'署名');
 const flat='First sentence. Middle sentence. Last sentence.';const ungrouped=readingRows(flat);assert(ungrouped.needsGrouping);assert(ungrouped.rows.every(r=>r.section==='unassigned'));const bounds={openingEnd:ungrouped.rows[0].end,endingStart:ungrouped.rows[2].start};assert.deepEqual(validateReadingLayout(bounds,flat),bounds);assert.deepEqual(readingRows(flat,bounds).rows.map(r=>r.section),['opening','body','ending']);assert.throws(()=>validateReadingLayout({openingEnd:2,endingStart:20},flat));assert.throws(()=>validateReadingLayout({openingEnd:flat.length,endingStart:0},flat));
 const row=parsed.rows.at(-1),at={start:row.start,end:row.end},original=row.text;const note={id:'c-1',kind:'correction',title:'纠错1',original,replacement:original.replace('parks serves','parks serve'),explanation:'主语是复数。',position:null,categories:[]};const located=[{note,range:at,source:'quote'}];const display=sentenceDisplays(text,parsed.rows,located).at(-1);assert.equal(display.inlineNoteIds.length,1);assert.equal(display.parts.filter(p=>p.type!=='add').map(p=>p.value).join(''),original);assert.equal(display.parts.filter(p=>p.type!=='remove').map(p=>p.value).join(''),note.replacement);assert.equal(display.parts.find(p=>p.type==='remove').value,'serves');assert.equal(display.parts.find(p=>p.type==='add').value,'serve');
 const datedNote={...note,id:'contest-date',original:contest,replacement:contest.replace('at my university','on campus')};const datedDisplay=sentenceDisplays(contest,readingRows(contest).rows,[{note:datedNote,range:{start:0,end:contest.length},source:'quote'}]);assert.equal(datedDisplay.length,1);assert.deepEqual(datedDisplay[0].inlineNoteIds,['contest-date']);assert.equal(datedDisplay[0].needsCheck,false);assert.equal(datedDisplay[0].parts.filter(p=>p.type!=='add').map(p=>p.value).join(''),contest);
 const {wordDiff}=await import(join(dir,'revisions.js'));
 const {asCurated,findSourceMatches}=await import(join(dir,'review-curation.js'));const quoted='He said "Great!"';const quotedNote={...note,original:'He said “Great!”'};const exactCurated=asCurated(quotedNote,{start:0,end:quoted.length-2},quoted);assert.deepEqual(exactCurated.anchor,{start:0,end:quoted.length});assert.equal(exactCurated.display,'auto','editing explanations preserves a reliable whole quoted surface');assert.equal(asCurated({...note,original:'Unrelated quote'},{start:0,end:4},quoted).display,'notes','uncertain automatic matches do not become source edits during curation');
 assert.deepEqual(findSourceMatches('parks and parks','parks'),[{start:0,end:5},{start:10,end:15}]);assert.deepEqual(findSourceMatches('parks',''),[]);assert.deepEqual(findSourceMatches('parks','missing'),[]);
 const hiddenNote=sentenceDisplays(text,parsed.rows,[{...located[0],note:{...note,hidden:true}}]).at(-1);assert.equal(hiddenNote.inlineNoteIds.length,0);assert.equal(hiddenNote.notes.length,0);assert.equal(hiddenNote.parts.map(p=>p.value).join(''),original);
 const notesOnly=sentenceDisplays(text,parsed.rows,[{...located[0],note:{...note,display:'notes'}}]).at(-1);assert.equal(notesOnly.inlineNoteIds.length,0);assert.equal(notesOnly.needsCheck,false);assert.equal(notesOnly.notes.length,1);

 assert.equal(isSentenceRewrite(display.parts),false,'one agreement error remains a word-level edit');
 const rewriteBefore='In the picture, a thought-provoking scene unfolds: in a river, two dragon boats are competing vigorously with some rowing cheering from a great dragon boat and the racing is attracting more people to get involved.';
 const rewriteAfter='In the picture, a thought-provoking scene unfolds: two dragon boats race on a river as crowds cheer from a bridge and the banks. One spectator remarks, “Our village’s dragon boat races are becoming livelier!”';
 const rewriteParts=wordDiff(rewriteBefore,rewriteAfter);assert.equal(isSentenceRewrite(rewriteParts),false,'a stable opening remains visible even during an extensive rewrite');
 assert.equal(rewriteParts.filter(p=>p.type!=='add').map(p=>p.value).join(''),rewriteBefore);assert.equal(rewriteParts.filter(p=>p.type!=='remove').map(p=>p.value).join(''),rewriteAfter);
 assert(isSentenceRewrite(wordDiff('This picture shows a crowd watching people in a boat.','Spectators enthusiastically cheer as two dragon boats race along the river.')),'complete rewrite uses sentence comparison');
 assert.equal(isSentenceRewrite(wordDiff('Parks serves residents.','Parks serve residents.')),false,'short grammatical correction stays inline');
 assert.equal(isSentenceRewrite(wordDiff('Public parks can help residents improve their health, reduce stress and develop a strong sense of belonging within their local communities.','Public parks can help residents improve their health, relieve stress and develop a stronger sense of belonging within their local communities.')),false,'sparse edits in a long sentence stay inline');
 assert.equal(isSentenceRewrite(wordDiff('No changes here.','No changes here.')),false);
 const {groupPhraseChanges}=await import(join(dir,'phrase-diff.js'));
 const mediaBefore='Finally, media coverage sheds light on intangible cultural heritage, reshaping public perceptions and encouraging individuals to translate heightened awareness into concrete actions like holding more competitions regarding folk customs and calling on people to take part in.';
 const mediaAfter='Finally, media coverage sheds light on intangible cultural heritage, encouraging individuals to organize traditional cultural events and invite others to take part.';
 const grouped=groupPhraseChanges(wordDiff(mediaBefore,mediaAfter));
 assert.deepEqual(grouped.filter(p=>p.type==='remove').map(p=>p.value),['reshaping public perceptions and ','translate heightened awareness into concrete actions like holding more competitions regarding folk customs','calling on people to take part in']);
 assert.deepEqual(grouped.filter(p=>p.type==='add').map(p=>p.value),['organize traditional cultural events','invite others to take part']);assert.equal(isSentenceRewrite(grouped),false);assert(grouped.some(p=>p.type==='same'&&p.value===' and '));
 for(const [before,after] of [[mediaBefore,mediaAfter],['People pay more attention to their health.','People attach greater importance to their health.'],['Parks serves residents.','Parks serve residents.'],['He has been working here.','He worked here.'],['We support culture, and protect nature.','They value culture, and preserve nature.'],['First paragraph.\nSecond paragraph.','A new paragraph.\nAnother paragraph.'],['', 'Added text.'],['Removed text.',''],['No changes.','No changes.'],[rewriteBefore,rewriteAfter]]){const input=wordDiff(before,after),frozen=JSON.stringify(input),result=groupPhraseChanges(input);assert.equal(result.filter(p=>p.type!=='add').map(p=>p.value).join(''),before);assert.equal(result.filter(p=>p.type!=='remove').map(p=>p.value).join(''),after);assert.equal(JSON.stringify(input),frozen);assert.deepEqual(groupPhraseChanges(result),result);}
 const collocation=groupPhraseChanges(wordDiff('People pay more attention to their health.','People attach greater importance to their health.'));assert.equal(collocation.find(p=>p.type==='remove').value,'pay more attention to');assert.equal(collocation.find(p=>p.type==='add').value,'attach greater importance to');
 const whole={...note,id:'cross',original:'First sentence. Middle sentence.',replacement:'Combined sentence.'};const cross=sentenceDisplays(flat,ungrouped.rows,[{note:whole,range:{start:0,end:whole.original.length},source:'quote'}]);assert(cross[0].needsCheck&&cross[1].needsCheck);assert(cross.slice(0,2).every(r=>!r.inlineNoteIds.length));assert.equal(cross.map(r=>r.parts.map(p=>p.value).join('')).join(' '),flat);
 const overlapping={...note,id:'overlap',original:'parks serves',replacement:'parks serve'};const offset=text.indexOf('parks serves');const overlap=sentenceDisplays(text,parsed.rows,[...located,{note:overlapping,range:{start:offset,end:offset+12},source:'quote'}]).at(-1);assert.equal(overlap.inlineNoteIds.length,0);assert(overlap.needsCheck);assert.equal(overlap.notes.length,2);
 const optimization={...note,id:'o-1',kind:'optimization',replacement:'A useful extra sentence.'};const optional=sentenceDisplays(text,parsed.rows,[{note:optimization,range:at,source:'paragraph'}]).at(-1);assert.equal(optional.inlineNoteIds.length,0);assert.equal(optional.parts.map(p=>p.value).join(''),original);assert.equal(optional.notes.length,1);
 const repeated='Parks serves residents. Parks serves residents.';
 const repeatedOriginal='Parks serves residents.',secondStart=repeated.lastIndexOf(repeatedOriginal);
 const repeatedNote={...note,id:'manual-repeat',original:repeatedOriginal,replacement:'Parks serve residents.',origin:'edited',scope:'range',anchor:{start:secondStart,end:repeated.length}};
 const repeatedDisplays=sentenceDisplays(repeated,readingRows(repeated).rows,[{note:repeatedNote,range:repeatedNote.anchor,source:'manual'}]);
 assert.deepEqual(repeatedDisplays[0].inlineNoteIds,[]);
 assert.deepEqual(repeatedDisplays[1].inlineNoteIds,['manual-repeat']);
 assert.equal(repeatedDisplays[1].parts.filter(p=>p.type!=='remove').map(p=>p.value).join(''),repeatedNote.replacement);
 const ambiguousRepeat=sentenceDisplays(repeated,readingRows(repeated).rows,[{note:{...repeatedNote,origin:undefined,scope:undefined,anchor:undefined},range:{start:0,end:repeated.length},source:'quote'}]);
 assert(ambiguousRepeat.every(r=>!r.inlineNoteIds.length),'automatic ambiguous matches remain unchanged');
 const wrong=sentenceDisplays(text,parsed.rows,[{note,range:{start:0,end:15},source:'manual'}]);assert(wrong.every(r=>!r.inlineNoteIds.length));

 // Quick bindings must work for both parsed and previously curated suggestions.
 const bindingSource='First sentence. Second sentence.';
 const bindingRows=readingRows(bindingSource).rows;
 const missing={...note,original:'A quote absent from the original.',replacement:'An alternative.'};
 const initially=locateReviewNotes(bindingSource,[missing]);
 assert.equal(initially[0].range,null);
 const boundStudy={revision:1,entries:{[missing.id]:{status:'mastered',starred:true,anchor:{start:bindingRows[1].start,end:bindingRows[1].end}}}};
 let bound=locateReviewNotes(bindingSource,[missing],boundStudy);
 assert.equal(bound[0].source,'manual');
 assert.deepEqual(bound[0].range,boundStudy.entries[missing.id].anchor);
 const boundDisplays=sentenceDisplays(bindingSource,bindingRows,bound);
 assert.equal(boundDisplays[0].notes.length,0);
 assert.equal(boundDisplays[1].notes[0].note.id,missing.id);
 assert(boundDisplays.every(d=>d.inlineNoteIds.length===0),'association alone does not invent an inline replacement');
 const curatedMissing={...missing,origin:'edited',scope:'unlocated',anchor:null,display:'notes'};
 bound=locateReviewNotes(bindingSource,[curatedMissing],boundStudy);
 assert.deepEqual(bound[0].range,boundStudy.entries[missing.id].anchor);
 boundStudy.entries[missing.id].anchor=null;
 assert.equal(locateReviewNotes(bindingSource,[curatedMissing],boundStudy)[0].range,null);
 assert.equal(curatedMissing.original,missing.original);
 console.log('PASS sentence reading: source offsets, quotes/abbreviations/decimals/possessives, natural paragraph and letter format groups, manual boundaries, exact inline diffs, cross-sentence/overlap/manual uncertainty, optional suggestions retained outside essay');
}finally{await rm(dir,{recursive:true,force:true});}
