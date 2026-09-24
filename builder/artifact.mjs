import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {TextDecoder} from 'node:util';
export async function readArtifact(path,max){
  const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const stat=await f.stat();if(!stat.isFile()||stat.nlink!==1||stat.size>max)throw new Error('Invalid output artifact');const bytes=await f.readFile();if(bytes.length>max)throw new Error('Output grew past limit');return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}finally{await f.close();}
}
