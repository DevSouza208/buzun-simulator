# WorldGen 7.6 — recorte geométrico do terreno pela rua

## Objetivo
Na versão 7.5 o solo 3D continuava inteiro debaixo do asfalto.
Em trechos inclinados, a triangulação do solo cruzava o plano vetorial
da pista: manchas de terra surgiam dentro da estrada, especialmente
na Avenida Senador Teotônio Vilela.

## Mudança principal
A **única autoridade de cobertura** agora é a malha final de asfalto
já unida pelo `unionVectorAsphaltTriangles` da 7.5.

Para cada tile 420×420m que entra no raio visível:
1. Gerar a grade de altitude da folha `WorldSheet` (52 segmentos no relevo).
2. Gerar a geometria do asfalto vetorial no LOD selecionado, incluindo
   curvas, cruzamentos, correções manuais e proteção de costura de 10cm.
3. Indexar os triângulos da malha unificada em uma grade espacial de 22m.
4. Para cada triângulo do terreno, consultar somente os triângulos da
   máscara próximos. Se não houver interseção, preservar sem alteração.
5. Se o solo estiver coberto, removê-lo. Se estiver parcialmente coberto,
   aplicar subtração convexa 2D e triangular apenas o restante.
6. A altura dos novos pontos de corte é interpolada no triângulo 3D
   original do terreno (não na altura do asfalto). Preservar ordem dos
   vértices para não inverter faces/normais.
7. Enviar ao THREE.BufferGeometry somente a parte visível do solo.

Ao trocar Ultra/Equilibrado/Econômico, o recorte é reconstruído pela
**mesma geometria de asfalto do novo nível**, sem guardar três versões
do terreno na GPU. A grade original só é guardada temporariamente na
CPU durante a vida do chunk; geometrias ultrapassadas são descartadas.

## Comparação na própria branch
- `?worldgen=flat&roads=vector&debug=worldgen`: relevo e recorte ON.
- `?worldgen=flat&roads=vector&cutout=off&debug=worldgen`: mesmo
  relevo e mesmo asfalto, mas terreno antigo inteiro.
- `?worldgen=flat&roads=vector&relief=flat&debug=worldgen`:
  conferir o recorte no terreno plano.
- `?sidewalks=on` continua ativando a antiga apresentação e
  desliga o novo recorte, para comparação histórica.

## Métricas adicionadas
No overlay `debug=worldgen`, mostramos:
- `Terreno recortado: X m²`: área somada nos tiles carregados.
- `Triângulos de terreno: N`: triângulos efetivamente enviados.
- Indicador `Recorte do terreno: desativado` para o modo A/B.

## Limitações
- Nenhum triângulo de terreno deve existir dentro da máscara do
  asfalto em solo nível 0. Não se deve passar a máscara de viadutos
  ou túneis para esse recorte.
- O recorte segue o footprint existente do OSM, mas **não fabrica
  novas conexões** onde dois nós estão separados.
- Pequenas diferenças verticais (por exemplo, 22cm de superfície
  de asfalto) ainda podem ser visíveis como bordas; o recorte resolve
  a invasão de terra, não é um sistema completo de acostamentos.
- A física do carro e as marcações legadas não são redesenhadas nesta
  fase; precisam de teste visual em encostas. Não afirmar que o carro
  deixou de afundar até validar o pivô/rodas.
- O processamento ocorre durante a carga inicial de um chunk e
  pode aumentar a latência de geração, embora o índice espacial
  evite comparação de cada triângulo com todas as 4.777 ruas.
- **main não foi alterada**. A PR permanece draft e aguarda QA visual
  no Chrome/telemetria de FPS no mesmo trecho da 7.5.

## Testes automatizados
`tests/worldgen-76-terrain-vector-cutout.test.js` cobre:
- Área removida exatamente igual ao footprint do asfalto;
- triângulos inteiros, parciais e com índices;
- relevo inclinado preservado na borda;
- continuidade da máscara no encontro de dois tiles;
- chunks sem asfalto e sincronização com LOD.
