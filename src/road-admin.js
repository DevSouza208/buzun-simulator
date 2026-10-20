import {
  emptyEdits,readSavedEdits,saveEdits,normalizeEdits,applyRoadEdits,
  withWidth,withNode,withoutWayEdits,editStats
} from "./road-editor-model.js";
import {sidewalkWidth} from "./road-corridor.js";

const $=id=>document.getElementById(id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const segmentDistance=(p,a,b)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1],len=dx*dx+dz*dz;
  const t=len?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/len,0,1):0;
  return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);
};
function downloadEdits(edits){
  const blob=new Blob([JSON.stringify({
    ...edits,metadata:{creator:"Buzun Editor",format:"local worldgen overrides",
      notice:"Não altera OpenStreetMap",exportedAt:new Date().toISOString()}
  },null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download="buzun-grajau-edicoes.json";
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function mountRoadAdmin({getRoads,getPosition,whenOpen,whenClose,notify}){
  const overlay=$("admin-editor"),login=$("admin-login"),
    canvas=$("admin-map"),ctx=canvas.getContext("2d");
  let session=false,visible=false,edits=emptyEdits(),roads=[],baseRoads=[];
  let selectedId=null,tool="select",center={x:0,z:0},scale=.38,
    isDragging=false,dragMode="",origin=null,lastPointer=null,
    moving=null,history=[],scheduled=false;
  const roadSelected=()=>roads.find(r=>String(r.id)===String(selectedId));
  const baseSelected=()=>baseRoads.find(r=>String(r.id)===String(selectedId));
  const mapStatus=text=>{$("admin-map-status").textContent=text;};
  const notifyStatus=text=>{mapStatus(text);notify?.(text);};
  const pointAt=(x,y)=>{
    const box=canvas.getBoundingClientRect();
    return [center.x+(x-box.left-box.width/2)/scale,
      center.z+(y-box.top-box.height/2)/scale];
  };
  const screenPoint=p=>{
    const box=canvas.getBoundingClientRect();
    return [(p[0]-center.x)*scale+box.width/2,
      (p[1]-center.z)*scale+box.height/2];
  };
  const resize=()=>{
    if(!visible)return;
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    const width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    requestDraw();
  };
  function requestDraw(){
    if(!visible||scheduled)return;
    scheduled=true;requestAnimationFrame(()=>{scheduled=false;draw();});
  }
  function draw(){
    if(!visible)return;
    const box=canvas.getBoundingClientRect(),w=box.width,h=box.height;
    const dpr=canvas.width/(w||1),minX=center.x-w/(2*scale),
      maxX=center.x+w/(2*scale),minZ=center.z-h/(2*scale),
      maxZ=center.z+h/(2*scale);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle="#142e38";ctx.fillRect(0,0,w,h);
    ctx.strokeStyle="#24434a";ctx.lineWidth=1;
    const step=scale<.12?1000:scale<.45?250:scale<1?100:25;
    for(let x=Math.ceil(minX/step)*step;x<=maxX;x+=step){
      const p=(x-center.x)*scale+w/2;
      ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,h);ctx.stroke();
    }
    for(let z=Math.ceil(minZ/step)*step;z<=maxZ;z+=step){
      const p=(z-center.z)*scale+h/2;
      ctx.beginPath();ctx.moveTo(0,p);ctx.lineTo(w,p);ctx.stroke();
    }
    ctx.lineJoin="round";ctx.lineCap="round";
    let visibleWays=0;
    for(const road of roads){
      if(!road.p||road.p.length<2)continue;
      let inRange=false;
      for(const [x,z] of road.p){
        if(x>minX-60&&x<maxX+60&&z>minZ-60&&z<maxZ+60){inRange=true;break;}
      }
      if(!inRange)continue;
      visibleWays++;
      const active=String(road.id)===String(selectedId);
      ctx.strokeStyle=active?"#d3fb7c":
        road.widthSource==="buzun:editor"?"#91dce4":
        ["primary","secondary","trunk"].includes(road.t)?"#a1b9b7":"#6d9697";
      ctx.lineWidth=Math.max(active?3.7:1.1,
        (road.widthMeters||7)*scale*(active?1.12:.8));
      ctx.beginPath();
      let i=0;for(const point of road.p){
        const x=(point[0]-center.x)*scale+w/2,
          y=(point[1]-center.z)*scale+h/2;
        i++===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    const road=roadSelected();
    if(road){
      ctx.fillStyle="#d7ff85";
      for(let i=0;i<road.p.length;i++){
        const p=(moving&&moving.index===i)?moving.point:road.p[i];
        const [x,y]=screenPoint(p);
        if(x<-10||x>w+10||y<-10||y>h+10)continue;
        ctx.beginPath();ctx.arc(x,y,tool==="node"?5:2.5,0,Math.PI*2);ctx.fill();
      }
    }
    const player=getPosition?.();
    if(player) {
      const [x,y]=screenPoint([player.x,player.z]);
      ctx.save();ctx.translate(x,y);ctx.rotate(player.yaw||0);
      ctx.fillStyle="#d6fa78";ctx.beginPath();
      ctx.moveTo(0,-12);ctx.lineTo(-8,9);ctx.lineTo(0,5);
      ctx.lineTo(8,9);ctx.closePath();ctx.fill();ctx.restore();
    }
    ctx.fillStyle="#e0f0dc";ctx.font="700 12px system-ui";
    ctx.fillText("N ↑",18,28);
    const metres=100/scale;
    ctx.strokeStyle="#c4ee84";ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(22,h-30);ctx.lineTo(122,h-30);ctx.stroke();
    ctx.fillText(Math.round(metres)+" m",22,h-40);
    $("admin-visible-count").textContent=visibleWays+" vias visíveis";
  }
  function nearestWay(point,pixelTolerance=14){
    let best=null,d=pixelTolerance/scale;
    for(const road of roads){
      for(let i=1;i<road.p.length;i++){
        const distance=segmentDistance(point,road.p[i-1],road.p[i]);
        if(distance<d){best=road;d=distance;}
      }
    }
    return best;
  }
  function nearestNode(road,point,tolerance=16){
    if(!road)return -1;
    let closest=-1,best=tolerance/scale;
    for(let i=0;i<road.p.length;i++){
      const d=Math.hypot(point[0]-road.p[i][0],point[1]-road.p[i][1]);
      if(d<best){best=d;closest=i;}
    }
    return closest;
  }
  function updateInfo(){
    const road=roadSelected();
    $("admin-road-name").textContent=road?(road.n||"Rua sem nome"):"Selecione uma rua";
    $("admin-road-meta").textContent=road?
      "OSM #"+road.id+" · "+road.t+" · "+road.p.length+" vértices":
      "Clique em uma via no mapa para editar.";
    const enabled=!!road;
    for(const id of ["admin-width","admin-walk","admin-width-save","admin-road-reset"])
      $(id).disabled=!enabled;
    if(enabled){
      $("admin-width").value=String(road.widthMeters||7);
      $("admin-walk").value=String(road.sidewalkMeters??sidewalkWidth(road));
      $("admin-width-origin").textContent=
        road.widthSource==="buzun:editor"?"Corrigida localmente":
        road.widthSource==="osm:width"?"Medida OSM":"Estimativa do gerador";
    }else $("admin-width-origin").textContent="Nenhuma via selecionada";
    const stats=editStats(edits);
    $("admin-edits-count").textContent=stats.widths+" larguras · "+
      stats.nodes+" vértices editados";
    requestDraw();
  }
  function store(previous=true){
    if(previous)history.push(structuredClone(edits));
    if(history.length>40)history.shift();
    edits=saveEdits(edits);
    roads=applyRoadEdits(baseRoads,edits);
    updateInfo();
  }
  function commit(next,label){
    history.push(structuredClone(edits));if(history.length>40)history.shift();
    edits=next;
    store(false);mapStatus(label+" · salvo neste navegador");
  }
  function setTool(next){
    tool=next;
    for(const button of document.querySelectorAll("[data-admin-tool]"))
      button.classList.toggle("active",button.dataset.adminTool===next);
    mapStatus(next==="node"?"Arraste um ponto amarelo da rua selecionada":
      next==="pan"?"Arraste o mapa para navegar":
      "Clique na rua para selecioná-la");
    requestDraw();
  }
  function showMap(){
    const current=getRoads?.();
    if(!current?.length){notifyStatus("Aguarde o carregamento do mapa.");return;}
    baseRoads=current;
    edits=readSavedEdits();roads=applyRoadEdits(baseRoads,edits);
    const player=getPosition?.();
    if(player){center={x:player.x,z:player.z};scale=.38;}
    selectedId=null;session=true;visible=true;history=[];
    login.classList.add("hidden");
    overlay.classList.remove("hidden");
    whenOpen?.();setTool("select");updateInfo();resize();
    $("admin-username").value="";$("admin-password").value="";
  }
  function close(){
    visible=false;overlay.classList.add("hidden");
    login.classList.add("hidden");
    moving=null;isDragging=false;
    whenClose?.();
  }
  $("admin-open").addEventListener("click",()=>{
    if(!getRoads?.()?.length){notify?.("Aguarde o mapa carregar.");return;}
    if(session)showMap();else{
      login.classList.remove("hidden");whenOpen?.();
      $("admin-username").focus();
    }
  });
  $("admin-login-form").addEventListener("submit",e=>{
    e.preventDefault();
    if($("admin-username").value.trim().toLowerCase()==="admin"&&
       $("admin-password").value==="7334"){
      $("admin-error").textContent="";showMap();
    }else $("admin-error").textContent="Usuário ou senha incorretos.";
  });
  $("admin-login-close").addEventListener("click",()=>{
    login.classList.add("hidden");whenClose?.();
  });
  $("admin-close").addEventListener("click",close);
  $("admin-logout").addEventListener("click",()=>{session=false;close();});
  for(const button of document.querySelectorAll("[data-admin-tool]"))
    button.addEventListener("click",()=>setTool(button.dataset.adminTool));
  function zoom(factor){
    scale=clamp(scale*factor,.035,4);requestDraw();
  }
  $("admin-zoom-in").addEventListener("click",()=>zoom(1.5));
  $("admin-zoom-out").addEventListener("click",()=>zoom(1/1.5));
  $("admin-center").addEventListener("click",()=>{
    const p=getPosition?.();if(p)center={x:p.x,z:p.z};scale=.38;requestDraw();
  });
  $("admin-fit").addEventListener("click",()=>{
    if(!roads.length)return;
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const road of roads)for(const [x,z] of road.p){
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);
      minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
    }
    const box=canvas.getBoundingClientRect();
    center={x:(minX+maxX)/2,z:(minZ+maxZ)/2};
    scale=clamp(Math.min((box.width-70)/(maxX-minX||1),
      (box.height-70)/(maxZ-minZ||1)),.025,4);
    requestDraw();
  });
  canvas.addEventListener("wheel",e=>{
    e.preventDefault();const before=pointAt(e.clientX,e.clientY);
    zoom(e.deltaY<0?1.25:.8);
    const after=pointAt(e.clientX,e.clientY);
    center.x+=before[0]-after[0];center.z+=before[1]-after[1];requestDraw();
  },{passive:false});
  canvas.addEventListener("pointerdown",e=>{
    if(!visible)return;
    const point=pointAt(e.clientX,e.clientY);
    isDragging=true;dragMode="";origin=point;
    lastPointer=[e.clientX,e.clientY];
    canvas.setPointerCapture(e.pointerId);
    if(tool==="pan"||e.button===1){dragMode="pan";return;}
    if(tool==="node"){
      let road=roadSelected(),index=nearestNode(road,point);
      if(index<0){road=nearestWay(point);if(road){selectedId=road.id;index=nearestNode(road,point);} }
      if(road&&index>=0){moving={index,point:[...road.p[index]],road};dragMode="node";}
      else mapStatus("Aproxime o zoom e selecione um ponto da rua.");
      updateInfo();return;
    }
    const road=nearestWay(point);
    selectedId=road?.id??null;updateInfo();
  });
  canvas.addEventListener("pointermove",e=>{
    if(!isDragging)return;
    if(dragMode==="pan"){
      center.x-=(e.clientX-lastPointer[0])/scale;
      center.z-=(e.clientY-lastPointer[1])/scale;requestDraw();
    }else if(dragMode==="node"&&moving){
      moving.point=pointAt(e.clientX,e.clientY).map(v=>Math.round(v*10)/10);
      requestDraw();
    }
    lastPointer=[e.clientX,e.clientY];
  });
  function endPointer(){
    if(dragMode==="node"&&moving){
      const road=baseRoads.find(r=>String(r.id)===String(moving.road.id));
      const next=withNode(edits,road,moving.index,moving.point);
      commit(next,"Vértice reposicionado");
    }
    isDragging=false;dragMode="";moving=null;
  }
  canvas.addEventListener("pointerup",endPointer);
  canvas.addEventListener("pointercancel",()=>{isDragging=false;dragMode="";moving=null;requestDraw();});
  $("admin-width-save").addEventListener("click",()=>{
    const road=roadSelected();if(!road)return;
    try{commit(withWidth(edits,road.id,$("admin-width").value,
      $("admin-walk").value),"Largura e calçada ajustadas");}
    catch(e){mapStatus(e.message);}
  });
  $("admin-road-reset").addEventListener("click",()=>{
    const road=baseSelected();if(road)commit(withoutWayEdits(edits,road),
      "Correções desta via revertidas");
  });
  $("admin-undo").addEventListener("click",()=>{
    if(!history.length){mapStatus("Nenhuma alteração para desfazer.");return;}
    edits=history.pop();store(false);mapStatus("Última mudança desfeita");
  });
  $("admin-export").addEventListener("click",()=>downloadEdits(edits));
  $("admin-import").addEventListener("change",async e=>{
    const file=e.target.files?.[0];e.target.value="";if(!file)return;
    try{
      if(file.size>3000000)throw Error("JSON muito grande (máximo 3 MB).");
      const next=normalizeEdits(JSON.parse(await file.text()));
      commit(next,"Correções importadas");
    }catch(error){mapStatus("Erro de importação: "+error.message);}
  });
  $("admin-clear").addEventListener("click",()=>{
    if(!confirm("Apagar TODAS as correções locais deste navegador?"))return;
    commit(emptyEdits(),"Edições locais zeradas");
  });
  $("admin-apply").addEventListener("click",()=>{
    saveEdits(edits);
    location.reload();
  });
  document.addEventListener("keydown",e=>{
    if(e.key!=="Escape")return;
    if(!login.classList.contains("hidden")){
      login.classList.add("hidden");whenClose?.();
    }else if(visible)close();
  });
  new ResizeObserver(resize).observe(canvas);
  return {isOpen:()=>visible||!login.classList.contains("hidden")};
}
