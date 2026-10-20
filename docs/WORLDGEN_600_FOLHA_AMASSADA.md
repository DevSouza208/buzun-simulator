# Buzun WorldGen 6.0 — Folha Amassada (plano e piloto)

## Visão

A cidade é uma única **superfície lógica H(x,z)**; os chunks não
têm autoridade própria sobre geometria ou elevação. Ruas são faixas
asfaltadas sobre o mesmo relevo (ou pontes acima dele), não buracos
removidos do terreno preenchidos por peças independentes.

Meta visual: relevo low poly orgânico, na linha do Infinite Driving
como inspiração de linguagem visual, mas com **ruas reais 1:1 do OSM**,
declives reais aproximados por DEM e orientação viária preservada.

**O 6.0 não significa necessariamente um único draw call ou um único
Mesh Three.js.** Significa um mesmo campo global de alturas com fronteiras
de chunks que amostram exatamente as mesmas coordenadas. Cada chunk
continua sendo uma partição descartável do mundo para renderização.

## Fundamentos

`naturalHeight(x,z)`: DEM Mapzen/Terrarium já carregado pelo app,
em metros locais; nenhuma ondulação artificial extra na zona real.

`roadGrade(way,d)`: o perfil canônico único da via completa,
amostrado/alisado ao longo do seu eixo global, usando as junções
compatíveis do OSM, não subtrechos escolhidos por chunk.

`heightWorld(x,z)`: terreno natural fora dos corredores, que se
aproxima de `roadGrade` nas ruas sem permitir cortes transparentes.
Na fase 6.1, a folha sustenta a pista 0,16 m abaixo da cota base,
sobe suavemente para a base da calçada (0,045 m abaixo dela) e
retorna ao terreno natural em um ombro com `smoothstep` de 9 m.
Cruzes de vias conectadas por um nó OSM podem influenciar o mesmo ponto;
vias paralelas não são fundidas por simples proximidade.

`worldSheet.sectionsFor(way)` alimenta os vértices e o índice de
altura do asfalto; `worldSheet.roadAt(x,z)` alimenta o veículo e a
inclinação do terreno. O mesmo modelo funciona antes e depois de
carregar/descarregar qualquer chunk.

## Ordem da execução

| Fase | Escopo | Estado |
| --- | --- | --- |
| 6.0.1 | Altura global H(x,z), indexada por vias e DEM, perfil canônico completo por rua | Implementado no piloto |
| 6.0.2 | Malha de terreno 420 m, grade 7 m com bordas iguais, sem recortar vazios | Implementado no piloto |
| 6.0.3 | Asfalto e física consultam os mesmos perfis canônicos, inclusive sem chunk carregado | Implementado no piloto |
| 6.0.4 | Inicialização com `?worldgen=sheet`, mantendo a versão estável como padrão | Implementado no piloto |
| 6.1 | Perfil lateral em três zonas e influência de braços conectados no cruzamento (corte/aterro por hierarquia ainda pendente) | Piloto implementado |
| 6.2 | Grade 4 m com colar conservador para impedir chão passando por cima do asfalto (tesselação adaptativa depois) | Piloto implementado |
| 6.3 | Cruzamentos: união topológica única e cota de concordância sem sobreposição ou buracos | Pendente |
| 6.4 | Pintura/materiais viários na folha e correção de zebra, calçadas e bordas | Pendente |
| 6.5 | LOD por distância; carregamento assíncrono, métricas de FPS e cache | Pendente |
| 6.6 | Promover folha ao modo padrão apenas depois dos testes visuais | Pendente |

## Regras de segurança da geometria

- Somente vias com `physicalLayer===0` influenciam o terreno.
  Pontes e túneis continuam como estruturas separadas; nunca nivelar o
  terreno na altura do viaduto.
- OSM não mede a altura da pista com precisão suficiente para garantir
  rampas sem buracos em todos os cruzamentos; conservar os dados originais.
- Qualquer ponto `heightWorld(x,z)` é determinístico e independente de
  carregamento, ordem de chunks, câmera ou velocidade do carro.
- O terreno não utiliza `alphaMap` nem `alphaTest`: jamais existe céu
  aparecendo porque uma máscara retirou o solo.
- Faixas, calçadas e asfalto continuam com geometrias separadas durante
  o piloto; não prometer que o compositor global já uniu toda a malha.

