/**
 * Buzun WorldGen — lane layout inferred from drivable metres and OSM tags.
 *
 * The base is one lane in each direction on ordinary two-way roads.
 * More lanes only appear if enough asphalt physically fits; explicit OSM
 * counts/directions win when they are coherent and fit. Unknown odd two-way
 * counts are NOT assigned to an arbitrary direction.
 *
 * This describes a plausible visual reconstruction, not legal lane signage
 * or surveyed street width. Never changes OSM centerlines or road meshes.
 */
export const MIN_LANE_METRES=3;
export const EDGE_RESERVE_METRES=.3;
export const MAX_LANES_PER_DIRECTION=3;
const major=new Set(["motorway","motorway_link","trunk","trunk_link",
  "primary","primary_link","secondary","secondary_link","tertiary","tertiary_link"]);
const trunk=new Set(["motorway","motorway_link","trunk","trunk_link"]);
const positiveInteger=value=>{
  if(value==null||value==="")return null;
  const n=Number(value);
  return Number.isInteger(n)&&n>=1&&n<=12?n:null;
};
function hasOneWay(road){
  const value=String(road.o??road.oneway??"").trim().toLowerCase();
  if(["yes","true","1","-1"].includes(value))return true;
  if(["no","false","0"].includes(value))return false;
  return trunk.has(road.t);
}
function laneCapacity(width){
  return Math.max(1,Math.min(6,Math.floor(
    (width-EDGE_RESERVE_METRES+1e-8)/MIN_LANE_METRES)));
}
export function resolveLanePlan(road){
  const width=Number(road.widthMeters);
  const metres=Number.isFinite(width)&&width>=2&&width<=45?width:7;
  const oneway=hasOneWay(road),capacity=laneCapacity(metres);
  const tagged=positiveInteger(road.lanes);
  const taggedForward=positiveInteger(road.lanesForward);
  const taggedBackward=positiveInteger(road.lanesBackward);
  const maxSide=MAX_LANES_PER_DIRECTION;
  const maxTotal=Math.min(capacity,maxSide*(oneway?1:2));
  let forward=1,backward=oneway?0:1,source="inferred";
  let ambiguousOSM=false,limitedByWidth=false;
  if(oneway){
    const inferred=Math.min(maxSide,capacity);
    const request=tagged??taggedForward??inferred;
    forward=Math.min(request,maxTotal);
    source=tagged||taggedForward?"osm":"estimated-width";
    limitedByWidth=request>maxTotal;
  }else{
    const physicalEven=Math.floor(Math.min(maxTotal,capacity)/2);
    const defaultPerSide=Math.min(maxSide,Math.max(1,physicalEven));
    forward=defaultPerSide;backward=defaultPerSide;
    // We only trust unequal directional counts when OSM actually specifies
    // both directions. Guessing 2+1 from "lanes=3" would be fictitious.
    if(taggedForward&&taggedBackward){
      const requestedTotal=taggedForward+taggedBackward;
      if(requestedTotal<=maxTotal){
        forward=Math.min(taggedForward,maxSide);
        backward=Math.min(taggedBackward,maxSide);
        source="osm-directions";
        limitedByWidth=taggedForward>maxSide||taggedBackward>maxSide;
      }else{
        limitedByWidth=true;source="width-constrained";
      }
    }else if(tagged){
      if(tagged%2===0){
        const half=tagged/2;
        if(tagged<=maxTotal&&half<=maxSide){
          forward=half;backward=half;source="osm";
        }else{
          limitedByWidth=true;source="width-constrained";
        }
      }else {
        // Odd totals might imply a turning lane, bus lane or unequal flow.
        // Preserve two-way symmetry unless OSM explicitly says which way.
        ambiguousOSM=true;source="osm-ambiguous";
      }
    }
  }
  const total=forward+backward;
  const laneWidth=metres/total;
  const center=oneway?null:(-metres/2+forward*laneWidth);
  const markings=[];
  const canStripe=metres>=5.7 && laneWidth>=2.7;
  const roadIsMajor=major.has(road.t);
  const roadIsAvenue=["primary","secondary","trunk","motorway"].includes(road.t);
  if(canStripe){
    if(!oneway&&roadIsMajor){
      // For roads with opposing traffic the center separates directions.
      // A double yellow visually differentiates avenues from side streets.
      const double=roadIsAvenue&&metres>=8;
      const positions=double?[center-.14,center+.14]:[center];
      for(const offset of positions)
        markings.push({kind:"center",color:"yellow",style:"solid",
          offset,width:double?.095:.12});
    }
    const n=oneway?total:forward;
    for(let i=1;i<n;i++)
      markings.push({kind:"lane",color:"white",style:"dashed",
        offset:-metres/2+i*laneWidth,width:.12});
    if(!oneway){
      for(let i=1;i<backward;i++)
        markings.push({kind:"lane",color:"white",style:"dashed",
          offset:center+i*laneWidth,width:.12});
    }
    if(roadIsMajor&&metres>=7.5)
      for(const side of [-1,1])
        markings.push({kind:"edge",color:"white",style:"solid",
          offset:side*(metres/2-.25),width:.10});
  }
  return {oneway,total,forward,backward,widthMeters:metres,
    laneWidthMeters:laneWidth,centerOffsetMeters:center,
    source,limitedByWidth,ambiguousOSM,markings};
}
/** Return subsections of a centerline segment which should be painted.
 * Dashed phase is measured from the start of the ENTIRE OSM way.
 */
export function paintIntervals(startMetres,lengthMetres,style){
  if(lengthMetres<=.02)return [];
  if(style!=="dashed")return [[0,1]];
  const cycle=12,ink=4.4;
  let cursor=0;const result=[];
  while(cursor<lengthMetres-.001){
    const phase=((startMetres+cursor)%cycle+cycle)%cycle;
    const next=Math.min(lengthMetres-cursor,phase<ink?ink-phase:cycle-phase);
    if(phase<ink-.0001 && next>.03)
      result.push([cursor/lengthMetres,(cursor+next)/lengthMetres]);
    cursor+=Math.max(next,.001);
  }
  return result;
}
