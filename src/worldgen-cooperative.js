/**
 * Cooperative generator runner for main-thread WorldGen.
 *
 * Each advance performs at most maxSteps generator checkpoints and
 * tries to respect a CPU time slice. It cannot preempt a single expensive
 * JS operation: union and sidewalk generators must yield between patches.
 *
 * No timers, browser APIs or WebGL dependency. The caller schedules
 * a new browser idle task for each advance, leaving input/RAF responsive.
 */
export function createCooperativeRunner(iterator,{
  now=()=>typeof performance!=="undefined"?performance.now():Date.now(),
  sliceMs=6,maxSteps=6
}={}){
  if(!iterator||typeof iterator.next!=="function")
    throw Error("WorldGen requer um iterador de construção");
  if(!(sliceMs>0)||!(maxSteps>=1))
    throw Error("Orçamento de etapas inválido");
  let done=false,cancelled=false,result=null,progress=null;
  const stats={slices:0,yields:0,maxSliceMs:0,cpuMs:0};
  return {
    stats,
    get done(){return done;},
    get cancelled(){return cancelled;},
    get progress(){return progress;},
    cancel(){cancelled=true;},
    advance(){
      if(cancelled)return {done:true,cancelled:true,value:null,progress};
      if(done)return {done:true,value:result,progress};
      const start=now();
      let steps=0;
      do{
        const step=iterator.next();
        steps++;
        if(step.done){done=true;result=step.value;break;}
        progress=step.value;
        stats.yields++;
      }while(steps<maxSteps&&now()-start<sliceMs);
      const elapsed=Math.max(0,now()-start);
      stats.slices++;
      stats.cpuMs+=elapsed;
      stats.maxSliceMs=Math.max(stats.maxSliceMs,elapsed);
      return {done,value:done?result:null,progress,steps,elapsed};
    }
  };
}
