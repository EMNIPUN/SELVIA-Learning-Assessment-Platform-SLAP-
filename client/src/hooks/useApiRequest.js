import { useCallback, useEffect, useState } from 'react'

// Runs `request(signal)` on mount and whenever `deps` change, cancelling the previous call.
// `reload` repeats the request, for example from a "Try again" button. `updateData(update)` replaces the
// loaded data with `update(data)`, for example with a record that a create or update request returned.
// With `enabled: false` nothing is requested until it becomes true, for data that is loaded on demand.
export function useApiRequest(request, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    setState((previous) => ({ ...previous, error: null, loading: true }))

    request(controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ data: null, error, loading: false })
      })

    return () => controller.abort()
  }, [...deps, enabled, attempt])

  const reload = useCallback(() => setAttempt((count) => count + 1), [])
  const updateData = useCallback((update) => setState((previous) => ({ ...previous, data: update(previous.data) })), [])

  return { ...state, reload, updateData }
}
