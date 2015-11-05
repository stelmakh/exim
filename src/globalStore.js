import Freezer from 'freezer-js';

var freezer;
export default class GlobalStore {
  static getStore() {
    if (!freezer) {
      freezer = new Freezer({});
    }
    return freezer;
  }

  static getState() {
    return this.getStore().get();
  }

  static init(substore, init) {
    let store = this.getState();
    let values = store[substore];

    if (values)
      return values;
    return store.set(substore, init || {})[substore];
  }

  static get(substore, name) {
    let store = this.getState();
    if (!name)
      return store[substore].toJS();
    return store[substore] ? store[substore].toJS()[name] : {};
  }

  static set(substore, name, value) {
    let store = this.getState();
    let values = store[substore];

    if (values)
      values.set(name, value);

    return this.get(substore);
  }
}
