let chai = require('chai');
var sinon = require("sinon");
var sinonChai = require("sinon-chai");
var chaiAsPromised = require("chai-as-promised");


chai.use(sinonChai);
chai.use(chaiAsPromised);
chai.should();

import Store from '../src/Store'
import { Action, Actions } from '../src/Actions'

let dummyConfig = {
  path: 'test'
}

const createStore = function(name, handler, config){
  let conf;

  if(typeof config === 'object')
    conf = config
  else
    conf = Object.create(dummyConfig);

  if(typeof name !== 'undefined' && typeof handler !== 'undefined'){
    let params = {name};
    let action = new Action(params);

    conf.actions = [action];
    conf[name] = handler;
  }

  return new Store(conf);
}

describe('Store', () => {
  describe('#constructor()', () =>  {
    it('should create store', () => {
      let config = Object.create(dummyConfig);
      let store = new Store(config);

      store.should.be.an.instanceOf(Object);
    });

    it('should initialize actions', () => {
      let action = 'action1';
      let config = Object.create(dummyConfig);
      config.actions = [action];

      let store = new Store(config);

      store.actions.should.be.instanceOf(Object);
      store.actions.should.include.keys(action);
    });

    it('should set initial values', () => {
      let initial = {testValue: 'abc'}
      let config = Object.create(dummyConfig);
      config.initial = initial;

      let store = new Store(config);

      store.initial.should.be.instanceOf(Object);
      store.initial.should.include.keys('testValue');
      store.initial.testValue.should.equal(initial.testValue);
    });
  });

  describe('running actions', () =>  {
    it('should call Action#run when store.actions.actionName is called', () => {
      let name = 'action';
      let params = {name};

      let config = Object.create(dummyConfig);
      let action = new Action(params);

      sinon.spy(action, 'run');

      config.actions = [action];
      config.action = sinon.spy();

      let store = new Store(config);

      store.actions.action();

      return action.run.should.have.been.calledOnce;
    });

    describe('declared as function', () =>  {
      it('should resolve promise', () => {
        let name = 'action';
        let handler = sinon.spy();

        let store = createStore(name, handler);

        return store.actions.action().should.be.fulfilled;
      });

      it('should execute handler', () => {
        let name = 'action';
        let handler = sinon.spy();

        let store = createStore(name, handler);

        return store.actions.action().then(() => {
          handler.should.have.been.calledOnce;
        });
      });

      describe('on error', () =>  {
        it("should reject promise", () => {
          let handler = function(){throw 'reject';};
          let store = createStore('action', handler);

          return store.actions.action().should.be.rejected;
        });
      });
    });

    describe('declared as hash', () =>  {
      it("should execute 'will' action", () => {
        let name = 'action';
        let onHandler = sinon.spy(), willHandler = sinon.spy();
        let handler = {will: willHandler, on: onHandler};

        let store = createStore(name, handler);

        return store.actions.action().then(() => {
          willHandler.should.have.been.calledOnce;
        });
      });
      it("should execute 'on' action", () => {
        let name = 'action';
        let onHandler = sinon.spy();
        let handler = {on: onHandler};

        let store = createStore(name, handler);

        return store.actions.action().then(() => {
          onHandler.should.have.been.calledOnce;
        });
      });

      it("should execute 'did' action", () => {
        let name = 'action';
        let onHandler = sinon.spy(), didHandler = sinon.spy();
        let handler = {did: didHandler, on: onHandler};

        let store = createStore(name, handler);

        return store.actions.action().then(() => {
          didHandler.should.have.been.calledOnce;
        });
      });

      describe('on error', () =>  {
        let store, onHandler, didNotHandler;

        beforeEach(() => {
          onHandler = function(){throw 'reject';};
          didNotHandler = sinon.spy();

          store = createStore('action', {didNot: didNotHandler, on: onHandler});
        });

        it("should reject promise", () => {
          let result = store.actions.action()

          return result.should.be.rejected;
        });

        it("should execute 'didNot' function", () => {
          let result = store.actions.action()

          return result.catch(() => {
            didNotHandler.should.have.been.calledOnce;
          });
        });
      });
    });
  });


  describe('#get', () =>  {
    it('should return initial values', () => {
      let initial = {testValue: 'abc'};
      let config = Object.create(dummyConfig);
      config.initial = initial;

      let store = createStore(null, null, config);

      return store.get(Object.keys(initial)[0]).should.equal(initial.testValue);
    });

    it('should return values set in action handler', () => {
      let name = 'action';
      let val = {testKey: 'testValue'}
      let onHandler = sinon.spy();
      let handler = {did: function(){this.set(val)}, on: onHandler};

      let store = createStore(name, handler);

      return store.actions.action().then(() => {
        store.get(Object.keys(val)[0]).should.equal(val.testKey);
      });
    });

    it('should update initial values in action handler', () => {
      let initial = {testKey: 'abc'};
      let config = Object.create(dummyConfig);
      config.initial = initial;

      let name = 'action';
      let val = {testKey: 'testValue'}
      let onHandler = sinon.spy();
      let handler = {did: function(){this.set(val)}, on: onHandler};

      let store = createStore(name, handler, config);

      return store.actions.action().then(() => {
        store.get(Object.keys(val)[0]).should.not.equal(initial.testKey);
        store.get(Object.keys(val)[0]).should.equal(val.testKey);
      });
    });
  });

});
