var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* views/components/EmojiPicker.jsx — selector visual de emojis (sin teclado emoji del SO) */

const EMOJI_CATEGORIAS = [
  {
    id: 'escuela',
    label: 'Escuela',
    emojis: ['🏫','🏛️','🎓','📚','✏️','📐','🔬','🧪','🎨','🎵','⚽','🏀','🏃','💻','🧮','🖍️','📏','🗒️','🏆','🎒','🌎','📖','🧬','🎭']
  },
  {
    id: 'pagos',
    label: 'Pagos',
    emojis: ['💰','💳','🧾','💵','💴','💶','💷','🏦','📄','📦','🛒','🎉','🎁','⭐','❤️','🔔','📅','🕐','✅','⚠️','💼','📊','🔒','🪙']
  },
  {
    id: 'comida',
    label: 'Comida',
    emojis: ['🍎','🥪','🍕','🍔','🥤','☕','🍪','🍫','🍇','🥗','🧃','🍿','🥛','🍌','🍉','🌮','🍦','🥐']
  },
  {
    id: 'transporte',
    label: 'Transporte',
    emojis: ['🚌','🚐','🚗','🚲','🅿️','⛽','🛣️','🚏','🛴','🚦']
  },
  {
    id: 'general',
    label: 'General',
    emojis: ['😀','😎','👍','🙌','🤝','🏠','🏢','📍','🌟','🔥','💡','📢','🎯','🧰','🗂️','📌','🧩','🪪','🔧','📋']
  }
];

function EmojiPicker({ value, onChange, size }) {
  const { useState, useRef, useEffect } = React;
  const [open, setOpen] = useState(false);
  const [catId, setCatId] = useState(EMOJI_CATEGORIAS[0].id);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const categoria = EMOJI_CATEGORIAS.find(c => c.id === catId) || EMOJI_CATEGORIAS[0];

  return _jsxDEV("div", {
    ref,
    style: { position: 'relative', display: 'inline-block' },
    children: [
      _jsxDEV("button", {
        type: 'button',
        className: 'form-input',
        onClick: () => setOpen(o => !o),
        title: 'Elegir emoji',
        style: {
          fontSize: size || 22,
          width: 56,
          height: 44,
          textAlign: 'center',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0
        },
        children: value || '🙂'
      }, void 0, false),

      open && _jsxDEV("div", {
        className: 'card',
        style: {
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          zIndex: 60,
          width: 270,
          padding: 10,
          boxShadow: 'var(--shadow-md)'
        },
        children: [
          _jsxDEV("div", {
            style: { display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' },
            children: EMOJI_CATEGORIAS.map(c => _jsxDEV("button", {
              type: 'button',
              className: `btn btn-sm ${catId === c.id ? 'btn-primary' : 'btn-secondary'}`,
              onClick: () => setCatId(c.id),
              children: c.label
            }, c.id, false))
          }, void 0, true),

          _jsxDEV("div", {
            className: 'emoji-picker-grid',
            children: categoria.emojis.map(em => _jsxDEV("button", {
              type: 'button',
              className: 'emoji-picker-item',
              onClick: () => { onChange(em); setOpen(false); },
              children: em
            }, em, false))
          }, void 0, true),

          _jsxDEV("input", {
            className: 'form-input',
            style: { marginTop: 8, fontSize: 13 },
            placeholder: 'O escribe/pega tu propio emoji…',
            value: value || '',
            onChange: e => onChange(e.target.value)
          }, void 0, false)
        ]
      }, void 0, true)
    ]
  }, void 0, true);
}