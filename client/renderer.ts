import type { DrawCommand, Style } from '../sdk/index';
import { validateCommands } from '../runtime/validation';
export function drawCommands(canvas:HTMLCanvasElement,commands:DrawCommand[],images:Map<string,HTMLImageElement>,style:Style){
  validateCommands(commands);const g=canvas.getContext('2d');if(!g)throw new Error('Canvas drawing is unavailable');
  for(const {op,args} of commands)if(op==='sprite'&&args[6]){const image=images.get(args[0]),f=args[6];if(image&&(f.x+f.w>image.naturalWidth||f.y+f.h>image.naturalHeight))throw new Error('Sprite frame exceeds its image');}
  // A cartridge's top-level clip and styles belong to this frame only.
  g.save();let depth=1;try{g.resetTransform();g.clearRect(0,0,640,400);g.globalAlpha=1;g.imageSmoothingEnabled=style!=='pixel';g.lineJoin='round';g.lineCap='round';
  for(const {op,args:a} of commands){switch(op){
    case 'clear':g.fillStyle=a[0];g.fillRect(0,0,640,400);break;
    case 'rect':g.fillStyle=a[4];g.beginPath();g.roundRect(a[0],a[1],a[2],a[3],Math.max(0,a[6]));g.fill();if(a[5]){g.strokeStyle=a[5];g.lineWidth=style==='doodle'?2:3;g.stroke();}break;
    case 'circle':g.beginPath();g.arc(a[0],a[1],Math.max(0,a[2]),0,Math.PI*2);g.fillStyle=a[3];g.fill();if(a[4]){g.strokeStyle=a[4];g.lineWidth=2;g.stroke();}break;
    case 'line':g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(a[2],a[3]);g.strokeStyle=a[4];g.lineWidth=a[5];g.stroke();break;
    case 'path':g.beginPath();a[0].forEach(([x,y]:number[],i:number)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fillStyle=a[1];g.fill();if(a[2]){g.strokeStyle=a[2];g.lineWidth=2;g.stroke();}break;
    case 'text':g.font=`${style==='doodle'?'600':'800'} ${a[3]}px ${style==='pixel'?'"Courier New",monospace':style==='doodle'?'"Trebuchet MS",sans-serif':'system-ui,sans-serif'}`;g.fillStyle=a[4];g.textAlign=a[5];g.fillText(a[0],a[1],a[2]);break;
    case 'sprite':{const img=images.get(a[0]);if(!img)break;g.save();depth++;g.translate(a[1]+a[3]/2,a[2]+a[4]/2);g.rotate(a[5]);if(a[6]){const f=a[6];g.drawImage(img,f.x,f.y,f.w,f.h,-a[3]/2,-a[4]/2,a[3],a[4]);}else g.drawImage(img,-a[3]/2,-a[4]/2,a[3],a[4]);g.restore();depth--;break;}
    case 'save':g.save();depth++;break;case 'restore':g.restore();depth--;break;case 'translate':g.translate(a[0],a[1]);break;case 'rotate':g.rotate(a[0]);break;case 'scale':g.scale(a[0],a[1]);break;case 'opacity':g.globalAlpha=a[0];break;
    case 'clip':g.beginPath();g.rect(a[0],a[1],a[2],a[3]);g.clip();break;
  }}}finally{while(depth-->0)g.restore();}
}
