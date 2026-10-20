# Buzun Create — Modelador das ruas em 3D

## Objetivo
Editor do **modelo 3D gerado** pelo Buzun, não das coordenadas do OpenStreetMap. OSM continua sendo referência imutável de eixos e conexões viárias. Esta etapa substitui a antiga planta 2D com pontos OSM por uma vista aérea ortográfica da **cena Three.js real**, com pré-visualização das malhas selecionadas.

## Acesso
Use o botão ⚙ no jogo e o login demonstrativo já conhecido. **Aviso:** em GitHub Pages estático, a senha no JavaScript é pública e não constitui autenticação de segurança.

## Ferramentas
- **Selecionar pista:** clique na rua renderizada em 3D; a seção selecionada fica destacada em ciano (asfalto) e verde (calçadas).
- **Mover câmera:** arraste para navegar pela cidade; roda do mouse para zoom; botões de zoom, centralizar no carro e ver região inteira.
- **Puxar asfalto:** depois de selecionar uma pista, arraste em direção à borda desejada. O valor de largura da via se ajusta em metros; todas as faixas são geradas novamente no Apply.
- **Puxar calçada:** arraste a borda externa do passeio, mudando sua largura por lado.
- **Altura do meio-fio (0–0,40 m):** altera a posição vertical da calçada e a face lateral do meio-fio.
- **Recuo do meio-fio nas esquinas (0–4 m):** recorta as pontas do meio-fio além da interseção, sem mudar as coordenadas do OSM.
- **Salvar modelagem:** armazena as propriedades daquela via no navegador.
- **Aplicar no jogo:** reconstrói o modelo viário a partir do OSM original **mais overrides de geometria**, incluindo terreno, asfalto e calçadas.
- **Desfazer / reverter via / exportar / importar JSON:** versões portáteis das correções.

## Visualização, desempenho e limitações
- O canvas Three.js do jogo é movido temporariamente para dentro do editor: **não há segunda cópia de WebGL ou da cidade**.
- A visualização da via em edição é uma prévia colorida e translúcida sobre o modelo atual. O modelo permanente é atualizado após **Aplicar no jogo**; redução de largura pode mostrar temporariamente o asfalto antigo por baixo do destaque. O recuo nas esquinas só pode ser conferido na malha reconstruída.
- Em visualização afastada, o motor ainda desenha o terreno e a malha somente nos setores próximos da câmera aérea para preservar desempenho.
- Este protótipo edita uma **via OSM por vez**, não cada vértice de suas faixas e não desenha geometrias arbitrárias. A edição por ponto geográfico foi retirada do painel principal.
- Os overrides são salvos no `localStorage`, sem alteração remota. A cidade não se torna automaticamente correta para todos os jogadores; exporte o JSON para manter e depois versionar as correções.

## Arquivos
- `src/road-admin.js`: editor aéreo 3D, seleção e interação.
- `src/road-model-preview.js`: prévia da malha asfáltica, passeio e bordas.
- `src/road-editor-model.js`: sparse overrides de largura, passeio, altura e recuo com formato JSON v1 e retrocompatibilidade.
- `src/city-road-mesh.js` e `src/road-corridor.js`: aplicação das medidas ao gerador de calçada/guia.

## Testes
1. Dirija até uma esquina, pare e entre no Admin.
2. Mova a câmera, selecione a rua que precisa de ajuste. Veja as bordas ciano/verde destacadas sobre o 3D.
3. Mude a largura da pista, altura do meio-fio ou recuo de esquina. Observe a prévia.
4. Salve e pressione **Aplicar no jogo**. A malha recalcula após a recarga; inspecione novamente a esquina.
5. Exporte o JSON e guarde-o.
