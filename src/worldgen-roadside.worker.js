import {runRoadsideJob} from "./worldgen-roadside-job.js";

function execute(input,reply){
  const {id,asphaltPatches,walkPatches,options}=input||{};
  if(!Number.isInteger(id)||!Array.isArray(asphaltPatches)||
     !Array.isArray(walkPatches)){
    reply({id,error:"Dados da composição das calçadas inválidos"});
    return;
  }
  try{
    const {geometry,stats}=runRoadsideJob(
      asphaltPatches,walkPatches,options||{});
    reply({id,geometry,stats},Object.values(geometry).map(a=>a.buffer));
  }catch(error){
    reply({id,error:String(error?.message||error)});
  }
}
if(typeof self!=="undefined"&&typeof self.postMessage==="function"){
  self.onmessage=event=>execute(event.data,(value,transfer)=>
    self.postMessage(value,transfer));
}else{
  // Same production entry point is tested in a real Node worker thread.
  const {parentPort}=await import("node:worker_threads");
  parentPort?.on("message",data=>execute(data,(value,transfer)=>
    parentPort.postMessage(value,transfer)));
}
