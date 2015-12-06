let chai = require('chai');
var sinon = require("sinon");
var sinonChai = require("sinon-chai");

chai.use(sinonChai);
chai.should();

import Store from '../src/Store'
import { Action, Actions } from '../src/Actions'

let dummyConfig = {
  path: 'test'
}

describe('Action', () => {
  describe('#constructor()', () =>  {
    it('should create action', () => {
      let action = new Action({});

      action.should.be.an.instanceOf(Object);
    });

    it('should initialize the name', () => {
      let name = 'somename', params = {name}
      let action = new Action(params);

      action.name.should.equal(name);
    });

    it('should initialize a single store', () => {
      let store = 'single store', params = {store}
      let action = new Action(params);

      action.stores.should.deep.equal([store]);
    });

    it('should initialize multiple stores', () => {
      let stores = ['store1', 'store2'], params = {stores}
      let action = new Action(params);

      action.stores.should.deep.equal(stores);
    });
  });

  describe('#run()', () =>  {
    it('should be called when store.actions.actionName is called', () => {
      let name = 'action';
      let params = {name};

      let config = Object.create(dummyConfig);
      let action = new Action(params);

      sinon.spy(action, 'run');

      config.actions = [action];
      config.action = sinon.spy();

      let store = new Store(config);

      store.actions.action();

      action.run.should.have.been.calledOnce;
    });

    it('should execute action', () => {
      let name = 'action';
      let params = {name};

      let config = Object.create(dummyConfig);
      let action = new Action(params);
      let handler = sinon.spy();

      config.actions = [action];
      config.action = handler;

      let store = new Store(config);

      store.actions.action().then(() => {
        handler.should.have.been.calledOnce;
      });
    });
  });
});
