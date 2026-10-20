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
No piloto, a superfície sob a rua fica 0,34 m abaixo da altura da
faixa de rolamento; entre os passeios e a natureza usa-se uma
transição `smoothstep` por 9 m.

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
| 6.1 | Perfis de relevo por hierarquia de vias, cortes/aterros coerentes e inclinações viárias realistas | Pendente |
| 6.2 | Geometria adaptativa perto de asfalto e cruzamentos (densidade variável, redução de penetração do solo) | Pendente |
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

- O solo é uma grade regular 7 m: em curvas fechadas, uma célula
  ainda pode invadir um limite estreito do asfalto. Melhorar
  tesselação local adaptativa antes de promover a nova arquitetura.
- A cota vem do DEM, não de topografia viária; falsas rampas ainda
  podem existir. Será necessário nivelamento controlado por trecho.
- A malha de asfalto ainda é composta por chunk, usando o halo atual:
  a união topológica global de cruzamentos é uma fase separada.
- A nova grade e o índice espacial podem aumentar CPU/VRAM:
  medir os custos reais e reduzir tiles ativos se necessário.

O estágio 6.0 inicial é uma **prova funcional opt-in**, não um
anúncio de eliminação completa dos bugs dos screenshots.
