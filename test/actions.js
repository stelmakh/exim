let chai = require('chai');
var sinonChai = require("sinon-chai");

chai.use(sinonChai);
chai.should();

import { Action, Actions } from '../src/Actions'

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
});
