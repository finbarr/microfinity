type StorageReader=Pick<Storage,'getItem'|'setItem'>;
/** Preserve the existing guest, ratings access and preferences across the rename. */
export function readSaved(key:string,storage:StorageReader=localStorage):string|null {
  try{
    const current=storage.getItem(`microfinity.${key}`);if(current!==null)return current;
    const legacy=storage.getItem(`minifinity.${key}`);
    if(legacy!==null){try{storage.setItem(`microfinity.${key}`,legacy);}catch{/* The old value remains readable if storage is full. */}}
    return legacy;
  }catch{return null;}
}
