/** Converte o rumo geográfico usado na movimentação para rotação visual do Three.js.
 * O carro foi modelado apontando para -Z (local).
 * Movimento: +sin(heading) no X, -cos(heading) no Z.
 * Rotação Y do THREE transforma -Z em (-sin(rotation), -cos(rotation)).
 */
export function modelYawFromHeading(heading) {
  return -heading;
}
