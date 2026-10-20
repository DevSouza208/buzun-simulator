/**
 * Conservative, OSM-evidenced medians between separately mapped,
 * opposite-direction one-way carriageways.
 *
 * This does NOT infer dividers on ordinary two-way streets, nor create
 * islands from every green-looking open space. Polygon masks downstream
 * remove the parts that would cross a real asphalt street.
 */
const types=new Set(["motorway","trunk","primary","secondary","tertiary"]);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const perpendicular=a=>[-a[1],a[0]];
const forward=road=>{
  const value=String(road.o||"").toLowerCase();
  return value==="-1"?-1:["yes","true","1"].includes(value)?1:0;
};
function collect(roads,cellSize=70){
  const segments=[],cells=new Map();
  const addTo=(k,s)=>{if(!cells.has(k))cells.set(k,[]);cells.get(k).push(s);};
  for(const road of roads){
    const sign=forward(road);
    if(!sign||!types.has(road.t))continue;
    for(let i=1;i<road.p.length;i++){
      const a=road.p[i-1],b=road.p[i],dx=b[0]-a[0],
        dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(length<12)continue;
      const direction=[dx/length,dz/length],
        effective=[direction[0]*sign,direction[1]*sign],
        item={id:String(road.id),type:road.t,layer:Number(road.layer)||0,
          road,a,b,direction,effective,length,
          halfWidth:(road.widthMeters||7)/2};
      segments.push(item);
      const pad=25;
      for(let x=Math.floor((Math.min(a[0],b[0])-pad)/cellSize);
        x<=Math.floor((Math.max(a[0],b[0])+pad)/cellSize);x++)
        for(let z=Math.floor((Math.min(a[1],b[1])-pad)/cellSize);
          z<=Math.floor((Math.max(a[1],b[1])+pad)/cellSize);z++)
          addTo(x+":"+z,item);
    }
  }
  return {segments,cells,cellSize};
}
function candidate(a,b,minGap,maxGap,minRun){
  if(a.id===b.id||a.layer!==b.layer ||
     dot(a.effective,b.effective)>-.97)return null;
  const along=dot(a.direction,b.direction);
  if(Math.abs(along)<.97)return null;
  // Parameterize B in A's longitudinal coordinate system.
  const offset=[b.a[0]-a.a[0],b.a[1]-a.a[1]];
  const start=dot(offset,a.direction),
    finish=start+dot([b.b[0]-b.a[0],b.b[1]-b.a[1]],a.direction);
  // Keep a 1-metre inset at each pair end to avoid an exposed seam.
  const lo=Math.max(1,Math.min(start,finish)+1),
    hi=Math.min(a.length-1,Math.max(start,finish)-1);
  if(hi-lo<minRun)return null;
  const normal=perpendicular(a.direction);
  const lateral=dot(offset,normal),distance=Math.abs(lateral);
  const gap=distance-a.halfWidth-b.halfWidth;
  if(gap<minGap||gap>maxGap)return null;
  const pos=t=>[a.a[0]+a.direction[0]*t,
    a.a[1]+a.direction[1]*t];
  const nearestB=t=>{
    const original=pos(t),d=[b.b[0]-b.a[0],b.b[1]-b.a[1]],
      denom=dot(d,d);
    const projection=denom?clamp(
      dot([original[0]-b.a[0],original[1]-b.a[1]],d)/denom,0,1):0;
    return [b.a[0]+d[0]*projection,b.a[1]+d[1]*projection];
  };
  const pa=pos(lo),qa=pos(hi),pb=nearestB(lo),qb=nearestB(hi);
  // Share the same border as asphalt; leave no gap between road and
  // planted median. The compositor removes any accidental overlap.
  const side=Math.sign(lateral),inset=0;
  const edgeA=point=>[
    point[0]+normal[0]*side*(a.halfWidth+inset),
    point[1]+normal[1]*side*(a.halfWidth+inset)
  ];
  const edgeB=point=>[
    point[0]-normal[0]*side*(b.halfWidth+inset),
    point[1]-normal[1]*side*(b.halfWidth+inset)
  ];
  const polygon=[edgeA(pa),edgeA(qa),edgeB(qb),edgeB(pb)];
  const area=Math.abs(polygon.reduce((sum,p,i)=>{
    const q=polygon[(i+1)%polygon.length];
    return sum+p[0]*q[1]-q[0]*p[1];
  },0))/2;
  if(area<minRun*.4)return null;
  return {poly:polygon,score:gap,lo,hi,gap};
}
export function findSeparatedCarriagewayMedians(roads,heightAt,{
  minGap=.85,maxGap=5.5,minRun=14,cellSize=70,maxCandidates=20000
}={}){
  const {segments,cells}=collect(roads,cellSize);
  const selected=[],seen=new Set();
  let analyzed=0,rejected=0;
  for(const a of segments){
    const mid=[(a.a[0]+a.b[0])/2,(a.a[1]+a.b[1])/2],
      ix=Math.floor(mid[0]/cellSize),iz=Math.floor(mid[1]/cellSize);
    const nearby=new Set();
    for(let x=ix-1;x<=ix+1;x++)for(let z=iz-1;z<=iz+1;z++)
      for(const b of cells.get(x+":"+z)||[])nearby.add(b);
    let best=null;
    for(const b of nearby){
      if(a.id>=b.id||a.layer!==b.layer)continue;
      if(++analyzed>maxCandidates)break;
      const entry=candidate(a,b,minGap,maxGap,minRun);
      if(entry&&(!best||entry.score<best.result.score))
        best={b,result:entry};
    }
    if(best){
      const {b,result}=best;
      const id=a.id+":"+b.id+":"+Math.round(result.lo)+":"+
        Math.round(result.hi);
      if(seen.has(id))continue;
      seen.add(id);
      const p=result.poly,
        first=[(p[0][0]+p[3][0])/2,(p[0][1]+p[3][1])/2],
        last=[(p[1][0]+p[2][0])/2,(p[1][1]+p[2][1])/2],
        h0=heightAt(...first),h1=heightAt(...last);
      selected.push({
        id:"median:"+id,isMedian:true,t:a.type,widthMeters:0,
        layer:a.layer,a:first,b:last,h0,h1,
        curbTop:.24,quad:p,gapMeters:result.gap
      });
    }else rejected++;
  }
  return {patches:selected,stats:{oneWaySegments:segments.length,
    candidatesChecked:analyzed,medians:selected.length,rejected}};
}
