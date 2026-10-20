import {composeRoadsideMeshes} from "./sidewalk-union.js";

/** WorldGen 5.16. Run EXACT sidewalk/curb/ramp/tactile compositor off
 * main thread, with its same precedence and callback order per material.
 * All coordinates are Float64 to match JavaScript number precision.
 * No Three.js, DOM, terrain sampler or shader code.
 */
export const ROADSIDE_CHANNELS=Object.freeze({
  walk:9,median:9,curb:12,tactile:9
});
const pushVertices=(buffer,vertices)=>{
  for(const v of vertices)
    buffer.push(v[0],v[1],v[2]);
};
export function runRoadsideJob(asphaltPatches,walkPatches,options={}){
  const output={walk:[],median:[],curb:[],tactile:[]};
  const stats=composeRoadsideMeshes(asphaltPatches,walkPatches,
    (triangle,patch)=>{
      pushVertices(output[patch.isMedian?"median":"walk"],triangle);
    },
    quad=>pushVertices(output.curb,quad),
    {...options,onTactile:tri=>pushVertices(output.tactile,tri)});
  const geometry=Object.fromEntries(
    Object.entries(output).map(([key,values])=>
      [key,new Float64Array(values)]));
  return {geometry,stats};
}
export function validateRoadsideGeometry(geometry){
  if(!geometry||typeof geometry!=="object")return false;
  return Object.entries(ROADSIDE_CHANNELS).every(([key,stride])=>{
    const data=geometry[key];
    return data instanceof Float64Array&&
      data.length%stride===0&&
      data.every(Number.isFinite);
  });
}
/** Each buffer feeds the same material-specific buffer on the main
 * thread. There is no cross-material z-order dependence in the composer.
 * Yield between batches so BufferGeometry conversion cannot monopolize RAF.
 */
export function* replayRoadsideGeometry(geometry,emit,{
  batchPrimitives=120
}={}){
  if(!validateRoadsideGeometry(geometry))
    throw Error("Dados de calçadas e guias inválidos");
  if(!Number.isInteger(batchPrimitives)||batchPrimitives<1)
    throw Error("Lote viário inválido");
  let total=0;
  for(const [kind,stride] of Object.entries(ROADSIDE_CHANNELS)){
    const data=geometry[kind];
    const count=data.length/stride;
    for(let i=0;i<count;i++){
      const start=i*stride,vertices=[];
      for(let j=0;j<stride;j+=3)
        vertices.push([data[start+j],data[start+j+1],
          data[start+j+2]]);
      emit(kind,vertices);
      total++;
      if((i+1)%batchPrimitives===0)
        yield {stage:"roadside_worker_replay",
          material:kind,done:i+1,total:count};
    }
    // Must yield even for short buffers, so no single callback replays
    // every material in one synchronous step.
    yield {stage:"roadside_worker_replay",
      material:kind,done:count,total:count};
  }
  return total;
}
