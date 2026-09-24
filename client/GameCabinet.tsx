import type {ReactNode} from 'react';
import type {Manifest} from '../server/store';
import {colors} from '../sdk/index';
type Props={manifest:Manifest;view:any;seats?:any[];round:string;children:ReactNode;controls?:ReactNode;network?:string;mode?:string};
export function GameCabinet({manifest,view,seats,round,children,controls,network,mode}:Props){
  const {meta}=manifest,hud=view?.hud??{},players=seats??view?.players??[];
  const active=hud.activePlayerId??view?.mode?.active;
  const name=players.find((p:any)=>p.id===active)?.name;
  return <section className="game-shell cabinet" tabIndex={-1} data-game-input aria-label={`${meta.title} arcade cabinet`} onPointerDown={e=>{if(!(e.target as HTMLElement).closest('button,input,select,a'))e.currentTarget.focus({preventScroll:true});}}>
    <div className="cabinet-marquee"><span>{round}</span><h2>{meta.title}</h2><span className="cabinet-light" aria-hidden="true">●</span></div>
    <div className="cabinet-readouts"><div className="cabinet-status"><span className="eyebrow">{name?'NOW PLAYING':meta.participation==='simultaneous'?'ALL PLAYERS':'READY PLAYER'}</span><strong>{name??(players.length===1?players[0].name:'Everyone')}</strong><span>{meta.instruction}</span></div><div className="timer">{Math.max(0,Math.ceil(meta.duration-(view?.attemptTime??view?.time??0)))}<small>TIME</small></div></div>
    <div className="cabinet-players" aria-label={`Scores in ${meta.score.unit}`}>{players.map((p:any,i:number)=><div key={p.id} className={`cabinet-player ${p.id===active?'current':''} ${p.id===view?.playerId?'you':''}`} style={{'--player-color':p.color??colors[i%4]} as React.CSSProperties}>
      <div><span className="player-index">P{i+1}</span><strong>{p.name}{p.id===view?.playerId?' · YOU':''}</strong><small>{p.fallback?'Practice fallback':view?.roles?.[p.id]??p.controller??'player'}</small></div><b key={view?.scores?.[p.id]??0} className="score-reaction">{new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(view?.scores?.[p.id]??0)}</b>
    </div>)}</div>
    <div className="cabinet-bezel"><div className="canvas-stage">{children}<div className="crt-glass" aria-hidden="true"/></div></div>
    <div className="cabinet-strip"><p>{hud.message||' '}</p>{!!hud.items?.length&&<dl>{hud.items.map((item:any,i:number)=><div key={i}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}</div>
    <div className="cabinet-deck">{controls}<div className="cabinet-meta"><span>{meta.score.unit.toUpperCase()} · {meta.score.order==='higher'?'HIGH':'LOW'} SCORE WINS</span>{mode&&['race','pressure','obstruction'].includes(mode)&&<span>{mode==='race'?'RACE · Separate playfields':mode==='pressure'?'PRESSURE · Rivals tap SPACE':'OBSTRUCTION · Rivals press SPACE'}</span>}{mode==='pressure'&&<progress aria-label="Rival pressure" value={view?.mode?.pressure??0} max="100"/>}<span>{network??'RECORDED PLAY'} · ESC MENU</span>{manifest.provenance.draft===true&&<span className="draft-badge">DRAFT PREVIEW</span>}</div></div>
  </section>;
}
