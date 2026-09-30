// In-process pub/sub for the /jukebox/devices/:id/events SSE endpoint (see
// docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md). One
// process, one Map — this app runs as a single Node process, so there's no
// need for a cross-process broker.
type Listener = (payload: unknown) => void

const deviceListeners = new Map<number, Set<Listener>>()
const profileListeners = new Set<() => void>()
// Remote-control commands (toggle/next/prev) are kept apart from queue items so
// each SSE event type has its own subscription and an unrelated listener can
// never receive a command by accident.
const commandListeners = new Map<number, Set<Listener>>()

export const sseBroadcaster = {
  subscribeToDevice(deviceId: number, listener: Listener): () => void {
    if (!deviceListeners.has(deviceId)) deviceListeners.set(deviceId, new Set())
    const set = deviceListeners.get(deviceId)!
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size === 0) deviceListeners.delete(deviceId)
    }
  },

  subscribeToCommands(deviceId: number, listener: Listener): () => void {
    if (!commandListeners.has(deviceId)) commandListeners.set(deviceId, new Set())
    const set = commandListeners.get(deviceId)!
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size === 0) commandListeners.delete(deviceId)
    }
  },

  subscribeToProfiles(listener: () => void): () => void {
    profileListeners.add(listener)
    return () => profileListeners.delete(listener)
  },

  broadcastQueueItemAdded(deviceId: number, payload: unknown): void {
    deviceListeners.get(deviceId)?.forEach((listener) => listener(payload))
  },

  // Returns how many kiosks received it: 0 means nothing is listening, which
  // the caller reports as "not connected" instead of pretending it worked.
  broadcastPlaybackCommand(deviceId: number, command: unknown): number {
    const listeners = commandListeners.get(deviceId)
    listeners?.forEach((listener) => listener(command))
    return listeners?.size ?? 0
  },

  broadcastProfilesChanged(): void {
    profileListeners.forEach((listener) => listener())
  },
}
