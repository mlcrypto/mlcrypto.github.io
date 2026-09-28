export const PAGE_SIZES=Object.freeze(['15','50','all']);
export function normalizePageSize(value){return PAGE_SIZES.includes(String(value))?String(value):'15'}
export function paginate(papers,{page=1,size='15'}={}){
 size=normalizePageSize(size);
 const limit=size==='all'?Math.max(1,papers.length):Number(size);
 const pages=Math.max(1,Math.ceil(papers.length/limit));
 const requested=Number(page);
 page=Math.min(pages,Math.max(1,Number.isFinite(requested)?Math.floor(requested):1));
 const start=(page-1)*limit,end=Math.min(start+limit,papers.length);
 return {size,page,pages,start,end,items:papers.slice(start,end)};
}
