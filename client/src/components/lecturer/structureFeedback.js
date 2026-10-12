import { createContext, useContext } from 'react'

// One message at a time for the whole course structure, shown in the list where the change happened:
// feedback is { key, type: 'success' | 'error', message } and `notify(null)` clears it.
export const StructureFeedbackContext = createContext({ feedback: null, notify: () => {} })

export function useStructureFeedback() {
  return useContext(StructureFeedbackContext)
}
