# paulianne-fontoura.github.io

Portfolio public de Paulianne Fontoura, publié par GitHub Pages depuis la branche `main`, sans étape de build.

## Organisation

- `index.html` contient tout le texte du site
- `assets/css/main.css` porte la mise en page et la typographie
- `assets/js/main.js` gère le défilement, les apparitions et le pilotage de la scène
- `assets/js/scene.js` dessine la scène 3D en WebGL2, sans bibliothèque
- `assets/fonts` contient Archivo et IBM Plex Mono, sous licence SIL Open Font License 1.1

## Aperçu local

Servir le dossier avec un serveur statique, par exemple

```bash
npx http-server . -p 8080
```

puis ouvrir l'adresse locale indiquée par le serveur.

## Accessibilité et repli

Tout le texte reste dans le HTML. Si le système demande moins d'animations, la scène devient fixe et les apparitions sont immédiates. Sans WebGL2, la page s'affiche avec un fond CSS équivalent.
