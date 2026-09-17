var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* views/components/ConfirmModal.jsx
 * Modal de confirmación compartido — antes cada vista que necesitaba
 * confirmar una acción destructiva usaba el `confirm()` nativo del
 * navegador, salvo Usuarios.js, que tenía su propio modal a la medida
 * (mismo html.modal/.modal-backdrop, repetido a mano). Se centraliza aquí
 * ESE modal — sin cambiar cómo cada vista decide cuándo mostrarlo.
 */
function ConfirmModal({
  abierto,
  titulo = 'Confirmar',
  mensaje,
  textoConfirmar = 'Confirmar',
  peligroso = false,
  onConfirmar,
  onCancelar,
}) {
  if (!abierto) return null;
  return /*#__PURE__*/_jsxDEV("div", {
    className: "modal-backdrop",
    onClick: e => e.target === e.currentTarget && onCancelar(),
    children: /*#__PURE__*/_jsxDEV("div", {
      className: "modal",
      style: { maxWidth: 380 },
      children: [
        /*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: /*#__PURE__*/_jsxDEV("div", { className: "modal-title", children: titulo }, void 0, false)
        }, void 0, false),
        /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: /*#__PURE__*/_jsxDEV("p", {
            style: { fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 },
            children: mensaje
          }, void 0, false)
        }, void 0, false),
        /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [
            /*#__PURE__*/_jsxDEV("button", { className: "btn btn-secondary", onClick: onCancelar, children: "Cancelar" }, void 0, false),
            /*#__PURE__*/_jsxDEV("button", {
              className: `btn ${peligroso ? 'btn-danger' : 'btn-primary'}`,
              onClick: onConfirmar,
              children: textoConfirmar
            }, void 0, false),
          ]
        }, void 0, true),
      ]
    }, void 0, true)
  }, void 0, false);
}
