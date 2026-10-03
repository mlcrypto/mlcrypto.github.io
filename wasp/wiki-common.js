export const WIKI_ORIGIN='https://ai-safety-research-library.vinod-nathan.chatgpt.site';
export function paperPath(id){return 'wasp/paper.html?id='+encodeURIComponent(id);}
export function starterSummary(paper){
 const abstract=String(paper.abstract||'').replace(/\s+/g,' ').trim();
 if(!abstract)return '';
 const sentences=Array.from(new Intl.Segmenter('en',{granularity:'sentence'}).segment(abstract),s=>s.segment);
 let text='';
 for(const sentence of sentences.slice(0,2)){if(text&&text.length+sentence.length>1000)break;text+=sentence;}
 return text.trim();
}
