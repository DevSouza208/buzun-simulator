/**
 * Streaming is the production world generator. The old full-city compositor
 * remains available only as an explicit diagnostic fallback.
 */
export function resolveWorldgenMode(search="") {
  const params=search instanceof URLSearchParams ? search :
    new URLSearchParams(search);
  const requested=params.get("worldgen");
  const debug=params.get("debug");
  const progressive=requested!=="legacy"&&requested!=="complete";
  const showWorldgen=debug!=="off"&&(
    requested==="debug"||debug==="worldgen"||
    // Preserve the historic diagnostic link for developers.
    requested==="stream"
  );
  return {progressive,showWorldgen};
}
