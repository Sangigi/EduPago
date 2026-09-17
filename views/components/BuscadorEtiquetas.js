// views/components/BuscadorEtiquetas.js
// Buscador acumulativo: cada Enter convierte lo escrito en una etiqueta.
// Todas las etiquetas deben coincidir a la vez (Y lógica), así se va
// acotando: "García López" + nombre del tutor + matrícula.
// Backspace con el campo vacío borra la última etiqueta.

// `var` a proposito: con `const`, cargar este archivo dos veces lanza
// "Identifier already declared" y ese error tumba toda la aplicacion.
var _hBE = React.createElement;

function BuscadorEtiquetas({ etiquetas, onCambio, placeholder, sugerencias, autoFocus }) {
  const { useState, useRef } = React;
  const [texto, setTexto] = useState('');
  const inputRef = useRef(null);

  const agregar = valor => {
    const v = String(valor || '').trim();
    if (!v) return;
    // Sin duplicados, sin distinguir mayúsculas
    const yaEsta = etiquetas.some(e => e.toLowerCase() === v.toLowerCase());
    if (!yaEsta) onCambio(etiquetas.concat([v]));
    setTexto('');
  };

  const quitar = i => onCambio(etiquetas.filter((_, n) => n !== i));

  const alTeclear = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      agregar(texto);
    } else if (e.key === 'Backspace' && texto === '' && etiquetas.length > 0) {
      // Solo borra la última cuando el campo ya está vacío, para no
      // eliminar etiquetas mientras se corrige lo que se está escribiendo.
      e.preventDefault();
      quitar(etiquetas.length - 1);
    } else if (e.key === 'Escape') {
      setTexto('');
    }
  };

  return _hBE('div', null,
    _hBE('div', {
      className: 'buscador-etiquetas',
      onClick: () => { if (inputRef.current) inputRef.current.focus(); },
      children: [
        _hBE('span', { key: 'ic', className: 'be-icono' },
          _hBE(Icon, { name: 'search', size: 15, color: 'currentColor' })
        ),
        etiquetas.map((et, i) => _hBE('span', { key: 'e' + i, className: 'be-chip' },
          _hBE('span', { key: 't' }, et),
          _hBE('button', {
            key: 'x',
            type: 'button',
            className: 'be-chip-x',
            title: 'Quitar',
            onClick: ev => { ev.stopPropagation(); quitar(i); },
            children: '\u00d7'
          })
        )),
        _hBE('input', {
          key: 'in',
          ref: inputRef,
          className: 'be-input',
          value: texto,
          autoFocus: !!autoFocus,
          onChange: e => setTexto(e.target.value),
          onKeyDown: alTeclear,
          onBlur: () => { if (texto.trim()) agregar(texto); },
          placeholder: etiquetas.length === 0
            ? (placeholder || 'Escribe y presiona Enter para acotar\u2026')
            : 'Agregar otro dato\u2026'
        }),
        etiquetas.length > 0 ? _hBE('button', {
          key: 'cl',
          type: 'button',
          className: 'be-limpiar',
          title: 'Limpiar todo',
          onClick: ev => { ev.stopPropagation(); onCambio([]); setTexto(''); },
          children: 'Limpiar'
        }) : null
      ]
    }),
    (sugerencias && sugerencias.length > 0 && etiquetas.length === 0)
      ? _hBE('div', { className: 'be-ayuda' },
          'Puedes combinar: ' + sugerencias.join(' \u00b7 '))
      : null
  );
}

// Devuelve true si el objeto coincide con TODAS las etiquetas.
// campos: array de funciones que extraen texto del registro.
function coincideEtiquetas(registro, etiquetas, campos) {
  if (!etiquetas || etiquetas.length === 0) return true;
  const heno = campos
    .map(f => {
      try { return f(registro); } catch (e) { return ''; }
    })
    .filter(v => v !== null && v !== undefined)
    .join(' \u00b7 ')
    .toLowerCase();
  return etiquetas.every(et => heno.includes(String(et).toLowerCase().trim()));
}
