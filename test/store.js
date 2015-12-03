var should = require('should');
var Store = require('../src/Store')

describe('Store', function() {
  describe('#constructor()', function () {
      it('should create store', function () {
        let store = new Store({})
        store.should.be.an.instanceOf(Object);
      });
  });
});
