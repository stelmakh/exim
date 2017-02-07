import utils from './utils';
import Immutable from 'immutable';

let globalStore, stores;

export default class GlobalStore {
  static getStore() {
    if (!globalStore) {
      globalStore = Immutable.Map();
    }
    return globalStore;
  }

  static setStore(store) {
    return globalStore = store;
  }

  static getSubstore(path, init) {
    const store = this.getStore();
    const pathBits = path.split('/');
    let values = store, found;
    if (found = values.getIn(pathBits)) {
      return found;
    } else {
      values = values.setIn(pathBits, Immutable.fromJS(init !== undefined ? init : {}));
      return this.setStore(values);
    }
  }

  static setSubstore(path, newValues) {
    const store = this.getStore();
    const pathBits = path.split('/');
    return this.setStore(store.setIn(pathBits, Immutable.fromJS(newValues !== undefined ? newValues : {})));
  }

  static init(path, init, store) {
    if (stores == null) stores = {};
    stores[path] = store;
    return this.getSubstore(path, init);
  }

  static get(substore, name) {
    const values = this.getSubstore(substore);
    if (!name) return values.toJS();
    const value = values ? values.get(name) : {};

    return (value && typeof (value.toJS) === 'function') ? value.toJS() : value;
  }

  static remove(substore, key) {
    const values = this.getSubstore(substore);
    this.setSubstore(substore, key ? values.delete(key) : {});
    return values.get(key);
  }

  static set(substore, name, value) {
    const values = this.getSubstore(substore);
    if (values) {
      this.setSubstore(substore, values.set(name, Immutable.fromJS(value)));
    }
    return value;
  }

  static findStore(path) {
    return stores[path];
  }
}
