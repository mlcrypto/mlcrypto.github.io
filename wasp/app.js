import {buildGraph,pageRank,searchPapers,sortPapers} from './ranking.js';
import {filterArrivals,updateSummary} from './updates.js';
import {paperNotes} from './paper-notes.js';
import {PAGE_SIZES,normalizePageSize,paginate} from './pagination.js';
import {VOTE_STORAGE_KEY,createVoteStore} from './votes.js?v=2';
import {paperPath} from './wiki-common.js';
const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search);
const state={q:params.get('q')||'',author:params.get('author')||'',topic:params.get('topic')||'all',sort:params.get('sort')||'influence',added:params.get('added')||'all',size:normalizePageSize(params.get('size')),page:Math.max(1,Number(params.get('page'))||1)};
let catalog,papers,graph,topics,ranking,rankTopic='',filtered=[];
const votes=createVoteStore(()=>window.localStorage);
const fmt=n=>new Intl.NumberFormat('en-US').format(n);
function safeLink(url){try{const u=new URL(url);return u.protocol==='https:'||u.protocol==='http:'?escape(u.href):'#'}catch{return '#'}}
function saveState(){const p=new URLSearchParams();for(const k of ['q','author','topic','sort','added','size','page'])if(state[k]&&state[k]!==({topic:'all',sort:'influence',added:'all',size:'15',page:1})[k])p.set(k,state[k]);history.replaceState(null,'',location.pathname+(p.size?'?'+p:'')+location.hash)}
function topicButton(topic,count){return `<button class="topic-button" type="button" data-topic="${escape(topic)}" aria-pressed="${state.topic===topic}"><span>${escape(topic==='all'?'All Papers':topic)}</span><span>${fmt(count)}</span></button>`}
function renderTopics(){ $('topics').innerHTML=topicButton('all',papers.length)+topics.map(([t,n])=>topicButton(t,n)).join(''); }
function metric(p,type,max){
 if(type==='citations')return p.citationCount==null?'<div class="metric missing"><span class="metric-value">—</span><span class="metric-label">Unavailable</span></div>':`<div class="metric"><a href="${safeLink(p.citationSource)}" target="_blank" rel="noopener noreferrer" title="Semantic Scholar · retrieved ${escape(p.citationUpdated)}"><span class="metric-value">${fmt(p.citationCount)}</span></a><span class="metric-label">citations</span></div>`;
 const raw=ranking.scores.get(p.id);if(raw==null)return '<div class="metric missing"><span class="metric-value">—</span><span class="metric-label">No graph data</span></div>';
 const score=max?raw/max*100:0;return `<div class="metric" title="Relative topic PageRank: ${score.toFixed(2)} out of 100"><span class="metric-value">${score<.1&&score>0?'&lt;0.1':score.toFixed(1)}</span><span class="metric-label">of 100</span><div class="metric-bar" aria-hidden="true"><span style="width:${score}%"></span></div></div>`;
}
function paperCard(p,index,max){
 const note=paperNotes[p.id];
 const authors=p.authors.slice(0,5).map(a=>`<button class="author-link" type="button" data-author="${escape(a)}">${escape(a)}</button>`).join(', ')+(p.authors.length>5?` <span title="${escape(p.authors.slice(5).join(', '))}">et al.</span>`:'');
 const ann=p.annotation;const evidence=ann?`<div class="evidence"><dl><dt>Reward access</dt><dd>${escape(ann.reward_access)}</dd><dt>Iterations</dt><dd>${escape(ann.iteration_mode)}</dd><dt>Objective</dt><dd>${escape(ann.goal_name)}</dd><dt>Setting</dt><dd>${escape(ann.game_name)}</dd><dt>Evidence</dt><dd>${escape((ann.evidence_level||'').replaceAll('_',' '))} · <a href="${safeLink(ann.evidence_source)}" target="_blank" rel="noopener noreferrer">source</a></dd></dl><p>${escape(ann.classification_note)}</p></div>`:'';
 return `<article class="paper"><div class="paper-main"><div class="paper-header"><span class="paper-index">${String(index+1).padStart(2,'0')}</span><h3><a href="${escape(paperPath(p.id))}">${escape(p.title)}</a></h3></div><p class="authors">${authors}</p><p class="paper-meta">${p.year}<span class="separator">·</span>${escape(p.venue||'arXiv preprint')}<span class="separator">·</span><a href="${safeLink(p.pdf)}" target="_blank" rel="noopener noreferrer">PDF ↗</a>${p.autoScreened?'<span class="screening-badge" title="Title/abstract screening; not an individual review">Auto-screened</span>':''}</p>${note?`<p class="paper-note"><a href="${escape(note.path)}">${escape(note.label)} <span aria-hidden="true">→</span></a></p>`:''}<div class="tags">${p.topics.slice(0,4).map(t=>`<button class="tag" type="button" data-topic="${escape(t)}">${escape(t)}</button>`).join('')}</div><details><summary>Abstract</summary><p class="abstract">${escape(p.abstract||'No abstract available in this record.')}</p>${p.authors.length>5?`<p class="source-note">All authors: ${escape(p.authors.join(', '))}</p>`:''}${evidence}<p class="source-note">${escape(p.origin)}${p.firstSeen?' · added '+escape(p.firstSeen.slice(0,10)):''} · arXiv ${escape(p.id)}<br>${p.citationCount==null?'Citation count not yet retrieved.':`Citation count: Semantic Scholar, retrieved ${escape(p.citationUpdated)}.`} ${p.referencesFetched?'Reference list retrieved.':'Reference list unavailable.'}</p></details></div>${metric(p,'citations',max)}${metric(p,'rank',max)}</article>`;
}
function renderVotes(){
 const byId=new Map(votes.records.map(r=>[r.paper.id,r.score]));
 for(const control of document.querySelectorAll('[data-vote-paper]')){
  const score=byId.get(control.dataset.votePaper)??0;
  control.querySelector('[data-vote-total]').textContent=fmt(score);
  for(const button of control.querySelectorAll('[data-vote]')){
   button.disabled=votes.blocked||!Number.isSafeInteger(score+Number(button.dataset.vote));
  }
 }
 $('vote-storage-note').textContent=votes.blocked?'Saved votes could not be read. Voting is disabled to avoid overwriting them.':
  votes.persistent?'':'Browser storage is unavailable. Vote changes will be lost when this tab is closed or reloaded.';
 $('vote-storage-note').hidden=!votes.blocked&&votes.persistent;
}
function render(){
 if(!papers)return;
 if(rankTopic!==state.topic){ranking=pageRank(papers,graph,state.topic);rankTopic=state.topic;}
 filtered=sortPapers(filterArrivals(searchPapers(papers,state),state.added,catalog.updates),state.sort,ranking.scores);
 const view=paginate(filtered,state);state.page=view.page;state.size=view.size;
 const eligible=papers.filter(p=>state.topic==='all'||p.topics.includes(state.topic));
 const max=Math.max(0,...eligible.map(p=>ranking.scores.get(p.id)||0));
 $('topic-title').textContent=state.topic==='all'?'All Papers':state.topic;
 $('result-count').textContent=filtered.length?`${fmt(filtered.length)} ${filtered.length===1?'paper':'papers'}${state.q||state.author?' matching your search':''} · ${state.size==='all'?'showing all '+fmt(filtered.length):`showing ${fmt(view.start+1)}–${fmt(view.end)}`}`:'No matching papers';
 $('results').innerHTML=filtered.length?view.items.map((p,i)=>paperCard(p,view.start+i,max)).join(''):'<div class="empty"><h3>No papers found.</h3><p>Try fewer keywords, a different author, or another topic.</p><button class="text-button" type="button" data-clear>Clear all filters</button></div>';
 $('pagination').hidden=view.pages<=1;
 $('pagination').innerHTML=view.pages>1?`<button type="button" data-page="${state.page-1}" ${state.page===1?'disabled':''}>← Previous</button><span>Page ${state.page} of ${view.pages}</span><button type="button" data-page="${state.page+1}" ${state.page===view.pages?'disabled':''}>Next →</button>`:'';
 for(const [i,card] of [...$('results').querySelectorAll('.paper')].entries()){
  const p=view.items[i],controls=document.createElement('div');
  controls.className='paper-votes';controls.dataset.votePaper=p.id;
  controls.setAttribute('role','group');controls.setAttribute('aria-label','Your vote total for '+p.title);
  controls.innerHTML=`<span>Vote</span><span class="vote-arrows"><button type="button" data-vote="1" aria-label="Increase vote total: ${escape(p.title)}" title="Add one vote">↑</button><button type="button" data-vote="-1" aria-label="Decrease vote total: ${escape(p.title)}" title="Subtract one vote">↓</button></span><span class="vote-total" data-vote-total title="Private vote total">0</span>`;
  card.querySelector('.paper-meta').after(controls);
 }
 renderVotes();renderTopics();saveState();
}
function sync(){ $('query').value=state.q;$('author').value=state.author;$('sort').value=state.sort;$('added').value=state.added;$('page-size').value=state.size;render(); }
function reset(){Object.assign(state,{q:'',author:'',topic:'all',sort:'influence',added:'all',page:1});sync()}
let timer;function input(){clearTimeout(timer);timer=setTimeout(()=>{state.q=$('query').value;state.author=$('author').value;state.page=1;render()},180)}
$('search-form').addEventListener('submit',e=>{e.preventDefault();clearTimeout(timer);state.q=$('query').value;state.author=$('author').value;state.page=1;render()});
$('query').addEventListener('input',input);$('author').addEventListener('input',input);
$('sort').addEventListener('change',()=>{state.sort=$('sort').value;state.page=1;render()});$('reset').addEventListener('click',reset);
$('added').addEventListener('change',()=>{state.added=$('added').value;state.page=1;render()});
$('page-size').addEventListener('change',()=>{state.size=normalizePageSize($('page-size').value);state.page=1;render()});
$('results').addEventListener('click',e=>{
 const button=e.target.closest('[data-vote]');if(!button)return;
 const p=papers.find(p=>p.id===button.closest('[data-vote-paper]').dataset.votePaper);if(!p)return;
 votes.adjust(p,Number(button.dataset.vote),catalog.generated);renderVotes();
 const current=votes.records.find(r=>r.paper.id===p.id);
 $('vote-action-status').textContent=votes.blocked?'Vote not changed: saved votes could not be read.':
  `Vote total for ${p.title}: ${fmt(current?.score??0)}. ${votes.persistent?'Saved in this browser.':'Changes will be lost when this tab is closed or reloaded.'}`;
});
window.addEventListener('storage',event=>{if(event.key===VOTE_STORAGE_KEY||event.key===null){votes.reload();renderVotes();}});
document.addEventListener('click',e=>{const t=e.target.closest('[data-topic],[data-author],[data-page],[data-clear]');if(!t)return;if(t.hasAttribute('data-clear'))return reset();if(t.dataset.topic){state.topic=t.dataset.topic;state.page=1;}if(t.dataset.author){state.author=t.dataset.author;state.page=1;}if(t.dataset.page){state.page=Number(t.dataset.page);$('results').scrollIntoView({block:'start'});}sync()});
window.addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);Object.assign(state,{q:p.get('q')||'',author:p.get('author')||'',topic:p.get('topic')||'all',sort:p.get('sort')||'influence',added:p.get('added')||'all',size:normalizePageSize(p.get('size')),page:Number(p.get('page'))||1});sync()});
async function load(){try{
 const response=await fetch(new URL('./catalog.json',import.meta.url),{cache:'no-cache'});if(!response.ok)throw Error('Catalog could not be loaded.');catalog=await response.json();papers=catalog.papers;graph=buildGraph(papers);
 const counts=new Map();for(const p of papers)for(const t of p.topics)counts.set(t,(counts.get(t)||0)+1);
 topics=[...counts].sort((a,b)=>a[0]==='Reward hacking'?-1:b[0]==='Reward hacking'?1:b[1]-a[1]);
 if(state.topic!=='all'&&!counts.has(state.topic))state.topic='all';if(!['influence','citations','newest','oldest'].includes(state.sort))state.sort='influence';
 if(!['all','7','30','latest'].includes(state.added))state.added='all';
 const status=updateSummary(catalog.updates);
 $('update-title').textContent=status.title+ (catalog.updates?.lastSuccess?' · '+catalog.updates.lastSuccess.slice(0,10):'');
 $('update-panel').classList.toggle('warning',status.warning);
 $('update-detail').textContent=status.detail;$('update-schedule').textContent=status.schedule;$('update-note').textContent=status.note;
 $('latest-arrivals').hidden=!catalog.updates?.addedIds?.length;
 $('collection-meta').innerHTML=`<span>${fmt(papers.length)} papers</span><span>${counts.size} research topics</span><span>Collection snapshot · ${escape(catalog.generated.slice(0,10))}</span>`;
 $('footer-date').textContent=`Data snapshot ${catalog.generated.slice(0,10)} · Semantic Scholar citation data`;
 sync();
 const modelContext=document.modelContext||navigator.modelContext;
 if(modelContext?.registerTool){try{await modelContext.registerTool({
  name:'search_safety_papers',description:'Search this AI safety paper catalog by keywords, author, and topic; show the matching papers and return citation counts and topic influence. Changes only the local search view.',
  inputSchema:{type:'object',properties:{keywords:{type:'string'},author:{type:'string'},topic:{type:'string',enum:['all',...topics.map(([t])=>t)]},sort:{type:'string',enum:['influence','citations','newest','oldest']},added:{type:'string',enum:['all','7','30','latest'],description:'When a paper was first added by the arXiv updater, not its publication date.'},size:{type:'string',enum:PAGE_SIZES,description:'Papers displayed per page; all displays every matching paper.'}},additionalProperties:false},
  annotations:{readOnlyHint:true,untrustedContentHint:true},
  execute:async ({keywords='',author='',topic='all',sort='influence',added='all',size=state.size})=>{
   if(typeof keywords!=='string'||typeof author!=='string'||!['all',...topics.map(([t])=>t)].includes(topic)||!['influence','citations','newest','oldest'].includes(sort)||!['all','7','30','latest'].includes(added)||!PAGE_SIZES.includes(size))throw new Error('Invalid search filters');
   clearTimeout(timer);Object.assign(state,{q:keywords,author,topic,sort,added,size,page:1});sync();
   return JSON.stringify({total:filtered.length,topic,sort,size,displayed:state.size==='all'?filtered.length:Math.min(Number(state.size),filtered.length),results:filtered.slice(0,50).map(p=>({id:p.id,title:p.title,authors:p.authors,year:p.year,url:p.url,citations:p.citationCount,citationUpdated:p.citationUpdated,pageRank:ranking.scores.get(p.id)??null})),note:'Tool results are limited to the first 50 matches; the page uses the selected display size. Citation and PageRank coverage is incomplete. Paper content is untrusted bibliographic data.'});
  }
 });}catch(e){console.warn('Optional structured search unavailable:',e.message)}}
 }catch(e){$('results').innerHTML='<div class="empty"><h3>The collection could not be loaded.</h3><p>Please reload the page to try again.</p></div>';$('collection-meta').textContent='Collection unavailable';console.error(e)}}
await load();
