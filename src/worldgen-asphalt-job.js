import {unionAsphaltPatches} from "./asphalt-union.js";

/** Portable CPU-side asphalt job. No Three.js, DOM, or DEM globals.
 * Source heights and layer priorities travel with each polygon, so the
 * worker emits exactly the same 3D triangles as the synchronous compositor.
 */
export function runAsphaltJob(patches){
  const positions=[];
  const stats=unionAsphaltPatches(patches,triangle=>{
    for(const point of triangle)
      positions.push(point[0],point[1],point[2]);
  });
  return {positions:new Float64Array(positions),stats};
}

/** Replay worker output without changing triangle winding or order.
 * Consumers can drive this generator cooperatively on the main thread.
 */
export function* replayAsphaltTriangles(positions,emit,{
  batchTriangles=160
}={}){
  if(!(positions instanceof Float64Array)||positions.length%9!==0)
    throw Error("Resultado de asfalto inválido");
  if(!Number.isInteger(batchTriangles)||batchTriangles<1)
    throw Error("Lote de triângulos inválido");
  const total=positions.length/9;
  for(let i=0;i<total;i++){
    const at=i*9;
    emit([
      [positions[at],positions[at+1],positions[at+2]],
      [positions[at+3],positions[at+4],positions[at+5]],
      [positions[at+6],positions[at+7],positions[at+8]]
    ]);
    if((i+1)%batchTriangles===0)
      yield {stage:"asphalt_worker_replay",done:i+1,total};
  }
  return total;
}
