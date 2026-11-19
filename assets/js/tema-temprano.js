/* [OF-UI] Tema oscuro sin parpadeo blanco.
 *
 * Se carga en el <head>, SIN defer ni async, antes de la hoja de estilos: así
 * <html data-theme="dark"> ya está puesto cuando el navegador pinta el primer
 * cuadro. Antes el atributo solo lo ponía app.js (un useEffect de React), y
 * entre que la página cargaba y React montaba se veía un destello claro.
 *
 * OF lo hace con un <script> en línea; aquí la CSP del .htaccess no permite
 * scripts en línea (script-src 'self' …), por eso es un archivo.
 *
 * La regla es EXACTAMENTE la de app.js y PortalFamilia.js — no se cambió el
 * comportamiento, solo el momento: preferencia guardada en 'edupago_theme'
 * ('dark' | 'light'); sin ella, el tema del sistema operativo.
 * Claro = sin atributo (la hoja define el claro como valor por defecto).
 */
(function () {
  try {
    var g = localStorage.getItem('edupago_theme');
    var oscuro = g === 'dark' ||
      (g !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (oscuro) document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {
    /* Ventana privada o almacenamiento bloqueado: se queda en claro. */
  }
})();
