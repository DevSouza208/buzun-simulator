import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import {emptyEdits,readSavedEdits,saveEdits,normalizeEdits,applyRoadEdits,
  withWidth,withMeshProfile,withoutWayEdits,meshEditCount} from "./road-editor-model.js";
import {sidewalkWidth} from "./road-corridor.js";
import {emptyVectorEdits,normalizeVectorEdits,loadVectorEdits,
  saveVectorEdits,applyVisualVectorEdits,withVectorVertexOffset,
  moveVectorEdge,createVectorElevationField}
  from "./worldgen-vector-edit-model.js";
import {buildRoadModelPreview,disposePreview} from "./road-model-preview.js";

const $=id=>document.getElementById(id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distanceToSegment=(p,a,b)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz;
  const t=l>1e-8?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l,0,1):0;
  return {distance:Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz),
    nearest:[a[0]+t*dx,a[1]+t*dz]};
};
function downloadEdits(edits){
  const data={...edits,metadata:{
    editor:"Buzun Create / Modelagem viária 3D",
    description:"Correções locais do gerador; OSM original intacto",
    exportedAt:new Date().toISOString()}};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="buzun-correcao-modelagem.json";
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/** The admin sees the REAL 3D world, not the schematic centreline editor.
 * Gameplay's renderer and canvas are moved into the editor viewport, and
 * an OrthographicCamera looks straight down. No duplicate WebGL context.
 */
export function mountRoadAdmin({
  getRoads,getPosition,getScene,getGameCanvas,getHeightAt,
  whenOpen,whenClose,onResize,notify
}){
  const login=$("admin-login"),panel=$("admin-editor"),
    stage=$("admin-map-stage"),canvas=getGameCanvas();
  const camera=new THREE.OrthographicCamera(-100,100,100,-100,.1,2400);
  const scene=()=>getScene?.();
  let session=false,visible=false,active=false,
    edits=emptyEdits(),roads=[],baseRoads=[],selectedId=null,tool="select",
    center={x:0,z:0},viewHeight=240,drag=null,history=[],preview=null,
    originalFog=null,originalFogSaved=false,
    vectorEdits=emptyVectorEdits(),vectorHistory=[],
    vectorHandles=null,openedVectorEdits=emptyVectorEdits();
  const selected=()=>roads.find(r=>String(r.id)===String(selectedId));
  const sourceSelected=()=>baseRoads.find(r=>String(r.id)===String(selectedId));
  const visualSelected=()=>{
    const r=selected();
    return r?applyVisualVectorEdits([r],vectorEdits)[0]:null;
  };
  // The world already contains any corrections that existed when the
  // editor opened. Apply only the difference while dragging, so a height
  // edit has an immediate 3D preview without doubling persisted offsets.
  function previewHeightField(){
    const delta=emptyVectorEdits();
    for(const [id,way] of Object.entries(vectorEdits.ways)){
      const old=openedVectorEdits.ways[id]?.vertices||{};
      const vertices={};
      for(const [i,point] of Object.entries(way.vertices)){
        const d=point[2]-(old[i]?.[2]||0);
        if(Math.abs(d)>1e-6)vertices[i]=[point[0],point[1],d];
      }
      if(Object.keys(vertices).length)delta.ways[id]={vertices};
    }
    for(const [id,way] of Object.entries(openedVectorEdits.ways)){
      for(const [i,point] of Object.entries(way.vertices)){
        if(vectorEdits.ways[id]?.vertices?.[i])continue;
        const d=-point[2];
        if(Math.abs(d)<1e-6)continue;
        if(!delta.ways[id])delta.ways[id]={vertices:{}};
        delta.ways[id].vertices[i]=[point[0],point[1],d];
      }
    }
    return createVectorElevationField(
      (x,z)=>getHeightAt?.(x,z)??0,baseRoads,delta).sample;
  }
  function disposeHandles(){
    if(!vectorHandles)return;
    scene()?.remove(vectorHandles);
    const geometries=new Set(),materials=new Set();
    vectorHandles.traverse(node=>{
      if(node.geometry)geometries.add(node.geometry);
      if(node.material)materials.add(node.material);
    });
    for(const geo of geometries)geo.dispose();
    for(const mat of materials)mat.dispose();
    vectorHandles=null;
  }
  function drawVectorHandles(heightAtPreview=previewHeightField()){
    disposeHandles();
    if(!visible||!["vertex","edge"].includes(tool))return;
    const road=visualSelected(),current=scene();
    if(!road||!current)return;
    const group=new THREE.Group(),vertices=[],radius=clamp(
      unitsPerPixel()*5,.65,4);
    const vertexGeo=new THREE.SphereGeometry(radius,8,6),
      vertexMat=new THREE.MeshBasicMaterial({color:"#d9ff69",
        depthTest:false}),lineMat=new THREE.LineBasicMaterial({
        color:"#61e5fd",depthTest:false});
    for(const [x,z] of road.p){
      const y=heightAtPreview(x,z)+1.7;
      vertices.push(x,y,z);
      const point=new THREE.Mesh(vertexGeo,vertexMat);
      point.position.set(x,y,z);
      point.renderOrder=500;
      group.add(point);
    }
    const path=new THREE.BufferGeometry();
    path.setAttribute("position",new THREE.Float32BufferAttribute(
      vertices,3));
    const line=new THREE.Line(path,lineMat);
    line.renderOrder=499;
    group.add(line);
    vectorHandles=group;
    current.add(group);
  }
  function vectorStatus(){
    const ways=Object.keys(vectorEdits.ways).length;
    const points=Object.values(vectorEdits.ways).reduce(
      (n,way)=>n+Object.keys(way.vertices).length,0);
    $("admin-vector-status").textContent=points+
      " vértices visuais editados em "+ways+
      " ruas. Aplique no jogo para reconstruir os chunks.";
  }
  const status=s=>{$("admin-map-status").textContent=s;};
  const bounds=()=>stage.getBoundingClientRect();
  const unitsPerPixel=()=>viewHeight/Math.max(1,bounds().height);
  const worldPoint=(x,y)=>{
    const box=bounds(),units=unitsPerPixel();
    return [center.x+(x-box.left-box.width/2)*units,
      center.z+(y-box.top-box.height/2)*units];
  };
  function alignCamera(){
    if(!visible)return;
    const box=bounds(),aspect=box.width/Math.max(1,box.height),half=viewHeight/2;
    camera.left=-half*aspect;camera.right=half*aspect;
    camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
    const level=getHeightAt?.(center.x,center.z)||0;
    camera.position.set(center.x,level+800,center.z);
    camera.up.set(0,0,-1);
    camera.lookAt(center.x,level,center.z);
    camera.updateMatrixWorld();
  }
  function resize(){if(!visible)return;alignCamera();onResize?.();}
  function nearestRoad(point,maxPixels=24){
    const tolerance=maxPixels*unitsPerPixel();
    let road=null,best=tolerance,hit=null;
    for(const r of roads) {
      const pts=r.p;
      for(let i=1;i<pts.length;i++){
        const a=pts[i-1],b=pts[i];
        if(Math.max(a[0],b[0])+best<point[0] ||
          Math.min(a[0],b[0])-best>point[0] ||
          Math.max(a[1],b[1])+best<point[1] ||
          Math.min(a[1],b[1])-best>point[1])continue;
        const h=distanceToSegment(point,a,b);
        if(h.distance<best){best=h.distance;road=r;hit=h;}
      }
    }
    return road?{road,hit}:null;
  }
  function nearestOnSelected(point){
    const road=selected();if(!road)return null;
    let best={distance:Infinity};
    for(let i=1;i<road.p.length;i++){
      const hit=distanceToSegment(point,road.p[i-1],road.p[i]);
      if(hit.distance<best.distance)best=hit;
    }
    return best;
  }
  function refreshPreview(){
    disposeHandles();
    disposePreview(preview);preview=null;
    const road=visualSelected(),current=scene();
    if(!road||!current)return;
    const n=id=>Number($(id).value);
    const heightAtPreview=previewHeightField();
    preview=buildRoadModelPreview(road,heightAtPreview,{
      asphalt:clamp(Number.isFinite(n("admin-width"))?n("admin-width"):road.widthMeters,2,45),
      walk:clamp(Number.isFinite(n("admin-walk"))?n("admin-walk"):sidewalkWidth(road),.6,5),
      curb:clamp(Number.isFinite(n("admin-curb"))?n("admin-curb"):.14,0,.4),
      corner:clamp(Number.isFinite(n("admin-corner"))?n("admin-corner"):0,0,4)
    });
    current.add(preview);
    drawVectorHandles(heightAtPreview);
  }
  function updateInfo(){
    const road=selected(),has=!!road;
    $("admin-road-name").textContent=has?road.n||"Rua sem nome":"Selecione uma rua";
    $("admin-road-meta").textContent=has?
      "Via OSM #"+road.id+" · "+road.t+" · modelo 3D gerado":
      "Clique diretamente no asfalto do cenário 3D.";
    for(const id of ["admin-width","admin-walk","admin-curb","admin-corner",
      "admin-width-save","admin-road-reset"]) $(id).disabled=!has;
    if(has){
      $("admin-width").value=road.widthMeters||7;
      $("admin-walk").value=road.sidewalkMeters??sidewalkWidth(road);
      $("admin-curb").value=road.curbHeightMeters??.14;
      $("admin-corner").value=road.cornerClearanceMeters??0;
      $("admin-width-origin").textContent=road.widthSource==="buzun:editor"?
        "Modelo corrigido localmente":"Geometria gerada a partir do OSM";
    }else $("admin-width-origin").textContent="Nenhuma via selecionada";
    $("admin-edits-count").textContent=meshEditCount(edits)+
      " ajustes de via · "+Object.values(vectorEdits.ways).reduce(
        (n,r)=>n+Object.keys(r.vertices).length,0)+" pontos vetoriais";
    vectorStatus();
    refreshPreview();
  }
  function store(){
    try{edits=saveEdits(edits);}catch(e){status("Falha ao salvar: "+e.message);return;}
    roads=applyRoadEdits(baseRoads,edits);
    updateInfo();
  }
  function commit(next,message){
    history.push(structuredClone(edits));if(history.length>35)history.shift();
    edits=next;store();status(message+" · aplicar no jogo para reconstruir.");
  }
  function saveParameters(){
    const road=selected();if(!road)return;
    try{
      const base=withWidth(edits,road.id,$("admin-width").value,$("admin-walk").value);
      commit(withMeshProfile(base,road.id,$("admin-curb").value,
        $("admin-corner").value),"Modelagem desta rua salva");
    }catch(error){status(error.message);}
  }
  function setTool(next){
    tool=next;
    for(const b of panel.querySelectorAll("[data-admin-tool]"))
      b.classList.toggle("active",b.dataset.adminTool===next);
    drawVectorHandles();
    status(next==="vertex"?"Arraste um ponto amarelo (Shift = altitude)":
      next==="edge"?"Arraste a linha azul (Shift = altitude)":
      next==="pan"?"Arraste a cena para navegar":
      next==="asphalt"?"Selecione uma rua e arraste a borda do asfalto":
      next==="sidewalk"?"Selecione uma rua e arraste a borda externa da calçada":
      "Clique na pista do cenário 3D para selecionar");
  }
  function enter(){
    const loaded=getRoads?.();
    if(!loaded?.length){notify?.("Aguarde o mapa terminar de carregar.");return;}
    baseRoads=loaded;edits=readSavedEdits();
    vectorEdits=loadVectorEdits();vectorHistory=[];
    openedVectorEdits=structuredClone(vectorEdits);
    roads=applyRoadEdits(baseRoads,edits);selectedId=null;history=[];
    const player=getPosition?.();
    if(player)center={x:player.x,z:player.z};
    viewHeight=220;
    login.classList.add("hidden");
    panel.classList.remove("hidden");
    stage.append(canvas);
    const current=scene();
    if(current){originalFog=current.fog;originalFogSaved=true;current.fog=null;}
    visible=true;active=true;session=true;
    whenOpen?.();setTool("select");updateInfo();resize();
    $("admin-username").value="";$("admin-password").value="";
  }
  function leave(){
    visible=false;active=false;drag=null;
    disposeHandles();
    disposePreview(preview);preview=null;
    if(scene()&&originalFogSaved)scene().fog=originalFog;
    originalFogSaved=false;
    panel.classList.add("hidden");login.classList.add("hidden");
    document.body.insertBefore(canvas,document.body.firstChild);
    onResize?.();whenClose?.();
  }
  $("admin-open").addEventListener("click",()=>{
    if(!getRoads?.()?.length){notify?.("Aguarde o carregamento do Grajaú.");return;}
    if(session)enter();
    else{login.classList.remove("hidden");whenOpen?.();$("admin-username").focus();}
  });
  $("admin-login-form").addEventListener("submit",e=>{
    e.preventDefault();
    if($("admin-username").value.trim().toLowerCase()==="admin"&&
       $("admin-password").value==="7334"){
      $("admin-error").textContent="";enter();
    }else $("admin-error").textContent="Usuário ou senha incorretos.";
  });
  $("admin-login-close").addEventListener("click",()=>{
    login.classList.add("hidden");whenClose?.();
  });
  $("admin-close").addEventListener("click",leave);
  $("admin-logout").addEventListener("click",()=>{session=false;leave();});
  for(const button of panel.querySelectorAll("[data-admin-tool]"))
    button.addEventListener("click",()=>setTool(button.dataset.adminTool));
  function zoom(factor,px,py) {
    const before=px!=null?worldPoint(px,py):null;
    viewHeight=clamp(viewHeight*factor,18,4000);alignCamera();
    if(before) {
      const after=worldPoint(px,py);
      center.x+=before[0]-after[0];center.z+=before[1]-after[1];
    }
    alignCamera();
  }
  $("admin-zoom-in").addEventListener("click",()=>zoom(.7));
  $("admin-zoom-out").addEventListener("click",()=>zoom(1.4));
  $("admin-center").addEventListener("click",()=>{
    const p=getPosition?.();if(p)center={x:p.x,z:p.z};
    viewHeight=220;alignCamera();
  });
  $("admin-fit").addEventListener("click",()=>{
    let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
    for(const road of roads)for(const [x,z] of road.p){
      minX=Math.min(x,minX);maxX=Math.max(x,maxX);
      minZ=Math.min(z,minZ);maxZ=Math.max(z,maxZ);
    }
    if(!Number.isFinite(minX))return;
    const box=bounds(),ratio=box.width/Math.max(1,box.height);
    center={x:(minX+maxX)/2,z:(minZ+maxZ)/2};
    viewHeight=clamp(Math.max((maxZ-minZ)*1.06,(maxX-minX)*1.06/ratio),
      18,4000);alignCamera();
    status("Vista geral: aproxime para ver as ruas renderizadas por setores.");
  });
  canvas.addEventListener("wheel",e=>{
    if(!visible)return;
    e.preventDefault();zoom(e.deltaY<0?.78:1.28,e.clientX,e.clientY);
  },{passive:false});
  canvas.addEventListener("pointerdown",e=>{
    if(!visible)return;
    if(e.button!==0&&e.button!==1)return;
    const point=worldPoint(e.clientX,e.clientY);
    if(tool==="pan"||e.button===1){
      drag={type:"pan",x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);return;
    }
    const hit=nearestRoad(point);
    if(tool==="vertex"||tool==="edge"){
      if(!selected()){
        selectedId=hit?.road.id??null;
        updateInfo();
        return;
      }
      const road=visualSelected();
      const limit=25*unitsPerPixel();
      let best=limit,index=-1;
      if(tool==="vertex"){
        for(let i=0;i<road.p.length;i++){
          const distance=Math.hypot(
            road.p[i][0]-point[0],road.p[i][1]-point[1]);
          if(distance<best){best=distance;index=i;}
        }
      }else{
        for(let i=0;i<road.p.length-1;i++){
          const distance=distanceToSegment(
            point,road.p[i],road.p[i+1]).distance;
          if(distance<best){best=distance;index=i;}
        }
      }
      if(index<0){
        selectedId=hit?.road.id??null;
        updateInfo();
        return;
      }
      drag={type:"vector",mode:tool,index,road:sourceSelected(),
        original:structuredClone(vectorEdits),
        startPoint:point,startScreenY:e.clientY,heightMode:e.shiftKey};
      canvas.setPointerCapture(e.pointerId);
      status("Arrastando "+(tool==="vertex"?"vértice":"aresta")+
        (e.shiftKey?" · altura Y":" · posição X/Z"));
      return;
    }
    if(tool==="select"||!selected()){
      selectedId=hit?.road.id??null;updateInfo();
      if(hit)status("Rua selecionada. Ajuste a malha pela lateral direita.");
      return;
    }
    const nearest=nearestOnSelected(point);
    if(!nearest||nearest.distance>45*unitsPerPixel()+sidewalkWidth(selected())+selected().widthMeters/2){
      selectedId=hit?.road.id??null;updateInfo();return;
    }
    if(tool==="asphalt"||tool==="sidewalk"){
      drag={type:tool};
      canvas.setPointerCapture(e.pointerId);
      updateDrag(point);
    }
  });
  function updateDrag(point){
    const road=selected(),hit=nearestOnSelected(point);
    if(!road||!hit)return;
    if(drag?.type==="asphalt"){
      $("admin-width").value=clamp(Math.round(hit.distance*20)/10,2,45);
    }else if(drag?.type==="sidewalk"){
      const outer=hit.distance-Number($("admin-width").value)/2;
      $("admin-walk").value=clamp(Math.round(outer*10)/10,.6,5);
    }
    refreshPreview();
    status("Prévia 3D · solte e clique em salvar ou aplique a modelagem.");
  }
  canvas.addEventListener("pointermove",e=>{
    if(!visible||!drag)return;
    if(drag.type==="vector"){
      const from=drag.startPoint,to=worldPoint(e.clientX,e.clientY),
        dx=drag.heightMode?0:to[0]-from[0],
        dz=drag.heightMode?0:to[1]-from[1],
        dy=drag.heightMode?
          -(e.clientY-drag.startScreenY)*.06:0;
      try{
        if(drag.mode==="vertex"){
          const old=drag.original.ways[String(drag.road.id)]
            ?.vertices?.[drag.index]||[0,0,0];
          vectorEdits=withVectorVertexOffset(drag.original,
            drag.road,drag.index,clamp(old[0]+dx,-30,30),
            clamp(old[1]+dz,-30,30),clamp(old[2]+dy,-30,30));
        }else vectorEdits=moveVectorEdge(drag.original,
          drag.road,drag.index,dx,dz,dy);
        refreshPreview();vectorStatus();
      }catch(error){status(error.message);}
      return;
    }
    if(drag.type==="pan"){
      const factor=unitsPerPixel();
      center.x-=(e.clientX-drag.x)*factor;
      center.z-=(e.clientY-drag.y)*factor;
      drag.x=e.clientX;drag.y=e.clientY;alignCamera();
    }else updateDrag(worldPoint(e.clientX,e.clientY));
  });
  canvas.addEventListener("pointerup",()=>{
    if(drag?.type==="vector"&&JSON.stringify(drag.original)!==
      JSON.stringify(vectorEdits)){
      vectorHistory.push(drag.original);
      if(vectorHistory.length>50)vectorHistory.shift();
      try{vectorEdits=saveVectorEdits(vectorEdits);
        status("Vetor salvo localmente. Clique APLICAR NO JOGO para atualizar.");
      }catch(err){status("Erro ao salvar vetor: "+err.message);}
    }
    drag=null;
  });
  canvas.addEventListener("pointercancel",()=>{
    if(drag?.type==="vector"){
      vectorEdits=drag.original;refreshPreview();
    }
    drag=null;
  });
  for(const id of ["admin-width","admin-walk","admin-curb","admin-corner"])
    $(id).addEventListener("input",()=>{
      if(selected()) {
        refreshPreview();status("Prévia da modelagem · clique Salvar medidas para guardar.");
      }
    });
  $("admin-width-save").addEventListener("click",saveParameters);
  $("admin-vector-undo").addEventListener("click",()=>{
    if(!vectorHistory.length){status("Nenhum ajuste vetorial para desfazer.");return;}
    vectorEdits=saveVectorEdits(vectorHistory.pop());
    updateInfo();status("Último movimento vetorial desfeito.");
  });
  $("admin-vector-reset").addEventListener("click",()=>{
    if(!selected())return;
    vectorHistory.push(structuredClone(vectorEdits));
    const next=structuredClone(vectorEdits);
    delete next.ways[String(selected().id)];
    vectorEdits=saveVectorEdits(next);updateInfo();
    status("Vetor desta rua restaurado. Aplique no jogo.");
  });
  $("admin-vector-export").addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify(vectorEdits,null,2)],
      {type:"application/json"});
    const url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download="buzun-vetores-visuais.json";
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $("admin-vector-import").addEventListener("change",async event=>{
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    try{
      if(file.size>2_000_000)throw Error("Máximo de 2 MB.");
      const data=JSON.parse(await file.text());
      vectorHistory.push(structuredClone(vectorEdits));
      vectorEdits=saveVectorEdits(normalizeVectorEdits(data));
      updateInfo();status("Vetores importados; aplique no jogo.");
    }catch(e){status("Falha ao importar vetores: "+e.message);}
  });
  $("admin-road-reset").addEventListener("click",()=>{
    const source=sourceSelected();
    if(source)commit(withoutWayEdits(edits,source),"Modelo original desta rua restaurado");
  });
  $("admin-undo").addEventListener("click",()=>{
    if(!history.length){status("Nada para desfazer.");return;}
    edits=history.pop();store();status("Última modelagem desfeita");
  });
  $("admin-export").addEventListener("click",()=>downloadEdits(edits));
  $("admin-import").addEventListener("change",async e=>{
    const file=e.target.files?.[0];e.target.value="";if(!file)return;
    try{
      if(file.size>3_000_000)throw Error("Limite de 3 MB.");
      commit(normalizeEdits(JSON.parse(await file.text())),"Modelagem importada");
    }catch(err){status("JSON inválido: "+err.message);}
  });
  $("admin-clear").addEventListener("click",()=>{
    if(confirm("Limpar todas as correções locais de modelagem?"))
      commit(emptyEdits(),"Modelagem local restaurada");
  });
  $("admin-apply").addEventListener("click",()=>{
    // Pending form values are committed too, so users do not lose the preview.
    if(selected()) {
      try{
        let next=withWidth(edits,selected().id,
          $("admin-width").value,$("admin-walk").value);
        next=withMeshProfile(next,selected().id,$("admin-curb").value,
          $("admin-corner").value);
        saveEdits(next);
      }catch(e){status(e.message);return;}
    }else saveEdits(edits);
    try{saveVectorEdits(vectorEdits);}
    catch(e){status("Falha ao salvar vetores: "+e.message);return;}
    location.reload();
  });
  document.addEventListener("keydown",e=>{
    if(e.key!=="Escape")return;
    if(!login.classList.contains("hidden")){
      login.classList.add("hidden");whenClose?.();
    }else if(visible)leave();
  });
  new ResizeObserver(()=>{if(visible)resize();}).observe(stage);
  return {
    isOpen:()=>visible||!login.classList.contains("hidden"),
    isEditing:()=>active,
    focus:()=>center,
    getCamera:()=>{alignCamera();return camera;},
    viewport:()=>{
      if(!visible)return null;
      const b=bounds();return {w:Math.max(1,Math.floor(b.width)),
        h:Math.max(1,Math.floor(b.height))};
    }
  };
}
