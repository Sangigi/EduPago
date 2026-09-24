// views/Promotor.js — Panel del rol 'promotor'
//
// Genera y da seguimiento a las ligas de invitación de colegios nuevos,
// exactamente como un distribuidor, pero SIN comisiones.
//
// Por qué no hizo falta tocar nada del cálculo de comisiones: la comisión no
// es una propiedad del rol, es una fila en `distribuidor_referidos`. Esa fila
// solo nace cuando `invitaciones_colegio.distribuidor_id` no es NULL, y esa
// columna solo se llena cuando el rol de quien invita es exactamente
// 'distribuidor' (acciones/invitacion_crear.php). Un promotor cae en el NULL,
// así que jamás genera un referido con comisión.
//
// Toda la UI se reusa de views/components/PanelInvitaciones.js, el mismo
// componente que ya montan Escuelas.js (esSuperAdmin=true) y Distribuidor.js
// (esSuperAdmin=false). Con esSuperAdmin=false el promotor ve solo SUS
// invitaciones y no puede resolverlas a mano — el filtrado por creador ya lo
// hace acciones/invitaciones_listar.php, así que es una garantía de backend,
// no un adorno de pantalla.
//
// `var` y React.createElement directo, como MenuPerfil.js / Provision.js /
// Tesoreria.js: un `const` a nivel raíz tumba toda la app si el archivo se
// carga dos veces, y el shim _jsxDEV trata el 3er argumento como key.

var _hPM = React.createElement;

function Promotor({ user, onLogout, menuPerfil }) {
  return _hPM('div', { style: { minHeight: '100vh', background: 'var(--bg-main)' } },

    _hPM('div', {
      key: 'top',
      style: {
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '14px 20px', borderBottom: '1px solid var(--border-glow)',
        background: 'var(--bg-surface)'
      }
    },
      _hPM('div', { key: 't', style: { fontWeight: 800, fontSize: 16, color: 'var(--ink)' } }, 'Invitaciones a colegios'),
      _hPM('div', { key: 'u', style: { marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-3)' } }, (user && user.nombre) || ''),
      // menuPerfil llega ya armado desde app.js (24-sep-2026): trae editar
      // perfil, cambiar contraseña, cerrar sesión y "Ver la guía otra vez".
      // El || deja el botón suelto como respaldo si la prop no llegara.
      menuPerfil || _hPM('button', { key: 'out', className: 'btn btn-ghost btn-sm', onClick: onLogout }, 'Cerrar sesión')
    ),

    _hPM('div', { key: 'body', style: { padding: 20, maxWidth: 1100, margin: '0 auto' } },
      _hPM('div', {
        key: 'expl',
        style: {
          padding: '12px 14px', marginBottom: 16, fontSize: 12.5, lineHeight: 1.55,
          background: 'var(--accent-glow)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-sm)', color: 'var(--ink-2)'
        }
      }, 'Genera una liga de invitación y mándasela al colegio. Con ella se registran solos, eligen su plan y entran a su periodo de prueba. Aquí ves el avance de cada invitación que hayas generado.'),

      (typeof PanelInvitaciones !== 'undefined')
        ? _hPM(PanelInvitaciones, { key: 'panel', esSuperAdmin: false })
        : _hPM('div', {
            key: 'err',
            style: { padding: 30, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }
          }, 'No se pudo cargar el panel de invitaciones. Recarga la página.')
    )
  );
}
