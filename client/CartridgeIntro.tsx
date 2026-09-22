import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Manifest} from '../server/store';
import './CartridgeIntro.css';

export type IntroCartridge={id:string;meta:Manifest['meta'];icon?:string|null};

function monogram(title:string){
  const words=title.match(/[\p{L}\p{N}]+/gu)??[];
  const letters=words.length>1?words.slice(0,2).map(word=>Array.from(word)[0]).join(''):Array.from(words[0]??'?').slice(0,2).join('');
  return letters.toLocaleUpperCase();
}

/** The server countdown is the clock for this reveal. Skipping only removes the art. */
export function CartridgeIntro({playlist,startsAt,now}:{playlist:IntroCartridge[];startsAt:number;now:number}){
  const [skipped,setSkipped]=useState(false);
  useLayoutEffect(()=>{
    const skip=(event:KeyboardEvent)=>{
      if(!['Space','Enter'].includes(event.code)||event.altKey||event.ctrlKey||event.metaKey)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(!event.repeat)setSkipped(true);
    };
    window.addEventListener('keydown',skip,true);
    return()=>window.removeEventListener('keydown',skip,true);
  },[]);
  const remaining=Math.max(0,startsAt-now);
  const columns=playlist.length<=3?playlist.length:playlist.length<=8?4:6;
  const step=Math.min(125,850/Math.max(1,playlist.length-1));
  // Give late arrivals the complete lineup immediately. The animation never
  // relies on a particular server countdown duration or extends it.
  const animate=useRef(remaining>(playlist.length-1)*step+600).current;
  if(skipped||!playlist.length)return null;
  return createPortal(<div className="cartridge-intro" role="presentation" onPointerDown={event=>{event.preventDefault();event.stopPropagation();setSkipped(true);}}>
    <div className="intro-scan" aria-hidden="true"/>
    <div className="intro-content" style={{'--intro-columns':columns} as React.CSSProperties}>
      <div className="intro-heading"><span className="intro-kicker">MICROFINITY · INSERT COINS</span><h1>CARTRIDGES LOADED<span aria-hidden="true"> ▮</span></h1><p>{playlist.length} {playlist.length===1?'ROUND':'ROUNDS'} QUEUED · GET READY</p></div>
      <ol className="intro-lineup" aria-label="Cartridges in play order" data-remainder={playlist.length>3?playlist.length%3:0} style={{maxWidth:`${columns*155+(columns-1)*20}px`}}>{playlist.map((game,index)=><li className={`intro-cart ${animate?'':'intro-cart-ready'}`} key={`${index}:${game.id}`} style={{'--arrival':`${index*step}ms`} as React.CSSProperties}>
        <div className="intro-cart-ridge" aria-hidden="true"/>
        <div className="intro-cart-label"><div className="intro-cart-art">{game.icon?<img src={game.icon} alt=""/>:<span className="intro-cart-monogram" aria-hidden="true">{monogram(game.meta.title)}</span>}</div><span className="intro-round">{String(index+1).padStart(2,'0')}</span><strong title={game.meta.title}>{game.meta.title}</strong></div>
        <div className="intro-cart-contacts" aria-hidden="true"/>
      </li>)}</ol>
      <div className="intro-footer"><span className="intro-signal"><i aria-hidden="true"/> DECK LOCKED</span><span className="intro-count">STARTING IN <b>{Math.max(1,Math.ceil(remaining/1000))}</b></span><span className="intro-skip">SPACE / ENTER / TAP TO SKIP</span></div>
    </div>
  </div>,document.body);
}
