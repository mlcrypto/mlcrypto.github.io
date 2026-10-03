// Private, per-browser preferences. No requests, identifiers, or shared totals.
export const VOTE_STORAGE_KEY='wasp.paperVotes.v1';
const paperId=/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})$/;
const strings=value=>Array.isArray(value)&&value.every(item=>typeof item==='string');
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));

export function parseVotes(raw){
 if(raw===null)return [];
 const data=JSON.parse(raw);
 if(data?.version!==1||!Array.isArray(data.votes))throw Error('Unsupported saved votes');
 const seen=new Set();
 for(const record of data.votes){
  const p=record?.paper;
  if(!p||typeof p.id!=='string'||!paperId.test(p.id)||seen.has(p.id)||
   typeof p.title!=='string'||!strings(p.authors)||typeof p.url!=='string'||
   !['up','down'].includes(record.vote)||!date(record.updatedAt)||!date(record.catalogSnapshot))throw Error('Invalid saved vote');
  seen.add(p.id);
 }
 return data.votes;
}

export function toggleVote(records,paper,vote,catalogSnapshot,updatedAt=new Date().toISOString()){
 if(!paperId.test(paper.id)||!['up','down'].includes(vote)||!date(catalogSnapshot)||!date(updatedAt))throw Error('Invalid vote');
 const next=records.filter(r=>r.paper.id!==paper.id);
 if(records.find(r=>r.paper.id===paper.id)?.vote===vote)return next;
 next.push({vote,updatedAt,catalogSnapshot,paper:{id:paper.id,title:paper.title,authors:[...paper.authors],
  year:paper.year,published:paper.published,venue:paper.venue||'',topics:[...paper.topics],url:paper.url,pdf:paper.pdf,
  citationCount:paper.citationCount??null,citationSource:paper.citationSource??null,citationUpdated:paper.citationUpdated??null}});
 return next;
}

export function serializeVotes(records){return JSON.stringify({version:1,votes:records});}
export function exportVotes(records,exportedAt=new Date().toISOString()){
 return JSON.stringify({format:'wasp-private-votes',version:1,exportedAt,
  note:'Private preferences, not community scores. One current vote per paper; paper metadata is a snapshot from the time of voting.',
  votes:[...records].sort((a,b)=>a.paper.id.localeCompare(b.paper.id))},null,2)+'\n';
}

export function createVoteStore(getStorage){
 let records=[],persistent=true,blocked=false;
 function read(){
  let raw;
  try{raw=getStorage().getItem(VOTE_STORAGE_KEY)}catch{persistent=false;return;}
  try{records=parseVotes(raw);persistent=true;blocked=false;}catch{blocked=true;}
 }
 read();
 return {
  get records(){return records;},get persistent(){return persistent;},get blocked(){return blocked;},
  reload(){if(persistent)read();},
  toggle(paper,vote,catalogSnapshot,updatedAt){
   // Merge the latest on-disk preferences before writing, including other tabs.
   if(persistent)read();
   if(blocked)return false;
   records=toggleVote(records,paper,vote,catalogSnapshot,updatedAt);
   if(persistent)try{getStorage().setItem(VOTE_STORAGE_KEY,serializeVotes(records));}catch{persistent=false;}
   return true;
  },
 };
}
