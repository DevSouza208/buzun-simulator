/**
 * Grajaú 1:1 horizontal-plane experiment.
 *
 * The mini-map already displays the same versioned OSM street coordinates
 * that drive the player. Flattening means replacing ONLY the vertical
 * elevations: all X/Z points, topology, way IDs and widths stay unchanged.
 * Every surface is in metres; x=east and z=south.
 *
 * Raised/lowered OSM layers remain offset so bridges and tunnels do not
 * coincide with ground asphalt. These offsets are visual clearance, NOT
 * measured terrain elevations.
 */
import {createWorldSheet} from "./worldgen-sheet.js";
import {physicalLayer} from "./asphalt-union.js";

export const FLAT_GROUND_HEIGHT=0;
export const FLAT_LAYER_CLEARANCE_METRES=5;
export const flatSampleHeight=()=>FLAT_GROUND_HEIGHT;
// Only in this isolated branch, opening / without parameters is FLAT.
export const flatBranchMode=search=>{
  const mode=new URLSearchParams(search).get("worldgen");
  return mode===null||mode==="flat";
};
export const flatRoadBase=road=>
  physicalLayer(road)*FLAT_LAYER_CLEARANCE_METRES;

/** Unchanged OSM lines with constant height per physical layer. */
export function createFlatMapWorldSheet(roads,{
  gradeModels=null,fixedJunctions=new Set(),junctions=[]
}={}){
  const canonical=createWorldSheet(roads,flatSampleHeight,{
    gradeModels,fixedJunctions,junctions
  });
  const cache=new Map();
  const sectionsFor=road=>{
    const key=String(road.id);
    if(cache.has(key))return cache.get(key);
    // Reuse the exact original, globally sampled X/Z points. Flatten only
    // the Y profile, never the road centerlines or generated intersections.
    const sections=canonical.sectionsFor(road).map(section=>({
      ...section,base:flatRoadBase(road)
    }));
    cache.set(key,sections);
    return sections;
  };
  const roadAt=(x,z)=>{
    const hit=canonical.roadAt(x,z);
    return hit?{...hit,base:FLAT_GROUND_HEIGHT}:null;
  };
  return {
    sectionsFor,roadAt,roadHits:(x,z,maxWays=5)=>
      canonical.roadHits(x,z,maxWays).map(hit=>({
        ...hit,base:FLAT_GROUND_HEIGHT
      })),
    height:flatSampleHeight,meshHeight:flatSampleHeight,
    tileSample:flatSampleHeight,
    flatWorld:true,
    get stats(){return {...canonical.stats,
      flat:true,cachedFlatProfiles:cache.size};}
  };
}
