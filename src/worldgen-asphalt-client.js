/**
 * State machine for an optional background asphalt worker.
 *
 * The streaming engine polls state between cooperative callbacks. No DOM
 * timers, Promises, or browser globals are needed to unit-test this module.
 */
let nextJobId=1;
export function startAsphaltWorkerJob(patches,{
  WorkerClass=typeof Worker==="function"?Worker:null,
  workerURL=new URL("./worldgen-asphalt.worker.js",import.meta.url)
}={}){
  if(!WorkerClass)return null;
  let worker;
  try{
    worker=new WorkerClass(workerURL,{type:"module",
      name:"BuzunAsphaltUnion"});
  }catch(error){
    return null; // Blocked, disabled or unsupported: caller falls back.
  }
  const id=nextJobId++;
  const job={id,status:"pending",positions:null,stats:null,error:null,
    cancel(){
      if(job.status==="pending")job.status="cancelled";
      worker.onmessage=null;
      worker.onerror=null;
      worker.terminate();
    }
  };
  worker.onmessage=event=>{
    const response=event.data||{};
    if(response.id!==id||job.status!=="pending")return;
    if(response.error){
      job.status="failed";
      job.error=String(response.error);
    }else if(!(response.positions instanceof Float64Array)||
             response.positions.length%9!==0||!response.stats){
      job.status="failed";
      job.error="Resposta incompleta do Web Worker";
    }else{
      job.status="complete";
      job.positions=response.positions;
      job.stats=response.stats;
    }
    worker.terminate();
  };
  worker.onerror=event=>{
    if(job.status!=="pending")return;
    event?.preventDefault?.();
    job.status="failed";
    job.error=event?.message||"Erro de execução do Web Worker";
    worker.terminate();
  };
  try{
    worker.postMessage({id,patches});
  }catch(error){
    job.cancel();
    return null;
  }
  return job;
}
