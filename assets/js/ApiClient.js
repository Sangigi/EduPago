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
    // 402 = suscripción vencida o prueba terminada (ver el candado en api.php).
    //
    // NO se cierra la sesión: el admin tiene que poder seguir dentro para
    // llegar a "Mi suscripción" y pagar. Lo que se hace es devolver el error
    // tal cual del backend, que ya trae el texto listo para enseñar, y marcar
    // la excepción con `codigo` para que quien la reciba pueda mandar al
    // usuario a la pantalla de pago en vez de enseñar un error genérico.
    if (res.status === 402) {
      const j402 = await res.json().catch(() => null);
      const err = new Error((j402 && j402.error) || 'Tu suscripción venció.');
      err.codigo = (j402 && j402.codigo) || 'suscripcion_vencida';
      throw err;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  return { post };
})();
