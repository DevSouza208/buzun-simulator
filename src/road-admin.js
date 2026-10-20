import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import {emptyEdits,readSavedEdits,saveEdits,normalizeEdits,applyRoadEdits,
  withWidth,withMeshProfile,withoutWayEdits,meshEditCount} from "./road-editor-model.js";
import {sidewalkWidth} from "./road-corridor.js";
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
    originalFog=null,originalFogSaved=false;
  const selected=()=>roads.find(r=>String(r.id)===String(selectedId));
  const sourceSelected=()=>baseRoads.find(r=>String(r.id)===String(selectedId));
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
    disposePreview(preview);preview=null;
    const road=selected(),current=scene();
    if(!road||!current)return;
    const n=id=>Number($(id).value);
    preview=buildRoadModelPreview(road,(x,z)=>getHeightAt(x,z),{
      asphalt:clamp(Number.isFinite(n("admin-width"))?n("admin-width"):road.widthMeters,2,45),
      walk:clamp(Number.isFinite(n("admin-walk"))?n("admin-walk"):sidewalkWidth(road),.6,5),
      curb:clamp(Number.isFinite(n("admin-curb"))?n("admin-curb"):.14,0,.4),
      corner:clamp(Number.isFinite(n("admin-corner"))?n("admin-corner"):0,0,4)
    });
    current.add(preview);
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
    $("admin-edits-count").textContent=meshEditCount(edits)+" ajustes de malha";
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
    status(next==="pan"?"Arraste a cena para navegar":
      next==="asphalt"?"Selecione uma rua e arraste a borda do asfalto":
      next==="sidewalk"?"Selecione uma rua e arraste a borda externa da calçada":
      "Clique na pista do cenário 3D para selecionar");
  }
  function enter(){
    const loaded=getRoads?.();
    if(!loaded?.length){notify?.("Aguarde o mapa terminar de carregar.");return;}
    baseRoads=loaded;edits=readSavedEdits();
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
    if(drag.type==="pan"){
      const factor=unitsPerPixel();
      center.x-=(e.clientX-drag.x)*factor;
      center.z-=(e.clientY-drag.y)*factor;
      drag.x=e.clientX;drag.y=e.clientY;alignCamera();
    }else updateDrag(worldPoint(e.clientX,e.clientY));
  });
  canvas.addEventListener("pointerup",()=>{drag=null;});
  canvas.addEventListener("pointercancel",()=>{drag=null;});
  for(const id of ["admin-width","admin-walk","admin-curb","admin-corner"])
    $(id).addEventListener("input",()=>{
      if(selected()) {
        refreshPreview();status("Prévia da modelagem · clique Salvar medidas para guardar.");
      }
    });
  $("admin-width-save").addEventListener("click",saveParameters);
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
