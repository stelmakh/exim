!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Exim=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var _Actions = require("./Actions");

var Action = _Actions.Action;
var Actions = _Actions.Actions;

var Store = _interopRequire(require("./Store"));

var helpers = _interopRequire(require("./helpers"));

var _DOMHelpers = require("./DOMHelpers");

var createView = _DOMHelpers.createView;
var Router = _DOMHelpers.Router;
var DOM = _DOMHelpers.DOM;

var Exim = { Action: Action, Actions: Actions, Store: Store, Router: Router, DOM: DOM, helpers: helpers, createView: createView };

Exim.createAction = function (args) {
  return new Action(args);
};

Exim.createActions = function (args) {
  return new Actions(args);
};

Exim.createStore = function (args) {
  return new Store(args);
};

module.exports = Exim;

},{"./Actions":8,"./DOMHelpers":9,"./Store":10,"./helpers":11}],2:[function(require,module,exports){
var Freezer = require('./src/freezer');
module.exports = Freezer;
},{"./src/freezer":4}],3:[function(require,module,exports){
'use strict';

var Utils = require( './utils' );

//#build

// The prototype methods are stored in a different object
// and applied as non enumerable properties later
var emitterProto = {
	on: function( eventName, listener, once ){
		var listeners = this._events[ eventName ] || [];

		listeners.push({ callback: listener, once: once});
		this._events[ eventName ] =  listeners;

		return this;
	},

	once: function( eventName, listener ){
		this.on( eventName, listener, true );
	},

	off: function( eventName, listener ){
		if( typeof eventName == 'undefined' ){
			this._events = {};
		}
		else if( typeof listener == 'undefined' ) {
			this._events[ eventName ] = [];
		}
		else {
			var listeners = this._events[ eventName ] || [],
				i
			;

			for (i = listeners.length - 1; i >= 0; i--) {
				if( listeners[i].callback === listener )
					listeners.splice( i, 1 );
			}
		}

		return this;
	},

	trigger: function( eventName ){
		var args = [].slice.call( arguments, 1 ),
			listeners = this._events[ eventName ] || [],
			onceListeners = [],
			i, listener
		;

		// Call listeners
		for (i = 0; i < listeners.length; i++) {
			listener = listeners[i];

			if( listener.callback )
				listener.callback.apply( null, args );
			else {
				// If there is not a callback, remove!
				listener.once = true;
			}

			if( listener.once )
				onceListeners.push( i );
		}

		// Remove listeners marked as once
		for( i = onceListeners.length - 1; i >= 0; i-- ){
			listeners.splice( onceListeners[i], 1 );
		}

		return this;
	}
};

// Methods are not enumerable so, when the stores are
// extended with the emitter, they can be iterated as
// hashmaps
var Emitter = Utils.createNonEnumerable( emitterProto );
//#build

module.exports = Emitter;

},{"./utils":7}],4:[function(require,module,exports){
'use strict';

var Utils = require( './utils.js' ),
	Emitter = require( './emitter' ),
	Mixins = require( './mixins' ),
	Frozen = require( './frozen' )
;

//#build
var Freezer = function( initialValue, options ) {
	var me = this,
		mutable = ( options && options.mutable ) || false,
		live = ( options && options.live ) || live
	;

	// Immutable data
	var frozen;

	var notify = function notify( eventName, node, options ){
		if( eventName == 'listener' )
			return Frozen.createListener( node );

		return Frozen.update( eventName, node, options );
	};

	var freeze = function(){};
	if( !mutable )
		freeze = function( obj ){ Object.freeze( obj ); };

	// Create the frozen object
	frozen = Frozen.freeze( initialValue, notify, freeze, live );

	// Listen to its changes immediately
	var listener = frozen.getListener();

	// Updating flag to trigger the event on nextTick
	var updating = false;

	listener.on( 'immediate', function( prevNode, updated ){
		if( prevNode != frozen )
			return;

		frozen = updated;

		if( live )
			return me.trigger( 'update', updated );

		// Trigger on next tick
		if( !updating ){
			updating = true;
			Utils.nextTick( function(){
				updating = false;
				me.trigger( 'update', frozen );
			});
		}
	});

	Utils.addNE( this, {
		get: function(){
			return frozen;
		},
		set: function( node ){
			var newNode = notify( 'reset', frozen, node );
			newNode.__.listener.trigger( 'immediate', frozen, newNode );
		}
	});

	Utils.addNE( this, { getData: this.get, setData: this.set } );

	// The event store
	this._events = [];
}

Freezer.prototype = Utils.createNonEnumerable({constructor: Freezer}, Emitter);
//#build

module.exports = Freezer;

},{"./emitter":3,"./frozen":5,"./mixins":6,"./utils.js":7}],5:[function(require,module,exports){
'use strict';

var Utils = require( './utils' ),
	Mixins = require( './mixins'),
	Emitter = require('./emitter')
;

//#build
var Frozen = {
	freeze: function( node, notify, freezeFn, live ){
		if( node && node.__ ){
			return node;
		}

		var me = this,
			frozen, mixin, cons
		;

		if( node.constructor == Array ){
			frozen = this.createArray( node.length );
		}
		else {
			frozen = Object.create( Mixins.Hash );
		}

		Utils.addNE( frozen, { __: {
			listener: false,
			parents: [],
			notify: notify,
			dirty: false,
			freezeFn: freezeFn,
			live: live || false
		}});

		// Freeze children
		Utils.each( node, function( child, key ){
			cons = child && child.constructor;
			if( cons == Array || cons == Object ){
				child = me.freeze( child, notify, freezeFn, live );
			}

			if( child && child.__ ){
				me.addParent( child, frozen );
			}

			frozen[ key ] = child;
		});

		freezeFn( frozen );

		return frozen;
	},

	update: function( type, node, options ){
		if( !this[ type ])
			return Utils.error( 'Unknown update type: ' + type );

		return this[ type ]( node, options );
	},

	reset: function( node, value ){
		var me = this,
			_ = node.__,
			frozen
		;

		if( value && value.__ ){
			frozen = value;
			frozen.__.listener = value.__.listener;
			frozen.__.parents = [];

			// Set back the parent on the children
			// that have been updated
			this.fixChildren( frozen, node );
			Utils.each( frozen, function( child ){
				if( child && child.__ ){
					me.removeParent( node );
					me.addParent( child, frozen );
				}
			});
		}
		else {
			frozen = this.freeze( node, _.notify, _.freezeFn, _.live );
		}

		return frozen;
	},

	merge: function( node, attrs ){
		var _ = node.__,
			trans = _.trans,

			// Clone the attrs to not modify the argument
			attrs = Utils.extend( {}, attrs)
		;

		if( trans ){

			for( var attr in attrs )
				trans[ attr ] = attrs[ attr ];
			return node;
		}

		var me = this,
			frozen = this.copyMeta( node ),
			notify = _.notify,
			val, cons, key, isFrozen
		;

		Utils.each( node, function( child, key ){
			isFrozen = child && child.__;

			if( isFrozen ){
				me.removeParent( child, node );
			}

			val = attrs[ key ];
			if( !val ){
				if( isFrozen )
					me.addParent( child, frozen );
				return frozen[ key ] = child;
			}

			cons = val && val.constructor;

			if( cons == Array || cons == Object )
				val = me.freeze( val, notify, _.freezeFn, _.live );

			if( val && val.__ )
				me.addParent( val, frozen );

			delete attrs[ key ];

			frozen[ key ] = val;
		});


		for( key in attrs ) {
			val = attrs[ key ];
			cons = val && val.constructor;

			if( cons == Array || cons == Object )
				val = me.freeze( val, notify, _.freezeFn, _.live );

			if( val && val.__ )
				me.addParent( val, frozen );

			frozen[ key ] = val;
		}

		_.freezeFn( frozen );

		this.refreshParents( node, frozen );

		return frozen;
	},

	replace: function( node, replacement ) {

		var me = this,
			cons = replacement && replacement.constructor,
			_ = node.__,
			frozen = replacement
		;

		if( cons == Array || cons == Object ) {

			frozen = me.freeze( replacement, _.notify, _.freezeFn, _.live );

			frozen.__.parents = _.parents;

			// Add the current listener if exists, replacing a
			// previous listener in the frozen if existed
			if( _.listener )
				frozen.__.listener = _.listener;

			// Since the parents will be refreshed directly,
			// Trigger the listener here
			if( frozen.__.listener )
				this.trigger( frozen, 'update', frozen );
		}

		// Refresh the parent nodes directly
		if( !_.parents.length && _.listener ){
			_.listener.trigger( 'immediate', node, frozen );
		}
		for (var i = _.parents.length - 1; i >= 0; i--) {
			if( i == 0 ){
				this.refresh( _.parents[i], node, frozen, false );
			}
			else{

				this.markDirty( _.parents[i], [node, frozen] );
			}
		}
		return frozen;
	},

	remove: function( node, attrs ){
		var trans = node.__.trans;
		if( trans ){
			for( var l = attrs.length - 1; l >= 0; l-- )
				delete trans[ attrs[l] ];
			return node;
		}

		var me = this,
			frozen = this.copyMeta( node ),
			isFrozen
		;

		Utils.each( node, function( child, key ){
			isFrozen = child && child.__;

			if( isFrozen ){
				me.removeParent( child, node );
			}

			if( attrs.indexOf( key ) != -1 ){
				return;
			}

			if( isFrozen )
				me.addParent( child, frozen );

			frozen[ key ] = child;
		});

		node.__.freezeFn( frozen );
		this.refreshParents( node, frozen );

		return frozen;
	},

	splice: function( node, args ){
		var _ = node.__,
			trans = _.trans
		;

		if( trans ){
			trans.splice.apply( trans, args );
			return node;
		}

		var me = this,
			frozen = this.copyMeta( node ),
			index = args[0],
			deleteIndex = index + args[1],
			con, child
		;

		// Clone the array
		Utils.each( node, function( child, i ){

			if( child && child.__ ){
				me.removeParent( child, node );

				// Skip the nodes to delete
				if( i < index || i>= deleteIndex )
					me.addParent( child, frozen );
			}

			frozen[i] = child;
		});

		// Prepare the new nodes
		if( args.length > 1 ){
			for (var i = args.length - 1; i >= 2; i--) {
				child = args[i];
				con = child && child.constructor;

				if( con == Array || con == Object )
					child = this.freeze( child, _.notify, _.freezeFn, _.live );

				if( child && child.__ )
					this.addParent( child, frozen );

				args[i] = child;
			}
		}

		// splice
		Array.prototype.splice.apply( frozen, args );

		node.__.freezeFn( frozen );
		this.refreshParents( node, frozen );

		return frozen;
	},

	transact: function( node ) {
		var me = this,
			transacting = node.__.trans,
			trans
		;

		if( transacting )
			return transacting;

		trans = node.constructor == Array ? [] : {};

		Utils.each( node, function( child, key ){
			trans[ key ] = child;
		});

		node.__.trans = trans;

		// Call run automatically in case
		// the user forgot about it
		Utils.nextTick( function(){
			if( node.__.trans )
				me.run( node );
		});

		return trans;
	},

	run: function( node ) {
		var me = this,
			trans = node.__.trans
		;

		if( !trans )
			return node;

		// Remove the node as a parent
		Utils.each( trans, function( child, key ){
			if( child && child.__ ){
				me.removeParent( child, node );
			}
		});

		delete node.__.trans;

		var result = this.replace( node, trans );
		return result;
	},

	refresh: function( node, oldChild, newChild, returnUpdated ){
		var me = this,
			trans = node.__.trans,
			found = 0
		;

		if( trans ){

			Utils.each( trans, function( child, key ){
				if( found ) return;

				if( child === oldChild ){

					trans[ key ] = newChild;
					found = 1;

					if( newChild && newChild.__ )
						me.addParent( newChild, node );
				}
			});

			return node;
		}

		var frozen = this.copyMeta( node ),
			dirty = node.__.dirty,
			dirt, replacement, __
		;

		if( dirty ){
			dirt = dirty[0],
			replacement = dirty[1]
		}

		Utils.each( node, function( child, key ){
			if( child === oldChild ){
				child = newChild;
			}
			else if( child === dirt ){
				child = replacement;
			}

			if( child && (__ = child.__) ){

				// If there is a trans happening we
				// don't update a dirty node now. The update
				// will occur on run.
				if( !__.trans && __.dirty ){
					child = me.refresh( child, __.dirty[0], __.dirty[1], true );
				}


				me.removeParent( child, node );
				me.addParent( child, frozen );
			}

			frozen[ key ] = child;
		});

		node.__.freezeFn( frozen );

		// If the node was dirty, clean it
		node.__.dirty = false;

		if( returnUpdated )
			return frozen;

		this.refreshParents( node, frozen );
	},

	fixChildren: function( node, oldNode ){
		var me = this;
		Utils.each( node, function( child ){
			if( !child || !child.__ )
				return;

			// If the child is linked to the node,
			// maybe its children are not linked
			if( child.__.parents.indexOf( node ) != -1 )
				return me.fixChildren( child );

			// If the child wasn't linked it is sure
			// that it wasn't modified. Just link it
			// to the new parent
			if( child.__.parents.length == 1 )
				return child.__.parents = [ node ];

			if( oldNode )
				me.removeParent( child, oldNode );

			me.addParent( child, node );
		});
	},

	copyMeta: function( node ){
		var me = this,
			frozen
		;

		if( node.constructor == Array ){
			frozen = this.createArray( node.length );
		}
		else {
			frozen = Object.create( Mixins.Hash );
		}

		var _ = node.__;

		Utils.addNE( frozen, {__: {
			notify: _.notify,
			listener: _.listener,
			parents: _.parents.slice( 0 ),
			trans: _.trans,
			dirty: false,
			freezeFn: _.freezeFn
		}});

		return frozen;
	},

	refreshParents: function( oldChild, newChild ){
		var _ = oldChild.__,
			i
		;

		if( _.listener )
			this.trigger( newChild, 'update', newChild );

		if( !_.parents.length ){
			if( _.listener ){
				_.listener.trigger( 'immediate', oldChild, newChild );
			}
		}
		else {
			for (i = _.parents.length - 1; i >= 0; i--) {
				// If there is more than one parent, mark everyone as dirty
				// but the last in the iteration, and when the last is refreshed
				// it will update the dirty nodes.
				if( i == 0 )
					this.refresh( _.parents[i], oldChild, newChild, false );
				else{

					this.markDirty( _.parents[i], [oldChild, newChild] );
				}
			}
		}
	},

	markDirty: function( node, dirt ){
		var _ = node.__,
			i
		;
		_.dirty = dirt;

		// If there is a transaction happening in the node
		// update the transaction data immediately
		if( _.trans )
			this.refresh( node, dirt[0], dirt[1] );

		for ( i = _.parents.length - 1; i >= 0; i-- ) {

			this.markDirty( _.parents[i], dirt );
		}
	},

	removeParent: function( node, parent ){
		var parents = node.__.parents,
			index = parents.indexOf( parent )
		;

		if( index != -1 ){
			parents.splice( index, 1 );
		}
	},

	addParent: function( node, parent ){
		var parents = node.__.parents,
			index = parents.indexOf( parent )
		;

		if( index == -1 ){
			parents[ parents.length ] = parent;
		}
	},

	trigger: function( node, eventName, param ){
		var listener = node.__.listener,
			ticking = listener.ticking
		;

		listener.ticking = param;
		if( !ticking ){
			Utils.nextTick( function(){
				var updated = listener.ticking;
				listener.ticking = false;
				listener.trigger( eventName, updated );
			});
		}
	},

	createListener: function( frozen ){
		var l = frozen.__.listener;

		if( !l ) {
			l = Object.create(Emitter, {
				_events: {
					value: {},
					writable: true
				}
			});

			frozen.__.listener = l;
		}

		return l;
	},

	createArray: (function(){
		// Set createArray method
		if( [].__proto__ )
			return function( length ){
				var arr = new Array( length );
				arr.__proto__ = Mixins.List;
				return arr;
			}
		return function( length ){
			var arr = new Array( length ),
				methods = Mixins.arrayMethods
			;
			for( var m in methods ){
				arr[ m ] = methods[ m ];
			}
			return arr;
		}
	})()
};
//#build

module.exports = Frozen;

},{"./emitter":3,"./mixins":6,"./utils":7}],6:[function(require,module,exports){
'use strict';

var Utils = require( './utils.js' );

//#build

/**
 * Creates non-enumerable property descriptors, to be used by Object.create.
 * @param  {Object} attrs Properties to create descriptors
 * @return {Object}       A hash with the descriptors.
 */
var createNE = function( attrs ){
	var ne = {};

	for( var key in attrs ){
		ne[ key ] = {
			writable: true,
			configurable: true,
			enumerable: false,
			value: attrs[ key]
		}
	}

	return ne;
}

var commonMethods = {
	set: function( attr, value ){
		var attrs = attr,
			update = this.__.trans
		;

		if( typeof value != 'undefined' ){
			attrs = {};
			attrs[ attr ] = value;
		}

		if( !update ){
			for( var key in attrs ){
				update = update || this[ key ] != attrs[ key ];
			}

			// No changes, just return the node
			if( !update )
				return this;
		}

		return this.__.notify( 'merge', this, attrs );
	},

	reset: function( attrs ) {
		return this.__.notify( 'replace', this, attrs );
	},

	getListener: function(){
		return this.__.notify( 'listener', this );
	},

	toJS: function(){
		var js;
		if( this.constructor == Array ){
			js = new Array( this.length );
		}
		else {
			js = {};
		}

		Utils.each( this, function( child, i ){
			if( child && child.__ )
				js[ i ] = child.toJS();
			else
				js[ i ] = child;
		});

		return js;
	},

	transact: function(){
		return this.__.notify( 'transact', this );
	},
	run: function(){
		return this.__.notify( 'run', this );
	}
};

var arrayMethods = Utils.extend({
	push: function( el ){
		return this.append( [el] );
	},

	append: function( els ){
		if( els && els.length )
			return this.__.notify( 'splice', this, [this.length, 0].concat( els ) );
		return this;
	},

	pop: function(){
		if( !this.length )
			return this;

		return this.__.notify( 'splice', this, [this.length -1, 1] );
	},

	unshift: function( el ){
		return this.prepend( [el] );
	},

	prepend: function( els ){
		if( els && els.length )
			return this.__.notify( 'splice', this, [0, 0].concat( els ) );
		return this;
	},

	shift: function(){
		if( !this.length )
			return this;

		return this.__.notify( 'splice', this, [0, 1] );
	},

	splice: function( index, toRemove, toAdd ){
		return this.__.notify( 'splice', this, arguments );
	}
}, commonMethods );

var FrozenArray = Object.create( Array.prototype, createNE( arrayMethods ) );

var Mixins = {

Hash: Object.create( Object.prototype, createNE( Utils.extend({
	remove: function( keys ){
		var filtered = [],
			k = keys
		;

		if( keys.constructor != Array )
			k = [ keys ];

		for( var i = 0, l = k.length; i<l; i++ ){
			if( this.hasOwnProperty( k[i] ) )
				filtered.push( k[i] );
		}

		if( filtered.length )
			return this.__.notify( 'remove', this, filtered );
		return this;
	}
}, commonMethods))),

List: FrozenArray,
arrayMethods: arrayMethods
};
//#build

module.exports = Mixins;
},{"./utils.js":7}],7:[function(require,module,exports){
'use strict';

//#build
var global = (new Function("return this")());

var Utils = {
	extend: function( ob, props ){
		for( var p in props ){
			ob[p] = props[p];
		}
		return ob;
	},

	createNonEnumerable: function( obj, proto ){
		var ne = {};
		for( var key in obj )
			ne[key] = {value: obj[key] };
		return Object.create( proto || {}, ne );
	},

	error: function( message ){
		var err = new Error( message );
		if( console )
			return console.error( err );
		else
			throw err;
	},

	each: function( o, clbk ){
		var i,l,keys;
		if( o && o.constructor == Array ){
			for (i = 0, l = o.length; i < l; i++)
				clbk( o[i], i );
		}
		else {
			keys = Object.keys( o );
			for( i = 0, l = keys.length; i < l; i++ )
				clbk( o[ keys[i] ], keys[i] );
		}
	},

	addNE: function( node, attrs ){
		for( var key in attrs ){
			Object.defineProperty( node, key, {
				enumerable: false,
				configurable: true,
				writable: true,
				value: attrs[ key ]
			});
		}
	},

	// nextTick - by stagas / public domain
  	nextTick: (function () {
      var queue = [],
			dirty = false,
			fn,
			hasPostMessage = !!global.postMessage,
			messageName = 'nexttick',
			trigger = (function () {
				return hasPostMessage
					? function trigger () {
					global.postMessage(messageName, '*');
				}
				: function trigger () {
					setTimeout(function () { processQueue() }, 0);
				};
			}()),
			processQueue = (function () {
				return hasPostMessage
					? function processQueue (event) {
						if (event.source === global && event.data === messageName) {
							event.stopPropagation();
							flushQueue();
						}
					}
					: flushQueue;
      	})()
      ;

      function flushQueue () {
          while (fn = queue.shift()) {
              fn();
          }
          dirty = false;
      }

      function nextTick (fn) {
          queue.push(fn);
          if (dirty) return;
          dirty = true;
          trigger();
      }

      if (hasPostMessage) global.addEventListener('message', processQueue, true);

      nextTick.removeListener = function () {
          global.removeEventListener('message', processQueue, true);
      }

      return nextTick;
  })()
};
//#build


module.exports = Utils;
},{}],8:[function(require,module,exports){
"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

Object.defineProperty(exports, "__esModule", {
  value: true
});

var Action = exports.Action = (function () {
  function Action(args) {
    _classCallCheck(this, Action);

    var store = args.store;
    var stores = args.stores;
    var allStores = [];

    this.name = args.name;

    if (store) allStores.push(store);
    if (stores) allStores.push.apply(allStores, stores);

    this.stores = allStores;
  }

  _createClass(Action, {
    run: {
      value: function run() {
        var _this = this;

        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }

        var storesCycles = this.stores.map(function (store) {
          return store.runCycle.apply(store, [_this.name].concat(args));
        });
        return Promise.all(storesCycles);
      }
    },
    addStore: {
      value: function addStore(store) {
        this.stores.push(store);
      }
    }
  });

  return Action;
})();

var Actions = exports.Actions = (function () {
  function Actions(actions) {
    var _this = this;

    _classCallCheck(this, Actions);

    this.all = [];
    if (Array.isArray(actions)) {
      actions.forEach(function (action) {
        return _this.addAction(action);
      }, this);
    }
  }

  _createClass(Actions, {
    addAction: {
      value: function addAction(item, noOverride) {
        var action = noOverride ? false : this.detectAction(item);
        if (!noOverride) {
          var old = this[action.name];
          if (old) this.removeAction(old);
          this.all.push(action);
          this[action.name] = action.run.bind(action);
        }

        return action;
      }
    },
    removeAction: {
      value: function removeAction(item) {
        var action = this.detectAction(item, true);
        var index = this.all.indexOf(action);
        if (index !== -1) this.all.splice(index, 1);
        delete this[action.name];
      }
    },
    addStore: {
      value: function addStore(store) {
        this.all.forEach(function (action) {
          return action.addStore(store);
        });
      }
    },
    detectAction: {
      value: function detectAction(action, isOld) {
        if (action.constructor === Action) {
          return action;
        } else if (typeof action === "string") {
          return isOld ? this[action] : new Action({ name: action });
        }
      }
    }
  });

  return Actions;
})();

},{}],9:[function(require,module,exports){
(function (global){
"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

exports.createView = createView;
Object.defineProperty(exports, "__esModule", {
  value: true
});

var React = _interopRequire((typeof window !== "undefined" ? window['React'] : typeof global !== "undefined" ? global['React'] : null));

var ReactRouter = _interopRequire((typeof window !== "undefined" ? window['ReactRouter'] : typeof global !== "undefined" ? global['ReactRouter'] : null));

function getFilePath(name) {
  var segments = name.split("-");
  var filePath = undefined;
  if (segments.length > 1) {
    filePath = segments.map(function (name, i) {
      if (i > 0) return name.charAt(0).toUpperCase() + name.slice(1);
      return name;
    }).join("/");
  } else {
    filePath = name + "/" + name.charAt(0).toUpperCase() + name.slice(1);
  }
  return filePath;
}

function getRouter() {
  var Router = {};

  if (typeof ReactRouter !== "undefined") {
    var routerElements = ["Route", "DefaultRoute", "RouteHandler", "ActiveHandler", "NotFoundRoute", "Link", "Redirect"],
        routerMixins = ["Navigation", "State"],
        routerFunctions = ["create", "createDefaultRoute", "createNotFoundRoute", "createRedirect", "createRoute", "createRoutesFromReactChildren", "run"],
        routerObjects = ["HashLocation", "History", "HistoryLocation", "RefreshLocation", "StaticLocation", "TestLocation", "ImitateBrowserBehavior", "ScrollToTopBehavior"],
        copiedItems = routerMixins.concat(routerFunctions).concat(routerObjects);

    routerElements.forEach(function (name) {
      Router[name] = React.createElement.bind(React, ReactRouter[name]);
    });

    copiedItems.forEach(function (name) {
      Router[name] = ReactRouter[name];
    });

    Router.mount = function (path) {
      console.log("Exim.Router.mount is not defined");
    };

    Router.match = function (name, handler, args, children) {
      if (typeof args === "undefined" && Array.isArray(handler)) {
        children = handler;
        args = {};
        handler = Router.mount(getFilePath(name));
      } else if (typeof args === "undefined" && typeof handler === "object") {
        args = handler;
        handler = Router.mount(getFilePath(name));
      } else if (typeof handler === "object" && Array.isArray(args)) {
        children = args;
        args = handler;
        handler = Router.mount(getFilePath(name));
      }
      var path = undefined,
          key = undefined,
          def = undefined;

      if (typeof args === "object") {
        path = args.path;
        key = args.key;
        def = args["default"];
      }

      // if (typeof path === 'undefined' && (typeof def === 'undefined' || def === false))
      //   path = name;

      if (def === true) {
        return Router.DefaultRoute({ name: name, path: path, handler: handler, key: key }, children);
      }

      return Router.Route({ name: name, path: path, handler: handler, key: key }, children);
    };
  }

  return Router;
}

function getDOM() {
  var DOMHelpers = {};

  if (typeof React !== "undefined") {
    var tag = function tag(name) {
      for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
      }

      var attributes = undefined;
      var first = args[0] && args[0].constructor;
      if (first === Object) {
        attributes = args.shift();
      } else {
        attributes = {};
      }
      return React.DOM[name].apply(React.DOM, [attributes].concat(args));
    };

    for (var tagName in React.DOM) {
      DOMHelpers[tagName] = tag.bind(this, tagName);
    }

    DOMHelpers.space = function () {
      return React.DOM.span({
        dangerouslySetInnerHTML: {
          __html: "&nbsp;"
        }
      });
    };
  }
  return DOMHelpers;
}

var Router = getRouter();
exports.Router = Router;
var DOM = getDOM();

exports.DOM = DOM;

function createView(classArgs) {
  var ReactClass = React.createClass(classArgs);
  var ReactElement = React.createElement.bind(React.createElement, ReactClass);
  return ReactElement;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9ET01IZWxwZXJzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O1FBNEdnQixVQUFVLEdBQVYsVUFBVTs7Ozs7SUE1R25CLEtBQUssMkJBQU0sT0FBTzs7SUFDbEIsV0FBVywyQkFBTSxjQUFjOztBQUV0QyxTQUFTLFdBQVcsQ0FBQyxJQUFJLEVBQUU7QUFDekIsTUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMvQixNQUFJLFFBQVEsWUFBQSxDQUFDO0FBQ2IsTUFBSSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUN2QixZQUFRLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxVQUFTLElBQUksRUFBRSxDQUFDLEVBQUM7QUFDdkMsVUFBSSxDQUFDLEdBQUMsQ0FBQyxFQUNMLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ3JELGFBQU8sSUFBSSxDQUFBO0tBQ1osQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztHQUNkLE1BQU07QUFDTCxZQUFRLEdBQUcsSUFBSSxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7R0FDdEU7QUFDRCxTQUFPLFFBQVEsQ0FBQztDQUNqQjs7QUFFRCxTQUFTLFNBQVMsR0FBSTtBQUNwQixNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUM7O0FBRWxCLE1BQUksT0FBTyxXQUFXLEtBQUssV0FBVyxFQUFFO0FBQ3RDLFFBQUksY0FBYyxHQUFHLENBQUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQUUsZUFBZSxFQUFFLGVBQWUs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RyxTQUFTLEVBQUUsQ0FBQztRQUFyQixNQUFNLEdBQU4sTUFBTTtBQUNaLElBQU0sR0FBRyxHQUFHLE1BQU0sRUFBRSxDQUFDOztRQUFmLEdBQUcsR0FBSCxHQUFHOztBQUVULFNBQVMsVUFBVSxDQUFFLFNBQVMsRUFBRTtBQUNyQyxNQUFJLFVBQVUsR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzlDLE1BQUksWUFBWSxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDN0UsU0FBTyxZQUFZLENBQUM7Q0FDckIiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBSZWFjdCBmcm9tICdyZWFjdCc7XG5pbXBvcnQgUmVhY3RSb3V0ZXIgZnJvbSAncmVhY3Qtcm91dGVyJztcblxuZnVuY3Rpb24gZ2V0RmlsZVBhdGgobmFtZSkge1xuICBsZXQgc2VnbWVudHMgPSBuYW1lLnNwbGl0KCctJyk7XG4gIGxldCBmaWxlUGF0aDtcbiAgaWYgKHNlZ21lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICBmaWxlUGF0aCA9IHNlZ21lbnRzLm1hcChmdW5jdGlvbihuYW1lLCBpKXtcbiAgICAgIGlmIChpPjApXG4gICAgICAgIHJldHVybiBuYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbmFtZS5zbGljZSgxKVxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9KS5qb2luKCcvJyk7XG4gIH0gZWxzZSB7XG4gICAgZmlsZVBhdGggPSBuYW1lICsgJy8nICsgbmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG5hbWUuc2xpY2UoMSk7XG4gIH1cbiAgcmV0dXJuIGZpbGVQYXRoO1xufVxuXG5mdW5jdGlvbiBnZXRSb3V0ZXIgKCkge1xuICBjb25zdCBSb3V0ZXIgPSB7fTtcblxuICBpZiAodHlwZW9mIFJlYWN0Um91dGVyICE9PSAndW5kZWZpbmVkJykge1xuICAgIGxldCByb3V0ZXJFbGVtZW50cyA9IFsnUm91dGUnLCAnRGVmYXVsdFJvdXRlJywgJ1JvdXRlSGFuZGxlcicsICdBY3RpdmVIYW5kbGVyJywgJ05vdEZvdW5kUm91dGUnLCAnTGluaycsICdSZWRpcmVjdCddLFxuICAgIHJvdXRlck1peGlucyA9IFsnTmF2aWdhdGlvbicsICdTdGF0ZSddLFxuICAgIHJvdXRlckZ1bmN0aW9ucyA9IFsnY3JlYXRlJywgJ2NyZWF0ZURlZmF1bHRSb3V0ZScsICdjcmVhdGVOb3RGb3VuZFJvdXRlJywgJ2NyZWF0ZVJlZGlyZWN0JywgJ2NyZWF0ZVJvdXRlJywgJ2NyZWF0ZVJvdXRlc0Zyb21SZWFjdENoaWxkcmVuJywgJ3J1biddLFxuICAgIHJvdXRlck9iamVjdHMgPSBbJ0hhc2hMb2NhdGlvbicsICdIaXN0b3J5JywgJ0hpc3RvcnlMb2NhdGlvbicsICdSZWZyZXNoTG9jYXRpb24nLCAnU3RhdGljTG9jYXRpb24nLCAnVGVzdExvY2F0aW9uJywgJ0ltaXRhdGVCcm93c2VyQmVoYXZpb3InLCAnU2Nyb2xsVG9Ub3BCZWhhdmlvciddLFxuICAgIGNvcGllZEl0ZW1zID0gcm91dGVyTWl4aW5zLmNvbmNhdChyb3V0ZXJGdW5jdGlvbnMpLmNvbmNhdChyb3V0ZXJPYmplY3RzKTtcblxuICAgIHJvdXRlckVsZW1lbnRzLmZvckVhY2goZnVuY3Rpb24obmFtZSkge1xuICAgICAgUm91dGVyW25hbWVdID0gUmVhY3QuY3JlYXRlRWxlbWVudC5iaW5kKFJlYWN0LCBSZWFjdFJvdXRlcltuYW1lXSk7XG4gICAgfSk7XG5cbiAgICBjb3BpZWRJdGVtcy5mb3JFYWNoKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIFJvdXRlcltuYW1lXSA9IFJlYWN0Um91dGVyW25hbWVdO1xuICAgIH0pO1xuXG4gICAgUm91dGVyWydtb3VudCddID0gZnVuY3Rpb24ocGF0aCkge1xuICAgICAgY29uc29sZS5sb2coJ0V4aW0uUm91dGVyLm1vdW50IGlzIG5vdCBkZWZpbmVkJyk7XG4gICAgfVxuXG4gICAgUm91dGVyWydtYXRjaCddID0gZnVuY3Rpb24obmFtZSwgaGFuZGxlciwgYXJncywgY2hpbGRyZW4pIHtcbiAgICAgIGlmICh0eXBlb2YgYXJncyA9PT0gJ3VuZGVmaW5lZCcgJiYgQXJyYXkuaXNBcnJheShoYW5kbGVyKSkge1xuICAgICAgICBjaGlsZHJlbiA9IGhhbmRsZXI7XG4gICAgICAgIGFyZ3MgPSB7fTtcbiAgICAgICAgaGFuZGxlciA9IFJvdXRlci5tb3VudChnZXRGaWxlUGF0aChuYW1lKSk7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzID09PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgaGFuZGxlciA9PT0gJ29iamVjdCcpe1xuICAgICAgICBhcmdzID0gaGFuZGxlcjtcbiAgICAgICAgaGFuZGxlciA9IFJvdXRlci5tb3VudChnZXRGaWxlUGF0aChuYW1lKSk7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnb2JqZWN0JyAmJiBBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG4gICAgICAgIGNoaWxkcmVuID0gYXJncztcbiAgICAgICAgYXJncyA9IGhhbmRsZXI7XG4gICAgICAgIGhhbmRsZXIgPSBSb3V0ZXIubW91bnQoZ2V0RmlsZVBhdGgobmFtZSkpO1xuICAgICAgfVxuICAgICAgbGV0IHBhdGgsIGtleSwgZGVmO1xuXG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIHBhdGggPSBhcmdzLnBhdGg7XG4gICAgICAgIGtleSA9IGFyZ3Mua2V5O1xuICAgICAgICBkZWYgPSBhcmdzLmRlZmF1bHQ7XG4gICAgICB9XG5cbiAgICAgIC8vIGlmICh0eXBlb2YgcGF0aCA9PT0gJ3VuZGVmaW5lZCcgJiYgKHR5cGVvZiBkZWYgPT09ICd1bmRlZmluZWQnIHx8IGRlZiA9PT0gZmFsc2UpKVxuICAgICAgLy8gICBwYXRoID0gbmFtZTtcblxuICAgICAgaWYgKGRlZiA9PT0gdHJ1ZSkge1xuICAgICAgICByZXR1cm4gUm91dGVyWydEZWZhdWx0Um91dGUnXSh7bmFtZSwgcGF0aCwgaGFuZGxlciwga2V5fSwgY2hpbGRyZW4pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gUm91dGVyWydSb3V0ZSddKHtuYW1lLCBwYXRoLCBoYW5kbGVyLCBrZXl9LCBjaGlsZHJlbik7XG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiBSb3V0ZXI7XG59XG5cbmZ1bmN0aW9uIGdldERPTSAoKSB7XG4gIGNvbnN0IERPTUhlbHBlcnMgPSB7fTtcblxuICBpZiAodHlwZW9mIFJlYWN0ICE9PSAndW5kZWZpbmVkJykge1xuICAgIGxldCB0YWcgPSBmdW5jdGlvbiAobmFtZSwgLi4uYXJncykge1xuICAgICAgbGV0IGF0dHJpYnV0ZXM7XG4gICAgICBsZXQgZmlyc3QgPSBhcmdzWzBdICYmIGFyZ3NbMF0uY29uc3RydWN0b3I7XG4gICAgICBpZiAoZmlyc3QgPT09IE9iamVjdCkge1xuICAgICAgICBhdHRyaWJ1dGVzID0gYXJncy5zaGlmdCgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXR0cmlidXRlcyA9IHt9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIFJlYWN0LkRPTVtuYW1lXS5hcHBseShSZWFjdC5ET00sIFthdHRyaWJ1dGVzXS5jb25jYXQoYXJncykpO1xuICAgIH07XG5cbiAgICBmb3IgKGxldCB0YWdOYW1lIGluIFJlYWN0LkRPTSkge1xuICAgICAgRE9NSGVscGVyc1t0YWdOYW1lXSA9IHRhZy5iaW5kKHRoaXMsIHRhZ05hbWUpO1xuICAgIH1cblxuICAgIERPTUhlbHBlcnMuc3BhY2UgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBSZWFjdC5ET00uc3Bhbih7XG4gICAgICAgIGRhbmdlcm91c2x5U2V0SW5uZXJIVE1MOiB7XG4gICAgICAgICAgX19odG1sOiAnJm5ic3A7J1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9O1xuICB9XG4gIHJldHVybiBET01IZWxwZXJzO1xufVxuXG5leHBvcnQgY29uc3QgUm91dGVyID0gZ2V0Um91dGVyKCk7XG5leHBvcnQgY29uc3QgRE9NID0gZ2V0RE9NKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVWaWV3IChjbGFzc0FyZ3MpIHtcbiAgbGV0IFJlYWN0Q2xhc3MgPSBSZWFjdC5jcmVhdGVDbGFzcyhjbGFzc0FyZ3MpO1xuICBsZXQgUmVhY3RFbGVtZW50ID0gUmVhY3QuY3JlYXRlRWxlbWVudC5iaW5kKFJlYWN0LmNyZWF0ZUVsZW1lbnQsIFJlYWN0Q2xhc3MpO1xuICByZXR1cm4gUmVhY3RFbGVtZW50O1xufVxuIl19
},{}],10:[function(require,module,exports){
"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var Actions = require("./Actions").Actions;

var utils = _interopRequire(require("./utils"));

var Freezer = _interopRequire(require("freezer-js"));

var getConnectMixin = _interopRequire(require("./mixins/connect"));

var Store = (function () {
  function Store() {
    var args = arguments[0] === undefined ? {} : arguments[0];

    _classCallCheck(this, Store);

    var actions = args.actions;
    var initial = args.initial;

    var init = typeof initial === "function" ? initial() : initial;
    var store = new Freezer(init || {});

    this.connect = function () {
      for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      return getConnectMixin(this, args.concat(args));
    };

    this.handlers = args.handlers || utils.getWithoutFields(["actions"], args) || {};

    if (Array.isArray(actions)) {
      this.actions = actions = new Actions(actions);
      this.actions.addStore(this);
    }

    var set = function set(item, value) {
      store.get().set(item, value);
    };

    var get = function get(item) {
      if (item) {
        return store.get().toJS()[item];
      }return store.get();
    };

    var reset = function reset() {
      this.set(init);
    };

    this.set = set;
    this.get = get;
    this.reset = reset;
    this.store = store;

    this.stateProto = { set: set, get: get, reset: reset, actions: actions };
    //this.getter = new Getter(this);
    return this;
  }

  _createClass(Store, {
    addAction: {
      value: function addAction(item) {
        if (Array.isArray(item)) {
          this.actions = this.actions.concat(this.actions);
        } else if (typeof item === "object") {
          this.actions.push(item);
        }
      }
    },
    removeAction: {
      value: function removeAction(item) {
        var action;
        if (typeof item === "string") {
          action = this.findByName("actions", "name", item);
          if (action) action.removeStore(this);
        } else if (typeof item === "object") {
          action = item;
          var index = this.actions.indexOf(action);
          if (index !== -1) {
            action.removeStore(this);
            this.actions = this.actions.splice(index, 1);
          }
        }
      }
    },
    getActionCycle: {
      value: function getActionCycle(actionName) {
        var prefix = arguments[1] === undefined ? "on" : arguments[1];

        var capitalized = utils.capitalize(actionName);
        var fullActionName = "" + prefix + "" + capitalized;
        var handler = this.handlers[fullActionName] || this.handlers[actionName];
        if (!handler) {
          throw new Error("No handlers for " + actionName + " action defined in current store");
        }

        var actions = undefined;
        if (typeof handler === "object") {
          actions = handler;
        } else if (typeof handler === "function") {
          actions = { on: handler };
        } else {
          throw new Error("" + handler + " must be an object or function");
        }
        return actions;
      }
    },
    runCycle: {

      // 1. will(initial) => willResult
      // 2. while(true)
      // 3. on(willResult || initial) => onResult
      // 4. while(false)
      // 5. did(onResult)

      value: function runCycle(actionName) {
        var _this = this;

        for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
          args[_key - 1] = arguments[_key];
        }

        // new Promise(resolve => resolve(true))
        var cycle = this.getActionCycle(actionName);
        var promise = Promise.resolve();
        var will = cycle.will,
            while_ = cycle["while"],
            on_ = cycle.on;
        var did = cycle.did,
            didNot = cycle.didNot;

        // Local state for this cycle.
        var state = Object.create(this.stateProto);

        // Pre-check & preparations.
        if (will) promise = promise.then(function () {
          return will.apply(state, args);
        });

        // Start while().
        if (while_) promise = promise.then(function (willResult) {
          while_.call(state, true);
          return willResult;
        });

        // Actual execution.
        promise = promise.then(function (willResult) {
          if (willResult == null) {
            return on_.apply(state, args);
          } else {
            return on_.call(state, willResult);
          }
        });

        // Stop while().
        if (while_) promise = promise.then(function (onResult) {
          while_.call(state, false);
          return onResult;
        });

        // For did and didNot state is freezed.
        promise = promise.then(function (onResult) {
          Object.freeze(state);
          return onResult;
        });

        // Handle the result.
        if (did) promise = promise.then(function (onResult) {
          return did.call(state, onResult);
        });

        promise["catch"](function (error) {
          if (while_) while_.call(_this, state, false);
          if (didNot) {
            didNot.call(state, error);
          } else {
            throw error;
          }
        });

        return promise;
      }
    }
  });

  return Store;
})();

module.exports = Store;

},{"./Actions":8,"./mixins/connect":12,"./utils":13,"freezer-js":2}],11:[function(require,module,exports){
"use strict";

module.exports = {
  cx: function cx(classNames) {
    if (typeof classNames == "object") {
      return Object.keys(classNames).filter(function (className) {
        return classNames[className];
      }).join(" ");
    } else {
      return Array.prototype.join.call(arguments, " ");
    }
  }
};

},{}],12:[function(require,module,exports){
"use strict";

module.exports = getConnectMixin;

function getConnectMixin(store) {
  var changeCallback = function changeCallback(state) {
    this.setState(state.toJS());
  };

  var listener = undefined;

  return {
    getInitialState: function getInitialState() {
      var frozen = store.store.get(arguments);
      var state = frozen.toJS();

      if (!this.boundEximChangeCallbacks) this.boundEximChangeCallbacks = {};

      this.boundEximChangeCallbacks[store] = changeCallback.bind(this);

      listener = frozen.getListener();
      return state;
    },

    componentDidMount: function componentDidMount() {
      listener.on("update", this.boundEximChangeCallbacks[store]);
    },

    componentWillUnmount: function componentWillUnmount() {
      if (listener) listener.off("update", this.boundEximChangeCallbacks[store]);
    }
  };
}

},{}],13:[function(require,module,exports){
"use strict";

var utils = {};

utils.getWithoutFields = function (outcast, target) {
  if (!target) throw new Error("TypeError: target is not an object.");
  var result = {};
  if (typeof outcast === "string") outcast = [outcast];
  var tKeys = Object.keys(target);
  outcast.forEach(function (fieldName) {
    tKeys.filter(function (key) {
      return key !== fieldName;
    }).forEach(function (key) {
      result[key] = target[key];
    });
  });
  return result;
};

utils.objectToArray = function (object) {
  return Object.keys(object).map(function (key) {
    return object[key];
  });
};

utils.classWithArgs = function (Item, args) {
  return Item.bind.apply(Item, [Item].concat(args));
};

// 1. will
// 2. while(true)
// 3. on
// 4. while(false)
// 5. did or didNot
utils.mapActionNames = function (object) {
  var list = [];
  var prefixes = ["will", "whileStart", "on", "whileEnd", "did", "didNot"];
  prefixes.forEach(function (item) {
    var name = item;
    if (item === "whileStart" || item === "whileEnd") {
      name = "while";
    }
    if (object[name]) {
      list.push([item, object[name]]);
    }
  });
  return list;
};

utils.isObject = function (targ) {
  return targ ? targ.toString().slice(8, 14) === "Object" : false;
};
utils.capitalize = function (str) {
  var first = str.charAt(0).toUpperCase();
  var rest = str.slice(1);
  return "" + first + "" + rest;
};

module.exports = utils;

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvdm9sb2R5bXlyL1dvcmsvaGVsbHllYWgvZXhpbS9zcmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZnJlZXplci1qcy9mcmVlemVyLmpzIiwibm9kZV9tb2R1bGVzL2ZyZWV6ZXItanMvc3JjL2VtaXR0ZXIuanMiLCJub2RlX21vZHVsZXMvZnJlZXplci1qcy9zcmMvZnJlZXplci5qcyIsIm5vZGVfbW9kdWxlcy9mcmVlemVyLWpzL3NyYy9mcm96ZW4uanMiLCJub2RlX21vZHVsZXMvZnJlZXplci1qcy9zcmMvbWl4aW5zLmpzIiwibm9kZV9tb2R1bGVzL2ZyZWV6ZXItanMvc3JjL3V0aWxzLmpzIiwiL1VzZXJzL3ZvbG9keW15ci9Xb3JrL2hlbGx5ZWFoL2V4aW0vc3JjL0FjdGlvbnMuanMiLCJzcmMvRE9NSGVscGVycy5qcyIsIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9TdG9yZS5qcyIsIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9oZWxwZXJzLmpzIiwiL1VzZXJzL3ZvbG9keW15ci9Xb3JrL2hlbGx5ZWFoL2V4aW0vc3JjL21peGlucy9jb25uZWN0LmpzIiwiL1VzZXJzL3ZvbG9keW15ci9Xb3JrL2hlbGx5ZWFoL2V4aW0vc3JjL3V0aWxzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozt1QkNBOEIsV0FBVzs7SUFBakMsTUFBTSxZQUFOLE1BQU07SUFBRSxPQUFPLFlBQVAsT0FBTzs7SUFDaEIsS0FBSywyQkFBTSxTQUFTOztJQUNwQixPQUFPLDJCQUFNLFdBQVc7OzBCQUNPLGNBQWM7O0lBQTVDLFVBQVUsZUFBVixVQUFVO0lBQUUsTUFBTSxlQUFOLE1BQU07SUFBRSxHQUFHLGVBQUgsR0FBRzs7QUFFL0IsSUFBTSxJQUFJLEdBQUcsRUFBQyxNQUFNLEVBQU4sTUFBTSxFQUFFLE9BQU8sRUFBUCxPQUFPLEVBQUUsS0FBSyxFQUFMLEtBQUssRUFBRSxNQUFNLEVBQU4sTUFBTSxFQUFFLEdBQUcsRUFBSCxHQUFHLEVBQUUsT0FBTyxFQUFQLE9BQU8sRUFBRSxVQUFVLEVBQVYsVUFBVSxFQUFDLENBQUM7O0FBRXhFLElBQUksQ0FBQyxZQUFZLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDbEMsU0FBTyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUN6QixDQUFDOztBQUVGLElBQUksQ0FBQyxhQUFhLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDbkMsU0FBTyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUMxQixDQUFDOztBQUVGLElBQUksQ0FBQyxXQUFXLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDakMsU0FBTyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUN4QixDQUFDOztpQkFFYSxJQUFJOzs7QUNuQm5CO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqa0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7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SSxFQUFFO0FBQy9CLFNBQU8sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxLQUFLLFFBQVEsR0FBRyxLQUFLLENBQUM7Q0FDaEUsQ0FBQztBQUNGLEtBQUssQ0FBQyxVQUFVLEdBQUcsVUFBVSxHQUFHLEVBQUU7QUFDaEMsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztBQUMxQyxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzFCLGNBQVUsS0FBSyxRQUFHLElBQUksQ0FBRztDQUMxQixDQUFDOztpQkFFYSxLQUFLIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImltcG9ydCB7QWN0aW9uLCBBY3Rpb25zfSBmcm9tICcuL0FjdGlvbnMnO1xuaW1wb3J0IFN0b3JlIGZyb20gJy4vU3RvcmUnO1xuaW1wb3J0IGhlbHBlcnMgZnJvbSAnLi9oZWxwZXJzJztcbmltcG9ydCB7Y3JlYXRlVmlldywgUm91dGVyLCBET019IGZyb20gJy4vRE9NSGVscGVycyc7XG5cbmNvbnN0IEV4aW0gPSB7QWN0aW9uLCBBY3Rpb25zLCBTdG9yZSwgUm91dGVyLCBET00sIGhlbHBlcnMsIGNyZWF0ZVZpZXd9O1xuXG5FeGltLmNyZWF0ZUFjdGlvbiA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gIHJldHVybiBuZXcgQWN0aW9uKGFyZ3MpO1xufTtcblxuRXhpbS5jcmVhdGVBY3Rpb25zID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgcmV0dXJuIG5ldyBBY3Rpb25zKGFyZ3MpO1xufTtcblxuRXhpbS5jcmVhdGVTdG9yZSA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gIHJldHVybiBuZXcgU3RvcmUoYXJncyk7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBFeGltO1xuIiwidmFyIEZyZWV6ZXIgPSByZXF1aXJlKCcuL3NyYy9mcmVlemVyJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEZyZWV6ZXI7IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIFV0aWxzID0gcmVxdWlyZSggJy4vdXRpbHMnICk7XHJcblxyXG4vLyNidWlsZFxyXG5cclxuLy8gVGhlIHByb3RvdHlwZSBtZXRob2RzIGFyZSBzdG9yZWQgaW4gYSBkaWZmZXJlbnQgb2JqZWN0XHJcbi8vIGFuZCBhcHBsaWVkIGFzIG5vbiBlbnVtZXJhYmxlIHByb3BlcnRpZXMgbGF0ZXJcclxudmFyIGVtaXR0ZXJQcm90byA9IHtcclxuXHRvbjogZnVuY3Rpb24oIGV2ZW50TmFtZSwgbGlzdGVuZXIsIG9uY2UgKXtcclxuXHRcdHZhciBsaXN0ZW5lcnMgPSB0aGlzLl9ldmVudHNbIGV2ZW50TmFtZSBdIHx8IFtdO1xyXG5cclxuXHRcdGxpc3RlbmVycy5wdXNoKHsgY2FsbGJhY2s6IGxpc3RlbmVyLCBvbmNlOiBvbmNlfSk7XHJcblx0XHR0aGlzLl9ldmVudHNbIGV2ZW50TmFtZSBdID0gIGxpc3RlbmVycztcclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRvbmNlOiBmdW5jdGlvbiggZXZlbnROYW1lLCBsaXN0ZW5lciApe1xyXG5cdFx0dGhpcy5vbiggZXZlbnROYW1lLCBsaXN0ZW5lciwgdHJ1ZSApO1xyXG5cdH0sXHJcblxyXG5cdG9mZjogZnVuY3Rpb24oIGV2ZW50TmFtZSwgbGlzdGVuZXIgKXtcclxuXHRcdGlmKCB0eXBlb2YgZXZlbnROYW1lID09ICd1bmRlZmluZWQnICl7XHJcblx0XHRcdHRoaXMuX2V2ZW50cyA9IHt9O1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSBpZiggdHlwZW9mIGxpc3RlbmVyID09ICd1bmRlZmluZWQnICkge1xyXG5cdFx0XHR0aGlzLl9ldmVudHNbIGV2ZW50TmFtZSBdID0gW107XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0dmFyIGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1sgZXZlbnROYW1lIF0gfHwgW10sXHJcblx0XHRcdFx0aVxyXG5cdFx0XHQ7XHJcblxyXG5cdFx0XHRmb3IgKGkgPSBsaXN0ZW5lcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuXHRcdFx0XHRpZiggbGlzdGVuZXJzW2ldLmNhbGxiYWNrID09PSBsaXN0ZW5lciApXHJcblx0XHRcdFx0XHRsaXN0ZW5lcnMuc3BsaWNlKCBpLCAxICk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHR0cmlnZ2VyOiBmdW5jdGlvbiggZXZlbnROYW1lICl7XHJcblx0XHR2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoIGFyZ3VtZW50cywgMSApLFxyXG5cdFx0XHRsaXN0ZW5lcnMgPSB0aGlzLl9ldmVudHNbIGV2ZW50TmFtZSBdIHx8IFtdLFxyXG5cdFx0XHRvbmNlTGlzdGVuZXJzID0gW10sXHJcblx0XHRcdGksIGxpc3RlbmVyXHJcblx0XHQ7XHJcblxyXG5cdFx0Ly8gQ2FsbCBsaXN0ZW5lcnNcclxuXHRcdGZvciAoaSA9IDA7IGkgPCBsaXN0ZW5lcnMubGVuZ3RoOyBpKyspIHtcclxuXHRcdFx0bGlzdGVuZXIgPSBsaXN0ZW5lcnNbaV07XHJcblxyXG5cdFx0XHRpZiggbGlzdGVuZXIuY2FsbGJhY2sgKVxyXG5cdFx0XHRcdGxpc3RlbmVyLmNhbGxiYWNrLmFwcGx5KCBudWxsLCBhcmdzICk7XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdC8vIElmIHRoZXJlIGlzIG5vdCBhIGNhbGxiYWNrLCByZW1vdmUhXHJcblx0XHRcdFx0bGlzdGVuZXIub25jZSA9IHRydWU7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGlmKCBsaXN0ZW5lci5vbmNlIClcclxuXHRcdFx0XHRvbmNlTGlzdGVuZXJzLnB1c2goIGkgKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBSZW1vdmUgbGlzdGVuZXJzIG1hcmtlZCBhcyBvbmNlXHJcblx0XHRmb3IoIGkgPSBvbmNlTGlzdGVuZXJzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tICl7XHJcblx0XHRcdGxpc3RlbmVycy5zcGxpY2UoIG9uY2VMaXN0ZW5lcnNbaV0sIDEgKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9XHJcbn07XHJcblxyXG4vLyBNZXRob2RzIGFyZSBub3QgZW51bWVyYWJsZSBzbywgd2hlbiB0aGUgc3RvcmVzIGFyZVxyXG4vLyBleHRlbmRlZCB3aXRoIHRoZSBlbWl0dGVyLCB0aGV5IGNhbiBiZSBpdGVyYXRlZCBhc1xyXG4vLyBoYXNobWFwc1xyXG52YXIgRW1pdHRlciA9IFV0aWxzLmNyZWF0ZU5vbkVudW1lcmFibGUoIGVtaXR0ZXJQcm90byApO1xyXG4vLyNidWlsZFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBFbWl0dGVyO1xyXG4iLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgVXRpbHMgPSByZXF1aXJlKCAnLi91dGlscy5qcycgKSxcclxuXHRFbWl0dGVyID0gcmVxdWlyZSggJy4vZW1pdHRlcicgKSxcclxuXHRNaXhpbnMgPSByZXF1aXJlKCAnLi9taXhpbnMnICksXHJcblx0RnJvemVuID0gcmVxdWlyZSggJy4vZnJvemVuJyApXHJcbjtcclxuXHJcbi8vI2J1aWxkXHJcbnZhciBGcmVlemVyID0gZnVuY3Rpb24oIGluaXRpYWxWYWx1ZSwgb3B0aW9ucyApIHtcclxuXHR2YXIgbWUgPSB0aGlzLFxyXG5cdFx0bXV0YWJsZSA9ICggb3B0aW9ucyAmJiBvcHRpb25zLm11dGFibGUgKSB8fCBmYWxzZSxcclxuXHRcdGxpdmUgPSAoIG9wdGlvbnMgJiYgb3B0aW9ucy5saXZlICkgfHwgbGl2ZVxyXG5cdDtcclxuXHJcblx0Ly8gSW1tdXRhYmxlIGRhdGFcclxuXHR2YXIgZnJvemVuO1xyXG5cclxuXHR2YXIgbm90aWZ5ID0gZnVuY3Rpb24gbm90aWZ5KCBldmVudE5hbWUsIG5vZGUsIG9wdGlvbnMgKXtcclxuXHRcdGlmKCBldmVudE5hbWUgPT0gJ2xpc3RlbmVyJyApXHJcblx0XHRcdHJldHVybiBGcm96ZW4uY3JlYXRlTGlzdGVuZXIoIG5vZGUgKTtcclxuXHJcblx0XHRyZXR1cm4gRnJvemVuLnVwZGF0ZSggZXZlbnROYW1lLCBub2RlLCBvcHRpb25zICk7XHJcblx0fTtcclxuXHJcblx0dmFyIGZyZWV6ZSA9IGZ1bmN0aW9uKCl7fTtcclxuXHRpZiggIW11dGFibGUgKVxyXG5cdFx0ZnJlZXplID0gZnVuY3Rpb24oIG9iaiApeyBPYmplY3QuZnJlZXplKCBvYmogKTsgfTtcclxuXHJcblx0Ly8gQ3JlYXRlIHRoZSBmcm96ZW4gb2JqZWN0XHJcblx0ZnJvemVuID0gRnJvemVuLmZyZWV6ZSggaW5pdGlhbFZhbHVlLCBub3RpZnksIGZyZWV6ZSwgbGl2ZSApO1xyXG5cclxuXHQvLyBMaXN0ZW4gdG8gaXRzIGNoYW5nZXMgaW1tZWRpYXRlbHlcclxuXHR2YXIgbGlzdGVuZXIgPSBmcm96ZW4uZ2V0TGlzdGVuZXIoKTtcclxuXHJcblx0Ly8gVXBkYXRpbmcgZmxhZyB0byB0cmlnZ2VyIHRoZSBldmVudCBvbiBuZXh0VGlja1xyXG5cdHZhciB1cGRhdGluZyA9IGZhbHNlO1xyXG5cclxuXHRsaXN0ZW5lci5vbiggJ2ltbWVkaWF0ZScsIGZ1bmN0aW9uKCBwcmV2Tm9kZSwgdXBkYXRlZCApe1xyXG5cdFx0aWYoIHByZXZOb2RlICE9IGZyb3plbiApXHJcblx0XHRcdHJldHVybjtcclxuXHJcblx0XHRmcm96ZW4gPSB1cGRhdGVkO1xyXG5cclxuXHRcdGlmKCBsaXZlIClcclxuXHRcdFx0cmV0dXJuIG1lLnRyaWdnZXIoICd1cGRhdGUnLCB1cGRhdGVkICk7XHJcblxyXG5cdFx0Ly8gVHJpZ2dlciBvbiBuZXh0IHRpY2tcclxuXHRcdGlmKCAhdXBkYXRpbmcgKXtcclxuXHRcdFx0dXBkYXRpbmcgPSB0cnVlO1xyXG5cdFx0XHRVdGlscy5uZXh0VGljayggZnVuY3Rpb24oKXtcclxuXHRcdFx0XHR1cGRhdGluZyA9IGZhbHNlO1xyXG5cdFx0XHRcdG1lLnRyaWdnZXIoICd1cGRhdGUnLCBmcm96ZW4gKTtcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0fSk7XHJcblxyXG5cdFV0aWxzLmFkZE5FKCB0aGlzLCB7XHJcblx0XHRnZXQ6IGZ1bmN0aW9uKCl7XHJcblx0XHRcdHJldHVybiBmcm96ZW47XHJcblx0XHR9LFxyXG5cdFx0c2V0OiBmdW5jdGlvbiggbm9kZSApe1xyXG5cdFx0XHR2YXIgbmV3Tm9kZSA9IG5vdGlmeSggJ3Jlc2V0JywgZnJvemVuLCBub2RlICk7XHJcblx0XHRcdG5ld05vZGUuX18ubGlzdGVuZXIudHJpZ2dlciggJ2ltbWVkaWF0ZScsIGZyb3plbiwgbmV3Tm9kZSApO1xyXG5cdFx0fVxyXG5cdH0pO1xyXG5cclxuXHRVdGlscy5hZGRORSggdGhpcywgeyBnZXREYXRhOiB0aGlzLmdldCwgc2V0RGF0YTogdGhpcy5zZXQgfSApO1xyXG5cclxuXHQvLyBUaGUgZXZlbnQgc3RvcmVcclxuXHR0aGlzLl9ldmVudHMgPSBbXTtcclxufVxyXG5cclxuRnJlZXplci5wcm90b3R5cGUgPSBVdGlscy5jcmVhdGVOb25FbnVtZXJhYmxlKHtjb25zdHJ1Y3RvcjogRnJlZXplcn0sIEVtaXR0ZXIpO1xyXG4vLyNidWlsZFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBGcmVlemVyO1xyXG4iLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgVXRpbHMgPSByZXF1aXJlKCAnLi91dGlscycgKSxcclxuXHRNaXhpbnMgPSByZXF1aXJlKCAnLi9taXhpbnMnKSxcclxuXHRFbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJylcclxuO1xyXG5cclxuLy8jYnVpbGRcclxudmFyIEZyb3plbiA9IHtcclxuXHRmcmVlemU6IGZ1bmN0aW9uKCBub2RlLCBub3RpZnksIGZyZWV6ZUZuLCBsaXZlICl7XHJcblx0XHRpZiggbm9kZSAmJiBub2RlLl9fICl7XHJcblx0XHRcdHJldHVybiBub2RlO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdGZyb3plbiwgbWl4aW4sIGNvbnNcclxuXHRcdDtcclxuXHJcblx0XHRpZiggbm9kZS5jb25zdHJ1Y3RvciA9PSBBcnJheSApe1xyXG5cdFx0XHRmcm96ZW4gPSB0aGlzLmNyZWF0ZUFycmF5KCBub2RlLmxlbmd0aCApO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdGZyb3plbiA9IE9iamVjdC5jcmVhdGUoIE1peGlucy5IYXNoICk7XHJcblx0XHR9XHJcblxyXG5cdFx0VXRpbHMuYWRkTkUoIGZyb3plbiwgeyBfXzoge1xyXG5cdFx0XHRsaXN0ZW5lcjogZmFsc2UsXHJcblx0XHRcdHBhcmVudHM6IFtdLFxyXG5cdFx0XHRub3RpZnk6IG5vdGlmeSxcclxuXHRcdFx0ZGlydHk6IGZhbHNlLFxyXG5cdFx0XHRmcmVlemVGbjogZnJlZXplRm4sXHJcblx0XHRcdGxpdmU6IGxpdmUgfHwgZmFsc2VcclxuXHRcdH19KTtcclxuXHJcblx0XHQvLyBGcmVlemUgY2hpbGRyZW5cclxuXHRcdFV0aWxzLmVhY2goIG5vZGUsIGZ1bmN0aW9uKCBjaGlsZCwga2V5ICl7XHJcblx0XHRcdGNvbnMgPSBjaGlsZCAmJiBjaGlsZC5jb25zdHJ1Y3RvcjtcclxuXHRcdFx0aWYoIGNvbnMgPT0gQXJyYXkgfHwgY29ucyA9PSBPYmplY3QgKXtcclxuXHRcdFx0XHRjaGlsZCA9IG1lLmZyZWV6ZSggY2hpbGQsIG5vdGlmeSwgZnJlZXplRm4sIGxpdmUgKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYoIGNoaWxkICYmIGNoaWxkLl9fICl7XHJcblx0XHRcdFx0bWUuYWRkUGFyZW50KCBjaGlsZCwgZnJvemVuICk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGZyb3plblsga2V5IF0gPSBjaGlsZDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdGZyZWV6ZUZuKCBmcm96ZW4gKTtcclxuXHJcblx0XHRyZXR1cm4gZnJvemVuO1xyXG5cdH0sXHJcblxyXG5cdHVwZGF0ZTogZnVuY3Rpb24oIHR5cGUsIG5vZGUsIG9wdGlvbnMgKXtcclxuXHRcdGlmKCAhdGhpc1sgdHlwZSBdKVxyXG5cdFx0XHRyZXR1cm4gVXRpbHMuZXJyb3IoICdVbmtub3duIHVwZGF0ZSB0eXBlOiAnICsgdHlwZSApO1xyXG5cclxuXHRcdHJldHVybiB0aGlzWyB0eXBlIF0oIG5vZGUsIG9wdGlvbnMgKTtcclxuXHR9LFxyXG5cclxuXHRyZXNldDogZnVuY3Rpb24oIG5vZGUsIHZhbHVlICl7XHJcblx0XHR2YXIgbWUgPSB0aGlzLFxyXG5cdFx0XHRfID0gbm9kZS5fXyxcclxuXHRcdFx0ZnJvemVuXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIHZhbHVlICYmIHZhbHVlLl9fICl7XHJcblx0XHRcdGZyb3plbiA9IHZhbHVlO1xyXG5cdFx0XHRmcm96ZW4uX18ubGlzdGVuZXIgPSB2YWx1ZS5fXy5saXN0ZW5lcjtcclxuXHRcdFx0ZnJvemVuLl9fLnBhcmVudHMgPSBbXTtcclxuXHJcblx0XHRcdC8vIFNldCBiYWNrIHRoZSBwYXJlbnQgb24gdGhlIGNoaWxkcmVuXHJcblx0XHRcdC8vIHRoYXQgaGF2ZSBiZWVuIHVwZGF0ZWRcclxuXHRcdFx0dGhpcy5maXhDaGlsZHJlbiggZnJvemVuLCBub2RlICk7XHJcblx0XHRcdFV0aWxzLmVhY2goIGZyb3plbiwgZnVuY3Rpb24oIGNoaWxkICl7XHJcblx0XHRcdFx0aWYoIGNoaWxkICYmIGNoaWxkLl9fICl7XHJcblx0XHRcdFx0XHRtZS5yZW1vdmVQYXJlbnQoIG5vZGUgKTtcclxuXHRcdFx0XHRcdG1lLmFkZFBhcmVudCggY2hpbGQsIGZyb3plbiApO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0ZnJvemVuID0gdGhpcy5mcmVlemUoIG5vZGUsIF8ubm90aWZ5LCBfLmZyZWV6ZUZuLCBfLmxpdmUgKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gZnJvemVuO1xyXG5cdH0sXHJcblxyXG5cdG1lcmdlOiBmdW5jdGlvbiggbm9kZSwgYXR0cnMgKXtcclxuXHRcdHZhciBfID0gbm9kZS5fXyxcclxuXHRcdFx0dHJhbnMgPSBfLnRyYW5zLFxyXG5cclxuXHRcdFx0Ly8gQ2xvbmUgdGhlIGF0dHJzIHRvIG5vdCBtb2RpZnkgdGhlIGFyZ3VtZW50XHJcblx0XHRcdGF0dHJzID0gVXRpbHMuZXh0ZW5kKCB7fSwgYXR0cnMpXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIHRyYW5zICl7XHJcblxyXG5cdFx0XHRmb3IoIHZhciBhdHRyIGluIGF0dHJzIClcclxuXHRcdFx0XHR0cmFuc1sgYXR0ciBdID0gYXR0cnNbIGF0dHIgXTtcclxuXHRcdFx0cmV0dXJuIG5vZGU7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0ZnJvemVuID0gdGhpcy5jb3B5TWV0YSggbm9kZSApLFxyXG5cdFx0XHRub3RpZnkgPSBfLm5vdGlmeSxcclxuXHRcdFx0dmFsLCBjb25zLCBrZXksIGlzRnJvemVuXHJcblx0XHQ7XHJcblxyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkLCBrZXkgKXtcclxuXHRcdFx0aXNGcm96ZW4gPSBjaGlsZCAmJiBjaGlsZC5fXztcclxuXHJcblx0XHRcdGlmKCBpc0Zyb3plbiApe1xyXG5cdFx0XHRcdG1lLnJlbW92ZVBhcmVudCggY2hpbGQsIG5vZGUgKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0dmFsID0gYXR0cnNbIGtleSBdO1xyXG5cdFx0XHRpZiggIXZhbCApe1xyXG5cdFx0XHRcdGlmKCBpc0Zyb3plbiApXHJcblx0XHRcdFx0XHRtZS5hZGRQYXJlbnQoIGNoaWxkLCBmcm96ZW4gKTtcclxuXHRcdFx0XHRyZXR1cm4gZnJvemVuWyBrZXkgXSA9IGNoaWxkO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRjb25zID0gdmFsICYmIHZhbC5jb25zdHJ1Y3RvcjtcclxuXHJcblx0XHRcdGlmKCBjb25zID09IEFycmF5IHx8IGNvbnMgPT0gT2JqZWN0IClcclxuXHRcdFx0XHR2YWwgPSBtZS5mcmVlemUoIHZhbCwgbm90aWZ5LCBfLmZyZWV6ZUZuLCBfLmxpdmUgKTtcclxuXHJcblx0XHRcdGlmKCB2YWwgJiYgdmFsLl9fIClcclxuXHRcdFx0XHRtZS5hZGRQYXJlbnQoIHZhbCwgZnJvemVuICk7XHJcblxyXG5cdFx0XHRkZWxldGUgYXR0cnNbIGtleSBdO1xyXG5cclxuXHRcdFx0ZnJvemVuWyBrZXkgXSA9IHZhbDtcclxuXHRcdH0pO1xyXG5cclxuXHJcblx0XHRmb3IoIGtleSBpbiBhdHRycyApIHtcclxuXHRcdFx0dmFsID0gYXR0cnNbIGtleSBdO1xyXG5cdFx0XHRjb25zID0gdmFsICYmIHZhbC5jb25zdHJ1Y3RvcjtcclxuXHJcblx0XHRcdGlmKCBjb25zID09IEFycmF5IHx8IGNvbnMgPT0gT2JqZWN0IClcclxuXHRcdFx0XHR2YWwgPSBtZS5mcmVlemUoIHZhbCwgbm90aWZ5LCBfLmZyZWV6ZUZuLCBfLmxpdmUgKTtcclxuXHJcblx0XHRcdGlmKCB2YWwgJiYgdmFsLl9fIClcclxuXHRcdFx0XHRtZS5hZGRQYXJlbnQoIHZhbCwgZnJvemVuICk7XHJcblxyXG5cdFx0XHRmcm96ZW5bIGtleSBdID0gdmFsO1xyXG5cdFx0fVxyXG5cclxuXHRcdF8uZnJlZXplRm4oIGZyb3plbiApO1xyXG5cclxuXHRcdHRoaXMucmVmcmVzaFBhcmVudHMoIG5vZGUsIGZyb3plbiApO1xyXG5cclxuXHRcdHJldHVybiBmcm96ZW47XHJcblx0fSxcclxuXHJcblx0cmVwbGFjZTogZnVuY3Rpb24oIG5vZGUsIHJlcGxhY2VtZW50ICkge1xyXG5cclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdGNvbnMgPSByZXBsYWNlbWVudCAmJiByZXBsYWNlbWVudC5jb25zdHJ1Y3RvcixcclxuXHRcdFx0XyA9IG5vZGUuX18sXHJcblx0XHRcdGZyb3plbiA9IHJlcGxhY2VtZW50XHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIGNvbnMgPT0gQXJyYXkgfHwgY29ucyA9PSBPYmplY3QgKSB7XHJcblxyXG5cdFx0XHRmcm96ZW4gPSBtZS5mcmVlemUoIHJlcGxhY2VtZW50LCBfLm5vdGlmeSwgXy5mcmVlemVGbiwgXy5saXZlICk7XHJcblxyXG5cdFx0XHRmcm96ZW4uX18ucGFyZW50cyA9IF8ucGFyZW50cztcclxuXHJcblx0XHRcdC8vIEFkZCB0aGUgY3VycmVudCBsaXN0ZW5lciBpZiBleGlzdHMsIHJlcGxhY2luZyBhXHJcblx0XHRcdC8vIHByZXZpb3VzIGxpc3RlbmVyIGluIHRoZSBmcm96ZW4gaWYgZXhpc3RlZFxyXG5cdFx0XHRpZiggXy5saXN0ZW5lciApXHJcblx0XHRcdFx0ZnJvemVuLl9fLmxpc3RlbmVyID0gXy5saXN0ZW5lcjtcclxuXHJcblx0XHRcdC8vIFNpbmNlIHRoZSBwYXJlbnRzIHdpbGwgYmUgcmVmcmVzaGVkIGRpcmVjdGx5LFxyXG5cdFx0XHQvLyBUcmlnZ2VyIHRoZSBsaXN0ZW5lciBoZXJlXHJcblx0XHRcdGlmKCBmcm96ZW4uX18ubGlzdGVuZXIgKVxyXG5cdFx0XHRcdHRoaXMudHJpZ2dlciggZnJvemVuLCAndXBkYXRlJywgZnJvemVuICk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gUmVmcmVzaCB0aGUgcGFyZW50IG5vZGVzIGRpcmVjdGx5XHJcblx0XHRpZiggIV8ucGFyZW50cy5sZW5ndGggJiYgXy5saXN0ZW5lciApe1xyXG5cdFx0XHRfLmxpc3RlbmVyLnRyaWdnZXIoICdpbW1lZGlhdGUnLCBub2RlLCBmcm96ZW4gKTtcclxuXHRcdH1cclxuXHRcdGZvciAodmFyIGkgPSBfLnBhcmVudHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuXHRcdFx0aWYoIGkgPT0gMCApe1xyXG5cdFx0XHRcdHRoaXMucmVmcmVzaCggXy5wYXJlbnRzW2ldLCBub2RlLCBmcm96ZW4sIGZhbHNlICk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZXtcclxuXHJcblx0XHRcdFx0dGhpcy5tYXJrRGlydHkoIF8ucGFyZW50c1tpXSwgW25vZGUsIGZyb3plbl0gKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIGZyb3plbjtcclxuXHR9LFxyXG5cclxuXHRyZW1vdmU6IGZ1bmN0aW9uKCBub2RlLCBhdHRycyApe1xyXG5cdFx0dmFyIHRyYW5zID0gbm9kZS5fXy50cmFucztcclxuXHRcdGlmKCB0cmFucyApe1xyXG5cdFx0XHRmb3IoIHZhciBsID0gYXR0cnMubGVuZ3RoIC0gMTsgbCA+PSAwOyBsLS0gKVxyXG5cdFx0XHRcdGRlbGV0ZSB0cmFuc1sgYXR0cnNbbF0gXTtcclxuXHRcdFx0cmV0dXJuIG5vZGU7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0ZnJvemVuID0gdGhpcy5jb3B5TWV0YSggbm9kZSApLFxyXG5cdFx0XHRpc0Zyb3plblxyXG5cdFx0O1xyXG5cclxuXHRcdFV0aWxzLmVhY2goIG5vZGUsIGZ1bmN0aW9uKCBjaGlsZCwga2V5ICl7XHJcblx0XHRcdGlzRnJvemVuID0gY2hpbGQgJiYgY2hpbGQuX187XHJcblxyXG5cdFx0XHRpZiggaXNGcm96ZW4gKXtcclxuXHRcdFx0XHRtZS5yZW1vdmVQYXJlbnQoIGNoaWxkLCBub2RlICk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGlmKCBhdHRycy5pbmRleE9mKCBrZXkgKSAhPSAtMSApe1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYoIGlzRnJvemVuIClcclxuXHRcdFx0XHRtZS5hZGRQYXJlbnQoIGNoaWxkLCBmcm96ZW4gKTtcclxuXHJcblx0XHRcdGZyb3plblsga2V5IF0gPSBjaGlsZDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdG5vZGUuX18uZnJlZXplRm4oIGZyb3plbiApO1xyXG5cdFx0dGhpcy5yZWZyZXNoUGFyZW50cyggbm9kZSwgZnJvemVuICk7XHJcblxyXG5cdFx0cmV0dXJuIGZyb3plbjtcclxuXHR9LFxyXG5cclxuXHRzcGxpY2U6IGZ1bmN0aW9uKCBub2RlLCBhcmdzICl7XHJcblx0XHR2YXIgXyA9IG5vZGUuX18sXHJcblx0XHRcdHRyYW5zID0gXy50cmFuc1xyXG5cdFx0O1xyXG5cclxuXHRcdGlmKCB0cmFucyApe1xyXG5cdFx0XHR0cmFucy5zcGxpY2UuYXBwbHkoIHRyYW5zLCBhcmdzICk7XHJcblx0XHRcdHJldHVybiBub2RlO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdGZyb3plbiA9IHRoaXMuY29weU1ldGEoIG5vZGUgKSxcclxuXHRcdFx0aW5kZXggPSBhcmdzWzBdLFxyXG5cdFx0XHRkZWxldGVJbmRleCA9IGluZGV4ICsgYXJnc1sxXSxcclxuXHRcdFx0Y29uLCBjaGlsZFxyXG5cdFx0O1xyXG5cclxuXHRcdC8vIENsb25lIHRoZSBhcnJheVxyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkLCBpICl7XHJcblxyXG5cdFx0XHRpZiggY2hpbGQgJiYgY2hpbGQuX18gKXtcclxuXHRcdFx0XHRtZS5yZW1vdmVQYXJlbnQoIGNoaWxkLCBub2RlICk7XHJcblxyXG5cdFx0XHRcdC8vIFNraXAgdGhlIG5vZGVzIHRvIGRlbGV0ZVxyXG5cdFx0XHRcdGlmKCBpIDwgaW5kZXggfHwgaT49IGRlbGV0ZUluZGV4IClcclxuXHRcdFx0XHRcdG1lLmFkZFBhcmVudCggY2hpbGQsIGZyb3plbiApO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRmcm96ZW5baV0gPSBjaGlsZDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdC8vIFByZXBhcmUgdGhlIG5ldyBub2Rlc1xyXG5cdFx0aWYoIGFyZ3MubGVuZ3RoID4gMSApe1xyXG5cdFx0XHRmb3IgKHZhciBpID0gYXJncy5sZW5ndGggLSAxOyBpID49IDI7IGktLSkge1xyXG5cdFx0XHRcdGNoaWxkID0gYXJnc1tpXTtcclxuXHRcdFx0XHRjb24gPSBjaGlsZCAmJiBjaGlsZC5jb25zdHJ1Y3RvcjtcclxuXHJcblx0XHRcdFx0aWYoIGNvbiA9PSBBcnJheSB8fCBjb24gPT0gT2JqZWN0IClcclxuXHRcdFx0XHRcdGNoaWxkID0gdGhpcy5mcmVlemUoIGNoaWxkLCBfLm5vdGlmeSwgXy5mcmVlemVGbiwgXy5saXZlICk7XHJcblxyXG5cdFx0XHRcdGlmKCBjaGlsZCAmJiBjaGlsZC5fXyApXHJcblx0XHRcdFx0XHR0aGlzLmFkZFBhcmVudCggY2hpbGQsIGZyb3plbiApO1xyXG5cclxuXHRcdFx0XHRhcmdzW2ldID0gY2hpbGQ7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHQvLyBzcGxpY2VcclxuXHRcdEFycmF5LnByb3RvdHlwZS5zcGxpY2UuYXBwbHkoIGZyb3plbiwgYXJncyApO1xyXG5cclxuXHRcdG5vZGUuX18uZnJlZXplRm4oIGZyb3plbiApO1xyXG5cdFx0dGhpcy5yZWZyZXNoUGFyZW50cyggbm9kZSwgZnJvemVuICk7XHJcblxyXG5cdFx0cmV0dXJuIGZyb3plbjtcclxuXHR9LFxyXG5cclxuXHR0cmFuc2FjdDogZnVuY3Rpb24oIG5vZGUgKSB7XHJcblx0XHR2YXIgbWUgPSB0aGlzLFxyXG5cdFx0XHR0cmFuc2FjdGluZyA9IG5vZGUuX18udHJhbnMsXHJcblx0XHRcdHRyYW5zXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIHRyYW5zYWN0aW5nIClcclxuXHRcdFx0cmV0dXJuIHRyYW5zYWN0aW5nO1xyXG5cclxuXHRcdHRyYW5zID0gbm9kZS5jb25zdHJ1Y3RvciA9PSBBcnJheSA/IFtdIDoge307XHJcblxyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkLCBrZXkgKXtcclxuXHRcdFx0dHJhbnNbIGtleSBdID0gY2hpbGQ7XHJcblx0XHR9KTtcclxuXHJcblx0XHRub2RlLl9fLnRyYW5zID0gdHJhbnM7XHJcblxyXG5cdFx0Ly8gQ2FsbCBydW4gYXV0b21hdGljYWxseSBpbiBjYXNlXHJcblx0XHQvLyB0aGUgdXNlciBmb3Jnb3QgYWJvdXQgaXRcclxuXHRcdFV0aWxzLm5leHRUaWNrKCBmdW5jdGlvbigpe1xyXG5cdFx0XHRpZiggbm9kZS5fXy50cmFucyApXHJcblx0XHRcdFx0bWUucnVuKCBub2RlICk7XHJcblx0XHR9KTtcclxuXHJcblx0XHRyZXR1cm4gdHJhbnM7XHJcblx0fSxcclxuXHJcblx0cnVuOiBmdW5jdGlvbiggbm9kZSApIHtcclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdHRyYW5zID0gbm9kZS5fXy50cmFuc1xyXG5cdFx0O1xyXG5cclxuXHRcdGlmKCAhdHJhbnMgKVxyXG5cdFx0XHRyZXR1cm4gbm9kZTtcclxuXHJcblx0XHQvLyBSZW1vdmUgdGhlIG5vZGUgYXMgYSBwYXJlbnRcclxuXHRcdFV0aWxzLmVhY2goIHRyYW5zLCBmdW5jdGlvbiggY2hpbGQsIGtleSApe1xyXG5cdFx0XHRpZiggY2hpbGQgJiYgY2hpbGQuX18gKXtcclxuXHRcdFx0XHRtZS5yZW1vdmVQYXJlbnQoIGNoaWxkLCBub2RlICk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cclxuXHRcdGRlbGV0ZSBub2RlLl9fLnRyYW5zO1xyXG5cclxuXHRcdHZhciByZXN1bHQgPSB0aGlzLnJlcGxhY2UoIG5vZGUsIHRyYW5zICk7XHJcblx0XHRyZXR1cm4gcmVzdWx0O1xyXG5cdH0sXHJcblxyXG5cdHJlZnJlc2g6IGZ1bmN0aW9uKCBub2RlLCBvbGRDaGlsZCwgbmV3Q2hpbGQsIHJldHVyblVwZGF0ZWQgKXtcclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdHRyYW5zID0gbm9kZS5fXy50cmFucyxcclxuXHRcdFx0Zm91bmQgPSAwXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIHRyYW5zICl7XHJcblxyXG5cdFx0XHRVdGlscy5lYWNoKCB0cmFucywgZnVuY3Rpb24oIGNoaWxkLCBrZXkgKXtcclxuXHRcdFx0XHRpZiggZm91bmQgKSByZXR1cm47XHJcblxyXG5cdFx0XHRcdGlmKCBjaGlsZCA9PT0gb2xkQ2hpbGQgKXtcclxuXHJcblx0XHRcdFx0XHR0cmFuc1sga2V5IF0gPSBuZXdDaGlsZDtcclxuXHRcdFx0XHRcdGZvdW5kID0gMTtcclxuXHJcblx0XHRcdFx0XHRpZiggbmV3Q2hpbGQgJiYgbmV3Q2hpbGQuX18gKVxyXG5cdFx0XHRcdFx0XHRtZS5hZGRQYXJlbnQoIG5ld0NoaWxkLCBub2RlICk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9KTtcclxuXHJcblx0XHRcdHJldHVybiBub2RlO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBmcm96ZW4gPSB0aGlzLmNvcHlNZXRhKCBub2RlICksXHJcblx0XHRcdGRpcnR5ID0gbm9kZS5fXy5kaXJ0eSxcclxuXHRcdFx0ZGlydCwgcmVwbGFjZW1lbnQsIF9fXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIGRpcnR5ICl7XHJcblx0XHRcdGRpcnQgPSBkaXJ0eVswXSxcclxuXHRcdFx0cmVwbGFjZW1lbnQgPSBkaXJ0eVsxXVxyXG5cdFx0fVxyXG5cclxuXHRcdFV0aWxzLmVhY2goIG5vZGUsIGZ1bmN0aW9uKCBjaGlsZCwga2V5ICl7XHJcblx0XHRcdGlmKCBjaGlsZCA9PT0gb2xkQ2hpbGQgKXtcclxuXHRcdFx0XHRjaGlsZCA9IG5ld0NoaWxkO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYoIGNoaWxkID09PSBkaXJ0ICl7XHJcblx0XHRcdFx0Y2hpbGQgPSByZXBsYWNlbWVudDtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYoIGNoaWxkICYmIChfXyA9IGNoaWxkLl9fKSApe1xyXG5cclxuXHRcdFx0XHQvLyBJZiB0aGVyZSBpcyBhIHRyYW5zIGhhcHBlbmluZyB3ZVxyXG5cdFx0XHRcdC8vIGRvbid0IHVwZGF0ZSBhIGRpcnR5IG5vZGUgbm93LiBUaGUgdXBkYXRlXHJcblx0XHRcdFx0Ly8gd2lsbCBvY2N1ciBvbiBydW4uXHJcblx0XHRcdFx0aWYoICFfXy50cmFucyAmJiBfXy5kaXJ0eSApe1xyXG5cdFx0XHRcdFx0Y2hpbGQgPSBtZS5yZWZyZXNoKCBjaGlsZCwgX18uZGlydHlbMF0sIF9fLmRpcnR5WzFdLCB0cnVlICk7XHJcblx0XHRcdFx0fVxyXG5cclxuXHJcblx0XHRcdFx0bWUucmVtb3ZlUGFyZW50KCBjaGlsZCwgbm9kZSApO1xyXG5cdFx0XHRcdG1lLmFkZFBhcmVudCggY2hpbGQsIGZyb3plbiApO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRmcm96ZW5bIGtleSBdID0gY2hpbGQ7XHJcblx0XHR9KTtcclxuXHJcblx0XHRub2RlLl9fLmZyZWV6ZUZuKCBmcm96ZW4gKTtcclxuXHJcblx0XHQvLyBJZiB0aGUgbm9kZSB3YXMgZGlydHksIGNsZWFuIGl0XHJcblx0XHRub2RlLl9fLmRpcnR5ID0gZmFsc2U7XHJcblxyXG5cdFx0aWYoIHJldHVyblVwZGF0ZWQgKVxyXG5cdFx0XHRyZXR1cm4gZnJvemVuO1xyXG5cclxuXHRcdHRoaXMucmVmcmVzaFBhcmVudHMoIG5vZGUsIGZyb3plbiApO1xyXG5cdH0sXHJcblxyXG5cdGZpeENoaWxkcmVuOiBmdW5jdGlvbiggbm9kZSwgb2xkTm9kZSApe1xyXG5cdFx0dmFyIG1lID0gdGhpcztcclxuXHRcdFV0aWxzLmVhY2goIG5vZGUsIGZ1bmN0aW9uKCBjaGlsZCApe1xyXG5cdFx0XHRpZiggIWNoaWxkIHx8ICFjaGlsZC5fXyApXHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cclxuXHRcdFx0Ly8gSWYgdGhlIGNoaWxkIGlzIGxpbmtlZCB0byB0aGUgbm9kZSxcclxuXHRcdFx0Ly8gbWF5YmUgaXRzIGNoaWxkcmVuIGFyZSBub3QgbGlua2VkXHJcblx0XHRcdGlmKCBjaGlsZC5fXy5wYXJlbnRzLmluZGV4T2YoIG5vZGUgKSAhPSAtMSApXHJcblx0XHRcdFx0cmV0dXJuIG1lLmZpeENoaWxkcmVuKCBjaGlsZCApO1xyXG5cclxuXHRcdFx0Ly8gSWYgdGhlIGNoaWxkIHdhc24ndCBsaW5rZWQgaXQgaXMgc3VyZVxyXG5cdFx0XHQvLyB0aGF0IGl0IHdhc24ndCBtb2RpZmllZC4gSnVzdCBsaW5rIGl0XHJcblx0XHRcdC8vIHRvIHRoZSBuZXcgcGFyZW50XHJcblx0XHRcdGlmKCBjaGlsZC5fXy5wYXJlbnRzLmxlbmd0aCA9PSAxIClcclxuXHRcdFx0XHRyZXR1cm4gY2hpbGQuX18ucGFyZW50cyA9IFsgbm9kZSBdO1xyXG5cclxuXHRcdFx0aWYoIG9sZE5vZGUgKVxyXG5cdFx0XHRcdG1lLnJlbW92ZVBhcmVudCggY2hpbGQsIG9sZE5vZGUgKTtcclxuXHJcblx0XHRcdG1lLmFkZFBhcmVudCggY2hpbGQsIG5vZGUgKTtcclxuXHRcdH0pO1xyXG5cdH0sXHJcblxyXG5cdGNvcHlNZXRhOiBmdW5jdGlvbiggbm9kZSApe1xyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0ZnJvemVuXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIG5vZGUuY29uc3RydWN0b3IgPT0gQXJyYXkgKXtcclxuXHRcdFx0ZnJvemVuID0gdGhpcy5jcmVhdGVBcnJheSggbm9kZS5sZW5ndGggKTtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRmcm96ZW4gPSBPYmplY3QuY3JlYXRlKCBNaXhpbnMuSGFzaCApO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBfID0gbm9kZS5fXztcclxuXHJcblx0XHRVdGlscy5hZGRORSggZnJvemVuLCB7X186IHtcclxuXHRcdFx0bm90aWZ5OiBfLm5vdGlmeSxcclxuXHRcdFx0bGlzdGVuZXI6IF8ubGlzdGVuZXIsXHJcblx0XHRcdHBhcmVudHM6IF8ucGFyZW50cy5zbGljZSggMCApLFxyXG5cdFx0XHR0cmFuczogXy50cmFucyxcclxuXHRcdFx0ZGlydHk6IGZhbHNlLFxyXG5cdFx0XHRmcmVlemVGbjogXy5mcmVlemVGblxyXG5cdFx0fX0pO1xyXG5cclxuXHRcdHJldHVybiBmcm96ZW47XHJcblx0fSxcclxuXHJcblx0cmVmcmVzaFBhcmVudHM6IGZ1bmN0aW9uKCBvbGRDaGlsZCwgbmV3Q2hpbGQgKXtcclxuXHRcdHZhciBfID0gb2xkQ2hpbGQuX18sXHJcblx0XHRcdGlcclxuXHRcdDtcclxuXHJcblx0XHRpZiggXy5saXN0ZW5lciApXHJcblx0XHRcdHRoaXMudHJpZ2dlciggbmV3Q2hpbGQsICd1cGRhdGUnLCBuZXdDaGlsZCApO1xyXG5cclxuXHRcdGlmKCAhXy5wYXJlbnRzLmxlbmd0aCApe1xyXG5cdFx0XHRpZiggXy5saXN0ZW5lciApe1xyXG5cdFx0XHRcdF8ubGlzdGVuZXIudHJpZ2dlciggJ2ltbWVkaWF0ZScsIG9sZENoaWxkLCBuZXdDaGlsZCApO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0Zm9yIChpID0gXy5wYXJlbnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcblx0XHRcdFx0Ly8gSWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBwYXJlbnQsIG1hcmsgZXZlcnlvbmUgYXMgZGlydHlcclxuXHRcdFx0XHQvLyBidXQgdGhlIGxhc3QgaW4gdGhlIGl0ZXJhdGlvbiwgYW5kIHdoZW4gdGhlIGxhc3QgaXMgcmVmcmVzaGVkXHJcblx0XHRcdFx0Ly8gaXQgd2lsbCB1cGRhdGUgdGhlIGRpcnR5IG5vZGVzLlxyXG5cdFx0XHRcdGlmKCBpID09IDAgKVxyXG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoKCBfLnBhcmVudHNbaV0sIG9sZENoaWxkLCBuZXdDaGlsZCwgZmFsc2UgKTtcclxuXHRcdFx0XHRlbHNle1xyXG5cclxuXHRcdFx0XHRcdHRoaXMubWFya0RpcnR5KCBfLnBhcmVudHNbaV0sIFtvbGRDaGlsZCwgbmV3Q2hpbGRdICk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0bWFya0RpcnR5OiBmdW5jdGlvbiggbm9kZSwgZGlydCApe1xyXG5cdFx0dmFyIF8gPSBub2RlLl9fLFxyXG5cdFx0XHRpXHJcblx0XHQ7XHJcblx0XHRfLmRpcnR5ID0gZGlydDtcclxuXHJcblx0XHQvLyBJZiB0aGVyZSBpcyBhIHRyYW5zYWN0aW9uIGhhcHBlbmluZyBpbiB0aGUgbm9kZVxyXG5cdFx0Ly8gdXBkYXRlIHRoZSB0cmFuc2FjdGlvbiBkYXRhIGltbWVkaWF0ZWx5XHJcblx0XHRpZiggXy50cmFucyApXHJcblx0XHRcdHRoaXMucmVmcmVzaCggbm9kZSwgZGlydFswXSwgZGlydFsxXSApO1xyXG5cclxuXHRcdGZvciAoIGkgPSBfLnBhcmVudHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0gKSB7XHJcblxyXG5cdFx0XHR0aGlzLm1hcmtEaXJ0eSggXy5wYXJlbnRzW2ldLCBkaXJ0ICk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlUGFyZW50OiBmdW5jdGlvbiggbm9kZSwgcGFyZW50ICl7XHJcblx0XHR2YXIgcGFyZW50cyA9IG5vZGUuX18ucGFyZW50cyxcclxuXHRcdFx0aW5kZXggPSBwYXJlbnRzLmluZGV4T2YoIHBhcmVudCApXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIGluZGV4ICE9IC0xICl7XHJcblx0XHRcdHBhcmVudHMuc3BsaWNlKCBpbmRleCwgMSApO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGFkZFBhcmVudDogZnVuY3Rpb24oIG5vZGUsIHBhcmVudCApe1xyXG5cdFx0dmFyIHBhcmVudHMgPSBub2RlLl9fLnBhcmVudHMsXHJcblx0XHRcdGluZGV4ID0gcGFyZW50cy5pbmRleE9mKCBwYXJlbnQgKVxyXG5cdFx0O1xyXG5cclxuXHRcdGlmKCBpbmRleCA9PSAtMSApe1xyXG5cdFx0XHRwYXJlbnRzWyBwYXJlbnRzLmxlbmd0aCBdID0gcGFyZW50O1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdHRyaWdnZXI6IGZ1bmN0aW9uKCBub2RlLCBldmVudE5hbWUsIHBhcmFtICl7XHJcblx0XHR2YXIgbGlzdGVuZXIgPSBub2RlLl9fLmxpc3RlbmVyLFxyXG5cdFx0XHR0aWNraW5nID0gbGlzdGVuZXIudGlja2luZ1xyXG5cdFx0O1xyXG5cclxuXHRcdGxpc3RlbmVyLnRpY2tpbmcgPSBwYXJhbTtcclxuXHRcdGlmKCAhdGlja2luZyApe1xyXG5cdFx0XHRVdGlscy5uZXh0VGljayggZnVuY3Rpb24oKXtcclxuXHRcdFx0XHR2YXIgdXBkYXRlZCA9IGxpc3RlbmVyLnRpY2tpbmc7XHJcblx0XHRcdFx0bGlzdGVuZXIudGlja2luZyA9IGZhbHNlO1xyXG5cdFx0XHRcdGxpc3RlbmVyLnRyaWdnZXIoIGV2ZW50TmFtZSwgdXBkYXRlZCApO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRjcmVhdGVMaXN0ZW5lcjogZnVuY3Rpb24oIGZyb3plbiApe1xyXG5cdFx0dmFyIGwgPSBmcm96ZW4uX18ubGlzdGVuZXI7XHJcblxyXG5cdFx0aWYoICFsICkge1xyXG5cdFx0XHRsID0gT2JqZWN0LmNyZWF0ZShFbWl0dGVyLCB7XHJcblx0XHRcdFx0X2V2ZW50czoge1xyXG5cdFx0XHRcdFx0dmFsdWU6IHt9LFxyXG5cdFx0XHRcdFx0d3JpdGFibGU6IHRydWVcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cclxuXHRcdFx0ZnJvemVuLl9fLmxpc3RlbmVyID0gbDtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gbDtcclxuXHR9LFxyXG5cclxuXHRjcmVhdGVBcnJheTogKGZ1bmN0aW9uKCl7XHJcblx0XHQvLyBTZXQgY3JlYXRlQXJyYXkgbWV0aG9kXHJcblx0XHRpZiggW10uX19wcm90b19fIClcclxuXHRcdFx0cmV0dXJuIGZ1bmN0aW9uKCBsZW5ndGggKXtcclxuXHRcdFx0XHR2YXIgYXJyID0gbmV3IEFycmF5KCBsZW5ndGggKTtcclxuXHRcdFx0XHRhcnIuX19wcm90b19fID0gTWl4aW5zLkxpc3Q7XHJcblx0XHRcdFx0cmV0dXJuIGFycjtcclxuXHRcdFx0fVxyXG5cdFx0cmV0dXJuIGZ1bmN0aW9uKCBsZW5ndGggKXtcclxuXHRcdFx0dmFyIGFyciA9IG5ldyBBcnJheSggbGVuZ3RoICksXHJcblx0XHRcdFx0bWV0aG9kcyA9IE1peGlucy5hcnJheU1ldGhvZHNcclxuXHRcdFx0O1xyXG5cdFx0XHRmb3IoIHZhciBtIGluIG1ldGhvZHMgKXtcclxuXHRcdFx0XHRhcnJbIG0gXSA9IG1ldGhvZHNbIG0gXTtcclxuXHRcdFx0fVxyXG5cdFx0XHRyZXR1cm4gYXJyO1xyXG5cdFx0fVxyXG5cdH0pKClcclxufTtcclxuLy8jYnVpbGRcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRnJvemVuO1xyXG4iLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgVXRpbHMgPSByZXF1aXJlKCAnLi91dGlscy5qcycgKTtcclxuXHJcbi8vI2J1aWxkXHJcblxyXG4vKipcclxuICogQ3JlYXRlcyBub24tZW51bWVyYWJsZSBwcm9wZXJ0eSBkZXNjcmlwdG9ycywgdG8gYmUgdXNlZCBieSBPYmplY3QuY3JlYXRlLlxyXG4gKiBAcGFyYW0gIHtPYmplY3R9IGF0dHJzIFByb3BlcnRpZXMgdG8gY3JlYXRlIGRlc2NyaXB0b3JzXHJcbiAqIEByZXR1cm4ge09iamVjdH0gICAgICAgQSBoYXNoIHdpdGggdGhlIGRlc2NyaXB0b3JzLlxyXG4gKi9cclxudmFyIGNyZWF0ZU5FID0gZnVuY3Rpb24oIGF0dHJzICl7XHJcblx0dmFyIG5lID0ge307XHJcblxyXG5cdGZvciggdmFyIGtleSBpbiBhdHRycyApe1xyXG5cdFx0bmVbIGtleSBdID0ge1xyXG5cdFx0XHR3cml0YWJsZTogdHJ1ZSxcclxuXHRcdFx0Y29uZmlndXJhYmxlOiB0cnVlLFxyXG5cdFx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcclxuXHRcdFx0dmFsdWU6IGF0dHJzWyBrZXldXHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gbmU7XHJcbn1cclxuXHJcbnZhciBjb21tb25NZXRob2RzID0ge1xyXG5cdHNldDogZnVuY3Rpb24oIGF0dHIsIHZhbHVlICl7XHJcblx0XHR2YXIgYXR0cnMgPSBhdHRyLFxyXG5cdFx0XHR1cGRhdGUgPSB0aGlzLl9fLnRyYW5zXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIHR5cGVvZiB2YWx1ZSAhPSAndW5kZWZpbmVkJyApe1xyXG5cdFx0XHRhdHRycyA9IHt9O1xyXG5cdFx0XHRhdHRyc1sgYXR0ciBdID0gdmFsdWU7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYoICF1cGRhdGUgKXtcclxuXHRcdFx0Zm9yKCB2YXIga2V5IGluIGF0dHJzICl7XHJcblx0XHRcdFx0dXBkYXRlID0gdXBkYXRlIHx8IHRoaXNbIGtleSBdICE9IGF0dHJzWyBrZXkgXTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0Ly8gTm8gY2hhbmdlcywganVzdCByZXR1cm4gdGhlIG5vZGVcclxuXHRcdFx0aWYoICF1cGRhdGUgKVxyXG5cdFx0XHRcdHJldHVybiB0aGlzO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzLl9fLm5vdGlmeSggJ21lcmdlJywgdGhpcywgYXR0cnMgKTtcclxuXHR9LFxyXG5cclxuXHRyZXNldDogZnVuY3Rpb24oIGF0dHJzICkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAncmVwbGFjZScsIHRoaXMsIGF0dHJzICk7XHJcblx0fSxcclxuXHJcblx0Z2V0TGlzdGVuZXI6IGZ1bmN0aW9uKCl7XHJcblx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdsaXN0ZW5lcicsIHRoaXMgKTtcclxuXHR9LFxyXG5cclxuXHR0b0pTOiBmdW5jdGlvbigpe1xyXG5cdFx0dmFyIGpzO1xyXG5cdFx0aWYoIHRoaXMuY29uc3RydWN0b3IgPT0gQXJyYXkgKXtcclxuXHRcdFx0anMgPSBuZXcgQXJyYXkoIHRoaXMubGVuZ3RoICk7XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0anMgPSB7fTtcclxuXHRcdH1cclxuXHJcblx0XHRVdGlscy5lYWNoKCB0aGlzLCBmdW5jdGlvbiggY2hpbGQsIGkgKXtcclxuXHRcdFx0aWYoIGNoaWxkICYmIGNoaWxkLl9fIClcclxuXHRcdFx0XHRqc1sgaSBdID0gY2hpbGQudG9KUygpO1xyXG5cdFx0XHRlbHNlXHJcblx0XHRcdFx0anNbIGkgXSA9IGNoaWxkO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0cmV0dXJuIGpzO1xyXG5cdH0sXHJcblxyXG5cdHRyYW5zYWN0OiBmdW5jdGlvbigpe1xyXG5cdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAndHJhbnNhY3QnLCB0aGlzICk7XHJcblx0fSxcclxuXHRydW46IGZ1bmN0aW9uKCl7XHJcblx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdydW4nLCB0aGlzICk7XHJcblx0fVxyXG59O1xyXG5cclxudmFyIGFycmF5TWV0aG9kcyA9IFV0aWxzLmV4dGVuZCh7XHJcblx0cHVzaDogZnVuY3Rpb24oIGVsICl7XHJcblx0XHRyZXR1cm4gdGhpcy5hcHBlbmQoIFtlbF0gKTtcclxuXHR9LFxyXG5cclxuXHRhcHBlbmQ6IGZ1bmN0aW9uKCBlbHMgKXtcclxuXHRcdGlmKCBlbHMgJiYgZWxzLmxlbmd0aCApXHJcblx0XHRcdHJldHVybiB0aGlzLl9fLm5vdGlmeSggJ3NwbGljZScsIHRoaXMsIFt0aGlzLmxlbmd0aCwgMF0uY29uY2F0KCBlbHMgKSApO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cG9wOiBmdW5jdGlvbigpe1xyXG5cdFx0aWYoICF0aGlzLmxlbmd0aCApXHJcblx0XHRcdHJldHVybiB0aGlzO1xyXG5cclxuXHRcdHJldHVybiB0aGlzLl9fLm5vdGlmeSggJ3NwbGljZScsIHRoaXMsIFt0aGlzLmxlbmd0aCAtMSwgMV0gKTtcclxuXHR9LFxyXG5cclxuXHR1bnNoaWZ0OiBmdW5jdGlvbiggZWwgKXtcclxuXHRcdHJldHVybiB0aGlzLnByZXBlbmQoIFtlbF0gKTtcclxuXHR9LFxyXG5cclxuXHRwcmVwZW5kOiBmdW5jdGlvbiggZWxzICl7XHJcblx0XHRpZiggZWxzICYmIGVscy5sZW5ndGggKVxyXG5cdFx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdzcGxpY2UnLCB0aGlzLCBbMCwgMF0uY29uY2F0KCBlbHMgKSApO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0c2hpZnQ6IGZ1bmN0aW9uKCl7XHJcblx0XHRpZiggIXRoaXMubGVuZ3RoIClcclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAnc3BsaWNlJywgdGhpcywgWzAsIDFdICk7XHJcblx0fSxcclxuXHJcblx0c3BsaWNlOiBmdW5jdGlvbiggaW5kZXgsIHRvUmVtb3ZlLCB0b0FkZCApe1xyXG5cdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAnc3BsaWNlJywgdGhpcywgYXJndW1lbnRzICk7XHJcblx0fVxyXG59LCBjb21tb25NZXRob2RzICk7XHJcblxyXG52YXIgRnJvemVuQXJyYXkgPSBPYmplY3QuY3JlYXRlKCBBcnJheS5wcm90b3R5cGUsIGNyZWF0ZU5FKCBhcnJheU1ldGhvZHMgKSApO1xyXG5cclxudmFyIE1peGlucyA9IHtcclxuXHJcbkhhc2g6IE9iamVjdC5jcmVhdGUoIE9iamVjdC5wcm90b3R5cGUsIGNyZWF0ZU5FKCBVdGlscy5leHRlbmQoe1xyXG5cdHJlbW92ZTogZnVuY3Rpb24oIGtleXMgKXtcclxuXHRcdHZhciBmaWx0ZXJlZCA9IFtdLFxyXG5cdFx0XHRrID0ga2V5c1xyXG5cdFx0O1xyXG5cclxuXHRcdGlmKCBrZXlzLmNvbnN0cnVjdG9yICE9IEFycmF5IClcclxuXHRcdFx0ayA9IFsga2V5cyBdO1xyXG5cclxuXHRcdGZvciggdmFyIGkgPSAwLCBsID0gay5sZW5ndGg7IGk8bDsgaSsrICl7XHJcblx0XHRcdGlmKCB0aGlzLmhhc093blByb3BlcnR5KCBrW2ldICkgKVxyXG5cdFx0XHRcdGZpbHRlcmVkLnB1c2goIGtbaV0gKTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiggZmlsdGVyZWQubGVuZ3RoIClcclxuXHRcdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAncmVtb3ZlJywgdGhpcywgZmlsdGVyZWQgKTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH1cclxufSwgY29tbW9uTWV0aG9kcykpKSxcclxuXHJcbkxpc3Q6IEZyb3plbkFycmF5LFxyXG5hcnJheU1ldGhvZHM6IGFycmF5TWV0aG9kc1xyXG59O1xyXG4vLyNidWlsZFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBNaXhpbnM7IiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyNidWlsZFxudmFyIGdsb2JhbCA9IChuZXcgRnVuY3Rpb24oXCJyZXR1cm4gdGhpc1wiKSgpKTtcblxudmFyIFV0aWxzID0ge1xuXHRleHRlbmQ6IGZ1bmN0aW9uKCBvYiwgcHJvcHMgKXtcblx0XHRmb3IoIHZhciBwIGluIHByb3BzICl7XG5cdFx0XHRvYltwXSA9IHByb3BzW3BdO1xuXHRcdH1cblx0XHRyZXR1cm4gb2I7XG5cdH0sXG5cblx0Y3JlYXRlTm9uRW51bWVyYWJsZTogZnVuY3Rpb24oIG9iaiwgcHJvdG8gKXtcblx0XHR2YXIgbmUgPSB7fTtcblx0XHRmb3IoIHZhciBrZXkgaW4gb2JqIClcblx0XHRcdG5lW2tleV0gPSB7dmFsdWU6IG9ialtrZXldIH07XG5cdFx0cmV0dXJuIE9iamVjdC5jcmVhdGUoIHByb3RvIHx8IHt9LCBuZSApO1xuXHR9LFxuXG5cdGVycm9yOiBmdW5jdGlvbiggbWVzc2FnZSApe1xuXHRcdHZhciBlcnIgPSBuZXcgRXJyb3IoIG1lc3NhZ2UgKTtcblx0XHRpZiggY29uc29sZSApXG5cdFx0XHRyZXR1cm4gY29uc29sZS5lcnJvciggZXJyICk7XG5cdFx0ZWxzZVxuXHRcdFx0dGhyb3cgZXJyO1xuXHR9LFxuXG5cdGVhY2g6IGZ1bmN0aW9uKCBvLCBjbGJrICl7XG5cdFx0dmFyIGksbCxrZXlzO1xuXHRcdGlmKCBvICYmIG8uY29uc3RydWN0b3IgPT0gQXJyYXkgKXtcblx0XHRcdGZvciAoaSA9IDAsIGwgPSBvLmxlbmd0aDsgaSA8IGw7IGkrKylcblx0XHRcdFx0Y2xiayggb1tpXSwgaSApO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGtleXMgPSBPYmplY3Qua2V5cyggbyApO1xuXHRcdFx0Zm9yKCBpID0gMCwgbCA9IGtleXMubGVuZ3RoOyBpIDwgbDsgaSsrIClcblx0XHRcdFx0Y2xiayggb1sga2V5c1tpXSBdLCBrZXlzW2ldICk7XG5cdFx0fVxuXHR9LFxuXG5cdGFkZE5FOiBmdW5jdGlvbiggbm9kZSwgYXR0cnMgKXtcblx0XHRmb3IoIHZhciBrZXkgaW4gYXR0cnMgKXtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSggbm9kZSwga2V5LCB7XG5cdFx0XHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdFx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0XHRcdHdyaXRhYmxlOiB0cnVlLFxuXHRcdFx0XHR2YWx1ZTogYXR0cnNbIGtleSBdXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0sXG5cblx0Ly8gbmV4dFRpY2sgLSBieSBzdGFnYXMgLyBwdWJsaWMgZG9tYWluXG4gIFx0bmV4dFRpY2s6IChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgcXVldWUgPSBbXSxcblx0XHRcdGRpcnR5ID0gZmFsc2UsXG5cdFx0XHRmbixcblx0XHRcdGhhc1Bvc3RNZXNzYWdlID0gISFnbG9iYWwucG9zdE1lc3NhZ2UsXG5cdFx0XHRtZXNzYWdlTmFtZSA9ICduZXh0dGljaycsXG5cdFx0XHR0cmlnZ2VyID0gKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhhc1Bvc3RNZXNzYWdlXG5cdFx0XHRcdFx0PyBmdW5jdGlvbiB0cmlnZ2VyICgpIHtcblx0XHRcdFx0XHRnbG9iYWwucG9zdE1lc3NhZ2UobWVzc2FnZU5hbWUsICcqJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0OiBmdW5jdGlvbiB0cmlnZ2VyICgpIHtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcHJvY2Vzc1F1ZXVlKCkgfSwgMCk7XG5cdFx0XHRcdH07XG5cdFx0XHR9KCkpLFxuXHRcdFx0cHJvY2Vzc1F1ZXVlID0gKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhhc1Bvc3RNZXNzYWdlXG5cdFx0XHRcdFx0PyBmdW5jdGlvbiBwcm9jZXNzUXVldWUgKGV2ZW50KSB7XG5cdFx0XHRcdFx0XHRpZiAoZXZlbnQuc291cmNlID09PSBnbG9iYWwgJiYgZXZlbnQuZGF0YSA9PT0gbWVzc2FnZU5hbWUpIHtcblx0XHRcdFx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0XHRcdGZsdXNoUXVldWUoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0OiBmbHVzaFF1ZXVlO1xuICAgICAgXHR9KSgpXG4gICAgICA7XG5cbiAgICAgIGZ1bmN0aW9uIGZsdXNoUXVldWUgKCkge1xuICAgICAgICAgIHdoaWxlIChmbiA9IHF1ZXVlLnNoaWZ0KCkpIHtcbiAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgZGlydHkgPSBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gbmV4dFRpY2sgKGZuKSB7XG4gICAgICAgICAgcXVldWUucHVzaChmbik7XG4gICAgICAgICAgaWYgKGRpcnR5KSByZXR1cm47XG4gICAgICAgICAgZGlydHkgPSB0cnVlO1xuICAgICAgICAgIHRyaWdnZXIoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGhhc1Bvc3RNZXNzYWdlKSBnbG9iYWwuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIHByb2Nlc3NRdWV1ZSwgdHJ1ZSk7XG5cbiAgICAgIG5leHRUaWNrLnJlbW92ZUxpc3RlbmVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGdsb2JhbC5yZW1vdmVFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgcHJvY2Vzc1F1ZXVlLCB0cnVlKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5leHRUaWNrO1xuICB9KSgpXG59O1xuLy8jYnVpbGRcblxuXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzOyIsImV4cG9ydCBjbGFzcyBBY3Rpb24ge1xuICBjb25zdHJ1Y3RvcihhcmdzKSB7XG4gICAgY29uc3QgW3N0b3JlLCBzdG9yZXMsIGFsbFN0b3Jlc10gPSBbYXJncy5zdG9yZSwgYXJncy5zdG9yZXMsIFtdXTtcbiAgICB0aGlzLm5hbWUgPSBhcmdzLm5hbWU7XG5cbiAgICBpZiAoc3RvcmUpIGFsbFN0b3Jlcy5wdXNoKHN0b3JlKTtcbiAgICBpZiAoc3RvcmVzKSBhbGxTdG9yZXMucHVzaC5hcHBseShhbGxTdG9yZXMsIHN0b3Jlcyk7XG5cbiAgICB0aGlzLnN0b3JlcyA9IGFsbFN0b3JlcztcbiAgfVxuXG4gIHJ1biguLi5hcmdzKSB7XG4gICAgY29uc3Qgc3RvcmVzQ3ljbGVzID0gdGhpcy5zdG9yZXMubWFwKHN0b3JlID0+XG4gICAgICBzdG9yZS5ydW5DeWNsZS5hcHBseShzdG9yZSwgW3RoaXMubmFtZV0uY29uY2F0KGFyZ3MpKVxuICAgICk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHN0b3Jlc0N5Y2xlcyk7XG4gIH1cblxuICBhZGRTdG9yZShzdG9yZSkge1xuICAgIHRoaXMuc3RvcmVzLnB1c2goc3RvcmUpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBBY3Rpb25zIHtcbiAgY29uc3RydWN0b3IoYWN0aW9ucykge1xuICAgIHRoaXMuYWxsID0gW107XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoYWN0aW9ucykpIHtcbiAgICAgIGFjdGlvbnMuZm9yRWFjaCgoYWN0aW9uID0+IHRoaXMuYWRkQWN0aW9uKGFjdGlvbikpLCB0aGlzKTtcbiAgICB9XG4gIH1cblxuICBhZGRBY3Rpb24oaXRlbSwgbm9PdmVycmlkZSkge1xuICAgIGNvbnN0IGFjdGlvbiA9IG5vT3ZlcnJpZGUgPyBmYWxzZSA6IHRoaXMuZGV0ZWN0QWN0aW9uKGl0ZW0pO1xuICAgIGlmICghbm9PdmVycmlkZSkge1xuICAgICAgbGV0IG9sZCA9IHRoaXNbYWN0aW9uLm5hbWVdO1xuICAgICAgaWYgKG9sZCkgdGhpcy5yZW1vdmVBY3Rpb24ob2xkKTtcbiAgICAgIHRoaXMuYWxsLnB1c2goYWN0aW9uKTtcbiAgICAgIHRoaXNbYWN0aW9uLm5hbWVdID0gYWN0aW9uLnJ1bi5iaW5kKGFjdGlvbik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFjdGlvbjtcbiAgfVxuXG4gIHJlbW92ZUFjdGlvbihpdGVtKSB7XG4gICAgY29uc3QgYWN0aW9uID0gdGhpcy5kZXRlY3RBY3Rpb24oaXRlbSwgdHJ1ZSk7XG4gICAgY29uc3QgaW5kZXggPSB0aGlzLmFsbC5pbmRleE9mKGFjdGlvbik7XG4gICAgaWYgKGluZGV4ICE9PSAtMSkgdGhpcy5hbGwuc3BsaWNlKGluZGV4LCAxKTtcbiAgICBkZWxldGUgdGhpc1thY3Rpb24ubmFtZV07XG4gIH1cblxuICBhZGRTdG9yZShzdG9yZSkge1xuICAgIHRoaXMuYWxsLmZvckVhY2goYWN0aW9uID0+IGFjdGlvbi5hZGRTdG9yZShzdG9yZSkpO1xuICB9XG5cbiAgZGV0ZWN0QWN0aW9uKGFjdGlvbiwgaXNPbGQpIHtcbiAgICBpZiAoYWN0aW9uLmNvbnN0cnVjdG9yID09PSBBY3Rpb24pIHtcbiAgICAgIHJldHVybiBhY3Rpb247XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgYWN0aW9uID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIChpc09sZCkgPyB0aGlzW2FjdGlvbl0gOiBuZXcgQWN0aW9uKHtuYW1lOiBhY3Rpb259KTtcbiAgICB9XG4gIH1cbn1cbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcblwidXNlIHN0cmljdFwiO1xuXG52YXIgX2ludGVyb3BSZXF1aXJlID0gZnVuY3Rpb24gKG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqW1wiZGVmYXVsdFwiXSA6IG9iajsgfTtcblxuZXhwb3J0cy5jcmVhdGVWaWV3ID0gY3JlYXRlVmlldztcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5cbnZhciBSZWFjdCA9IF9pbnRlcm9wUmVxdWlyZSgodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snUmVhY3QnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ1JlYWN0J10gOiBudWxsKSk7XG5cbnZhciBSZWFjdFJvdXRlciA9IF9pbnRlcm9wUmVxdWlyZSgodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snUmVhY3RSb3V0ZXInXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ1JlYWN0Um91dGVyJ10gOiBudWxsKSk7XG5cbmZ1bmN0aW9uIGdldEZpbGVQYXRoKG5hbWUpIHtcbiAgdmFyIHNlZ21lbnRzID0gbmFtZS5zcGxpdChcIi1cIik7XG4gIHZhciBmaWxlUGF0aCA9IHVuZGVmaW5lZDtcbiAgaWYgKHNlZ21lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICBmaWxlUGF0aCA9IHNlZ21lbnRzLm1hcChmdW5jdGlvbiAobmFtZSwgaSkge1xuICAgICAgaWYgKGkgPiAwKSByZXR1cm4gbmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG5hbWUuc2xpY2UoMSk7XG4gICAgICByZXR1cm4gbmFtZTtcbiAgICB9KS5qb2luKFwiL1wiKTtcbiAgfSBlbHNlIHtcbiAgICBmaWxlUGF0aCA9IG5hbWUgKyBcIi9cIiArIG5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnNsaWNlKDEpO1xuICB9XG4gIHJldHVybiBmaWxlUGF0aDtcbn1cblxuZnVuY3Rpb24gZ2V0Um91dGVyKCkge1xuICB2YXIgUm91dGVyID0ge307XG5cbiAgaWYgKHR5cGVvZiBSZWFjdFJvdXRlciAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHZhciByb3V0ZXJFbGVtZW50cyA9IFtcIlJvdXRlXCIsIFwiRGVmYXVsdFJvdXRlXCIsIFwiUm91dGVIYW5kbGVyXCIsIFwiQWN0aXZlSGFuZGxlclwiLCBcIk5vdEZvdW5kUm91dGVcIiwgXCJMaW5rXCIsIFwiUmVkaXJlY3RcIl0sXG4gICAgICAgIHJvdXRlck1peGlucyA9IFtcIk5hdmlnYXRpb25cIiwgXCJTdGF0ZVwiXSxcbiAgICAgICAgcm91dGVyRnVuY3Rpb25zID0gW1wiY3JlYXRlXCIsIFwiY3JlYXRlRGVmYXVsdFJvdXRlXCIsIFwiY3JlYXRlTm90Rm91bmRSb3V0ZVwiLCBcImNyZWF0ZVJlZGlyZWN0XCIsIFwiY3JlYXRlUm91dGVcIiwgXCJjcmVhdGVSb3V0ZXNGcm9tUmVhY3RDaGlsZHJlblwiLCBcInJ1blwiXSxcbiAgICAgICAgcm91dGVyT2JqZWN0cyA9IFtcIkhhc2hMb2NhdGlvblwiLCBcIkhpc3RvcnlcIiwgXCJIaXN0b3J5TG9jYXRpb25cIiwgXCJSZWZyZXNoTG9jYXRpb25cIiwgXCJTdGF0aWNMb2NhdGlvblwiLCBcIlRlc3RMb2NhdGlvblwiLCBcIkltaXRhdGVCcm93c2VyQmVoYXZpb3JcIiwgXCJTY3JvbGxUb1RvcEJlaGF2aW9yXCJdLFxuICAgICAgICBjb3BpZWRJdGVtcyA9IHJvdXRlck1peGlucy5jb25jYXQocm91dGVyRnVuY3Rpb25zKS5jb25jYXQocm91dGVyT2JqZWN0cyk7XG5cbiAgICByb3V0ZXJFbGVtZW50cy5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBSb3V0ZXJbbmFtZV0gPSBSZWFjdC5jcmVhdGVFbGVtZW50LmJpbmQoUmVhY3QsIFJlYWN0Um91dGVyW25hbWVdKTtcbiAgICB9KTtcblxuICAgIGNvcGllZEl0ZW1zLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIFJvdXRlcltuYW1lXSA9IFJlYWN0Um91dGVyW25hbWVdO1xuICAgIH0pO1xuXG4gICAgUm91dGVyLm1vdW50ID0gZnVuY3Rpb24gKHBhdGgpIHtcbiAgICAgIGNvbnNvbGUubG9nKFwiRXhpbS5Sb3V0ZXIubW91bnQgaXMgbm90IGRlZmluZWRcIik7XG4gICAgfTtcblxuICAgIFJvdXRlci5tYXRjaCA9IGZ1bmN0aW9uIChuYW1lLCBoYW5kbGVyLCBhcmdzLCBjaGlsZHJlbikge1xuICAgICAgaWYgKHR5cGVvZiBhcmdzID09PSBcInVuZGVmaW5lZFwiICYmIEFycmF5LmlzQXJyYXkoaGFuZGxlcikpIHtcbiAgICAgICAgY2hpbGRyZW4gPSBoYW5kbGVyO1xuICAgICAgICBhcmdzID0ge307XG4gICAgICAgIGhhbmRsZXIgPSBSb3V0ZXIubW91bnQoZ2V0RmlsZVBhdGgobmFtZSkpO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYXJncyA9PT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgaGFuZGxlciA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICBhcmdzID0gaGFuZGxlcjtcbiAgICAgICAgaGFuZGxlciA9IFJvdXRlci5tb3VudChnZXRGaWxlUGF0aChuYW1lKSk7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBoYW5kbGVyID09PSBcIm9iamVjdFwiICYmIEFycmF5LmlzQXJyYXkoYXJncykpIHtcbiAgICAgICAgY2hpbGRyZW4gPSBhcmdzO1xuICAgICAgICBhcmdzID0gaGFuZGxlcjtcbiAgICAgICAgaGFuZGxlciA9IFJvdXRlci5tb3VudChnZXRGaWxlUGF0aChuYW1lKSk7XG4gICAgICB9XG4gICAgICB2YXIgcGF0aCA9IHVuZGVmaW5lZCxcbiAgICAgICAgICBrZXkgPSB1bmRlZmluZWQsXG4gICAgICAgICAgZGVmID0gdW5kZWZpbmVkO1xuXG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgcGF0aCA9IGFyZ3MucGF0aDtcbiAgICAgICAga2V5ID0gYXJncy5rZXk7XG4gICAgICAgIGRlZiA9IGFyZ3NbXCJkZWZhdWx0XCJdO1xuICAgICAgfVxuXG4gICAgICAvLyBpZiAodHlwZW9mIHBhdGggPT09ICd1bmRlZmluZWQnICYmICh0eXBlb2YgZGVmID09PSAndW5kZWZpbmVkJyB8fCBkZWYgPT09IGZhbHNlKSlcbiAgICAgIC8vICAgcGF0aCA9IG5hbWU7XG5cbiAgICAgIGlmIChkZWYgPT09IHRydWUpIHtcbiAgICAgICAgcmV0dXJuIFJvdXRlci5EZWZhdWx0Um91dGUoeyBuYW1lOiBuYW1lLCBwYXRoOiBwYXRoLCBoYW5kbGVyOiBoYW5kbGVyLCBrZXk6IGtleSB9LCBjaGlsZHJlbik7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBSb3V0ZXIuUm91dGUoeyBuYW1lOiBuYW1lLCBwYXRoOiBwYXRoLCBoYW5kbGVyOiBoYW5kbGVyLCBrZXk6IGtleSB9LCBjaGlsZHJlbik7XG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiBSb3V0ZXI7XG59XG5cbmZ1bmN0aW9uIGdldERPTSgpIHtcbiAgdmFyIERPTUhlbHBlcnMgPSB7fTtcblxuICBpZiAodHlwZW9mIFJlYWN0ICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgdmFyIHRhZyA9IGZ1bmN0aW9uIHRhZyhuYW1lKSB7XG4gICAgICBmb3IgKHZhciBfbGVuID0gYXJndW1lbnRzLmxlbmd0aCwgYXJncyA9IEFycmF5KF9sZW4gPiAxID8gX2xlbiAtIDEgOiAwKSwgX2tleSA9IDE7IF9rZXkgPCBfbGVuOyBfa2V5KyspIHtcbiAgICAgICAgYXJnc1tfa2V5IC0gMV0gPSBhcmd1bWVudHNbX2tleV07XG4gICAgICB9XG5cbiAgICAgIHZhciBhdHRyaWJ1dGVzID0gdW5kZWZpbmVkO1xuICAgICAgdmFyIGZpcnN0ID0gYXJnc1swXSAmJiBhcmdzWzBdLmNvbnN0cnVjdG9yO1xuICAgICAgaWYgKGZpcnN0ID09PSBPYmplY3QpIHtcbiAgICAgICAgYXR0cmlidXRlcyA9IGFyZ3Muc2hpZnQoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF0dHJpYnV0ZXMgPSB7fTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBSZWFjdC5ET01bbmFtZV0uYXBwbHkoUmVhY3QuRE9NLCBbYXR0cmlidXRlc10uY29uY2F0KGFyZ3MpKTtcbiAgICB9O1xuXG4gICAgZm9yICh2YXIgdGFnTmFtZSBpbiBSZWFjdC5ET00pIHtcbiAgICAgIERPTUhlbHBlcnNbdGFnTmFtZV0gPSB0YWcuYmluZCh0aGlzLCB0YWdOYW1lKTtcbiAgICB9XG5cbiAgICBET01IZWxwZXJzLnNwYWNlID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIFJlYWN0LkRPTS5zcGFuKHtcbiAgICAgICAgZGFuZ2Vyb3VzbHlTZXRJbm5lckhUTUw6IHtcbiAgICAgICAgICBfX2h0bWw6IFwiJm5ic3A7XCJcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfTtcbiAgfVxuICByZXR1cm4gRE9NSGVscGVycztcbn1cblxudmFyIFJvdXRlciA9IGdldFJvdXRlcigpO1xuZXhwb3J0cy5Sb3V0ZXIgPSBSb3V0ZXI7XG52YXIgRE9NID0gZ2V0RE9NKCk7XG5cbmV4cG9ydHMuRE9NID0gRE9NO1xuXG5mdW5jdGlvbiBjcmVhdGVWaWV3KGNsYXNzQXJncykge1xuICB2YXIgUmVhY3RDbGFzcyA9IFJlYWN0LmNyZWF0ZUNsYXNzKGNsYXNzQXJncyk7XG4gIHZhciBSZWFjdEVsZW1lbnQgPSBSZWFjdC5jcmVhdGVFbGVtZW50LmJpbmQoUmVhY3QuY3JlYXRlRWxlbWVudCwgUmVhY3RDbGFzcyk7XG4gIHJldHVybiBSZWFjdEVsZW1lbnQ7XG59XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZGF0YTphcHBsaWNhdGlvbi9qc29uO2NoYXJzZXQ6dXRmLTg7YmFzZTY0LGV5SjJaWEp6YVc5dUlqb3pMQ0p6YjNWeVkyVnpJanBiSWk5VmMyVnljeTkyYjJ4dlpIbHRlWEl2VjI5eWF5OW9aV3hzZVdWaGFDOWxlR2x0TDNOeVl5OUVUMDFJWld4d1pYSnpMbXB6SWwwc0ltNWhiV1Z6SWpwYlhTd2liV0Z3Y0dsdVozTWlPaUk3T3pzN08xRkJORWRuUWl4VlFVRlZMRWRCUVZZc1ZVRkJWVHM3T3pzN1NVRTFSMjVDTEV0QlFVc3NNa0pCUVUwc1QwRkJUenM3U1VGRGJFSXNWMEZCVnl3eVFrRkJUU3hqUVVGak96dEJRVVYwUXl4VFFVRlRMRmRCUVZjc1EwRkJReXhKUVVGSkxFVkJRVVU3UVVGRGVrSXNUVUZCU1N4UlFVRlJMRWRCUVVjc1NVRkJTU3hEUVVGRExFdEJRVXNzUTBGQlF5eEhRVUZITEVOQlFVTXNRMEZCUXp0QlFVTXZRaXhOUVVGSkxGRkJRVkVzV1VGQlFTeERRVUZETzBGQlEySXNUVUZCU1N4UlFVRlJMRU5CUVVNc1RVRkJUU3hIUVVGSExFTkJRVU1zUlVGQlJUdEJRVU4yUWl4WlFVRlJMRWRCUVVjc1VVRkJVU3hEUVVGRExFZEJRVWNzUTBGQlF5eFZRVUZUTEVsQlFVa3NSVUZCUlN4RFFVRkRMRVZCUVVNN1FVRkRka01zVlVGQlNTeERRVUZETEVkQlFVTXNRMEZCUXl4RlFVTk1MRTlCUVU4c1NVRkJTU3hEUVVGRExFMUJRVTBzUTBGQlF5eERRVUZETEVOQlFVTXNRMEZCUXl4WFFVRlhMRVZCUVVVc1IwRkJSeXhKUVVGSkxFTkJRVU1zUzBGQlN5eERRVUZETEVOQlFVTXNRMEZCUXl4RFFVRkJPMEZCUTNKRUxHRkJRVThzU1VGQlNTeERRVUZCTzB0QlExb3NRMEZCUXl4RFFVRkRMRWxCUVVrc1EwRkJReXhIUVVGSExFTkJRVU1zUTBGQlF6dEhRVU5rTEUxQlFVMDdRVUZEVEN4WlFVRlJMRWRCUVVjc1NVRkJTU3hIUVVGSExFZEJRVWNzUjBGQlJ5eEpRVUZKTEVOQlFVTXNUVUZCVFN4RFFVRkRMRU5CUVVNc1EwRkJReXhEUVVGRExGZEJRVmNzUlVGQlJTeEhRVUZITEVsQlFVa3NRMEZCUXl4TFFVRkxMRU5CUVVNc1EwRkJReXhEUVVGRExFTkJRVU03UjBGRGRFVTdRVUZEUkN4VFFVRlBMRkZCUVZFc1EwRkJRenREUVVOcVFqczdRVUZGUkN4VFFVRlRMRk5CUVZNc1IwRkJTVHRCUVVOd1FpeE5RVUZOTEUxQlFVMHNSMEZCUnl4RlFVRkZMRU5CUVVNN08wRkJSV3hDTEUxQlFVa3NUMEZCVHl4WFFVRlhMRXRCUVVzc1YwRkJWeXhGUVVGRk8wRkJRM1JETEZGQlFVa3NZMEZCWXl4SFFVRkhMRU5CUVVNc1QwRkJUeXhGUVVGRkxHTkJRV01zUlVGQlJTeGpRVUZqTEVWQlFVVXNaVUZCWlN4RlFVRkZMR1ZCUVdVc1JVRkJSU3hOUVVGTkxFVkJRVVVzVlVGQlZTeERRVUZETzFGQlEzQklMRmxCUVZrc1IwRkJSeXhEUVVGRExGbEJRVmtzUlVGQlJTeFBRVUZQTEVOQlFVTTdVVUZEZEVNc1pVRkJaU3hIUVVGSExFTkJRVU1zVVVGQlVTeEZRVUZGTEc5Q1FVRnZRaXhGUVVGRkxIRkNRVUZ4UWl4RlFVRkZMR2RDUVVGblFpeEZRVUZGTEdGQlFXRXNSVUZCUlN3clFrRkJLMElzUlVGQlJTeExRVUZMTEVOQlFVTTdVVUZEYkVvc1lVRkJZU3hIUVVGSExFTkJRVU1zWTBGQll5eEZRVUZGTEZOQlFWTXNSVUZCUlN4cFFrRkJhVUlzUlVGQlJTeHBRa0ZCYVVJc1JVRkJSU3huUWtGQlowSXNSVUZCUlN4alFVRmpMRVZCUVVVc2QwSkJRWGRDTEVWQlFVVXNjVUpCUVhGQ0xFTkJRVU03VVVGRGNFc3NWMEZCVnl4SFFVRkhMRmxCUVZrc1EwRkJReXhOUVVGTkxFTkJRVU1zWlVGQlpTeERRVUZETEVOQlFVTXNUVUZCVFN4RFFVRkRMR0ZCUVdFc1EwRkJReXhEUVVGRE96dEJRVVY2UlN4clFrRkJZeXhEUVVGRExFOUJRVThzUTBGQlF5eFZRVUZUTEVsQlFVa3NSVUZCUlR0QlFVTndReXhaUVVGTkxFTkJRVU1zU1VGQlNTeERRVUZETEVkQlFVY3NTMEZCU3l4RFFVRkRMR0ZCUVdFc1EwRkJReXhKUVVGSkxFTkJRVU1zUzBGQlN5eEZRVUZGTEZkQlFWY3NRMEZCUXl4SlFVRkpMRU5CUVVNc1EwRkJReXhEUVVGRE8wdEJRMjVGTEVOQlFVTXNRMEZCUXpzN1FVRkZTQ3hsUVVGWExFTkJRVU1zVDBGQlR5eERRVUZETEZWQlFWTXNTVUZCU1N4RlFVRkZPMEZCUTJwRExGbEJRVTBzUTBGQlF5eEpRVUZKTEVOQlFVTXNSMEZCUnl4WFFVRlhMRU5CUVVNc1NVRkJTU3hEUVVGRExFTkJRVU03UzBGRGJFTXNRMEZCUXl4RFFVRkRPenRCUVVWSUxGVkJRVTBzVFVGQlV5eEhRVUZITEZWQlFWTXNTVUZCU1N4RlFVRkZPMEZCUXk5Q0xHRkJRVThzUTBGQlF5eEhRVUZITEVOQlFVTXNhME5CUVd0RExFTkJRVU1zUTBGQlF6dExRVU5xUkN4RFFVRkJPenRCUVVWRUxGVkJRVTBzVFVGQlV5eEhRVUZITEZWQlFWTXNTVUZCU1N4RlFVRkZMRTlCUVU4c1JVRkJSU3hKUVVGSkxFVkJRVVVzVVVGQlVTeEZRVUZGTzBGQlEzaEVMRlZCUVVrc1QwRkJUeXhKUVVGSkxFdEJRVXNzVjBGQlZ5eEpRVUZKTEV0QlFVc3NRMEZCUXl4UFFVRlBMRU5CUVVNc1QwRkJUeXhEUVVGRExFVkJRVVU3UVVGRGVrUXNaMEpCUVZFc1IwRkJSeXhQUVVGUExFTkJRVU03UVVGRGJrSXNXVUZCU1N4SFFVRkhMRVZCUVVVc1EwRkJRenRCUVVOV0xHVkJRVThzUjBGQlJ5eE5RVUZOTEVOQlFVTXNTMEZCU3l4RFFVRkRMRmRCUVZjc1EwRkJReXhKUVVGSkxFTkJRVU1zUTBGQlF5eERRVUZETzA5QlF6TkRMRTFCUVUwc1NVRkJTU3hQUVVGUExFbEJRVWtzUzBGQlN5eFhRVUZYTEVsQlFVa3NUMEZCVHl4UFFVRlBMRXRCUVVzc1VVRkJVU3hGUVVGRE8wRkJRM0JGTEZsQlFVa3NSMEZCUnl4UFFVRlBMRU5CUVVNN1FVRkRaaXhsUVVGUExFZEJRVWNzVFVGQlRTeERRVUZETEV0QlFVc3NRMEZCUXl4WFFVRlhMRU5CUVVNc1NVRkJTU3hEUVVGRExFTkJRVU1zUTBGQlF6dFBRVU16UXl4TlFVRk5MRWxCUVVrc1QwRkJUeXhQUVVGUExFdEJRVXNzVVVGQlVTeEpRVUZKTEV0QlFVc3NRMEZCUXl4UFFVRlBMRU5CUVVNc1NVRkJTU3hEUVVGRExFVkJRVVU3UVVGRE4wUXNaMEpCUVZFc1IwRkJSeXhKUVVGSkxFTkJRVU03UVVGRGFFSXNXVUZCU1N4SFFVRkhMRTlCUVU4c1EwRkJRenRCUVVObUxHVkJRVThzUjBGQlJ5eE5RVUZOTEVOQlFVTXNTMEZCU3l4RFFVRkRMRmRCUVZjc1EwRkJReXhKUVVGSkxFTkJRVU1zUTBGQlF5eERRVUZETzA5QlF6TkRPMEZCUTBRc1ZVRkJTU3hKUVVGSkxGbEJRVUU3VlVGQlJTeEhRVUZITEZsQlFVRTdWVUZCUlN4SFFVRkhMRmxCUVVFc1EwRkJRenM3UVVGRmJrSXNWVUZCU1N4UFFVRlBMRWxCUVVrc1MwRkJTeXhSUVVGUkxFVkJRVVU3UVVGRE5VSXNXVUZCU1N4SFFVRkhMRWxCUVVrc1EwRkJReXhKUVVGSkxFTkJRVU03UVVGRGFrSXNWMEZCUnl4SFFVRkhMRWxCUVVrc1EwRkJReXhIUVVGSExFTkJRVU03UVVGRFppeFhRVUZITEVkQlFVY3NTVUZCU1N4WFFVRlJMRU5CUVVNN1QwRkRjRUk3T3pzN08wRkJTMFFzVlVGQlNTeEhRVUZITEV0QlFVc3NTVUZCU1N4RlFVRkZPMEZCUTJoQ0xHVkJRVThzVFVGQlRTeGhRVUZuUWl4RFFVRkRMRVZCUVVNc1NVRkJTU3hGUVVGS0xFbEJRVWtzUlVGQlJTeEpRVUZKTEVWQlFVb3NTVUZCU1N4RlFVRkZMRTlCUVU4c1JVRkJVQ3hQUVVGUExFVkJRVVVzUjBGQlJ5eEZRVUZJTEVkQlFVY3NSVUZCUXl4RlFVRkZMRkZCUVZFc1EwRkJReXhEUVVGRE8wOUJRM0pGT3p0QlFVVkVMR0ZCUVU4c1RVRkJUU3hOUVVGVExFTkJRVU1zUlVGQlF5eEpRVUZKTEVWQlFVb3NTVUZCU1N4RlFVRkZMRWxCUVVrc1JVRkJTaXhKUVVGSkxFVkJRVVVzVDBGQlR5eEZRVUZRTEU5QlFVOHNSVUZCUlN4SFFVRkhMRVZCUVVnc1IwRkJSeXhGUVVGRExFVkJRVVVzVVVGQlVTeERRVUZETEVOQlFVTTdTMEZET1VRc1EwRkJRenRIUVVOSU96dEJRVVZFTEZOQlFVOHNUVUZCVFN4RFFVRkRPME5CUTJZN08wRkJSVVFzVTBGQlV5eE5RVUZOTEVkQlFVazdRVUZEYWtJc1RVRkJUU3hWUVVGVkxFZEJRVWNzUlVGQlJTeERRVUZET3p0QlFVVjBRaXhOUVVGSkxFOUJRVThzUzBGQlN5eExRVUZMTEZkQlFWY3NSVUZCUlR0QlFVTm9ReXhSUVVGSkxFZEJRVWNzUjBGQlJ5eGhRVUZWTEVsQlFVa3NSVUZCVnp0M1EwRkJUaXhKUVVGSk8wRkJRVW9zV1VGQlNUczdPMEZCUXk5Q0xGVkJRVWtzVlVGQlZTeFpRVUZCTEVOQlFVTTdRVUZEWml4VlFVRkpMRXRCUVVzc1IwRkJSeXhKUVVGSkxFTkJRVU1zUTBGQlF5eERRVUZETEVsQlFVa3NTVUZCU1N4RFFVRkRMRU5CUVVNc1EwRkJReXhEUVVGRExGZEJRVmNzUTBGQlF6dEJRVU16UXl4VlFVRkpMRXRCUVVzc1MwRkJTeXhOUVVGTkxFVkJRVVU3UVVGRGNFSXNhMEpCUVZVc1IwRkJSeXhKUVVGSkxFTkJRVU1zUzBGQlN5eEZRVUZGTEVOQlFVTTdUMEZETTBJc1RVRkJUVHRCUVVOTUxHdENRVUZWTEVkQlFVY3NSVUZCUlN4RFFVRkRPMDlCUTJwQ08wRkJRMFFzWVVGQlR5eExRVUZMTEVOQlFVTXNSMEZCUnl4RFFVRkRMRWxCUVVrc1EwRkJReXhEUVVGRExFdEJRVXNzUTBGQlF5eExRVUZMTEVOQlFVTXNSMEZCUnl4RlFVRkZMRU5CUVVNc1ZVRkJWU3hEUVVGRExFTkJRVU1zVFVGQlRTeERRVUZETEVsQlFVa3NRMEZCUXl4RFFVRkRMRU5CUVVNN1MwRkRjRVVzUTBGQlF6czdRVUZGUml4VFFVRkxMRWxCUVVrc1QwRkJUeXhKUVVGSkxFdEJRVXNzUTBGQlF5eEhRVUZITEVWQlFVVTdRVUZETjBJc1owSkJRVlVzUTBGQlF5eFBRVUZQTEVOQlFVTXNSMEZCUnl4SFFVRkhMRU5CUVVNc1NVRkJTU3hEUVVGRExFbEJRVWtzUlVGQlJTeFBRVUZQTEVOQlFVTXNRMEZCUXp0TFFVTXZRenM3UVVGRlJDeGpRVUZWTEVOQlFVTXNTMEZCU3l4SFFVRkhMRmxCUVZjN1FVRkROVUlzWVVGQlR5eExRVUZMTEVOQlFVTXNSMEZCUnl4RFFVRkRMRWxCUVVrc1EwRkJRenRCUVVOd1Fpd3JRa0ZCZFVJc1JVRkJSVHRCUVVOMlFpeG5Ra0ZCVFN4RlFVRkZMRkZCUVZFN1UwRkRha0k3VDBGRFJpeERRVUZETEVOQlFVTTdTMEZEU2l4RFFVRkRPMGRCUTBnN1FVRkRSQ3hUUVVGUExGVkJRVlVzUTBGQlF6dERRVU51UWpzN1FVRkZUU3hKUVVGTkxFMUJRVTBzUjBGQlJ5eFRRVUZUTEVWQlFVVXNRMEZCUXp0UlFVRnlRaXhOUVVGTkxFZEJRVTRzVFVGQlRUdEJRVU5hTEVsQlFVMHNSMEZCUnl4SFFVRkhMRTFCUVUwc1JVRkJSU3hEUVVGRE96dFJRVUZtTEVkQlFVY3NSMEZCU0N4SFFVRkhPenRCUVVWVUxGTkJRVk1zVlVGQlZTeERRVUZGTEZOQlFWTXNSVUZCUlR0QlFVTnlReXhOUVVGSkxGVkJRVlVzUjBGQlJ5eExRVUZMTEVOQlFVTXNWMEZCVnl4RFFVRkRMRk5CUVZNc1EwRkJReXhEUVVGRE8wRkJRemxETEUxQlFVa3NXVUZCV1N4SFFVRkhMRXRCUVVzc1EwRkJReXhoUVVGaExFTkJRVU1zU1VGQlNTeERRVUZETEV0QlFVc3NRMEZCUXl4aFFVRmhMRVZCUVVVc1ZVRkJWU3hEUVVGRExFTkJRVU03UVVGRE4wVXNVMEZCVHl4WlFVRlpMRU5CUVVNN1EwRkRja0lpTENKbWFXeGxJam9pWjJWdVpYSmhkR1ZrTG1weklpd2ljMjkxY21ObFVtOXZkQ0k2SWlJc0luTnZkWEpqWlhORGIyNTBaVzUwSWpwYkltbHRjRzl5ZENCU1pXRmpkQ0JtY205dElDZHlaV0ZqZENjN1hHNXBiWEJ2Y25RZ1VtVmhZM1JTYjNWMFpYSWdabkp2YlNBbmNtVmhZM1F0Y205MWRHVnlKenRjYmx4dVpuVnVZM1JwYjI0Z1oyVjBSbWxzWlZCaGRHZ29ibUZ0WlNrZ2UxeHVJQ0JzWlhRZ2MyVm5iV1Z1ZEhNZ1BTQnVZVzFsTG5Od2JHbDBLQ2N0SnlrN1hHNGdJR3hsZENCbWFXeGxVR0YwYUR0Y2JpQWdhV1lnS0hObFoyMWxiblJ6TG14bGJtZDBhQ0ErSURFcElIdGNiaUFnSUNCbWFXeGxVR0YwYUNBOUlITmxaMjFsYm5SekxtMWhjQ2htZFc1amRHbHZiaWh1WVcxbExDQnBLWHRjYmlBZ0lDQWdJR2xtSUNocFBqQXBYRzRnSUNBZ0lDQWdJSEpsZEhWeWJpQnVZVzFsTG1Ob1lYSkJkQ2d3S1M1MGIxVndjR1Z5UTJGelpTZ3BJQ3NnYm1GdFpTNXpiR2xqWlNneEtWeHVJQ0FnSUNBZ2NtVjBkWEp1SUc1aGJXVmNiaUFnSUNCOUtTNXFiMmx1S0Njdkp5azdYRzRnSUgwZ1pXeHpaU0I3WEc0Z0lDQWdabWxzWlZCaGRHZ2dQU0J1WVcxbElDc2dKeThuSUNzZ2JtRnRaUzVqYUdGeVFYUW9NQ2t1ZEc5VmNIQmxja05oYzJVb0tTQXJJRzVoYldVdWMyeHBZMlVvTVNrN1hHNGdJSDFjYmlBZ2NtVjBkWEp1SUdacGJHVlFZWFJvTzF4dWZWeHVYRzVtZFc1amRHbHZiaUJuWlhSU2IzVjBaWElnS0NrZ2UxeHVJQ0JqYjI1emRDQlNiM1YwWlhJZ1BTQjdmVHRjYmx4dUlDQnBaaUFvZEhsd1pXOW1JRkpsWVdOMFVtOTFkR1Z5SUNFOVBTQW5kVzVrWldacGJtVmtKeWtnZTF4dUlDQWdJR3hsZENCeWIzVjBaWEpGYkdWdFpXNTBjeUE5SUZzblVtOTFkR1VuTENBblJHVm1ZWFZzZEZKdmRYUmxKeXdnSjFKdmRYUmxTR0Z1Wkd4bGNpY3NJQ2RCWTNScGRtVklZVzVrYkdWeUp5d2dKMDV2ZEVadmRXNWtVbTkxZEdVbkxDQW5UR2x1YXljc0lDZFNaV1JwY21WamRDZGRMRnh1SUNBZ0lISnZkWFJsY2sxcGVHbHVjeUE5SUZzblRtRjJhV2RoZEdsdmJpY3NJQ2RUZEdGMFpTZGRMRnh1SUNBZ0lISnZkWFJsY2taMWJtTjBhVzl1Y3lBOUlGc25ZM0psWVhSbEp5d2dKMk55WldGMFpVUmxabUYxYkhSU2IzVjBaU2NzSUNkamNtVmhkR1ZPYjNSR2IzVnVaRkp2ZFhSbEp5d2dKMk55WldGMFpWSmxaR2x5WldOMEp5d2dKMk55WldGMFpWSnZkWFJsSnl3Z0oyTnlaV0YwWlZKdmRYUmxjMFp5YjIxU1pXRmpkRU5vYVd4a2NtVnVKeXdnSjNKMWJpZGRMRnh1SUNBZ0lISnZkWFJsY2s5aWFtVmpkSE1nUFNCYkowaGhjMmhNYjJOaGRHbHZiaWNzSUNkSWFYTjBiM0o1Snl3Z0owaHBjM1J2Y25sTWIyTmhkR2x2Ymljc0lDZFNaV1p5WlhOb1RHOWpZWFJwYjI0bkxDQW5VM1JoZEdsalRHOWpZWFJwYjI0bkxDQW5WR1Z6ZEV4dlkyRjBhVzl1Snl3Z0owbHRhWFJoZEdWQ2NtOTNjMlZ5UW1Wb1lYWnBiM0luTENBblUyTnliMnhzVkc5VWIzQkNaV2hoZG1sdmNpZGRMRnh1SUNBZ0lHTnZjR2xsWkVsMFpXMXpJRDBnY205MWRHVnlUV2w0YVc1ekxtTnZibU5oZENoeWIzVjBaWEpHZFc1amRHbHZibk1wTG1OdmJtTmhkQ2h5YjNWMFpYSlBZbXBsWTNSektUdGNibHh1SUNBZ0lISnZkWFJsY2tWc1pXMWxiblJ6TG1admNrVmhZMmdvWm5WdVkzUnBiMjRvYm1GdFpTa2dlMXh1SUNBZ0lDQWdVbTkxZEdWeVcyNWhiV1ZkSUQwZ1VtVmhZM1F1WTNKbFlYUmxSV3hsYldWdWRDNWlhVzVrS0ZKbFlXTjBMQ0JTWldGamRGSnZkWFJsY2x0dVlXMWxYU2s3WEc0Z0lDQWdmU2s3WEc1Y2JpQWdJQ0JqYjNCcFpXUkpkR1Z0Y3k1bWIzSkZZV05vS0daMWJtTjBhVzl1S0c1aGJXVXBJSHRjYmlBZ0lDQWdJRkp2ZFhSbGNsdHVZVzFsWFNBOUlGSmxZV04wVW05MWRHVnlXMjVoYldWZE8xeHVJQ0FnSUgwcE8xeHVYRzRnSUNBZ1VtOTFkR1Z5V3lkdGIzVnVkQ2RkSUQwZ1puVnVZM1JwYjI0b2NHRjBhQ2tnZTF4dUlDQWdJQ0FnWTI5dWMyOXNaUzVzYjJjb0owVjRhVzB1VW05MWRHVnlMbTF2ZFc1MElHbHpJRzV2ZENCa1pXWnBibVZrSnlrN1hHNGdJQ0FnZlZ4dVhHNGdJQ0FnVW05MWRHVnlXeWR0WVhSamFDZGRJRDBnWm5WdVkzUnBiMjRvYm1GdFpTd2dhR0Z1Wkd4bGNpd2dZWEpuY3l3Z1kyaHBiR1J5Wlc0cElIdGNiaUFnSUNBZ0lHbG1JQ2gwZVhCbGIyWWdZWEpuY3lBOVBUMGdKM1Z1WkdWbWFXNWxaQ2NnSmlZZ1FYSnlZWGt1YVhOQmNuSmhlU2hvWVc1a2JHVnlLU2tnZTF4dUlDQWdJQ0FnSUNCamFHbHNaSEpsYmlBOUlHaGhibVJzWlhJN1hHNGdJQ0FnSUNBZ0lHRnlaM01nUFNCN2ZUdGNiaUFnSUNBZ0lDQWdhR0Z1Wkd4bGNpQTlJRkp2ZFhSbGNpNXRiM1Z1ZENoblpYUkdhV3hsVUdGMGFDaHVZVzFsS1NrN1hHNGdJQ0FnSUNCOUlHVnNjMlVnYVdZZ0tIUjVjR1Z2WmlCaGNtZHpJRDA5UFNBbmRXNWtaV1pwYm1Wa0p5QW1KaUIwZVhCbGIyWWdhR0Z1Wkd4bGNpQTlQVDBnSjI5aWFtVmpkQ2NwZTF4dUlDQWdJQ0FnSUNCaGNtZHpJRDBnYUdGdVpHeGxjanRjYmlBZ0lDQWdJQ0FnYUdGdVpHeGxjaUE5SUZKdmRYUmxjaTV0YjNWdWRDaG5aWFJHYVd4bFVHRjBhQ2h1WVcxbEtTazdYRzRnSUNBZ0lDQjlJR1ZzYzJVZ2FXWWdLSFI1Y0dWdlppQm9ZVzVrYkdWeUlEMDlQU0FuYjJKcVpXTjBKeUFtSmlCQmNuSmhlUzVwYzBGeWNtRjVLR0Z5WjNNcEtTQjdYRzRnSUNBZ0lDQWdJR05vYVd4a2NtVnVJRDBnWVhKbmN6dGNiaUFnSUNBZ0lDQWdZWEpuY3lBOUlHaGhibVJzWlhJN1hHNGdJQ0FnSUNBZ0lHaGhibVJzWlhJZ1BTQlNiM1YwWlhJdWJXOTFiblFvWjJWMFJtbHNaVkJoZEdnb2JtRnRaU2twTzF4dUlDQWdJQ0FnZlZ4dUlDQWdJQ0FnYkdWMElIQmhkR2dzSUd0bGVTd2daR1ZtTzF4dVhHNGdJQ0FnSUNCcFppQW9kSGx3Wlc5bUlHRnlaM01nUFQwOUlDZHZZbXBsWTNRbktTQjdYRzRnSUNBZ0lDQWdJSEJoZEdnZ1BTQmhjbWR6TG5CaGRHZzdYRzRnSUNBZ0lDQWdJR3RsZVNBOUlHRnlaM011YTJWNU8xeHVJQ0FnSUNBZ0lDQmtaV1lnUFNCaGNtZHpMbVJsWm1GMWJIUTdYRzRnSUNBZ0lDQjlYRzVjYmlBZ0lDQWdJQzh2SUdsbUlDaDBlWEJsYjJZZ2NHRjBhQ0E5UFQwZ0ozVnVaR1ZtYVc1bFpDY2dKaVlnS0hSNWNHVnZaaUJrWldZZ1BUMDlJQ2QxYm1SbFptbHVaV1FuSUh4OElHUmxaaUE5UFQwZ1ptRnNjMlVwS1Z4dUlDQWdJQ0FnTHk4Z0lDQndZWFJvSUQwZ2JtRnRaVHRjYmx4dUlDQWdJQ0FnYVdZZ0tHUmxaaUE5UFQwZ2RISjFaU2tnZTF4dUlDQWdJQ0FnSUNCeVpYUjFjbTRnVW05MWRHVnlXeWRFWldaaGRXeDBVbTkxZEdVblhTaDdibUZ0WlN3Z2NHRjBhQ3dnYUdGdVpHeGxjaXdnYTJWNWZTd2dZMmhwYkdSeVpXNHBPMXh1SUNBZ0lDQWdmVnh1WEc0Z0lDQWdJQ0J5WlhSMWNtNGdVbTkxZEdWeVd5ZFNiM1YwWlNkZEtIdHVZVzFsTENCd1lYUm9MQ0JvWVc1a2JHVnlMQ0JyWlhsOUxDQmphR2xzWkhKbGJpazdYRzRnSUNBZ2ZUdGNiaUFnZlZ4dVhHNGdJSEpsZEhWeWJpQlNiM1YwWlhJN1hHNTlYRzVjYm1aMWJtTjBhVzl1SUdkbGRFUlBUU0FvS1NCN1hHNGdJR052Ym5OMElFUlBUVWhsYkhCbGNuTWdQU0I3ZlR0Y2JseHVJQ0JwWmlBb2RIbHdaVzltSUZKbFlXTjBJQ0U5UFNBbmRXNWtaV1pwYm1Wa0p5a2dlMXh1SUNBZ0lHeGxkQ0IwWVdjZ1BTQm1kVzVqZEdsdmJpQW9ibUZ0WlN3Z0xpNHVZWEpuY3lrZ2UxeHVJQ0FnSUNBZ2JHVjBJR0YwZEhKcFluVjBaWE03WEc0Z0lDQWdJQ0JzWlhRZ1ptbHljM1FnUFNCaGNtZHpXekJkSUNZbUlHRnlaM05iTUYwdVkyOXVjM1J5ZFdOMGIzSTdYRzRnSUNBZ0lDQnBaaUFvWm1seWMzUWdQVDA5SUU5aWFtVmpkQ2tnZTF4dUlDQWdJQ0FnSUNCaGRIUnlhV0oxZEdWeklEMGdZWEpuY3k1emFHbG1kQ2dwTzF4dUlDQWdJQ0FnZlNCbGJITmxJSHRjYmlBZ0lDQWdJQ0FnWVhSMGNtbGlkWFJsY3lBOUlIdDlPMXh1SUNBZ0lDQWdmVnh1SUNBZ0lDQWdjbVYwZFhKdUlGSmxZV04wTGtSUFRWdHVZVzFsWFM1aGNIQnNlU2hTWldGamRDNUVUMDBzSUZ0aGRIUnlhV0oxZEdWelhTNWpiMjVqWVhRb1lYSm5jeWtwTzF4dUlDQWdJSDA3WEc1Y2JpQWdJQ0JtYjNJZ0tHeGxkQ0IwWVdkT1lXMWxJR2x1SUZKbFlXTjBMa1JQVFNrZ2UxeHVJQ0FnSUNBZ1JFOU5TR1ZzY0dWeWMxdDBZV2RPWVcxbFhTQTlJSFJoWnk1aWFXNWtLSFJvYVhNc0lIUmhaMDVoYldVcE8xeHVJQ0FnSUgxY2JseHVJQ0FnSUVSUFRVaGxiSEJsY25NdWMzQmhZMlVnUFNCbWRXNWpkR2x2YmlncElIdGNiaUFnSUNBZ0lISmxkSFZ5YmlCU1pXRmpkQzVFVDAwdWMzQmhiaWg3WEc0Z0lDQWdJQ0FnSUdSaGJtZGxjbTkxYzJ4NVUyVjBTVzV1WlhKSVZFMU1PaUI3WEc0Z0lDQWdJQ0FnSUNBZ1gxOW9kRzFzT2lBbkptNWljM0E3SjF4dUlDQWdJQ0FnSUNCOVhHNGdJQ0FnSUNCOUtUdGNiaUFnSUNCOU8xeHVJQ0I5WEc0Z0lISmxkSFZ5YmlCRVQwMUlaV3h3WlhKek8xeHVmVnh1WEc1bGVIQnZjblFnWTI5dWMzUWdVbTkxZEdWeUlEMGdaMlYwVW05MWRHVnlLQ2s3WEc1bGVIQnZjblFnWTI5dWMzUWdSRTlOSUQwZ1oyVjBSRTlOS0NrN1hHNWNibVY0Y0c5eWRDQm1kVzVqZEdsdmJpQmpjbVZoZEdWV2FXVjNJQ2hqYkdGemMwRnlaM01wSUh0Y2JpQWdiR1YwSUZKbFlXTjBRMnhoYzNNZ1BTQlNaV0ZqZEM1amNtVmhkR1ZEYkdGemN5aGpiR0Z6YzBGeVozTXBPMXh1SUNCc1pYUWdVbVZoWTNSRmJHVnRaVzUwSUQwZ1VtVmhZM1F1WTNKbFlYUmxSV3hsYldWdWRDNWlhVzVrS0ZKbFlXTjBMbU55WldGMFpVVnNaVzFsYm5Rc0lGSmxZV04wUTJ4aGMzTXBPMXh1SUNCeVpYUjFjbTRnVW1WaFkzUkZiR1Z0Wlc1ME8xeHVmVnh1SWwxOSIsImltcG9ydCB7QWN0aW9uc30gZnJvbSAnLi9BY3Rpb25zJztcbmltcG9ydCB1dGlscyBmcm9tICcuL3V0aWxzJztcbmltcG9ydCBGcmVlemVyIGZyb20gJ2ZyZWV6ZXItanMnO1xuaW1wb3J0IGdldENvbm5lY3RNaXhpbiBmcm9tICcuL21peGlucy9jb25uZWN0JztcblxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTdG9yZSB7XG4gIGNvbnN0cnVjdG9yKGFyZ3M9e30pIHtcbiAgICBsZXQge2FjdGlvbnMsIGluaXRpYWx9ID0gYXJncztcbiAgICBsZXQgaW5pdCA9IHR5cGVvZiBpbml0aWFsID09PSAnZnVuY3Rpb24nID8gaW5pdGlhbCgpIDogaW5pdGlhbDtcbiAgICBsZXQgc3RvcmUgPSBuZXcgRnJlZXplcihpbml0IHx8IHt9KTtcblxuICAgIHRoaXMuY29ubmVjdCA9IGZ1bmN0aW9uICguLi5hcmdzKSB7XG4gICAgICByZXR1cm4gZ2V0Q29ubmVjdE1peGluKHRoaXMsIGFyZ3MuY29uY2F0KGFyZ3MpKTtcbiAgICB9O1xuXG4gICAgdGhpcy5oYW5kbGVycyA9IGFyZ3MuaGFuZGxlcnMgfHwgdXRpbHMuZ2V0V2l0aG91dEZpZWxkcyhbJ2FjdGlvbnMnXSwgYXJncykgfHwge307XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShhY3Rpb25zKSkge1xuICAgICAgdGhpcy5hY3Rpb25zID0gYWN0aW9ucyA9IG5ldyBBY3Rpb25zKGFjdGlvbnMpO1xuICAgICAgdGhpcy5hY3Rpb25zLmFkZFN0b3JlKHRoaXMpO1xuICAgIH1cblxuICAgIGNvbnN0IHNldCA9IGZ1bmN0aW9uIChpdGVtLCB2YWx1ZSkge1xuICAgICAgc3RvcmUuZ2V0KCkuc2V0KGl0ZW0sIHZhbHVlKTtcbiAgICB9O1xuXG4gICAgY29uc3QgZ2V0ID0gZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgIGlmIChpdGVtKVxuICAgICAgICByZXR1cm4gc3RvcmUuZ2V0KCkudG9KUygpW2l0ZW1dO1xuICAgICAgcmV0dXJuIHN0b3JlLmdldCgpO1xuICAgIH07XG5cbiAgICBjb25zdCByZXNldCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuc2V0KGluaXQpO1xuICAgIH07XG5cbiAgICB0aGlzLnNldCA9IHNldDtcbiAgICB0aGlzLmdldCA9IGdldDtcbiAgICB0aGlzLnJlc2V0ID0gcmVzZXQ7XG4gICAgdGhpcy5zdG9yZSA9IHN0b3JlO1xuXG4gICAgdGhpcy5zdGF0ZVByb3RvID0ge3NldCwgZ2V0LCByZXNldCwgYWN0aW9uc307XG4gICAgLy90aGlzLmdldHRlciA9IG5ldyBHZXR0ZXIodGhpcyk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBhZGRBY3Rpb24oaXRlbSkge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGl0ZW0pKSB7XG4gICAgICB0aGlzLmFjdGlvbnMgPSB0aGlzLmFjdGlvbnMuY29uY2F0KHRoaXMuYWN0aW9ucyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHRoaXMuYWN0aW9ucy5wdXNoKGl0ZW0pO1xuICAgIH1cbiAgfVxuXG4gIHJlbW92ZUFjdGlvbihpdGVtKSB7XG4gICAgdmFyIGFjdGlvbjtcbiAgICBpZiAodHlwZW9mIGl0ZW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICBhY3Rpb24gPSB0aGlzLmZpbmRCeU5hbWUoJ2FjdGlvbnMnLCAnbmFtZScsIGl0ZW0pO1xuICAgICAgaWYgKGFjdGlvbikgYWN0aW9uLnJlbW92ZVN0b3JlKHRoaXMpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnKSB7XG4gICAgICBhY3Rpb24gPSBpdGVtO1xuICAgICAgbGV0IGluZGV4ID0gdGhpcy5hY3Rpb25zLmluZGV4T2YoYWN0aW9uKTtcbiAgICAgIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICAgICAgYWN0aW9uLnJlbW92ZVN0b3JlKHRoaXMpO1xuICAgICAgICB0aGlzLmFjdGlvbnMgPSB0aGlzLmFjdGlvbnMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXRBY3Rpb25DeWNsZShhY3Rpb25OYW1lLCBwcmVmaXg9J29uJykge1xuICAgIGNvbnN0IGNhcGl0YWxpemVkID0gdXRpbHMuY2FwaXRhbGl6ZShhY3Rpb25OYW1lKTtcbiAgICBjb25zdCBmdWxsQWN0aW9uTmFtZSA9IGAke3ByZWZpeH0ke2NhcGl0YWxpemVkfWA7XG4gICAgY29uc3QgaGFuZGxlciA9IHRoaXMuaGFuZGxlcnNbZnVsbEFjdGlvbk5hbWVdIHx8IHRoaXMuaGFuZGxlcnNbYWN0aW9uTmFtZV07XG4gICAgaWYgKCFoYW5kbGVyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIGhhbmRsZXJzIGZvciAke2FjdGlvbk5hbWV9IGFjdGlvbiBkZWZpbmVkIGluIGN1cnJlbnQgc3RvcmVgKTtcbiAgICB9XG5cbiAgICBsZXQgYWN0aW9ucztcbiAgICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdvYmplY3QnKSB7XG4gICAgICBhY3Rpb25zID0gaGFuZGxlcjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBhY3Rpb25zID0ge29uOiBoYW5kbGVyfTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2hhbmRsZXJ9IG11c3QgYmUgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uYCk7XG4gICAgfVxuICAgIHJldHVybiBhY3Rpb25zO1xuICB9XG5cbiAgLy8gMS4gd2lsbChpbml0aWFsKSA9PiB3aWxsUmVzdWx0XG4gIC8vIDIuIHdoaWxlKHRydWUpXG4gIC8vIDMuIG9uKHdpbGxSZXN1bHQgfHwgaW5pdGlhbCkgPT4gb25SZXN1bHRcbiAgLy8gNC4gd2hpbGUoZmFsc2UpXG4gIC8vIDUuIGRpZChvblJlc3VsdClcbiAgcnVuQ3ljbGUoYWN0aW9uTmFtZSwgLi4uYXJncykge1xuICAgIC8vIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gcmVzb2x2ZSh0cnVlKSlcbiAgICBjb25zdCBjeWNsZSA9IHRoaXMuZ2V0QWN0aW9uQ3ljbGUoYWN0aW9uTmFtZSk7XG4gICAgbGV0IHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICBsZXQgd2lsbCA9IGN5Y2xlLndpbGwsIHdoaWxlXyA9IGN5Y2xlLndoaWxlLCBvbl8gPSBjeWNsZS5vbjtcbiAgICBsZXQgZGlkID0gY3ljbGUuZGlkLCBkaWROb3QgPSBjeWNsZS5kaWROb3Q7XG5cbiAgICAvLyBMb2NhbCBzdGF0ZSBmb3IgdGhpcyBjeWNsZS5cbiAgICBsZXQgc3RhdGUgPSBPYmplY3QuY3JlYXRlKHRoaXMuc3RhdGVQcm90byk7XG5cbiAgICAvLyBQcmUtY2hlY2sgJiBwcmVwYXJhdGlvbnMuXG4gICAgaWYgKHdpbGwpIHByb21pc2UgPSBwcm9taXNlLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHdpbGwuYXBwbHkoc3RhdGUsIGFyZ3MpO1xuICAgIH0pO1xuXG4gICAgLy8gU3RhcnQgd2hpbGUoKS5cbiAgICBpZiAod2hpbGVfKSBwcm9taXNlID0gcHJvbWlzZS50aGVuKCh3aWxsUmVzdWx0KSA9PiB7XG4gICAgICB3aGlsZV8uY2FsbChzdGF0ZSwgdHJ1ZSk7XG4gICAgICByZXR1cm4gd2lsbFJlc3VsdDtcbiAgICB9KTtcblxuICAgIC8vIEFjdHVhbCBleGVjdXRpb24uXG4gICAgcHJvbWlzZSA9IHByb21pc2UudGhlbigod2lsbFJlc3VsdCkgPT4ge1xuICAgICAgaWYgKHdpbGxSZXN1bHQgPT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gb25fLmFwcGx5KHN0YXRlLCBhcmdzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBvbl8uY2FsbChzdGF0ZSwgd2lsbFJlc3VsdCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBTdG9wIHdoaWxlKCkuXG4gICAgaWYgKHdoaWxlXykgcHJvbWlzZSA9IHByb21pc2UudGhlbigob25SZXN1bHQpID0+IHtcbiAgICAgIHdoaWxlXy5jYWxsKHN0YXRlLCBmYWxzZSk7XG4gICAgICByZXR1cm4gb25SZXN1bHQ7XG4gICAgfSk7XG5cbiAgICAvLyBGb3IgZGlkIGFuZCBkaWROb3Qgc3RhdGUgaXMgZnJlZXplZC5cbiAgICBwcm9taXNlID0gcHJvbWlzZS50aGVuKChvblJlc3VsdCkgPT4ge1xuICAgICAgT2JqZWN0LmZyZWV6ZShzdGF0ZSk7XG4gICAgICByZXR1cm4gb25SZXN1bHQ7XG4gICAgfSk7XG5cbiAgICAvLyBIYW5kbGUgdGhlIHJlc3VsdC5cbiAgICBpZiAoZGlkKSBwcm9taXNlID0gcHJvbWlzZS50aGVuKG9uUmVzdWx0ID0+IHtcbiAgICAgIHJldHVybiBkaWQuY2FsbChzdGF0ZSwgb25SZXN1bHQpO1xuICAgIH0pO1xuXG4gICAgcHJvbWlzZS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBpZiAod2hpbGVfKSB3aGlsZV8uY2FsbCh0aGlzLCBzdGF0ZSwgZmFsc2UpO1xuICAgICAgaWYgKGRpZE5vdCkge1xuICAgICAgICBkaWROb3QuY2FsbChzdGF0ZSwgZXJyb3IpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxufVxuIiwiZXhwb3J0IGRlZmF1bHQge1xuICBjeDogZnVuY3Rpb24gKGNsYXNzTmFtZXMpIHtcbiAgICBpZiAodHlwZW9mIGNsYXNzTmFtZXMgPT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiBPYmplY3Qua2V5cyhjbGFzc05hbWVzKS5maWx0ZXIoZnVuY3Rpb24oY2xhc3NOYW1lKSB7XG4gICAgICAgIHJldHVybiBjbGFzc05hbWVzW2NsYXNzTmFtZV07XG4gICAgICB9KS5qb2luKCcgJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuam9pbi5jYWxsKGFyZ3VtZW50cywgJyAnKTtcbiAgICB9XG4gIH1cbn07XG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBnZXRDb25uZWN0TWl4aW4gKHN0b3JlKSB7XG4gIGxldCBjaGFuZ2VDYWxsYmFjayA9IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgIHRoaXMuc2V0U3RhdGUoc3RhdGUudG9KUygpKTtcbiAgfTtcblxuICBsZXQgbGlzdGVuZXI7XG5cbiAgcmV0dXJuIHtcbiAgICBnZXRJbml0aWFsU3RhdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGNvbnN0IGZyb3plbiA9IHN0b3JlLnN0b3JlLmdldChhcmd1bWVudHMpO1xuICAgICAgY29uc3Qgc3RhdGUgPSBmcm96ZW4udG9KUygpO1xuXG4gICAgICBpZiAoIXRoaXMuYm91bmRFeGltQ2hhbmdlQ2FsbGJhY2tzKVxuICAgICAgICB0aGlzLmJvdW5kRXhpbUNoYW5nZUNhbGxiYWNrcyA9IHt9O1xuXG4gICAgICB0aGlzLmJvdW5kRXhpbUNoYW5nZUNhbGxiYWNrc1tzdG9yZV0gPSBjaGFuZ2VDYWxsYmFjay5iaW5kKHRoaXMpO1xuXG4gICAgICBsaXN0ZW5lciA9IGZyb3plbi5nZXRMaXN0ZW5lcigpO1xuICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH0sXG5cbiAgICBjb21wb25lbnREaWRNb3VudDogZnVuY3Rpb24gKCkge1xuICAgICAgbGlzdGVuZXIub24oJ3VwZGF0ZScsIHRoaXMuYm91bmRFeGltQ2hhbmdlQ2FsbGJhY2tzW3N0b3JlXSk7XG4gICAgfSxcblxuICAgIGNvbXBvbmVudFdpbGxVbm1vdW50OiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAobGlzdGVuZXIpXG4gICAgICAgIGxpc3RlbmVyLm9mZigndXBkYXRlJywgdGhpcy5ib3VuZEV4aW1DaGFuZ2VDYWxsYmFja3Nbc3RvcmVdKTtcbiAgICB9XG4gIH07XG59XG4iLCJjb25zdCB1dGlscyA9IHt9O1xuXG51dGlscy5nZXRXaXRob3V0RmllbGRzID0gZnVuY3Rpb24gKG91dGNhc3QsIHRhcmdldCkge1xuICBpZiAoIXRhcmdldCkgdGhyb3cgbmV3IEVycm9yKCdUeXBlRXJyb3I6IHRhcmdldCBpcyBub3QgYW4gb2JqZWN0LicpO1xuICB2YXIgcmVzdWx0ID0ge307XG4gIGlmICh0eXBlb2Ygb3V0Y2FzdCA9PT0gJ3N0cmluZycpIG91dGNhc3QgPSBbb3V0Y2FzdF07XG4gIHZhciB0S2V5cyA9IE9iamVjdC5rZXlzKHRhcmdldCk7XG4gIG91dGNhc3QuZm9yRWFjaChmdW5jdGlvbihmaWVsZE5hbWUpIHtcbiAgICB0S2V5c1xuICAgICAgLmZpbHRlcihmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgcmV0dXJuIGtleSAhPT0gZmllbGROYW1lO1xuICAgICAgfSlcbiAgICAgIC5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgICAgICByZXN1bHRba2V5XSA9IHRhcmdldFtrZXldO1xuICAgICAgfSk7XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxudXRpbHMub2JqZWN0VG9BcnJheSA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG9iamVjdCkubWFwKGtleSA9PiBvYmplY3Rba2V5XSk7XG59O1xuXG51dGlscy5jbGFzc1dpdGhBcmdzID0gZnVuY3Rpb24gKEl0ZW0sIGFyZ3MpIHtcbiAgcmV0dXJuIEl0ZW0uYmluZC5hcHBseShJdGVtLFtJdGVtXS5jb25jYXQoYXJncykpO1xufTtcblxuLy8gMS4gd2lsbFxuLy8gMi4gd2hpbGUodHJ1ZSlcbi8vIDMuIG9uXG4vLyA0LiB3aGlsZShmYWxzZSlcbi8vIDUuIGRpZCBvciBkaWROb3RcbnV0aWxzLm1hcEFjdGlvbk5hbWVzID0gZnVuY3Rpb24ob2JqZWN0KSB7XG4gIGNvbnN0IGxpc3QgPSBbXTtcbiAgY29uc3QgcHJlZml4ZXMgPSBbJ3dpbGwnLCAnd2hpbGVTdGFydCcsICdvbicsICd3aGlsZUVuZCcsICdkaWQnLCAnZGlkTm90J107XG4gIHByZWZpeGVzLmZvckVhY2goaXRlbSA9PiB7XG4gICAgbGV0IG5hbWUgPSBpdGVtO1xuICAgIGlmIChpdGVtID09PSAnd2hpbGVTdGFydCcgfHwgaXRlbSA9PT0gJ3doaWxlRW5kJykge1xuICAgICAgbmFtZSA9ICd3aGlsZSc7XG4gICAgfVxuICAgIGlmIChvYmplY3RbbmFtZV0pIHtcbiAgICAgIGxpc3QucHVzaChbaXRlbSwgb2JqZWN0W25hbWVdXSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIGxpc3Q7XG59O1xuXG51dGlscy5pc09iamVjdCA9IGZ1bmN0aW9uICh0YXJnKSB7XG4gIHJldHVybiB0YXJnID8gdGFyZy50b1N0cmluZygpLnNsaWNlKDgsMTQpID09PSAnT2JqZWN0JyA6IGZhbHNlO1xufTtcbnV0aWxzLmNhcGl0YWxpemUgPSBmdW5jdGlvbiAoc3RyKSB7XG4gIGNvbnN0IGZpcnN0ID0gc3RyLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpO1xuICBjb25zdCByZXN0ID0gc3RyLnNsaWNlKDEpO1xuICByZXR1cm4gYCR7Zmlyc3R9JHtyZXN0fWA7XG59O1xuXG5leHBvcnQgZGVmYXVsdCB1dGlscztcbiJdfQ==
