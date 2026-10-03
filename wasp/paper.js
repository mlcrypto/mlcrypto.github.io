import {WIKI_ORIGIN,starterSummary} from './wiki-common.js';
import {paperNotes} from './paper-notes.js';
const $=id=>document.getElementById(id);
const id=new URLSearchParams(location.search).get('id');
const apiOrigin=['localhost','127.0.0.1'].includes(location.hostname)?location.origin:WIKI_ORIGIN;
const libraryUrl=new URL('../wasp.html',location.href);
let paper,current=null,baseVersion=0,permit=null,commentCursor=null,historyCursor=null,historyLoaded=false,summaryRequest=null,commentRequest=null;
const date=value=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
function busy(form,value){for(const control of $(form).querySelectorAll('input,textarea,button'))control.disabled=value;}
function status(target,message,error=false){$(target).textContent=message;$(target).classList.toggle('error',error);}
async function api(path,{data,before}={}){
 const url=new URL('/api/wiki/'+path,apiOrigin);url.searchParams.set('id',id);if(before)url.searchParams.set('before',before);
 let response;try{response=await fetch(url,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw Error('Could not reach shared storage. Your draft is still on this page. Please try again.');}
 let result;try{result=await response.json()}catch{throw Error('Shared storage returned an unexpected response. Your draft is still on this page.');}
 if(!response.ok){const error=Error(result.error||'Could not save changes.');error.status=response.status;throw error;}return result;
}
async function getPermit(){
 if(!permit||permit.expiresAt<Date.now()+10000)permit=await api('token');
 const delay=permit.notBefore-Date.now()+150;if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));return permit.token;
}
function renderSummary(){
 $('summary-text').textContent=current?.body||starterSummary(paper)||'No summary yet. Be the first to write one.';
 $('summary-origin').textContent=current?`Community edit · revision ${current.version} · ${current.author} (unverified) · ${date(current.createdAt)}`:paper.abstract?'Starting excerpt from the authors’ abstract. Not yet edited into a community summary.':'No community summary yet.';
}
function commentNode(comment){const article=document.createElement('article');article.className='comment';const meta=document.createElement('p');meta.className='comment-meta';meta.textContent=`${comment.author} (unverified) · ${date(comment.createdAt)}`;const body=document.createElement('p');body.className='comment-body';body.textContent=comment.body;article.append(meta,body);return article;}
function showComments(data,append=false){
 if(!append)$('comment-list').replaceChildren();
 $('comment-list').append(...data.comments.map(commentNode));
 if(!$('comment-list').children.length){const empty=document.createElement('p');empty.className='empty-discussion';empty.textContent='No comments yet. Start the discussion.';$('comment-list').append(empty);}
 commentCursor=data.commentsCursor;$('more-comments').hidden=!commentCursor;
}
async function refresh(){const data=await api('paper');current=data.summary;renderSummary();showComments(data);$('edit-summary').disabled=false;$('post-comment').disabled=false;}
function edit(body){baseVersion=current?.version||0;$('summary-body').value=body??current?.body??starterSummary(paper);$('summary-form').hidden=false;$('edit-summary').hidden=true;$('summary-body').focus();summaryRequest=null;}
$('edit-summary').addEventListener('click',()=>{edit();getPermit().catch(e=>status('summary-status',e.message,true));});
$('cancel-summary').addEventListener('click',()=>{$('summary-form').hidden=true;$('edit-summary').hidden=false;status('summary-status','');});
$('summary-body').addEventListener('input',()=>summaryRequest=null);$('summary-name').addEventListener('input',()=>summaryRequest=null);
$('comment-body').addEventListener('input',()=>commentRequest=null);$('comment-name').addEventListener('input',()=>commentRequest=null);
$('comment-body').addEventListener('focus',()=>{getPermit().catch(()=>{});});
$('summary-form').addEventListener('submit',async event=>{
 event.preventDefault();busy('summary-form',true);status('summary-status','Saving…');
 try{
  const body=$('summary-body').value,author=$('summary-name').value;
  summaryRequest??=crypto.randomUUID();
  await api('summary',{data:{body,author,baseVersion,requestId:summaryRequest,token:await getPermit(),website:$('summary-website').value}});
  $('summary-form').hidden=true;$('edit-summary').hidden=false;summaryRequest=null;historyLoaded=false;$('history').open=false;
  status('summary-status','Summary saved for everyone.');
  try{await refresh()}catch{status('summary-status','Saved, but the page could not refresh. Reload to see the latest version.',true);}
 }catch(error){
  status('summary-status',error.message,true);
  if(error.status===409){try{const data=await api('paper');current=data.summary;renderSummary();baseVersion=current?.version||0;summaryRequest=null;status('summary-status',error.message+' The latest version is shown above your draft. Save again only after reviewing both.',true);}catch{}}
  if(error.status===403)permit=null;
 }finally{busy('summary-form',false);}
});
$('comment-form').addEventListener('submit',async event=>{
 event.preventDefault();busy('comment-form',true);status('comment-status','Posting…');
 try{
  commentRequest??=crypto.randomUUID();
  await api('comments',{data:{body:$('comment-body').value,author:$('comment-name').value,requestId:commentRequest,token:await getPermit(),website:$('comment-website').value}});
  $('comment-body').value='';commentRequest=null;status('comment-status','Comment posted for everyone.');
  try{await refresh()}catch{status('comment-status','Posted, but the discussion could not refresh. Reload to see your comment.',true);}
 }catch(error){status('comment-status',error.message,true);if(error.status===403)permit=null;}finally{busy('comment-form',false);}
});
async function loadHistory(append=false){
 const data=await api('history',{before:append?historyCursor:null});if(!append)$('history-list').replaceChildren();
 for(const revision of data.revisions){
  const item=document.createElement('div');item.className='revision';const meta=document.createElement('p');meta.className='revision-meta';meta.textContent=`Revision ${revision.version} · ${revision.author} (unverified) · ${date(revision.createdAt)}`;
  const text=document.createElement('p');text.className='revision-body';text.textContent=revision.body;
  const use=document.createElement('button');use.type='button';use.className='secondary';use.textContent='Use this text in editor';use.addEventListener('click',()=>edit(revision.body));item.append(meta,text,use);$('history-list').append(item);
 }
 if(!data.revisions.length&&!append)$('history-list').textContent='No community revisions yet.';
 historyCursor=data.historyCursor;$('more-history').hidden=!historyCursor;historyLoaded=true;
}
$('history').addEventListener('toggle',()=>{if($('history').open&&!historyLoaded)loadHistory().catch(e=>status('summary-status',e.message,true));});
$('more-history').addEventListener('click',async()=>{$('more-history').disabled=true;try{await loadHistory(true)}catch(e){status('summary-status',e.message,true)}finally{$('more-history').disabled=false;}});
$('more-comments').addEventListener('click',async()=>{$('more-comments').disabled=true;try{showComments(await api('comments',{before:commentCursor}),true)}catch(e){status('comment-status',e.message,true)}finally{$('more-comments').disabled=false;}});
async function load(){
 try{
  const r=await fetch('./catalog.json',{cache:'no-cache'});if(!r.ok)throw Error('The paper catalog could not be loaded.');const catalog=await r.json();paper=catalog.papers.find(p=>p.id===id);if(!paper)throw Error('Paper not found. Please return to the library and choose a paper.');
  document.title=paper.title+' — WASP';$('paper-title').textContent=paper.title;$('paper-authors').textContent=paper.authors.join(', ');$('paper-meta').textContent=`${paper.year} · ${paper.venue||'arXiv preprint'} · arXiv:${paper.id}`;
  for(const [label,url] of [['arXiv',paper.url],['PDF',paper.pdf]]){if(!/^https:\/\/arxiv\.org\//.test(url))continue;const link=document.createElement('a');link.href=url;link.textContent=label;link.target='_blank';link.rel='noopener noreferrer';$('source-links').append(link);}
  const note=paperNotes[id];if(note){const link=document.createElement('a');link.href=new URL(note.path,libraryUrl).href;link.textContent=note.label;$('editorial-note').append(link);$('editorial-note').hidden=false;}
  $('paper-abstract').textContent=paper.abstract||'No abstract available.';renderSummary();$('paper-content').hidden=false;$('paper-loading').hidden=true;
  try{await refresh()}catch(e){status('summary-status',e.message,true);status('comment-status','Discussion is unavailable. Reload to try again.',true);}
 }catch(error){$('paper-loading').textContent=error.message;}
}
await load();
