# Buzun — base geométrica 1:1 (somente vias)

## Objetivo

**1 metro nas coordenadas do recorte = 1 unidade no Three.js.** Sem multiplicar artificialmente coordenadas, distâncias, curvas ou inclinações. A rota entre os estabelecimentos tem **1.158,84 metros**, pela soma dos segmentos do eixo viário OSM; o manifesto existente arredonda para 1.159 metros.

## Neste modo de teste

- Prédios, muros, vitrines, fachadas, letreiros, postes, árvores e placas de cenário **não são renderizados**. Arquivos e dados preservados.
- Rodovias e vias laterais: posições e curvas seguem **as coordenadas OSM do recorte**, sem escala horizontal diferente de 1.
- Relevo SRTM e inclinações seguem a interpolação existente. Câmera é aproximada e baixa; carro preserva dimensões em metros.
- Percurso, minimapa, HUD e pontos de início/fim continuam funcionais. Pontos de referência são âncoras de navegação **sem modelos ou letreiros 3D**.
- Larguras têm *limite importante*: **nenhuma das 44 vias deste arquivo contém largura medida**; portanto, a largura desenhada ainda é uma estimativa por classe de rua. Não apresentar largura de rua como “perfeita” sem levantamentos adicionais (ex.: largura `width` do OSM, levantamento municipal ou medição de campo).

## Precisão e próximos passos

As coordenadas foram derivadas de lat/lon por uma projeção local aproximada e armazenadas arredondadas em 0,1 m; SRTM é um modelo de elevação com precisão limitada. Este modo é **escala nominal 1:1 dos dados do projeto**, não uma garantia de fidelidade centimétrica do pavimento real.

Para melhorar a medição da faixa de rolamento: adicionar `widthMeters` às vias que têm uma medição verificável e validar largura de calçadas/canteiros individualmente. `src/metric-audit.js` identifica vias estimadas versus medidas; atualizar a origem e construir testes antes de alterar o gerador. Nunca reduzir a distância da rota para “bater” com o comprimento em linha reta.

## Validação

- `npm run verify`
- Iniciar no McDonald's e rodar até o Habib's, checando que a rota é de cerca de 1.159 m.
- Verificar se todos os volumes de prédios, placas, postes e árvores estão de fato ausentes, inclusive os marcos Mc Donaits e HabiBuz.
- Verificar terreno, bifurcações e cruzamentos em PC e celular; relevo não deve mudar quando reativar edifícios.
- `roadsOnly: true` no ponto de inicialização seleciona esta versão temporária. Remover a opção após acertar geometrias/medidas.
