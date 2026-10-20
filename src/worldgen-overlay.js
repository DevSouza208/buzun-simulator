/**
 * Optional, read-only browser HUD: ?worldgen=debug
 * Built into the game (not a bookmarklet), no third-party telemetry.
 * Numbers are visible-frame GPU calls / triangles and estimated static
 * mesh buffer sizes. Rendering and input are unaffected.
 */
export function mountWorldgenOverlay({
  enabled=false,documentRef=typeof document!=="undefined"?document:null
}={}){
  if(!enabled||!documentRef)return null;
  const panel=documentRef.createElement("pre");
  panel.id="buzun-worldgen-performance";
  panel.setAttribute("aria-label","Diagnóstico de desempenho do Buzun");
  panel.style.cssText=[
    "position:fixed","bottom:12px","right:12px","z-index:99999",
    "pointer-events:none","margin:0","padding:10px 12px",
    "border:1px solid #ffffff33","border-radius:9px",
    "background:#0d1521db","color:#dce5e8",
    "font:12px/1.5 ui-monospace,Consolas,monospace",
    "max-width:min(92vw,420px)","white-space:pre-wrap"
  ].join(";");
  panel.textContent="BUZUN WORLDGEN DEBUG\nPreparando análise...";
  documentRef.body.append(panel);
  let count=0,previous=0,fps=0,frames=0;
  const report=world=>{
    const stats=world?.stats;
    if(!stats?.geometryStatistics)return null;
    return {
      build:stats.worldTiming,
      stages:stats.buildProfile?.stagesMs,
      geometry:stats.geometryStatistics,
      lod:{...stats.lodStatistics},
      streaming:stats.streaming?{...stats.streaming}:null,
      fps:+fps.toFixed(1),
      frames
    };
  };
  return {
    report,
    frame(timestamp,renderer,world){
      count++;frames++;
      if(!previous){previous=timestamp;return;}
      const elapsed=timestamp-previous;
      if(elapsed<1000)return;
      fps=1000*count/elapsed;
      previous=timestamp;count=0;
      const r=report(world),info=renderer?.info?.render;
      if(!r||!info)return;
      const megabytes=r.geometry.megabytes;
      const visible=r.lod.visibleTriangles||0;
      panel.textContent=[
        "🚌 BUZUN WORLDGEN · DIAGNÓSTICO",
        "FPS: "+fps.toFixed(1)+
          "    draw calls: "+(info.calls||0),
        "Triângulos no frame: "+(info.triangles||0).toLocaleString("pt-BR"),
        "Vias visíveis: "+r.lod.visibleTiles+"/"+r.geometry.tiles+" setores",
        "LOD: "+visible.toLocaleString("pt-BR")+
          "/"+r.geometry.triangles.toLocaleString("pt-BR")+" triângulos viários",
        "Geometria total: "+megabytes+" MiB estimados",
        "WorldGen: "+(r.build?.totalMs??"?")+" ms",
        ...(r.streaming?[
          "Streaming: "+r.streaming.loadedRegions+
            " regiões ativas · "+r.streaming.queuedRegions+" aguardando",
          "Primeira região: "+r.streaming.initialRegionMs.toFixed(1)+" ms",
          "Próximo setor: "+(r.streaming.building||"em espera"),
          "Etapa: "+(r.streaming.buildStage||"em espera"),
          "Lotes cooperativos: "+(r.streaming.cooperativeSlices||0),
          "Maior lote: "+(r.streaming.maxCooperativeSliceMs||0).toFixed(1)+" ms",
          "Regiões em segundo plano: "+(r.streaming.backgroundRegions||0),
          "Asfalto Worker: "+(r.streaming.asphaltWorkerRegions||0)+
            " concluídas / "+(r.streaming.asphaltWorkerFallbacks||0)+
            " fallback",
          "Pior etapa: "+(r.streaming.maxCooperativeStepMs||0).toFixed(1)+
            " ms ("+(r.streaming.slowestCooperativeStage||"—")+")",
          "Lotes acima da meta: "+(r.streaming.slowCooperativeSteps||0)
        ]:[]),
        "Asfalto: "+(r.stages?.uniao_poligonal_asfalto??"?")+" ms",
        "Calçadas: "+(r.stages?.uniao_calcadas_guias_rampas??"?")+" ms",
        "Setor maior: "+(r.geometry.heavySectors?.[0]?.tile??"?"),
        "Somente diagnóstico · ?worldgen=debug"
      ].join("\n");
    },
    dispose(){panel.remove();}
  };
}
