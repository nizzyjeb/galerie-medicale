import { useEffect, useRef } from 'react'

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef()

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Ajuster position si déborde hors de l'écran
  const menuWidth = 200
  const menuHeight = items.length * 38 + 12
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x
  const adjustedY = y + menuHeight > window.innerHeight ? y - menuHeight : y

  return (
    <div ref={ref} style={{
      position: 'fixed',
      top: adjustedY,
      left: adjustedX,
      zIndex: 9999,
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      boxShadow: '0 8px 30px rgba(0,0,0,.15)',
      minWidth: menuWidth,
      padding: '6px 0',
      fontFamily: 'var(--font)',
      animation: 'fadeIn .1s ease',
    }}>
      <style>{`@keyframes fadeIn { from { opacity:0; transform:scale(.96) } to { opacity:1; transform:scale(1) } }`}</style>
      {items.map((item, i) => item === 'divider'
        ? <div key={i} style={{ height: 1, background: '#f3f4f6', margin: '4px 0' }} />
        : (
          <button key={i} onClick={() => { item.action(); onClose() }}
            disabled={item.disabled}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '8px 16px',
              background: 'none', border: 'none', cursor: item.disabled ? 'not-allowed' : 'pointer',
              fontSize: 13, color: item.danger ? '#dc2626' : item.disabled ? '#aaa' : '#2C2C2C',
              textAlign: 'left', transition: 'background .1s',
              fontFamily: 'var(--font)',
            }}
            onMouseEnter={e => { if (!item.disabled) e.target.style.background = item.danger ? '#fef2f2' : '#f9fafb' }}
            onMouseLeave={e => { e.target.style.background = 'none' }}
          >
            <span style={{ fontSize: 15, width: 18, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  )
}
