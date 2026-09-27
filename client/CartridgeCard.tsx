import type {ReactNode} from 'react';
import type {Asset,Manifest} from '../server/store';
import type {RatingSummary} from '../shared/ratings';

type CoverManifest=Manifest&{icon?:Asset};

export function CartridgeCard({game,index,selected,rating,art,onToggle,onPlay,onRemix,disabled,busy=false,inParty=false}:{game:Manifest;index:number;selected:boolean;rating?:RatingSummary;art:ReactNode;onToggle:(control:HTMLButtonElement)=>void;onPlay:(control:HTMLButtonElement)=>void;onRemix:()=>void;disabled:boolean;busy?:boolean;inParty?:boolean}){
  const icon=(game as CoverManifest).icon;
  const {meta}=game;
  return <article className={`game-card ${selected?'picked':''}`} aria-label={`${meta.title} cartridge`}>
    <div className="cartridge-ridge" aria-hidden="true"/>
    <span className="shell-screw screw-left" aria-hidden="true"/><span className="shell-screw screw-right" aria-hidden="true"/>
    <div className="cartridge-label">
      <div className={`game-cover cover-${index%8}`}>
        {icon?<img className="generated-cover" src={icon.url} alt=""/>:art}
        <span className="game-number">{String(index+1).padStart(2,'0')}</span>
        <button className="pick" disabled={disabled} aria-disabled={disabled||busy} aria-label={`${selected?'Remove':'Add'} ${meta.title} ${selected?'from':'to'} playlist`} aria-pressed={selected} onClick={event=>{if(!busy)onToggle(event.currentTarget);}}>{selected?'✓':'+'}</button>
        <span className="cover-caption">{meta.tags[0]?.toUpperCase()}</span>
      </div>
      <div className="card-body">
        <div className="card-meta"><span>SOLO + PARTY</span><span>{meta.duration}s</span></div>
        <h3>{meta.title}</h3>
        <div className="cartridge-rating">{rating?.count?<><span aria-hidden="true">★</span> {rating.average.toFixed(1)} <small>({rating.count} {rating.count===1?'rating':'ratings'})</small></>:'Not rated yet'}</div>
        {game.provenance.draft===true&&<span className="draft-badge">Draft · {game.music?'custom music':'stock soundtrack'}</span>}
        <p>{meta.description}</p>
      </div>
    </div>
    <div className="card-footer"><button aria-label={inParty?`${selected?'Deselect':'Select'} ${meta.title} for party`:`Play ${meta.title}`} disabled={disabled} aria-disabled={disabled||busy} onClick={event=>{if(!busy)onPlay(event.currentTarget);}}>{inParty?(selected?'✓ SELECTED':'+ SELECT'):'▶ PLAY'}</button><button aria-label={`Remix ${meta.title}`} disabled={disabled} aria-disabled={disabled||busy} onClick={()=>{if(!busy)onRemix();}}>Remix</button></div>
    <div className="cartridge-contacts" aria-hidden="true"/>
  </article>;
}
