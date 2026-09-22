import sharp from 'sharp';

const MAX_BYTES=20_000_000,MAX_PIXELS=4_500_000,MAX_SIDE=4096;
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);

/** Check encoded size and format before handing provider bytes to a decoder. */
async function providerPng(encoded:string){
  if(typeof encoded!=='string'||!encoded.length||encoded.length>4*Math.ceil(MAX_BYTES/3))throw new Error('Image exceeds asset limit or is missing');
  if(encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new Error('Invalid image encoding');
  const raw=Buffer.from(encoded,'base64');
  if(raw.length>MAX_BYTES)throw new Error('Image exceeds asset limit');
  if(!raw.subarray(0,8).equals(PNG_SIGNATURE))throw new Error('Generated sprites must be PNG images');
  const source=sharp(raw,{limitInputPixels:MAX_PIXELS}),metadata=await source.metadata();
  if(metadata.format!=='png'||!metadata.width||!metadata.height||metadata.width>MAX_SIDE||metadata.height>MAX_SIDE||metadata.width*metadata.height>MAX_PIXELS||(metadata.pages??1)!==1)throw new Error('Image dimensions exceed the sprite limit');
  return {source,metadata};
}

export async function normalizeSprite(encoded:string):Promise<Buffer>{
  const {source,metadata}=await providerPng(encoded);
  if(!metadata.hasAlpha||(await source.stats()).isOpaque)throw new Error('The generated sprite has no transparent background');
  return source.ensureAlpha().trim().resize(256,256,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
}

/** Cover art is independent of gameplay sprites and always has square pixels. */
export async function normalizeIcon(encoded:string):Promise<Buffer>{
  const {source}=await providerPng(encoded);
  return source.resize(256,256,{fit:'cover',position:'centre'}).png().toBuffer();
}
