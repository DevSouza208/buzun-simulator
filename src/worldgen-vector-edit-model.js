/**
 * Buzun Create: visual-vector corrections only.
 * The OSM snapshot, navigation graph and provider road IDs are immutable.
 * Persist metre X/Z displacements and optional height offsets per OSM vertex.
 * A translated edge translates its two endpoints without changing connectivity
 * in the original routing graph.
 */
export const VECTOR_EDIT_KEY="buzun-visual-vector-edits-v1";
export const VECTOR_EDIT_MAX_OFFSET_METRES=30;
const finite=n=>Number.isFinite(Number(n));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const emptyVectorEdits=()=>({version:1,ways:{}});
export function normalizeVectorEdits(value){
  const out=emptyVectorEdits();
  if(!value||typeof value!=="object")return out;
  const ways=value.ways;
  if(!ways||typeof ways!=="object")return out;
  for(const [id,data] of Object.entries(ways).slice(0,1500)){
    if(!/^[\w:.-]{1,128}$/.test(id)||!data||
      typeof data!=="object"||!data.vertices)continue;
    const points={};
    for(const [index,v] of Object.entries(data.vertices).slice(0,750)){
      if(!/^(0|[1-9]\d{0,5})$/.test(index)||
        !Array.isArray(v)||v.length!==3||!v.every(finite))continue;
      const xyz=v.map(Number);
      if(xyz.some(n=>Math.abs(n)>VECTOR_EDIT_MAX_OFFSET_METRES))
        continue;
      if(xyz.some(n=>Math.abs(n)>1e-6))points[index]=xyz;
    }
    if(Object.keys(points).length)out.ways[id]={vertices:points};
  }
  return out;
}
export function loadVectorEdits(storage=globalThis.localStorage){
  try{return normalizeVectorEdits(JSON.parse(
    storage.getItem(VECTOR_EDIT_KEY)||"null"));}
  catch{return emptyVectorEdits();}
}
export function saveVectorEdits(edits,storage=globalThis.localStorage){
  const clean=normalizeVectorEdits(edits);
  storage.setItem(VECTOR_EDIT_KEY,JSON.stringify(clean));
  return clean;
}
export function correctedPoint(road,index,edits){
  const p=road.p[index],d=edits?.ways?.[String(road.id)]?.vertices?.[index];
  return d?[p[0]+d[0],p[1]+d[1]]:[...p];
}
export function withVectorVertexOffset(edits,road,index,dx,dz,dy=0){
  if(!road?.p?.[index]||
      ![dx,dz,dy].every(finite)||[dx,dz,dy].some(n=>
        Math.abs(Number(n))>VECTOR_EDIT_MAX_OFFSET_METRES))
    throw Error("Ajuste de vértice inválido (limite 30 m por eixo)");
  const next=normalizeVectorEdits(edits);
  const id=String(road.id);
  const vertex={...(next.ways[id]?.vertices||{})};
  const displacement=[Number(dx),Number(dz),Number(dy)];
  if(displacement.every(n=>Math.abs(n)<1e-6))delete vertex[index];
  else vertex[index]=displacement;
  if(Object.keys(vertex).length)next.ways[id]={vertices:vertex};
  else delete next.ways[id];
  return next;
}
export function moveVectorEdge(edits,road,edgeIndex,dx,dz,dy=0){
  if(!Number.isInteger(edgeIndex)||edgeIndex<0||
    edgeIndex>=road.p.length-1)
    throw Error("Aresta inválida");
  let next=normalizeVectorEdits(edits);
  for(const vertex of [edgeIndex,edgeIndex+1]){
    const old=next.ways[String(road.id)]?.vertices?.[vertex]||[0,0,0];
    next=withVectorVertexOffset(next,road,vertex,
      clamp(old[0]+dx,-30,30),
      clamp(old[1]+dz,-30,30),
      clamp(old[2]+dy,-30,30));
  }
  return next;
}
export function applyVisualVectorEdits(roads,edits){
  const clean=normalizeVectorEdits(edits);
  return roads.map(road=>{
    if(!clean.ways[String(road.id)])return road;
    return {...road,p:road.p.map((_,index)=>
      correctedPoint(road,index,clean))};
  });
}
/**
 * Elevation handles alter the shared H(x,z) FIELD rather than displacing
 * only asphalt vertices. Therefore terrain and asphalt remain co-elevated.
 * The offset decays continuously to zero within influenceRadius.
 */
export function createVectorElevationField(baseHeight,roads,edits,{
  influenceRadius=18
}={}){
  const clean=normalizeVectorEdits(edits),anchors=[];
  for(const road of roads){
    const changed=clean.ways[String(road.id)]?.vertices;
    if(!changed)continue;
    for(const [key,delta] of Object.entries(changed)){
      const p=road.p[Number(key)];
      if(p&&Math.abs(delta[2])>.0001)
        anchors.push({x:p[0]+delta[0],z:p[1]+delta[1],
          dy:delta[2]});
    }
  }
  // Indexed on a coarse grid: sampling an 11k-vertex terrain tile should
  // never scan the entire city or every saved adjustment.
  const size=Math.max(10,influenceRadius),cells=new Map();
  const key=(x,z)=>x+":"+z;
  for(const anchor of anchors){
    const gx=Math.floor(anchor.x/size),gz=Math.floor(anchor.z/size);
    const cell=key(gx,gz);
    if(!cells.has(cell))cells.set(cell,[]);
    cells.get(cell).push(anchor);
  }
  const sample=(x,z)=>{
    let weighted=0,total=0;
    const gx=Math.floor(x/size),gz=Math.floor(z/size);
    for(let ix=gx-1;ix<=gx+1;ix++)
      for(let iz=gz-1;iz<=gz+1;iz++)
        for(const a of cells.get(key(ix,iz))||[]){
          const d=Math.hypot(x-a.x,z-a.z);
          if(d>=influenceRadius)continue;
          const t=1-d/influenceRadius;
          const weight=t*t*(3-2*t);
          weighted+=a.dy*weight;
          total+=weight;
        }
    // Using a bounded total suppresses discontinuous normalization at
    // the influence edge and makes zero-offset terrain exactly unchanged.
    return baseHeight(x,z)+weighted/Math.max(1,total);
  };
  return {sample,anchorCount:anchors.length};
}
