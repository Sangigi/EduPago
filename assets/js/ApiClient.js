/**
 * ApiClient — cliente HTTP compartido hacia api.php.
 * Antes, cada controller (Auth/Caja/Cliente/Cobro/Productos) reimplementaba
 * su propia función apiPost con exactamente el mismo fetch + header de auth
 * + logout en 401 + error en HTTP no-ok — copiado 5 veces. Se centraliza
 * aquí; los controllers solo la reexportan como su `apiPost` local para no
 * tener que cambiar ninguno de sus call sites.
 */
const ApiClient = (() => {
  async function post(action, body = {}) {
    const token = AuthController.getToken();
    const res = await fetch(`api.php?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401) { AuthController.logout(); window.location.reload(); throw new Error('Sesión expirada. Inicia sesión de nuevo.'); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  return { post };
})();
