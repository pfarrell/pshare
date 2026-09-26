// In-process pub/sub for the /jukebox/devices/:id/events SSE endpoint (see
// docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md). One
// process, one Map — this app runs as a single Node process, so there's no
// need for a cross-process broker.
type Listener = (payload: unknown) => void

const deviceListeners = new Map<number, Set<Listener>>()
const profileListeners = new Set<() => void>()

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

  subscribeToProfiles(listener: () => void): () => void {
    profileListeners.add(listener)
    return () => profileListeners.delete(listener)
  },

  broadcastQueueItemAdded(deviceId: number, payload: unknown): void {
    deviceListeners.get(deviceId)?.forEach((listener) => listener(payload))
  },

  broadcastProfilesChanged(): void {
    profileListeners.forEach((listener) => listener())
  },
}
