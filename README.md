# Butaca

Web app personal (PWA) para el iPhone: registrar lo que he visto, clasificarlo con tags y tres notas (la mía, IMDb y Rotten Tomatoes), encontrar qué ver según el momento y enterarme de lo nuevo en mis plataformas y de las temporadas nuevas de mis series.

Todo vive en el propio iPhone (IndexedDB). No hay servidor ni cuenta. Los datos de catálogo vienen de TMDB y las notas de OMDb.

## Instalar en el iPhone

1. Abre la dirección de la app en **Safari**.
2. Toca **Compartir** → **Añadir a pantalla de inicio**.
3. Abre Butaca desde el icono nuevo. La primera vez te pide dos claves gratuitas:
   - **TMDB**: themoviedb.org → Ajustes → API → «API Read Access Token» (el largo). Uso personal.
   - **OMDb**: omdbapi.com → «API Key» (llega por correo; hay que activarla con el enlace).
4. Las claves se escriben en la propia app y se guardan solo en ese iPhone. No van al código ni al repositorio.

Safari y el icono de la pantalla de inicio no comparten datos: usa siempre el icono.

## Desarrollo

```bash
npm install
npm run dev      # servidor de prueba
npm test         # pruebas
npm run build    # compila a dist
npm run icons    # regenera los PNG del icono desde public/icons/icon.svg
```

Abrir la app con `?mock` (`http://localhost:5174/?mock`) usa un TMDB y un OMDb simulados, solo en desarrollo: sirve para ver las pantallas sin claves.

Pila: Vite, React 18, TypeScript, React Router (`HashRouter`), `idb` y `vite-plugin-pwa`. Sin librería de interfaz: el CSS es propio y sale de la especificación.

## Publicar en GitHub Pages

El flujo `.github/workflows/deploy.yml` prueba, compila y publica en cada push a `main`. Una sola vez, en el repositorio: **Settings → Pages → Source: GitHub Actions**. La app usa rutas con `#` y `base: './'`, así que funciona desde la subruta de Pages.

## Atribuciones

Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB. Datos de plataformas: JustWatch, vía TMDB. Notas: OMDb API.
