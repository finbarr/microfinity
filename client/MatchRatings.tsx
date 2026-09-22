import {useEffect,useRef,useState} from 'react';
import type {RatingSummary} from '../shared/ratings';
type Played={gameId:string;versionId:string;title:string;stars:number|null};
export function MatchRatings({matchId,api,onRated}:{matchId:string;api:(path:string,body?:unknown)=>Promise<any>;onRated:(gameId:string,summary:RatingSummary)=>void}){
 const [games,setGames]=useState<Played[]>([]),[error,setError]=useState(''),[saving,setSaving]=useState(''),[saved,setSaved]=useState('');
 const busy=useRef(false);
 useEffect(()=>{let canceled=false;void api(`/matches/${matchId}/ratings`).then(rows=>{if(!canceled)setGames(rows);}).catch(e=>{if(!canceled)setError(e.message);});return()=>{canceled=true;};},[matchId]);
 const rate=async(game:Played,stars:number)=>{if(busy.current)return;busy.current=true;setSaving(game.gameId);setSaved('');setError('');try{
   const response=await api('/ratings',{versionId:game.versionId,stars});setGames(rows=>rows.map(row=>row.gameId===game.gameId?{...row,stars:response.stars}:row));setSaved(game.gameId);onRated(game.gameId,response.summary);
  }catch(e){setError((e as Error).message);}finally{busy.current=false;setSaving('');}};
 if(!games.length&&!error)return null;
 return <section className="match-ratings" aria-label="Rate the cartridges"><h2>How was it?</h2>{games.map(game=><div className="rating-row" key={game.gameId}>
   <span>{game.title}</span><div className="rating-stars" role="radiogroup" aria-label={`Rate ${game.title}`}>
    {[1,2,3,4,5].map(star=><button key={star} type="button" role="radio" aria-checked={game.stars===star} aria-label={`${star} star${star===1?'':'s'}`} aria-disabled={!!saving} className={star<=(game.stars??0)?'lit':''} onClick={()=>void rate(game,star)}>★</button>)}
   </div><small role="status">{saving===game.gameId?'Saving…':saved===game.gameId?'Saved':game.stars?`${game.stars}/5`:''}</small>
  </div>)}{error&&<p role="alert">{error}</p>}</section>;
}
