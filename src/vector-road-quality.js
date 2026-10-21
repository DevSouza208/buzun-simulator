/**
 * Three independent visual tessellations of the same authoritative OSM graph.
 * No profile changes road widths, node locations, physical layers or its
 * global clipping grid. Only the smoothness of vector caps/curve joints varies.
 */
export const ROAD_DETAIL_STORAGE_KEY="buzun-road-vector-detail-v1";
export const ROAD_DETAIL_DEFAULT="ultra";
export const ROAD_DETAIL_PRESETS=Object.freeze({
  ultra:Object.freeze({
    label:"Ultra · máximo detalhe",metresPerArcStep:1.25,
    minArcSteps:18,maxArcSteps:48
  }),
  balanced:Object.freeze({
    label:"Equilibrado",metresPerArcStep:2.25,
    minArcSteps:12,maxArcSteps:28
  }),
  economy:Object.freeze({
    label:"Econômico",metresPerArcStep:4.5,
    minArcSteps:8,maxArcSteps:14
  })
});
export const isRoadDetail=value=>
  Object.prototype.hasOwnProperty.call(ROAD_DETAIL_PRESETS,value);
export function resolveRoadDetail(search="",stored=""){
  const requested=new URLSearchParams(search).get("detail");
  if(isRoadDetail(requested))return requested;
  return isRoadDetail(stored)?stored:ROAD_DETAIL_DEFAULT;
}
export function arcStepsForRoadRadius(radius,detail=ROAD_DETAIL_DEFAULT){
  const profile=ROAD_DETAIL_PRESETS[
    isRoadDetail(detail)?detail:ROAD_DETAIL_DEFAULT];
  return Math.max(profile.minArcSteps,
    Math.min(profile.maxArcSteps,
      Math.ceil(2*Math.PI*radius/profile.metresPerArcStep)));
}
