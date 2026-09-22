import type {ReactNode} from 'react';
import type {Asset,Manifest} from '../server/store';
import type {RatingSummary} from '../shared/ratings';

type CoverManifest=Manifest&{icon?:Asset};

export function CartridgeCard({game,index,selected,rating,art,onToggle,onPlay,onRemix,disabled}:{game:Manifest;index:number;selected:boolean;rating?:RatingSummary;art:ReactNode;onToggle:()=>void;onPlay:()=>void;onRemix:()=>void;disabled:boolean}){
  const icon=(game as CoverManifest).icon;
  const {meta}=game;
  return <article className={`game-card ${selected?'picked':''}`} aria-label={`${meta.title} cartridge`}>
    <div className="cartridge-ridge" aria-hidden="true"/>
    <span className="shell-screw screw-left" aria-hidden="true"/><span className="shell-screw screw-right" aria-hidden="true"/>
    <div className="cartridge-label">
      <div className={`game-cover cover-${index%8}`}>
        {icon?<img className="generated-cover" src={icon.url} alt=""/>:art}
        <span className="game-number">{String(index+1).padStart(2,'0')}</span>
        <button className="pick" aria-label={`${selected?'Remove':'Add'} ${meta.title} ${selected?'from':'to'} playlist`} aria-pressed={selected} onClick={onToggle}>{selected?'✓':'+'}</button>
        <span className="cover-caption">{meta.tags[0]?.toUpperCase()}</span>
      </div>
      <div className="card-body">
        <div className="card-meta"><span>{meta.players[0]===meta.players[1]?meta.players[0]:`${meta.players[0]}–${meta.players[1]}`} PLAYER{meta.players[1]>1?'S':''}</span><span>{meta.duration}s</span></div>
        <h3>{meta.title}</h3>
        <div className="cartridge-rating">{rating?.count?<><span aria-hidden="true">★</span> {rating.average.toFixed(1)} <small>({rating.count} {rating.count===1?'rating':'ratings'})</small></>:'Not rated yet'}</div>
        {game.provenance.draft===true&&<span className="draft-badge">Draft · {game.music?'custom music':'stock soundtrack'}</span>}
        <p>{meta.description}</p>
      </div>
    </div>
    <div className="card-footer"><button aria-label={`Play ${meta.title}`} disabled={disabled} onClick={onPlay}>▶ PLAY</button><button aria-label={`Remix ${meta.title}`} onClick={onRemix}>Remix</button></div>
    <div className="cartridge-contacts" aria-hidden="true"/>
  </article>;
}
