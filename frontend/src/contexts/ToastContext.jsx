import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'

const ToastContext = createContext(() => {})
const STYLE = {
  success: ['bg-navy-900 text-white', CheckCircle2, 'text-mint-400'],
  error: ['bg-white text-slate-800 border border-red-200', TriangleAlert, 'text-up'],
  info: ['bg-white text-slate-800 border border-slate-200', Info, 'text-brand-600'],
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const remove = (id) => setToasts((t) => t.filter((x) => x.id !== id))
  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-3), { id, message, type }])
    setTimeout(() => remove(id), 4200)
  }, [])
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[2000] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => {
          const [cls, Icon, iconCls] = STYLE[t.type] || STYLE.info
          return (
            <div key={t.id} className={`pointer-events-auto flex max-w-md animate-fade-up items-start gap-3 rounded-xl px-4 py-3 text-[14px] shadow-float ${cls}`}>
              <Icon size={18} className={`mt-0.5 shrink-0 ${iconCls}`} />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => remove(t.id)} aria-label="닫기" className="opacity-60 hover:opacity-100"><X size={16} /></button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
