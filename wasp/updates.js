export function filterArrivals(papers,added='all',updates={},now=Date.now()) {
 if(added==='latest'){const ids=new Set(updates.addedIds||[]);return papers.filter(p=>ids.has(p.id))}
 if(!['7','30'].includes(added))return papers;
 const cutoff=now-Number(added)*86400000;
 return papers.filter(p=>p.firstSeen&&Date.parse(p.firstSeen)>=cutoff&&Date.parse(p.firstSeen)<=now);
}
export function updateSummary(updates={},now=Date.now()) {
 const last=updates.lastSuccess;
 const failed=updates.lastAttempt?.status==='error';
 const stale=last&&now-Date.parse(last)>3*86400000;
 const time=last?new Date(last).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})+' UTC':null;
 return {warning:Boolean(failed||stale),
  title:failed?'Latest arXiv check failed':stale?'arXiv check overdue':last?'arXiv collection updated':'arXiv updates ready',
  detail:last?`Last successful check: ${time}. ${updates.added||0} papers added; ${updates.revised||0} existing records revised in that check.`:'The first complete arXiv check has not finished. Existing papers are preserved.',
  schedule:updates.schedule?.enabled?`Daily check at ${updates.schedule.timeLabel}. Runs through Codex on the owner’s Mac; the Mac and Codex must be running.`:'No automatic schedule is enabled.',
  note:failed?'Existing papers and the last successful checkpoint are preserved. The next run will retry.':stale?'The schedule may be paused, the Mac may be offline, or a scan may have failed.':'New entries are screened from titles and abstracts, not individually reviewed.'};
}
