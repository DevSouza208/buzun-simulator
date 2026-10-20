import {validateRoadsideGeometry}
  from "./worldgen-roadside-job.js";

/** Optional region-local worker. The legacy/initial world never waits for
 * this asynchronous result. Every job has its own cancellation and guard
 * against stale, malformed or late worker messages.
 */
let nextId=1;
export function startRoadsideWorkerJob(
  asphaltPatches,walkPatches,options={},{
    WorkerClass=typeof Worker==="function"?Worker:null,
    workerURL=new URL("./worldgen-roadside.worker.js",import.meta.url)
  }={}
){
  if(!WorkerClass)return null;
  let worker;
  try{
    worker=new WorkerClass(workerURL,{
      type:"module",name:"BuzunRoadsideUnion"
    });
  }catch{return null;}
  const id=nextId++;
  const job={id,status:"pending",geometry:null,stats:null,error:null,
    cancel(){
      if(job.status==="pending")job.status="cancelled";
      worker.onmessage=null;worker.onerror=null;
      worker.terminate();
    }
  };
  worker.onmessage=event=>{
    const message=event.data||{};
    if(message.id!==id||job.status!=="pending")return;
    if(message.error){
      job.status="failed";job.error=String(message.error);
    }else if(!validateRoadsideGeometry(message.geometry)||
             !message.stats||typeof message.stats!=="object"){
      job.status="failed";job.error="Resposta de calçadas incompleta";
    }else{
      job.status="complete";
      job.geometry=message.geometry;
      job.stats=message.stats;
    }
    worker.terminate();
  };
  worker.onerror=event=>{
    if(job.status!=="pending")return;
    event?.preventDefault?.();
    job.status="failed";
    job.error=event?.message||"Erro de Web Worker de calçadas";
    worker.terminate();
  };
  try{
    // Input is intentionally cloned, not transferred: it may be needed
    // unchanged if the worker fails and the cooperative fallback starts.
    worker.postMessage({id,asphaltPatches,walkPatches,options});
  }catch{
    job.cancel();return null;
  }
  return job;
}
