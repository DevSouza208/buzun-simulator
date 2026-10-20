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
  const stats={slices:0,yields:0,maxSliceMs:0,cpuMs:0,
    maxStepMs:0,slowestStage:null,slowSteps:0,waitSlices:0};
  return {
    stats,
    get done(){return done;},
    get cancelled(){return cancelled;},
    get progress(){return progress;},
    cancel(){
      if(cancelled||done)return;
      cancelled=true;
      // A suspended generator can own a live Web Worker. Closing it
      // executes its finally block and terminates the worker promptly.
      iterator.return?.();
    },
    advance(){
      if(cancelled)return {done:true,cancelled:true,value:null,progress};
      if(done)return {done:true,value:result,progress};
      const start=now();
      let steps=0;
      do{
        const beforeStep=now();
        const step=iterator.next();
        const duration=Math.max(0,now()-beforeStep);
        steps++;
        if(duration>stats.maxStepMs){
          stats.maxStepMs=duration;
          stats.slowestStage=step.value?.stage||
            progress?.stage||"finalização";
        }
        if(duration>sliceMs)stats.slowSteps++;
        if(step.done){done=true;result=step.value;break;}
        progress=step.value;
        stats.yields++;
        if(progress?.waiting){
          stats.waitSlices++;
          break; // never spin on a worker that has not answered yet
        }
      }while(steps<maxSteps&&now()-start<sliceMs);
      const elapsed=Math.max(0,now()-start);
      stats.slices++;
      stats.cpuMs+=elapsed;
      stats.maxSliceMs=Math.max(stats.maxSliceMs,elapsed);
      return {done,value:done?result:null,progress,steps,elapsed};
    }
  };
}
