export const normalize=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function buildGraph(papers){
 const ids=new Map(papers.filter(p=>p.semanticId).map(p=>[p.semanticId,p.id]));
 const positions=new Map(papers.map((p,i)=>[p.id,i]));
 const outgoing=papers.map(p=>[...new Set((p.references||[]).map(r=>positions.get(ids.get(r))).filter(i=>i!==undefined&&papers[i].id!==p.id))]);
 return {outgoing,edges:outgoing.reduce((s,a)=>s+a.length,0)};
}
export function pageRank(papers,graph,topic='all',{damping=.85,tolerance=1e-10,maxIterations=200}={}){
 const n=papers.length;if(!n||!graph.edges)return {scores:new Map(),iterations:0,converged:false};
 const eligible=papers.map(p=>topic==='all'||p.topics.includes(topic));
 const size=eligible.filter(Boolean).length;if(!size)return {scores:new Map(),iterations:0,converged:false};
 const v=eligible.map(b=>b?1/size:0);let r=[...v],iterations=0,converged=false;
 for(;iterations<maxIterations;iterations++){
  let dangling=0;const next=v.map(x=>(1-damping)*x);
  for(let i=0;i<n;i++){const out=graph.outgoing[i];if(!out.length){dangling+=r[i];continue;}const share=damping*r[i]/out.length;for(const j of out)next[j]+=share;}
  let delta=0;for(let i=0;i<n;i++){next[i]+=damping*dangling*v[i];delta+=Math.abs(next[i]-r[i]);}
  r=next;if(delta<tolerance){converged=true;iterations++;break;}
 }
 return {scores:new Map(papers.map((p,i)=>[p.id,r[i]])),iterations,converged};
}
export function searchPapers(papers,{q='',author='',topic='all'}={}){
 const terms=normalize(q).match(/"[^"]+"|\S+/g)?.map(t=>t.replace(/^"|"$/g,''))||[];
 const a=normalize(author).trim();
 return papers.filter(p=>(topic==='all'||p.topics.includes(topic))&&(!a||p.authors.some(name=>normalize(name).includes(a)))&&terms.every(t=>normalize([p.title,p.abstract,...p.authors,...p.topics,...(p.keywords||[])].join(' ')).includes(t)));
}
export function sortPapers(papers,sort,scores){
 const count=p=>p.citationCount??-1;
 return [...papers].sort((a,b)=>{
  if(sort==='citations')return count(b)-count(a)||b.year-a.year||a.title.localeCompare(b.title);
  if(sort==='newest')return b.published.localeCompare(a.published)||a.title.localeCompare(b.title);
  if(sort==='oldest')return a.published.localeCompare(b.published)||a.title.localeCompare(b.title);
  return (scores.get(b.id)??0)-(scores.get(a.id)??0)||count(b)-count(a)||a.title.localeCompare(b.title);
 });
}
