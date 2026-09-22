export function MatchSummary({match,close}:{match:any;close:()=>void}){
  const rounds=match.record?.rounds??[];
  return <div className="modal-backdrop" onClick={close}><section className="stats-modal" role="dialog" aria-modal="true" aria-label="Party summary" onClick={e=>e.stopPropagation()}>
    <button className="close" aria-label="Close party summary" onClick={close}>×</button>
    <div className="eyebrow">YOUR RECENT PARTY</div><h2>Party results</h2>
    <p>{match.status==='complete'?'Party complete':`Party ${match.status}`}. {rounds.length} finished round{rounds.length===1?'':'s'}.</p>
    {rounds.map((round:any,index:number)=><div className="party-summary-round" key={`${round.versionId}:${index}`}><h3>Round {index+1}</h3><div className="standings">{round.records.map((result:any)=><div key={result.playerId}><strong>{result.name??result.playerId}</strong><span>{new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(result.score)} · {result.outcome??'complete'}</span></div>)}</div></div>)}
    {!rounds.length&&<p>This party ended before a round was finished. No score was awarded.</p>}
    {match.challenge_id&&<a className="secondary" href={`/?challenge=${encodeURIComponent(match.challenge_id)}`}>Play this challenge</a>}
  </section></div>;
}
