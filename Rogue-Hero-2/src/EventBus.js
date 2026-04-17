export class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  // Fire callback exactly once, then auto-remove it
  once(event, callback) {
    const wrapper = (payload) => {
      this.off(event, wrapper);
      callback(payload);
    };
    this.on(event, wrapper);
  }

  off(event, callback) {
    const arr = this.listeners[event];
    if (!arr) return;
    // Swap-remove: O(1), avoids array allocation from filter()
    // Listener order is not guaranteed, so swap with last element is safe.
    // Note: emit() slices before iterating when arr.length > 1, so mid-dispatch removal is safe.
    const idx = arr.indexOf(callback);
    if (idx !== -1) { arr[idx] = arr[arr.length - 1]; arr.pop(); }
  }

  emit(event, payload) {
    const arr = this.listeners[event];
    if (!arr || arr.length === 0) return;
    // Fast path: single listener needs no copy (no mid-dispatch removal possible)
    if (arr.length === 1) { arr[0](payload); return; }
    // Slice to allow safe removal mid-dispatch (e.g. from once())
    const cbs = arr.slice();
    for (let i = 0; i < cbs.length; i++) cbs[i](payload);
  }
}

export const events = new EventBus();