## Teste com o Buzun

- Produção atual: `/`, streaming v5.21 sem alterações.
- Piloto: `/?worldgen=sheet&debug=worldgen`.
- Fazer percurso McDonald's → Habib's; capturar o mesmo
  cruzamento em declive (prints de 20/10/2026).
- Verificar penetração do terreno pela pista, degraus na física,
  materiais e transparências, FPS médio e carregamento ao cruzar
  fronteiras de 420m e 880m.
- Voltar à região inicial após andar 2 km e comparar alturas,
  geometria, FPS e consumo de memória.
- Testar ponte e túnel onde houver referência confiável.
- Meta preliminar: >40 FPS no PC de referência, sem aberturas e
  sem degraus de colisão perceptíveis; orçamento móvel deve ser
  medido antes da promoção.

## Riscos e próximos passos

- O solo agora é uma grade regular 5 m: em curvas fechadas, uma célula
  ainda ainda pode invadir um limite estreito do asfalto. Melhorar
  tesselação local adaptativa antes de promover a nova arquitetura.
- A cota vem do DEM, não de topografia viária; falsas rampas ainda
  podem existir. Será necessário nivelamento controlado por trecho.
- A malha de asfalto ainda é composta por chunk, usando o halo atual:
  a união topológica global de cruzamentos é uma fase separada.
- A nova grade e o índice espacial podem aumentar CPU/VRAM:
  medir os custos reais e reduzir tiles ativos se necessário.

O estágio 6.0 inicial é uma **prova funcional opt-in**, não um
anúncio de eliminação completa dos bugs dos screenshots.


## Alterações 6.1 (preview `worldgen=sheet`)

- Malha do terreno: 84 subdivisões em 420 m = 5 m (antes 60 = 7 m).
- Limite de 32 tiles ativos para cobrir inteiramente os setores no raio
  de 900 m: um limite experimental de 18 criava novas bordas vazias.
  O consumo de GPU com grade 5 m deve ser medido no navegador antes de
  aplicar LOD por distância sem quebrar as costuras.
- Perfil lateral em três zonas contínuas: 0,16 m sob asfalto, transição até
  a base da calçada e blend até relevo natural em 9 m.
- Cruzamentos: amostra até cinco vias candidatas, deduplicando trechos da
  mesma via. Só aceita influência cruzada de ruas efetivamente conectadas
  por nós de junção OSM próximos; diferenças verticais maiores que
  0,65 m são ignoradas.
- Nas faixas de rolamento e calçadas, limita a altura da folha para não
  ultrapassar o piso renderizado nas junções.
- Todos esses ajustes só se aplicam a `worldgen=sheet`, sem alterar
  o gerador `stream` usado pelo endereço principal.

**Próximas validações:** cruzamentos da Belmira Marin, inclinação de rampas,
custo de geração da primeira região, FPS contínuo e faixa de pedestre.
A 6.1 ainda **não une os polígonos de asfalto num único objeto topológico**:
essa correção continua planejada na fase 6.3.


## Correção 6.2 — solo atravessando pista (print v0.1.76)

O visual da versão anterior mostrou uma **ponta triangular de chão atravessando o asfalto**. A malha de 5 m e o suporte restrito ao centro da pista não bastavam para prevenir interpolação de triângulos no espaço entre vértices.

- Grade 420 m: 105 células de 4 m de cada lado (antes 84 células de 5 m).
- Amostras do terreno adotam `sheet.tileSample(x,z)` e não só
  `sheet.height(x,z)`.
- O campo `meshHeight` utiliza um anel de segurança do tamanho da
  diagonal de uma célula (`sqrt(2)*4+0.35 m`), reduzindo a malha sob
  asfalto próximo e soltando gradualmente a influência após 5,5 m.
- Todo asfalto térreo detectado no mesmo ponto limita a altitude
  do terreno: proteção não depende de um único eixo escolhido nem
  da presença de uma junção OSM.
- A física fora da pista usa a mesma superfície de terreno mostrada,
  preservando `roadAt` para piso da pista e calçadas.

**Atenção:** mais polígonos custam processamento. Mesmo mantendo 32
tiles possíveis, esta etapa deve ser conferida em jogo para decidir
se será necessário LOD adaptativo em chão distante. A união global do
asfalto e dos cruzamentos continua pendente na 6.3.
