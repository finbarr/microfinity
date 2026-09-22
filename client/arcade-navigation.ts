import {useEffect,useRef,useState} from 'react';
export type Direction='up'|'down'|'left'|'right';
export type Box={x:number;y:number;width:number;height:number};
/** Favor nearby controls and penalize gaps between visual rows/columns. Stable order breaks ties. */
export function spatialTarget(boxes:Box[],from:number,direction:Direction):number{
  if(!boxes.length)return -1;if(from<0||!boxes[from])return 0;
  const origin=boxes[from],horizontal=direction==='left'||direction==='right',sign=direction==='left'||direction==='up'?-1:1;
  const center=(b:Box)=>horizontal?[b.x+b.width/2,b.y+b.height/2]:[b.y+b.height/2,b.x+b.width/2];
  const [a,b]=center(origin);let winner=from,best=Infinity;
  boxes.forEach((box,i)=>{if(i===from)return;const [x,y]=center(box),advance=(x-a)*sign;if(advance<2)return;
    const extent=horizontal?(origin.height+box.height)/2:(origin.width+box.width)/2;
    const cross=Math.abs(y-b),gap=Math.max(0,cross-extent),score=advance+gap*3+cross*.15;
    if(score<best){winner=i;best=score;}
  });return winner;
}
const selector='button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]';
const editor=(el:HTMLElement)=>el.matches('textarea,select,input:not([type="checkbox"]):not([type="radio"])')||el.isContentEditable;
const visible=(el:HTMLElement)=>el.tabIndex>=0&&!el.matches(':disabled')&&!el.closest('[inert]')&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
const dialog=()=>Array.from(document.querySelectorAll<HTMLElement>('dialog[open],[role="dialog"][aria-modal="true"]')).filter(el=>el.getClientRects().length).at(-1);
const candidates=(scope:ParentNode,includeShortcuts=false)=>Array.from(scope.querySelectorAll<HTMLElement>(selector)).filter(el=>visible(el)&&(includeShortcuts||!el.closest('[data-arrow-ignore]')));
// Navigation belongs to the current screen. Header/menu shortcuts are reached by
// Escape, pointer, or ordinary Tab navigation, never by a directional jump.
const navigationScope=(modal?:HTMLElement)=>modal??document.querySelector('main');
export function useArcadeNavigation({screen,gameplay,onBack}:{screen:string;gameplay:boolean;onBack:()=>void}){
  const current=useRef({gameplay,onBack});current.current={gameplay,onBack};
  const [editing,setEditing]=useState(false);const edit=useRef<HTMLElement|null>(null);
  const wasModal=useRef(false),returnFocus=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    const focus=(el?:HTMLElement)=>{if(!el)return;el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',inline:'nearest'});};
    const editMode=(el:HTMLElement|null)=>{if(edit.current)delete edit.current.dataset.arcadeEditing;edit.current=el;if(el)el.dataset.arcadeEditing='true';setEditing(!!el);};
    const key=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
      const target=document.activeElement instanceof HTMLElement?document.activeElement:document.body;
      const modal=dialog(),scope=navigationScope(modal),items=scope?candidates(scope):[];
      if(event.key==='Escape'){
        event.preventDefault();event.stopImmediatePropagation();
        if(edit.current){editMode(null);return;}
        current.current.onBack();return;
      }
      if(edit.current===target){
        if(event.key==='Tab')editMode(null);
        else {
          const delta=({ArrowUp:-1,ArrowLeft:-1,KeyW:-1,KeyA:-1,ArrowDown:1,ArrowRight:1,KeyS:1,KeyD:1} as Record<string,number>)[event.code];
          // Keep keyboard selection inside the cabinet instead of opening a platform popup.
          if(target instanceof HTMLSelectElement&&delta){event.preventDefault();const options=Array.from(target.options).filter(o=>!o.disabled),index=options.indexOf(target.selectedOptions[0]),next=options[Math.max(0,Math.min(options.length-1,index+delta))];if(next){target.value=next.value;target.dispatchEvent(new Event('change',{bubbles:true}));}return;}
          if(target instanceof HTMLInputElement&&['range','number'].includes(target.type)&&delta){
            event.preventDefault();const current=Number(target.value),step=Number(target.step)||1,low=target.min===''?-Infinity:Number(target.min),high=target.max===''?Infinity:Number(target.max);
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(target,String(Math.max(low,Math.min(high,current+delta*step))));target.dispatchEvent(new Event('input',{bubbles:true}));return;
          }
          if((event.key==='Enter'||event.code==='Space')&&target instanceof HTMLSelectElement){event.preventDefault();editMode(null);return;}
          return;
        }
      }
      if(current.current.gameplay&&!modal){
        // The playfield owns the five game buttons. Tab opens a menu rather than stranding focus.
        if(event.key==='Tab'){event.preventDefault();current.current.onBack();}return;
      }
      if(event.key==='Tab'){
        if(modal){event.preventDefault();const index=items.indexOf(target);focus(items[(index+(event.shiftKey?-1:1)+items.length)%items.length]);}
        return;
      }
      const direction=({ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'} as Record<string,Direction>)[event.code];
      if(direction){event.preventDefault();const from=items.indexOf(target);if(from<0){focus(items.find(el=>el.hasAttribute('data-nav-start'))??items[0]);return;}const index=spatialTarget(items.map(el=>el.getBoundingClientRect()),from,direction);focus(items[index]);return;}
      if(event.code==='Space'||event.key==='Enter'){
        event.preventDefault();if(event.repeat)return;
        if(!(modal?items:candidates(document,true)).includes(target)){focus(items.find(el=>el.hasAttribute('data-nav-start'))??items[0]);return;}
        if(editor(target)){editMode(target);return;}
        target.click();
      }
    };
    const pointer=(e:PointerEvent)=>{const el=e.target instanceof HTMLElement?e.target:null;editMode(el&&editor(el)?el:null);};
    const focusin=(e:FocusEvent)=>{if(e.target!==edit.current)editMode(null);};
    window.addEventListener('keydown',key,true);document.addEventListener('pointerdown',pointer,true);document.addEventListener('focusin',focusin);
    return()=>{window.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('focusin',focusin);};
  },[]);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const frame=requestAnimationFrame(()=>{
      const modal=dialog(),scope=navigationScope(modal);
      if(modal&&!wasModal.current)returnFocus.current=previous;
      const field=current.current.gameplay&&!modal?document.querySelector<HTMLElement>('[data-game-input]'):null;
      const restored=!modal&&wasModal.current&&returnFocus.current?.isConnected?returnFocus.current:null;
      const items=scope?candidates(scope):[],next=field??restored??scope?.querySelector<HTMLElement>('[data-nav-focus]')??items.find(el=>el.hasAttribute('data-nav-start'))??items[0];
      wasModal.current=!!modal;if(!modal)returnFocus.current=null;
      if(edit.current)delete edit.current.dataset.arcadeEditing;edit.current=null;setEditing(false);
      next?.focus({preventScroll:true});next?.scrollIntoView({block:'nearest'});
    });
    return()=>cancelAnimationFrame(frame);
  },[screen]);
  return editing;
}
