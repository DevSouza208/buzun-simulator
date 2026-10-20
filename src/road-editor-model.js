/**
 * Local Buzun editor patch format. Never sends edits back to OpenStreetMap.
 * Node overrides apply to every OSM way sharing the same node ID.
 * Local fallback references (wayId:index) affect only that way.
 */
export const EDITS_STORAGE_KEY="buzun-world-editor-v1";
export const emptyEdits=()=>({version:1,widths:{},nodes:{},localNodes:{},profiles:{}});
const validNumber=n=>typeof n==="number"&&Number.isFinite(n);
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(x=>validNumber(x)&&Math.abs(x)<100000);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function normalizeEdits(data){
  if(!data||data.version!==1||typeof data!=="object"||
     !["object"].includes(typeof data.widths) ||
     !["object"].includes(typeof data.nodes))throw Error("Formato de edição incompatível");
  const normalized=emptyEdits();
  for(const [id,v] of Object.entries(data.widths||{})){
    if(!/^[a-zA-Z0-9:_-]{1,50}$/.test(id)||!v||typeof v!=="object")continue;
    const width=Number(v.widthMeters),walk=Number(v.sidewalkMeters);
    if(!Number.isFinite(width)||width<2||width>45)continue;
    normalized.widths[id]={widthMeters:width};
    if(Number.isFinite(walk)&&walk>=.6&&walk<=5)
      normalized.widths[id].sidewalkMeters=walk;
  }
  for(const [id,v] of Object.entries(data.profiles||{})){
    if(!/^[a-zA-Z0-9:_-]{1,50}$/.test(id)||!v||typeof v!=="object")continue;
    const height=Number(v.curbHeightMeters),clearance=Number(v.cornerClearanceMeters);
    if(!Number.isFinite(height)||height<0||height>.4 ||
       !Number.isFinite(clearance)||clearance<0||clearance>4)continue;
    normalized.profiles[id]={curbHeightMeters:height,cornerClearanceMeters:clearance};
  }
  for(const [id,p] of Object.entries(data.nodes||{}))
    if(/^\d{1,20}$/.test(id)&&validPoint(p))normalized.nodes[id]=[...p];
  for(const [id,p] of Object.entries(data.localNodes||{}))
    if(/^[-\w]+:\d{1,6}$/.test(id)&&validPoint(p))
      normalized.localNodes[id]=[...p];
  return normalized;
}
export function applyRoadEdits(roads,edits){
  const v=normalizeEdits(edits);
  return roads.map(road=>{
    const width=v.widths[String(road.id)];
    const profile=v.profiles[String(road.id)];
    let changed=!!width||!!profile;
    const p=road.p.map((point,i)=>{
      const nodeId=road.nodeIds?.[i];
      const replace=(nodeId!=null?v.nodes[String(nodeId)]:null)||
        v.localNodes[String(road.id)+":"+i];
      if(replace){changed=true;return [...replace];}
      return point;
    });
    return !changed?road:{...road,p,
      ...(width?{widthMeters:width.widthMeters,
        widthSource:"buzun:editor",
        ...(width.sidewalkMeters!=null?{sidewalkMeters:width.sidewalkMeters}:{})}:{}),
      ...(profile?{...profile}:{})};
  });
}
export function withWidth(edits,wayId,width,sidewalk){
  const next=structuredClone(normalizeEdits(edits));
  const w=Number(width),s=Number(sidewalk);
  if(!Number.isFinite(w)||w<2||w>45)throw Error("Largura deve ser de 2 a 45 metros.");
  if(!Number.isFinite(s)||s<.6||s>5)throw Error("Calçada deve ter de 0,6 a 5 metros.");
  next.widths[String(wayId)]={widthMeters:clamp(w,2,45),
    sidewalkMeters:clamp(s,.6,5)};
  return next;
}
/** Visual mesh parameters, deliberately independent of OSM geographic nodes. */
export function withMeshProfile(edits,wayId,curbHeight,cornerClearance){
  const next=structuredClone(normalizeEdits(edits));
  const h=Number(curbHeight),c=Number(cornerClearance);
  if(!Number.isFinite(h)||h<0||h>.4)
    throw Error("Altura do meio-fio entre 0 e 0,40 m.");
  if(!Number.isFinite(c)||c<0||c>4)
    throw Error("Recuo de esquina entre 0 e 4 m.");
  next.profiles[String(wayId)]={curbHeightMeters:h,cornerClearanceMeters:c};
  return next;
}
export function withNode(edits,road,index,point){
  if(!validPoint(point))throw Error("Coordenadas fora da área permitida.");
  if(!road?.p?.[index])throw Error("Vértice inexistente.");
  const next=structuredClone(normalizeEdits(edits));
  const nodeId=road.nodeIds?.[index];
  if(nodeId!=null)next.nodes[String(nodeId)]=[...point];
  else next.localNodes[String(road.id)+":"+index]=[...point];
  return next;
}
export function withoutWayEdits(edits,road){
  const next=structuredClone(normalizeEdits(edits));
  delete next.widths[String(road.id)];
  delete next.profiles[String(road.id)];
  for(let i=0;i<road.p.length;i++){
    const nodeId=road.nodeIds?.[i];
    if(nodeId!=null)delete next.nodes[String(nodeId)];
    else delete next.localNodes[String(road.id)+":"+i];
  }
  return next;
}
export function editStats(edits){
  const e=normalizeEdits(edits);
  return {widths:Object.keys(e.widths).length,
    nodes:Object.keys(e.nodes).length+Object.keys(e.localNodes).length};
}
export function meshEditCount(edits){
  const e=normalizeEdits(edits);
  return Object.keys(e.widths).length+Object.keys(e.profiles).length;
}
export function readSavedEdits(storage=globalThis.localStorage){
  try {
    const raw=storage?.getItem(EDITS_STORAGE_KEY);
    return raw?normalizeEdits(JSON.parse(raw)):emptyEdits();
  }catch{return emptyEdits();}
}
export function saveEdits(edits,storage=globalThis.localStorage){
  const normalized=normalizeEdits(edits);
  storage.setItem(EDITS_STORAGE_KEY,JSON.stringify(normalized));
  return normalized;
}
