# Buzun WorldGen 7.4 — Relevo vetorial + editor da geometria visual

## Contexto
A v7.3.1 corrigiu parcialmente a costura de chunks e apresentou ~50 FPS
no Ultra plano. Agora o jogo deve voltar a ter ladeiras, **sem reconstruir
a estrutura da malha por setor**. Alterações manuais devem afetar o
vetor desenhado, NUNCA a geometria oficial OSM.

## Preview (branch experimental)
- `/?worldgen=flat&roads=vector&debug=worldgen`: nesta branch começa com
  relevo via DEM Mapzen/Terrarium (quando disponível), usando um campo
  global de altitude H(X,Z).
- `/?worldgen=flat&roads=vector&relief=flat&debug=worldgen`: mesma
  branch, mesma geometria, porém completamente plana. Ideal para
  comparação no mesmo cruzamento.
- Ultra continua como padrão; Equilibrado e Econômico estão no menu.

## Como a malha segue as ladeiras
- A geometria lógica 2D é construída do snapshot OSM 1:1; não é alterada
  pelos chunks.
- O WorldSheet global recebe DEM e um perfil de inclinação reconciliado
  por nós reais do OSM. O campo `surfaceHeight(x,z)` usa essa referência
  e, quando há correções manuais de Y, as aplica suavemente a um raio
  de 18 metros. **O MESMO campo H** alimenta o terreno quadriculado, os
  triângulos vetoriais e a altura usada pelo carro.
- Segmentos vetoriais de comprimento longo são divididos em passos
  de até 4 metros antes de amostrar alturas, inclusive em curvas.
  Alteramos APENAS Y: os X/Z continuam derivados dos caminhos OSM.
- O relevo do terreno passa de um quad gigante plano por chunk para
  grade de 52 segmentos em cada tile de 420m, sempre calculada da
  MESMA função H. As costuras dos tiles preservam coordenadas
  canônicas de mundo.
- O asfalto usa uma pequena folga vertical de 22cm para não ficar
  escondido sob a malha relativamente grosseira de terreno. Isto é
  um **piloto visual**, não uma reconstrução topográfica detalhada
  do leito viário. A malha do terreno ainda pode necessitar malha
  adaptativa para curvas/elevações muito fechadas.

## Editor administrativo: pontos e arestas
- Abrir BUZUN CREATE ⚙ (credenciais existentes do protótipo são
  demonstrativas; NÃO oferecem autenticação real).
- Selecionar rua, escolher **Mover vértice** ou **Mover aresta**.
- Pontos amarelos = nós da centerline visual, linha azul = arestas.
  Arrastar normalmente = posição horizontal X/Z.
  **Shift + arrastar** = deslocamento vertical Y.
- As modificações são deslocamentos métricos de até 30m por eixo
  por ponto, nunca mudanças no ID, no OSM, na navegação nem em
  qualquer snapshot oficial.
- Ao soltar, a correção é salva no armazenamento local do navegador.
  **APLICAR NO JOGO** recarrega a malha 3D e o terreno, incluindo
  as alterações verticais suavizadas no campo global H.
- Também é possível desfazer, restaurar uma rua, importar/exportar
  arquivos JSON. Arquivos podem ser guardados em outra máquina.
- O visual 3D do editor funciona como prévia imediata da centerline.
  O mundo inteiro é reconstruído apenas ao clicar em Aplicar.

## Limitações / QA de aceitação
1. Executar o teste McDonald's → Habib's na Belmira Marin, comparando
   plano e DEM, vendo se as esquinas com inclinação não viram escadas.
2. Conferir se as alturas dos crossings/stripe antigos do compositor
   seguem visualmente o asfalto vetorial: eles não estão unificados
   nesta etapa e ainda podem exibir discrepâncias.
3. Depois de arrastar um ponto em X/Z, verificar se as novas bordas
   continuam consistentes sem criar calçada sobre pista vizinha.
4. Mover um ponto Y e confirmar que não existe buraco no solo próximo
   ao mesmo ponto; o efeito perde força gradualmente em 18m.
5. FPS/tempo de construção de setor sob a grade 52 e vetores 3D:
   qualidade não pode ser promovida à produção sem benchmark do usuário.
6. Fonte DEM Mapzen pode falhar em conexão; motor cai para o
   relevo de reserva do projeto e deve avisar que não é levantamento.
7. Preview e PR **não alteram main**. Não confundir senha do editor
   estático com controle de acesso seguro na internet.

## Próximas iterações
- Malha adaptativa que siga a fronteira vetorial nas interseções
  complexas com Y variável (em vez de grid genérica 8m);
- Máscara geométrica / união topológica em cruzamentos reais;
- Alturas específicas para bridges/tunnels e faixas com base na mesma
  malha oficial.
