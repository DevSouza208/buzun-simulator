# Etapa 5.8 — rebaixamento real de guias e rampas nas travessias

## Contexto

A etapa 5.7 criou *pintura de zebras inferidas* a partir da topologia OSM. O mundo ainda tinha uma guia vertical de aproximadamente 14 cm (base + .04 até .18) em ambos os lados, com a calçada inteira na mesma altura: colocar uma rampa decorativa por cima faria superfícies sobrepostas e não resolveria o degrau.

## O que foi implementado

### 1. Apenas nas travessias realmente pintáveis
A etapa 5.7 primeiro valida as seis barras contra o índice de asfalto e identifica o `roadId` proprietário. Só as travessias com superfície validada entram em `verifiedRampSites`. Cada local aprovado ganha **duas zonas de rampa**, uma em cada lado da pista. Nenhum desenho é feito em travessias rejeitadas, pontes ou no passeio de outra rua.

### 2. Corte geométrico da calçada original
Em `src/curb-ramps.js`, cada rampa ocupa um retângulo de 5,70 m no sentido da rua, da borda asfaltada até uma profundidade limitada pela largura do passeio (no máximo 1,45 m e até 88% da calçada). A faixa central é praticamente plana na abertura; as bordas laterais formam transições suaves.

`src/sidewalk-union.js` executa operações geométricas nos polígonos **após a união com o asfalto**:
- Recorta fora do passeio a área coberta pela zona de rampa, preservando os fragmentos fora dela.
- Divide a porção da rampa em 8 células e triangula cada célula na elevação correta.
- Usa a altitude original drapeada do próprio proprietário do passeio para calcular a superfície nova. A aresta da rua fica com uma pequena soleira de aproximadamente 1,2 cm acima do asfalto; o fundo da rampa reencontra a calçada alta.
- Não deixa a antiga superfície plana escondida sob a rampa.

### 3. A guia abre no mesmo local
O gerador de meio-fio detecta as zonas da travessia e subdivide o segmento nas entradas e saídas da faixa central. Nesses segmentos, a altura do topo da guia acompanha a altura da rampa em ambos os vértices. O bisel anterior fica preservado nos outros pontos e não atravessa o rebaixamento.

### 4. Altura e física
`src/city-road-mesh.js` monta `rampSurface`; `src/city-world.js` usa o mesmo cálculo para a altura do piso no jogo. O asfalto e os pontos OSM nunca são movidos. O relevo Mapzen, minimapa e faixas de rolamento continuam preservados.

### Testes
`tests/curb-ramps.test.js` verifica corte físico da calçada, curvatura da rampa, altura da guia, aproximação ao asfalto, preferência por vias corretas, limitação pela largura da calçada e rejeição de zonas estreitas.

`tests/grajau-ramp-integration.test.js` executa o mesmo compositor em um recorte real de 250 vias OSM do Grajaú. Resultado do CI (referência, não FPS do navegador):
- 217 travessias propostas; 185 passaram na checagem do asfalto;
- 370 zonas laterais de rampa;
- 5.729 células de rampa, 11.207 triângulos de rampa;
- 1.525 segmentos de guia rebaixados;
- Aproximadamente 1,1 segundo para a composição das calçadas e meio-fios nesse recorte.

## Limites importantes
- **O protótipo não está certificado como acessível.** As rampas são estilizadas. Suas medidas, inclinações e posição reais precisam de levantamento e adaptação a normas técnicas aplicáveis.
- As travessias são inferidas, não verificadas no município.
- A sobreposição de muitos cruzamentos e topologias OSM atípicas ainda pode produzir pequenas fissuras ou variação de grade; é preciso inspecionar visualmente.
- O tempo no jogo completo pode ser maior do que o benchmark da amostra; o navegador e hardware do usuário importam.
- Não adiciona piso tátil, sinalização oficial, semáforos ou textura de pavimento.

## Conferência em jogo
1. Abrir **v0.1.58** do Buzun e carregar a área da Av. Dona Belmira Marin.
2. Aproximar no Buzun Create de uma zebra existente. Deve haver uma depressão em cada extremidade, esculpida no passeio (não uma placa por cima), com guia baixa na abertura e guia normal adiante.
3. Dirigir sobre uma ladeira e observar se as rampas seguem o perfil da rua sem flutuar.
4. No console do navegador, ler `[Buzun WorldGen] Rampas e rebaixamentos:`: `rampSides`, `cells`, `triangles` e `curbSegmentsLowered`.
5. Caso haja artefatos, compartilhar captura da vista superior e do nível da rua com o trecho aproximado.

## Próximos trabalhos
Auditoria visual dos encontros asfalto/calçada/guia, piso tátil ilustrativo, materiais de solo e carregamento progressivo por regiões para reduzir tempo de entrada.
