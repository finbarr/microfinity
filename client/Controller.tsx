import { useEffect, useRef, useState } from 'react';
import { InputCollector, keyMap, padButtons } from '../runtime/input';
import type { Edge } from '../sdk/index';
import { audio } from './audio';
export function Controller({active,epoch,label,send}:{active:boolean;epoch:number;label:string;send:(edges:Edge[],method:string)=>void}){
  const collector=useRef(new InputCollector()),pad=useRef<HTMLDivElement>(null),[held,setHeld]=useState(collector.current.getHeld());
  const sendRef=useRef(send);sendRef.current=send;const activeRef=useRef(active);activeRef.current=active;
  const flush=(method:string)=>{const edges=collector.current.drain();setHeld(collector.current.getHeld());if(activeRef.current&&edges.length)sendRef.current(edges,method);};
  useEffect(()=>{collector.current.clear();const releases=collector.current.drain();if(releases.length)sendRef.current(releases,'keyboard');setHeld(collector.current.getHeld());},[active,epoch]);
  useEffect(()=>{
    const isEditor=(target:EventTarget|null)=>!(target instanceof HTMLElement)||!target.closest('[data-game-input]')||target.matches('input,textarea,select,button,a')||target.isContentEditable;
    const down=(e:KeyboardEvent)=>{if(!activeRef.current||isEditor(e.target)||!keyMap[e.code])return;e.preventDefault();if(e.repeat)return;void audio.unlock().catch(()=>{});collector.current.set(e.code,[keyMap[e.code]]);flush('keyboard');};
    const up=(e:KeyboardEvent)=>{if(!keyMap[e.code])return;if(activeRef.current&&!isEditor(e.target))e.preventDefault();collector.current.release(e.code);flush('keyboard');};
    const clear=()=>{collector.current.clear();flush('keyboard');};
    const focus=(e:FocusEvent)=>{if(isEditor(e.target))clear();};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',clear);window.addEventListener('orientationchange',clear);document.addEventListener('visibilitychange',clear);document.addEventListener('focusin',focus);
    return()=>{clear();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clear);window.removeEventListener('orientationchange',clear);document.removeEventListener('visibilitychange',clear);document.removeEventListener('focusin',focus);};
  },[]);
  const position=(e:React.PointerEvent<HTMLDivElement>)=>{const r=pad.current!.getBoundingClientRect();collector.current.set(`pad:${e.pointerId}`,padButtons((e.clientX-r.left-r.width/2)/(r.width/2),(e.clientY-r.top-r.height/2)/(r.height/2)));flush('touch');};
  const release=(e:React.PointerEvent)=>{collector.current.release(`pad:${e.pointerId}`);collector.current.release(`action:${e.pointerId}`);flush('touch');};
  return <div className={`controller ${active?'':'disabled'}`} aria-label="Five-button game controller">
    <div className="dpad" ref={pad} role="group" aria-label="Directional pad" onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);void audio.unlock().catch(()=>{});position(e);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))position(e);}} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      <span className={`up ${held.up?'held':''}`}>▲</span><span className={`left ${held.left?'held':''}`}>◀</span><span className="middle">✚</span><span className={`right ${held.right?'held':''}`}>▶</span><span className={`down ${held.down?'held':''}`}>▼</span>
    </div><div className="keyboard-hint"><kbd>W</kbd><br/><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><small>or arrow keys</small></div>
    <div className="action-wrap"><button className={`action-button ${held.action?'held':''}`} aria-label={label||'Action'} tabIndex={-1} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);void audio.unlock().catch(()=>{});collector.current.set(`action:${e.pointerId}`,['action']);flush('touch');}} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>●</button><span>{label||'Action'} <kbd>SPACE</kbd></span></div>
  </div>;
}
