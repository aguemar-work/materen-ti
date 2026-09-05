// Stub de un asset de `frontend/public/` para los tests de render.
//
// En la app real, `<img src="/logo_materen_sisti.svg">` lo sirve Vite desde
// publicDir. En un test no hay servidor, y Vite intenta resolver esa ruta
// absoluta contra el sistema de archivos y falla. El alias de
// vitest.config.js manda cualquier `/algo.svg` acá.
//
// Mismo patrón que tests/stubs/insforge-sdk.js: lo que se prueba es el
// componente, no el binario del asset.
export default '/asset-de-prueba.svg';
