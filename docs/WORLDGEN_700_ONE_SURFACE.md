# WorldGen 7.0 — Superfície única do Grajaú (experimento)

## O que significa "todas as ruas virarem uma coisa só"

Este protótipo abandona a construção de **placas 3D individuais de
asfalto térreo**. O asfalto das 4.777 vias originais do OSM é desenhado
numa **mesma superfície plana de terreno** em escala horizontal 1:1.
Os cruzamentos que compartilham nós se encontram no desenho contínuo;
nenhum triângulo de pavimento precisa ser soldado depois.

O chão é uma superfície lógica única, H(x,z)=0 no experimento. Os
chunks de 420 m são apenas cópias renderizáveis dos recortes da pintura:
todos usam o mesmo índice global de vias OSM, as mesmas coordenadas e
as mesmas larguras métricas. Renderiza cada chunk com **dois
triângulos de terreno**, mais uma textura 768x768 (gutter de dois pixels).

**Não confundir com um único THREE.Mesh global:** o jogo ainda descarrega
os chunks distantes. A unidade está no material/superfície e nas
coordenadas, preservando desempenho e streaming.

## Regras mantidas

- O minimapa e a cidade leem o mesmo snapshot OSM 1:1.
- O modo plano não inventa junções ou pontes de asfalto faltantes.
- Pontes e túneis, onde o OSM informa camada elevada/rebaixada, ainda
  usam geometria 3D em separado e as distâncias verticais artificiais
  da prova de conceito (5 m por layer).
- Linhas centrais, zebras, calçadas e meio-fios usam os geradores
  existentes e seguem uma etapa posterior de revisão estética.
- O asfalto térreo foi retirado do atlas 3D para evitar desenho duplo
  e z-fighting.
- A textura é gerada do OSM sem dependências CDN adicionais.
- Todos os recursos CanvasTexture e materiais próprios são descartados
  ao descarregar o chunk.

## Como testar

Branch: `experiment/worldgen-70-flat-one-surface-20261021`.

- `/` (na branch) ou `/?worldgen=flat`:
  nova superfície com todas as ruas pintadas.
- `/?worldgen=flat&roads=geometry`: comparação com a geometria
  3D de asfalto da versão plana anterior.
- `/?worldgen=sheet`: motor experimental com relevo anterior.

Não integrar à main até comparar em navegador nos mesmos cruzamentos.
Um link via raw.githack, se utilizado, serve arquivos da branch, sem
criar um verdadeiro deploy de Pages ou Vercel.

## Validação necessária

- Conferir McDonald's → Habib's e mais dois cruzamentos residenciais.
- Conferir se as faixas de pedestres e calçadas coincidem com o asfalto
  e não ficam deslocadas sobre o material.
- Passar sobre duas fronteiras de tiles e retornar: nenhuma linha de
  costura ou atraso permanente da textura pode aparecer.
- Conferir FPS, custo de textura e consumo GPU após dirigir 10 minutos.
- Confirmar que pontes não foram impressas no solo plano.

## Próximas etapas: relevo sem rasgar o asfalto

1. Manter a **mesma máscara e coordenadas de asfalto** no shader/material
   da folha em vez de voltar a reconstruir ruas por chunks.
2. Construir perfil global do relevo DEM suavizado por nós OSM reais.
3. Deformar a **folha única lógica** junto da pintura e das calçadas.
4. Subdividir a grade APENAS onde a inclinação precisa de detalhe;
   preservar bordas compartilhadas com grade canônica.
5. Atualizar física e níveis de pontes/túneis e só depois promover.

Esta é uma prova visual/funcional de unificação. O antigo atlas de
polígonos ainda existe para camadas elevadas e experimentos com
relief; a topologia geométrica não foi transformada em um único buffer
de índices gigantesco.
