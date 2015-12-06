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

      action.run.should.have.been.calledOnce;
    });

    describe('declared as function', () =>  {
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

    describe('declared as hash', () =>  {
      it("should execute 'will' action", () => {
        let name = 'action';
        let params = {name};

        let config = Object.create(dummyConfig);
        let action = new Action(params);
        let onHandler = sinon.spy(), willHandler = sinon.spy();

        config.actions = [action];
        config.action = {will: willHandler, on: onHandler};

        let store = new Store(config);

        store.actions.action().then(() => {
          willHandler.should.have.been.calledOnce;
        });
      });
      it("should execute 'on' action", () => {
        let name = 'action';
        let params = {name};

        let config = Object.create(dummyConfig);
        let action = new Action(params);
        let onHandler = sinon.spy();

        config.actions = [action];
        config.action = {on: onHandler};

        let store = new Store(config);

        store.actions.action().then(() => {
          onHandler.should.have.been.calledOnce;
        });
      });

      it("should execute 'did' action", () => {
        let name = 'action';
        let params = {name};

        let config = Object.create(dummyConfig);
        let action = new Action(params);
        let onHandler = sinon.spy(), didHandler = sinon.spy();

        config.actions = [action];
        config.action = {did: didHandler, on: onHandler};

        let store = new Store(config);

        store.actions.action().then(() => {
          didHandler.should.have.been.calledOnce;
        });
      });

      describe('on error', () =>  {
        it("should execute 'didNot' action", () => {
          let name = 'action';
          let params = {name};

          let config = Object.create(dummyConfig);
          let action = new Action(params);
          let onHandler = function(){throw Error();}, didNotHandler = sinon.spy();

          config.actions = [action];
          config.action = {didNot: didNotHandler, on: onHandler};

          let store = new Store(config);

          store.actions.action().then(() => {
            didNotHandler.should.have.been.calledOnce;
          });
        });
      });
    });
  });
});
