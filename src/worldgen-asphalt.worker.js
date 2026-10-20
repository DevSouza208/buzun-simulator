import {runAsphaltJob} from "./worldgen-asphalt-job.js";

/** Browser module worker, also exercised in a genuine Node worker thread
 * during CI. Only pure polygon data crosses the boundary, never Three.js.
 */
function handleJob(input,reply){
  const {id,patches}=input||{};
  if(!Number.isInteger(id)||!Array.isArray(patches)){
    reply({id,error:"Dados de asfalto inválidos"});
    return;
  }
  try{
    const {positions,stats}=runAsphaltJob(patches);
    reply({id,positions,stats},[positions.buffer]);
  }catch(error){
    reply({id,error:String(error?.message||error)});
  }
}

if(typeof self!=="undefined"&&typeof self.postMessage==="function"){
  self.onmessage=event=>handleJob(event.data,(payload,transfer)=>
    self.postMessage(payload,transfer));
}else{
  // This branch is never executed in browsers. It permits real threaded
  // end-to-end testing in Node CI instead of testing only mocked messages.
  const {parentPort}=await import("node:worker_threads");
  parentPort?.on("message",data=>
    handleJob(data,(payload,transfer)=>
      parentPort.postMessage(payload,transfer)));
}
