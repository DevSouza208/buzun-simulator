/**
 * Cinemática longitudinal básica do Buzun.
 * Coordenadas do mundo: +X leste, +Z sul; o nariz do modelo aponta para -Z.
 * No Three.js, giro +Y leva -Z para -X, então o mesh usa yaw negativo.
 */
export function headingForward(yaw) {
  return { x: Math.sin(yaw), z: -Math.cos(yaw) };
}
export function meshYawForHeading(yaw) {
  return -yaw;
}
export function nextSpeed(speed, { throttle = 0, brake = 0 } = {}, dt, maxForward = 26, maxReverse = 10) {
  if (!(dt > 0)) return speed;
  const gas = Math.max(0, Math.min(1, throttle));
  const pedal = Math.max(0, Math.min(1, brake));

  // Freio no movimento para frente reduz até zero. Mantido, engata ré.
  // A transição não cruza zero em um único quadro.
  if (pedal > 0) {
    if (speed > 0) return Math.max(0, speed - 12 * pedal * dt);
    return Math.max(-maxReverse, speed - 4.8 * pedal * dt);
  }
  // Aceleração saindo da ré freia primeiro e só então move para frente.
  if (gas > 0) {
    if (speed < 0) return Math.min(0, speed + 12 * gas * dt);
    return Math.min(maxForward, speed + 6.8 * gas * dt);
  }
  const drag = (1.5 + 0.008 * speed * speed) * dt;
  return Math.abs(speed) <= drag ? 0 : speed - Math.sign(speed) * drag;
}
