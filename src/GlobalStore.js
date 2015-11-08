var globalStore;

export default class GlobalStore {
  static getStore() {
    if (!globalStore) {
      globalStore = new Object();
    }
    return globalStore;
  }

  static init(substore, init) {
    let store = this.getStore();
    let values = store[substore];

    if (values)
      return values;

    store[substore] = init ? init : new Object();
    return store[substore];
  }

  static get(substore, name) {
    let store = this.getStore();
    if (!name)
      return store[substore];
    return store[substore] ? store[substore][name] : {};
  }

  static remove(substore, key) {
    let store = this.getStore()[substore];

    let success = false;
    if (!key) {
      for (let key in store) {
        success = store[key] && delete store[key];
      }
    } else {
     success = store[key] && delete store[key];
    }
    return success;
  }

  static set(substore, name, value) {
    let store = this.getStore();
    let values = store[substore];

    if (values)
      values[name] = value;

    return this.get(substore);
  }
}
