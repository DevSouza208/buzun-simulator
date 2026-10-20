/**
 * WorldGen 5.17 — bounded warm cache for detached regional Three.js meshes.
 *
 * A cached region retains its already-computed road surface indices, draped
 * grade, curb cuts and completed BufferGeometries. It is NOT on the scene,
 * so it costs no draw calls. Geometry/indices consume memory until the LRU
 * evicts them; cap both item count and estimated geometry bytes.
 *
 * Pure JavaScript, no Three.js imports: caller supplies disposal callback.
 */
export const REGION_CACHE_MAX_ENTRIES=4;
export const REGION_CACHE_MAX_BYTES=24*1024*1024;

export function createRegionGeometryCache({
  maxEntries=REGION_CACHE_MAX_ENTRIES,
  maxBytes=REGION_CACHE_MAX_BYTES,
  onEvict=()=>{}
}={}){
  if(!Number.isInteger(maxEntries)||maxEntries<0||
     !Number.isFinite(maxBytes)||maxBytes<0)
    throw Error("Orçamento inválido para cache de regiões");
  const lru=new Map();
  let bytes=0;
  const counters={hits:0,misses:0,stores:0,evictions:0,
    rejects:0,clears:0};
  const footprint=record=>{
    const n=record?.scenery?.geometryStatistics?.gpuBytes ??
      record?.estimatedBytes;
    if(!Number.isFinite(n)||n<0)
      throw Error("Região sem orçamento estimado de geometria");
    return Math.ceil(n);
  };
  const discardOldest=()=>{
    const oldest=lru.entries().next().value;
    if(!oldest)return;
    const [key,item]=oldest;
    lru.delete(key);
    bytes-=item.bytes;
    counters.evictions++;
    onEvict(key,item.record);
  };
  return {
    has:key=>lru.has(key),
    // Read-only index use at a terrain boundary: checking height should
    // not mark a detached region as recently visited or reattach its mesh.
    peek:key=>lru.get(key)?.record??null,
    keys:()=>[...lru.keys()],
    get stats(){
      return {...counters,entries:lru.size,estimatedBytes:bytes,
        estimatedMiB:+(bytes/1048576).toFixed(2)};
    },
    put(key,record){
      if(!key||!record)throw Error("Chave de cache inválida");
      const size=footprint(record);
      // A current region should never be duplicated in the cache.
      if(lru.has(key)){
        const old=lru.get(key);
        lru.delete(key);
        bytes-=old.bytes;
        onEvict(key,old.record);
        counters.evictions++;
      }
      if(maxEntries===0||size>maxBytes){
        counters.rejects++;
        onEvict(key,record);
        return false;
      }
      lru.set(key,{record,bytes:size});
      bytes+=size;
      counters.stores++;
      while(lru.size>maxEntries||bytes>maxBytes)discardOldest();
      return lru.has(key);
    },
    take(key){
      const item=lru.get(key);
      if(!item){counters.misses++;return null;}
      lru.delete(key);
      bytes-=item.bytes;
      counters.hits++;
      return item.record;
    },
    clear(){
      while(lru.size){
        const [key,item]=lru.entries().next().value;
        lru.delete(key);
        bytes-=item.bytes;
        onEvict(key,item.record);
      }
      counters.clears++;
    }
  };
}
