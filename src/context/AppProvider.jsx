import { AppContext } from './appContext.js'

export function AppProvider({ children, value = null }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
