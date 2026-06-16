import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";
/* views/components/Badge.jsx */
const fmt = n => new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN'
}).format(n || 0);
const fmtDate = d => new Date(d + 'T12:00').toLocaleDateString('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});
function EstadoBadge({
  estado
}) {
  const map = {
    pagado: 'badge-green',
    pendiente: 'badge-amber',
    cancelado: 'badge-red',
    vencido: 'badge-red'
  };
  const icons = {
    pagado: 'check',
    pendiente: 'warning',
    cancelado: 'close',
    vencido: 'warning'
  };
  return /*#__PURE__*/_jsxDEV("span", {
    className: `badge ${map[estado] || 'badge-gray'}`,
    children: [/*#__PURE__*/_jsxDEV(Icon, {
      name: icons[estado] || 'info',
      size: 11,
      color: "currentColor"
    }, void 0, false), estado]
  }, void 0, true);
}
function MetodoBadge({
  metodo
}) {
  const map = {
    TC: 'badge-blue',
    SPEI: 'badge-purple',
    CoDi: 'badge-green',
    Efectivo: 'badge-gray'
  };
  const icons = {
    TC: 'card',
    SPEI: 'bank',
    CoDi: 'phone',
    Efectivo: 'pay'
  };
  return /*#__PURE__*/_jsxDEV("span", {
    className: `badge ${map[metodo] || 'badge-gray'}`,
    children: [/*#__PURE__*/_jsxDEV(Icon, {
      name: icons[metodo] || 'pay',
      size: 11,
      color: "currentColor"
    }, void 0, false), metodo]
  }, void 0, true);
}
