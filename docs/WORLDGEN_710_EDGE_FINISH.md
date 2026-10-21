# WorldGen 7.1 — Acabamento do asfalto plano (preview)

Base: `experiment/worldgen-70-flat-one-surface-20261021`. A versão
jogável plana com o OSM 1:1 continua intacta na branch anterior.

## Objetivo

Reduzir os "dentinhos" e o brilho/cintilação vistos na borda do asfalto
na captura da avenida (20/10/2026, ~60 FPS), SEM modificar os pontos do
OpenStreetMap, suas larguras métricas ou reconstruir placas 3D de estrada.

## Implementação

- A textura no navegador permanece com **768 pixels úteis para 420 m**.
- No momento de criar cada tile, pintar provisoriamente em **1536 pixels
  úteis** (2x) e reduzir com filtragem de alta qualidade à resolução
  final. Nenhuma textura 1536px persiste na GPU.
- Continuar pintando o gutter de 2px em cada borda; o buffer temporário
  trabalha com gutter de 4px e é descartado após gerar a textura final.
- Filtro trilinear com mipmaps e anisotropia moderada 8 para melhorar
  contornos em ângulo rasante ao horizonte.
- Adicionar `?quality=fast` para comparar com a pintura 768px sem
  supersampling. Na branch 7.1, `?worldgen=flat` usa `smooth` por
  padrão; outros geradores não são alterados.
- O transporte continua sendo a superfície 420 m / dois triângulos
  por tile, sem placas independentes de asfalto.
- Calçadas, guias e faixas brancas continuam como geometrias com altura
  acima da folha e deverão ser alinhadas geometricamente na próxima
  etapa; **supersampling não corrige divergência de malhas**.

## Como comparar

- 7.1 — `/?worldgen=flat&debug=worldgen` (smooth por padrão)
- 7.1 fast — `/?worldgen=flat&quality=fast&debug=worldgen`
- 7.0 estável — abrir a branch experimental anterior
- Use o mesmo cruzamento da Belmira Marin, mesmo ângulo e mesma distância.
- Medir FPS depois de 30 segundos, primeiro tempo de carregamento,
  pico de memória e aliasing das bordas.
- Verificar a textura na linha de duas células 420 m e ao retornar à
  região inicial. Confirmar que o asfalto continua unido.
- Se a primeira região estiver pesada, usar `quality=fast` e
  futuramente ativar qualidade adaptativa por distância.

## WorldGen 7.2 — Próximo passo (NÃO ativado aqui)

1. Continuar usando **a mesma máscara de asfalto OSM** pintada na folha.
2. Reintroduzir altitudes no campo canônico global H(x,z), sem depender
   de chunk; preservar vértices idênticos nos limites.
3. Usar os nós reais de cruzamento para conciliar alturas e evitar
   buracos/saltos de rampa.
4. Dar mais vértices **só onde a curvatura vertical exigir**, sempre
   mantendo uma costura determinística entre tiles.
5. Deformar calçadas, faixas e física lendo a MESMA fonte de altura.
6. Validar primeiro pequenas encostas da Belmira e comparar com a 7.0
   plana, usando feature flag, antes de promover o relevo por padrão.

**Ainda não há relevo na 7.1.** A geometria plana com asfalto pintado
permanece nosso ponto de recuperação. Não promover a branch à main
sem QA visual do navegador.
