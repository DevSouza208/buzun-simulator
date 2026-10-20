import {runAsphaltJob} from "./worldgen-asphalt-job.js";

/** Dedicated ESM worker: the asphalt union has no WebGL dependency.
 * Responses transfer one Float64Array buffer, never per-triangle messages.
 * A region's Worker is terminated on success, failure, or cancellation.
 */
self.onmessage=event=>{
  const {id,patches}=event.data||{};
  if(!Number.isInteger(id)||!Array.isArray(patches)){
    self.postMessage({id,error:"Dados de asfalto inválidos"});
    return;
  }
  try{
    const {positions,stats}=runAsphaltJob(patches);
    self.postMessage({id,positions,stats},[positions.buffer]);
  }catch(error){
    self.postMessage({id,error:String(error?.message||error)});
  }
};
