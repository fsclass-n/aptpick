import { createContext, useContext, useEffect, useState } from 'react'

// 일반 페이지는 라이트 고정, 데이터 분석·관리자 화면만 선택적으로 다크 테마 (해당 페이지 루트에 .dark 부여)
const ThemeContext = createContext({ dark: false, toggle: () => {} })

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => localStorage.getItem('aptpick.dashboardDark') === '1')
  useEffect(() => { localStorage.setItem('aptpick.dashboardDark', dark ? '1' : '0') }, [dark])
  return <ThemeContext.Provider value={{ dark, toggle: () => setDark((d) => !d) }}>{children}</ThemeContext.Provider>
}

export const useDashboardTheme = () => useContext(ThemeContext)
