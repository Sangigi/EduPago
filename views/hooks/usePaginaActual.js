/**
 * usePaginaActual — hook compartido para el patrón de paginación repetido de
 * forma independiente en Logs.js y PortalFamilia.js (estado de página actual
 * + función que salta de página con clamp a [1, totalPaginas]). A propósito
 * NO calcula totalPaginas internamente — cada vista sigue calculándolo como
 * ya lo hacía. Se llamaba `usePaginacion`, pero ese nombre ya lo usa
 * `views/components/Paginador.js` (paginación de listas completas ya
 * cargadas, con firma y propósito distintos) — se renombró para no chocar.
 */
function usePaginaActual(totalPaginas = 1) {
  const { useState } = React;
  const [pagina, setPagina] = useState(1);
  const irAPagina = p => setPagina(Math.min(Math.max(1, p), Math.max(1, totalPaginas)));
  return { pagina, setPagina, irAPagina };
}
