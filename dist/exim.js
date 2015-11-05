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
      if (typeof handler === "object") {
        children = args;
        args = handler;

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

        handler = Router.mount(filePath);
      }

      var path = undefined,
          key = undefined,
          def = undefined;

      if (args) {
        path = args.path;
        key = args.key;
        def = args["default"];
      }

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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9ET01IZWxwZXJzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O1FBaUdnQixVQUFVLEdBQVYsVUFBVTs7Ozs7SUFqR25CLEtBQUssMkJBQU0sT0FBTzs7SUFDbEIsV0FBVywyQkFBTSxjQUFjOztBQUV0QyxTQUFTLFNBQVMsR0FBSTtBQUNwQixNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUM7O0FBRWxCLE1BQUksT0FBTyxXQUFXLEtBQUssV0FBVyxFQUFFO0FBQ3RDLFFBQUksY0FBYyxHQUFHLENBQUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQUUsZUFBZSxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsVUFBVSxDQUFDO1FBQ3BILFlBQVksR0FBRyxDQUFDLFlBQVksRUFBRSxPQUFPLENBQUM7UUFDdEMsZUFBZSxHQUFHLENBQUMsUUFBUSxFQUFFLG9CQUFvQixFQUFFLHFCQUFxQixFQUFFLGdCQUFnQixFQUFFLGFBQWEsRUFBRSwrQkFBK0IsRUFBRSxLQUFLLENBQUM7UUFDbEosYUFBYSxHQUFHLENBQUMsY0FBYyxFQUFFLFNBQVMsRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxjQUFjLEVBQUUsd0JBQXdCLEVBQUUscUJBQXFCLENBQUM7UUFDcEssV0FBVyxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDOztBQUV6RSxrQkFBYyxDQUFDLE9BQU8sQ0FBQyxVQUFTLElBQUksRUFBRTtBQUNwQyxZQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0tBQ25FLENBQUMsQ0FBQzs7QUFFSCxlQUFXLENBQUMsT0FBTyxDQUFDLFVBQVMsSUFBSSxFQUFFO0FBQ2pD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LElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7S0FDcEUsQ0FBQzs7QUFFRixTQUFLLElBQUksT0FBTyxJQUFJLEtBQUssQ0FBQyxHQUFHLEVBQUU7QUFDN0IsZ0JBQVUsQ0FBQyxPQUFPLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztLQUMvQzs7QUFFRCxjQUFVLENBQUMsS0FBSyxHQUFHLFlBQVc7QUFDNUIsYUFBTyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQztBQUNwQiwrQkFBdUIsRUFBRTtBQUN2QixnQkFBTSxFQUFFLFFBQVE7U0FDakI7T0FDRixDQUFDLENBQUM7S0FDSixDQUFDO0dBQ0g7QUFDRCxTQUFPLFVBQVUsQ0FBQztDQUNuQjs7QUFFTSxJQUFNLE1BQU0sR0FBRyxTQUFTLEVBQUUsQ0FBQztRQUFyQixNQUFNLEdBQU4sTUFBTTtBQUNaLElBQU0sR0FBRyxHQUFHLE1BQU0sRUFBRSxDQUFDOztRQUFmLEdBQUcsR0FBSCxHQUFHOztBQUVULFNBQVMsVUFBVSxDQUFFLFNBQVMsRUFBRTtBQUNyQyxNQUFJLFVBQVUsR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzlDLE1BQUksWUFBWSxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDN0UsU0FBTyxZQUFZLENBQUM7Q0FDckIiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBSZWFjdCBmcm9tICdyZWFjdCc7XG5pbXBvcnQgUmVhY3RSb3V0ZXIgZnJvbSAncmVhY3Qtcm91dGVyJztcblxuZnVuY3Rpb24gZ2V0Um91dGVyICgpIHtcbiAgY29uc3QgUm91dGVyID0ge307XG5cbiAgaWYgKHR5cGVvZiBSZWFjdFJvdXRlciAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBsZXQgcm91dGVyRWxlbWVudHMgPSBbJ1JvdXRlJywgJ0RlZmF1bHRSb3V0ZScsICdSb3V0ZUhhbmRsZXInLCAnQWN0aXZlSGFuZGxlcicsICdOb3RGb3VuZFJvdXRlJywgJ0xpbmsnLCAnUmVkaXJlY3QnXSxcbiAgICByb3V0ZXJNaXhpbnMgPSBbJ05hdmlnYXRpb24nLCAnU3RhdGUnXSxcbiAgICByb3V0ZXJGdW5jdGlvbnMgPSBbJ2NyZWF0ZScsICdjcmVhdGVEZWZhdWx0Um91dGUnLCAnY3JlYXRlTm90Rm91bmRSb3V0ZScsICdjcmVhdGVSZWRpcmVjdCcsICdjcmVhdGVSb3V0ZScsICdjcmVhdGVSb3V0ZXNGcm9tUmVhY3RDaGlsZHJlbicsICdydW4nXSxcbiAgICByb3V0ZXJPYmplY3RzID0gWydIYXNoTG9jYXRpb24nLCAnSGlzdG9yeScsICdIaXN0b3J5TG9jYXRpb24nLCAnUmVmcmVzaExvY2F0aW9uJywgJ1N0YXRpY0xvY2F0aW9uJywgJ1Rlc3RMb2NhdGlvbicsICdJbWl0YXRlQnJvd3NlckJlaGF2aW9yJywgJ1Njcm9sbFRvVG9wQmVoYXZpb3InXSxcbiAgICBjb3BpZWRJdGVtcyA9IHJvdXRlck1peGlucy5jb25jYXQocm91dGVyRnVuY3Rpb25zKS5jb25jYXQocm91dGVyT2JqZWN0cyk7XG5cbiAgICByb3V0ZXJFbGVtZW50cy5mb3JFYWNoKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIFJvdXRlcltuYW1lXSA9IFJlYWN0LmNyZWF0ZUVsZW1lbnQuYmluZChSZWFjdCwgUmVhY3RSb3V0ZXJbbmFtZV0pO1xuICAgIH0pO1xuXG4gICAgY29waWVkSXRlbXMuZm9yRWFjaChmdW5jdGlvbihuYW1lKSB7XG4gICAgICBSb3V0ZXJbbmFtZV0gPSBSZWFjdFJvdXRlcltuYW1lXTtcbiAgICB9KTtcblxuICAgIFJvdXRlclsnbW91bnQnXSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdFeGltLlJvdXRlci5tb3VudCBpcyBub3QgZGVmaW5lZCcpO1xuICAgIH1cblxuICAgIFJvdXRlclsnbWF0Y2gnXSA9IGZ1bmN0aW9uKG5hbWUsIGhhbmRsZXIsIGFyZ3MsIGNoaWxkcmVuKSB7XG4gICAgICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGNoaWxkcmVuID0gYXJncztcbiAgICAgICAgYXJncyA9IGhhbmRsZXI7XG5cbiAgICAgICAgbGV0IHNlZ21lbnRzID0gbmFtZS5zcGxpdCgnLScpO1xuICAgICAgICBsZXQgZmlsZVBhdGg7XG4gICAgICAgIGlmIChzZWdtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgZmlsZVBhdGggPSBzZWdtZW50cy5tYXAoZnVuY3Rpb24obmFtZSwgaSl7XG4gICAgICAgICAgICBpZiAoaT4wKVxuICAgICAgICAgICAgICByZXR1cm4gbmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG5hbWUuc2xpY2UoMSlcbiAgICAgICAgICAgIHJldHVybiBuYW1lXG4gICAgICAgICAgfSkuam9pbignLycpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGZpbGVQYXRoID0gbmFtZSArICcvJyArIG5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnNsaWNlKDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgaGFuZGxlciA9IFJvdXRlci5tb3VudChmaWxlUGF0aCk7XG4gICAgICB9XG5cbiAgICAgIGxldCBwYXRoLCBrZXksIGRlZjtcblxuICAgICAgaWYgKGFyZ3Mpe1xuICAgICAgICBwYXRoID0gYXJncy5wYXRoO1xuICAgICAgICBrZXkgPSBhcmdzLmtleTtcbiAgICAgICAgZGVmID0gYXJncy5kZWZhdWx0O1xuICAgICAgfVxuXG4gICAgICBpZiAoZGVmID09PSB0cnVlKSB7XG4gICAgICAgIHJldHVybiBSb3V0ZXJbJ0RlZmF1bHRSb3V0ZSddKHtuYW1lLCBwYXRoLCBoYW5kbGVyLCBrZXl9LCBjaGlsZHJlbik7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBSb3V0ZXJbJ1JvdXRlJ10oe25hbWUsIHBhdGgsIGhhbmRsZXIsIGtleX0sIGNoaWxkcmVuKTtcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIFJvdXRlcjtcbn1cblxuZnVuY3Rpb24gZ2V0RE9NICgpIHtcbiAgY29uc3QgRE9NSGVscGVycyA9IHt9O1xuXG4gIGlmICh0eXBlb2YgUmVhY3QgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbGV0IHRhZyA9IGZ1bmN0aW9uIChuYW1lLCAuLi5hcmdzKSB7XG4gICAgICBsZXQgYXR0cmlidXRlcztcbiAgICAgIGxldCBmaXJzdCA9IGFyZ3NbMF0gJiYgYXJnc1swXS5jb25zdHJ1Y3RvcjtcbiAgICAgIGlmIChmaXJzdCA9PT0gT2JqZWN0KSB7XG4gICAgICAgIGF0dHJpYnV0ZXMgPSBhcmdzLnNoaWZ0KCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhdHRyaWJ1dGVzID0ge307XG4gICAgICB9XG4gICAgICByZXR1cm4gUmVhY3QuRE9NW25hbWVdLmFwcGx5KFJlYWN0LkRPTSwgW2F0dHJpYnV0ZXNdLmNvbmNhdChhcmdzKSk7XG4gICAgfTtcblxuICAgIGZvciAobGV0IHRhZ05hbWUgaW4gUmVhY3QuRE9NKSB7XG4gICAgICBET01IZWxwZXJzW3RhZ05hbWVdID0gdGFnLmJpbmQodGhpcywgdGFnTmFtZSk7XG4gICAgfVxuXG4gICAgRE9NSGVscGVycy5zcGFjZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIFJlYWN0LkRPTS5zcGFuKHtcbiAgICAgICAgZGFuZ2Vyb3VzbHlTZXRJbm5lckhUTUw6IHtcbiAgICAgICAgICBfX2h0bWw6ICcmbmJzcDsnXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH07XG4gIH1cbiAgcmV0dXJuIERPTUhlbHBlcnM7XG59XG5cbmV4cG9ydCBjb25zdCBSb3V0ZXIgPSBnZXRSb3V0ZXIoKTtcbmV4cG9ydCBjb25zdCBET00gPSBnZXRET00oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVZpZXcgKGNsYXNzQXJncykge1xuICBsZXQgUmVhY3RDbGFzcyA9IFJlYWN0LmNyZWF0ZUNsYXNzKGNsYXNzQXJncyk7XG4gIGxldCBSZWFjdEVsZW1lbnQgPSBSZWFjdC5jcmVhdGVFbGVtZW50LmJpbmQoUmVhY3QuY3JlYXRlRWxlbWVudCwgUmVhY3RDbGFzcyk7XG4gIHJldHVybiBSZWFjdEVsZW1lbnQ7XG59XG4iXX0=
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvdm9sb2R5bXlyL1dvcmsvaGVsbHllYWgvZXhpbS9zcmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZnJlZXplci1qcy9mcmVlemVyLmpzIiwibm9kZV9tb2R1bGVzL2ZyZWV6ZXItanMvc3JjL2VtaXR0ZXIuanMiLCJub2RlX21vZHVsZXMvZnJlZXplci1qcy9zcmMvZnJlZXplci5qcyIsIm5vZGVfbW9kdWxlcy9mcmVlemVyLWpzL3NyYy9mcm96ZW4uanMiLCJub2RlX21vZHVsZXMvZnJlZXplci1qcy9zcmMvbWl4aW5zLmpzIiwibm9kZV9tb2R1bGVzL2ZyZWV6ZXItanMvc3JjL3V0aWxzLmpzIiwiL1VzZXJzL3ZvbG9keW15ci9Xb3JrL2hlbGx5ZWFoL2V4aW0vc3JjL0FjdGlvbnMuanMiLCJzcmMvRE9NSGVscGVycy5qcyIsIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9TdG9yZS5qcyIsIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9oZWxwZXJzLmpzIiwiL1VzZXJzL3ZvbG9keW15ci9Xb3JrL2hlbGx5ZWFoL2V4aW0vc3JjL21peGlucy9jb25uZWN0LmpzIiwiL1VzZXJzL3ZvbG9keW15ci9Xb3JrL2hlbGx5ZWFoL2V4aW0vc3JjL3V0aWxzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozt1QkNBOEIsV0FBVzs7SUFBakMsTUFBTSxZQUFOLE1BQU07SUFBRSxPQUFPLFlBQVAsT0FBTzs7SUFDaEIsS0FBSywyQkFBTSxTQUFTOztJQUNwQixPQUFPLDJCQUFNLFdBQVc7OzBCQUNPLGNBQWM7O0lBQTVDLFVBQVUsZUFBVixVQUFVO0lBQUUsTUFBTSxlQUFOLE1BQU07SUFBRSxHQUFHLGVBQUgsR0FBRzs7QUFFL0IsSUFBTSxJQUFJLEdBQUcsRUFBQyxNQUFNLEVBQU4sTUFBTSxFQUFFLE9BQU8sRUFBUCxPQUFPLEVBQUUsS0FBSyxFQUFMLEtBQUssRUFBRSxNQUFNLEVBQU4sTUFBTSxFQUFFLEdBQUcsRUFBSCxHQUFHLEVBQUUsT0FBTyxFQUFQLE9BQU8sRUFBRSxVQUFVLEVBQVYsVUFBVSxFQUFDLENBQUM7O0FBRXhFLElBQUksQ0FBQyxZQUFZLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDbEMsU0FBTyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUN6QixDQUFDOztBQUVGLElBQUksQ0FBQyxhQUFhLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDbkMsU0FBTyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUMxQixDQUFDOztBQUVGLElBQUksQ0FBQyxXQUFXLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDakMsU0FBTyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUN4QixDQUFDOztpQkFFYSxJQUFJOzs7QUNuQm5CO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqa0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7OztJQzFHYSxNQUFNLFdBQU4sTUFBTTtBQUNOLFdBREEsTUFBTSxDQUNMLElBQUksRUFBRTswQkFEUCxNQUFNOztRQUVSLEtBQUssR0FBd0IsSUFBSSxDQUFDLEtBQUs7UUFBaEMsTUFBTSxHQUE0QixJQUFJLENBQUMsTUFBTTtRQUFyQyxTQUFTLEdBQThCLEVBQUU7O0FBQy9ELFFBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQzs7QUFFdEIsUUFBSSxLQUFLLEVBQUUsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNqQyxRQUFJLE1BQU0sRUFBRSxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7O0FBRXBELFFBQUksQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDO0dBQ3pCOztlQVRVLE1BQU07QUFXakIsT0FBRzthQUFBLGVBQVU7OzswQ0FBTixJQUFJO0FBQUosY0FBSTs7O0FBQ1QsWUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBQSxLQUFLO2lCQUN4QyxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQyxNQUFLLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUFBLENBQ3RELENBQUM7QUFDRixlQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7T0FDbEM7O0FBRUQsWUFBUTthQUFBLGtCQUFDLEtBQUssRUFBRTtBQUNkLFlBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO09BQ3pCOzs7O1NBcEJVLE1BQU07OztJQXVCTixPQUFPLFdBQVAsT0FBTztBQUNQLFdBREEsT0FBTyxDQUNOLE9BQU8sRUFBRTs7OzBCQURWLE9BQU87O0FBRWhCLFFBQUksQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQ2QsUUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFO0FBQzFCLGFBQU8sQ0FBQyxPQUFPLENBQUUsVUFBQSxNQUFNO2VBQUksTUFBSyxTQUFTLENBQUMsTUFBTSxDQUFDO09BQUEsRUFBRyxJQUFJLENBQUMsQ0FBQztLQUMzRDtHQUNGOztlQU5VLE9BQU87QUFRbEIsYUFBUzthQUFBLG1CQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7QUFDMUIsWUFBTSxNQUFNLEdBQUcsVUFBVSxHQUFHLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzVELFlBQUksQ0FBQyxVQUFVLEVBQUU7QUFDZixjQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzVCLGNBQUksR0FBRyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDaEMsY0FBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDdEIsY0FBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUM3Qzs7QUFFRCxlQUFPLE1BQU0sQ0FBQztPQUNmOztBQUVELGdCQUFZO2FBQUEsc0JBQUMsSUFBSSxFQUFFO0FBQ2pCLFlBQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQzdDLFlBQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3ZDLFlBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztBQUM1QyxlQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7T0FDMUI7O0FBRUQsWUFBUTthQUFBLGtCQUFDLEtBQUssRUFBRTtBQUNkLFlBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQUEsTUFBTTtpQkFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQztTQUFBLENBQUMsQ0FBQztPQUNwRDs7QUFFRCxnQkFBWTthQUFBLHNCQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUU7QUFDMUIsWUFBSSxNQUFNLENBQUMsV0FBVyxLQUFLLE1BQU0sRUFBRTtBQUNqQyxpQkFBTyxNQUFNLENBQUM7U0FDZixNQUFNLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFO0FBQ3JDLGlCQUFPLEFBQUMsS0FBSyxHQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLE1BQU0sQ0FBQyxFQUFDLElBQUksRUFBRSxNQUFNLEVBQUMsQ0FBQyxDQUFDO1NBQzVEO09BQ0Y7Ozs7U0FyQ1UsT0FBTzs7OztBQ3ZCcEI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7SUMzSFEsT0FBTyxXQUFPLFdBQVcsRUFBekIsT0FBTzs7SUFDUixLQUFLLDJCQUFNLFNBQVM7O0lBQ3BCLE9BQU8sMkJBQU0sWUFBWTs7SUFDekIsZUFBZSwyQkFBTSxrQkFBa0I7O0lBR3pCLEtBQUs7QUFDYixXQURRLEtBQUssR0FDSDtRQUFULElBQUksZ0NBQUMsRUFBRTs7MEJBREEsS0FBSzs7UUFFakIsT0FBTyxHQUFhLElBQUksQ0FBeEIsT0FBTztRQUFFLE9BQU8sR0FBSSxJQUFJLENBQWYsT0FBTzs7QUFDckIsUUFBSSxJQUFJLEdBQUcsT0FBTyxPQUFPLEtBQUssVUFBVSxHQUFHLE9BQU8sRUFBRSxHQUFHLE9BQU8sQ0FBQztBQUMvRCxRQUFJLEtBQUssR0FBRyxJQUFJLE9BQU8sQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLENBQUM7O0FBRXBDLFFBQUksQ0FBQyxPQUFPLEdBQUcsWUFBbUI7d0NBQU4sSUFBSTtBQUFKLFlBQUk7OztBQUM5QixhQUFPLGVBQWUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0tBQ2pELENBQUM7O0FBRUYsUUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQzs7QUFFakYsUUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFO0FBQzFCLFVBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxHQUFHLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQzlDLFVBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQzdCOztBQUVELFFBQU0sR0FBRyxHQUFHLGFBQVUsSUFBSSxFQUFFLEtBQUssRUFBRTtBQUNqQyxXQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztLQUM5QixDQUFDOztBQUVGLFFBQU0sR0FBRyxHQUFHLGFBQVUsSUFBSSxFQUFFO0FBQzFCLFVBQUksSUFBSTtBQUNOLGVBQU8sS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO09BQUEsQUFDbEMsT0FBTyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7S0FDcEIsQ0FBQzs7QUFFRixRQUFNLEtBQUssR0FBRyxpQkFBWTtBQUN4QixVQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ2hCLENBQUM7O0FBRUYsUUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDZixRQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUNmLFFBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0FBQ25CLFFBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDOztBQUVuQixRQUFJLENBQUMsVUFBVSxHQUFHLEVBQUMsR0FBRyxFQUFILEdBQUcsRUFBRSxHQUFHLEVBQUgsR0FBRyxFQUFFLEtBQUssRUFBTCxLQUFLLEVBQUUsT0FBTyxFQUFQLE9BQU8sRUFBQyxDQUFDOztBQUU3QyxXQUFPLElBQUksQ0FBQztHQUNiOztlQXZDa0IsS0FBSztBQXlDeEIsYUFBUzthQUFBLG1CQUFDLElBQUksRUFBRTtBQUNkLFlBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtBQUN2QixjQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztTQUNsRCxNQUFNLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFO0FBQ25DLGNBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ3pCO09BQ0Y7O0FBRUQsZ0JBQVk7YUFBQSxzQkFBQyxJQUFJLEVBQUU7QUFDakIsWUFBSSxNQUFNLENBQUM7QUFDWCxZQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRTtBQUM1QixnQkFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNsRCxjQUFJLE1BQU0sRUFBRSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ3RDLE1BQU0sSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUU7QUFDbkMsZ0JBQU0sR0FBRyxJQUFJLENBQUM7QUFDZCxjQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN6QyxjQUFJLEtBQUssS0FBSyxDQUFDLENBQUMsRUFBRTtBQUNoQixrQkFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN6QixnQkFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7V0FDOUM7U0FDRjtPQUNGOztBQUVELGtCQUFjO2FBQUEsd0JBQUMsVUFBVSxFQUFlO1lBQWIsTUFBTSxnQ0FBQyxJQUFJOztBQUNwQyxZQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQ2pELFlBQU0sY0FBYyxRQUFNLE1BQU0sUUFBRyxXQUFXLEFBQUUsQ0FBQztBQUNqRCxZQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDM0UsWUFBSSxDQUFDLE9BQU8sRUFBRTtBQUNaLGdCQUFNLElBQUksS0FBSyxzQkFBb0IsVUFBVSxzQ0FBbUMsQ0FBQztTQUNsRjs7QUFFRCxZQUFJLE9BQU8sWUFBQSxDQUFDO0FBQ1osWUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUU7QUFDL0IsaUJBQU8sR0FBRyxPQUFPLENBQUM7U0FDbkIsTUFBTSxJQUFJLE9BQU8sT0FBTyxLQUFLLFVBQVUsRUFBRTtBQUN4QyxpQkFBTyxHQUFHLEVBQUMsRUFBRSxFQUFFLE9BQU8sRUFBQyxDQUFDO1NBQ3pCLE1BQU07QUFDTCxnQkFBTSxJQUFJLEtBQUssTUFBSSxPQUFPLG9DQUFpQyxDQUFDO1NBQzdEO0FBQ0QsZUFBTyxPQUFPLENBQUM7T0FDaEI7O0FBT0QsWUFBUTs7Ozs7Ozs7YUFBQSxrQkFBQyxVQUFVLEVBQVc7OzswQ0FBTixJQUFJO0FBQUosY0FBSTs7OztBQUUxQixZQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQzlDLFlBQUksT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUNoQyxZQUFJLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSTtZQUFFLE1BQU0sR0FBRyxLQUFLLFNBQU07WUFBRSxHQUFHLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQztBQUM1RCxZQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRztZQUFFLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDOzs7QUFHM0MsWUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7OztBQUczQyxZQUFJLElBQUksRUFBRSxPQUFPLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFNO0FBQ3JDLGlCQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1NBQ2hDLENBQUMsQ0FBQzs7O0FBR0gsWUFBSSxNQUFNLEVBQUUsT0FBTyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBQyxVQUFVLEVBQUs7QUFDakQsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3pCLGlCQUFPLFVBQVUsQ0FBQztTQUNuQixDQUFDLENBQUM7OztBQUdILGVBQU8sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQUMsVUFBVSxFQUFLO0FBQ3JDLGNBQUksVUFBVSxJQUFJLElBQUksRUFBRTtBQUN0QixtQkFBTyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztXQUMvQixNQUFNO0FBQ0wsbUJBQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7V0FDcEM7U0FDRixDQUFDLENBQUM7OztBQUdILFlBQUksTUFBTSxFQUFFLE9BQU8sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQUMsUUFBUSxFQUFLO0FBQy9DLGdCQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztBQUMxQixpQkFBTyxRQUFRLENBQUM7U0FDakIsQ0FBQyxDQUFDOzs7QUFHSCxlQUFPLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFDLFFBQVEsRUFBSztBQUNuQyxnQkFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQixpQkFBTyxRQUFRLENBQUM7U0FDakIsQ0FBQyxDQUFDOzs7QUFHSCxZQUFJLEdBQUcsRUFBRSxPQUFPLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFBLFFBQVEsRUFBSTtBQUMxQyxpQkFBTyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztTQUNsQyxDQUFDLENBQUM7O0FBRUgsZUFBTyxTQUFNLENBQUMsVUFBQSxLQUFLLEVBQUk7QUFDckIsY0FBSSxNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksUUFBTyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDNUMsY0FBSSxNQUFNLEVBQUU7QUFDVixrQkFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7V0FDM0IsTUFBTTtBQUNMLGtCQUFNLEtBQUssQ0FBQztXQUNiO1NBQ0YsQ0FBQyxDQUFDOztBQUVILGVBQU8sT0FBTyxDQUFDO09BQ2hCOzs7O1NBakprQixLQUFLOzs7aUJBQUwsS0FBSzs7Ozs7aUJDTlg7QUFDYixJQUFFLEVBQUUsWUFBVSxVQUFVLEVBQUU7QUFDeEIsUUFBSSxPQUFPLFVBQVUsSUFBSSxRQUFRLEVBQUU7QUFDakMsYUFBTyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFTLFNBQVMsRUFBRTtBQUN4RCxlQUFPLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztPQUM5QixDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0tBQ2QsTUFBTTtBQUNMLGFBQU8sS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQztLQUNsRDtHQUNGO0NBQ0Y7Ozs7O2lCQ1Z1QixlQUFlOztBQUF4QixTQUFTLGVBQWUsQ0FBRSxLQUFLLEVBQUU7QUFDOUMsTUFBSSxjQUFjLEdBQUcsd0JBQVUsS0FBSyxFQUFFO0FBQ3BDLFFBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7R0FDN0IsQ0FBQzs7QUFFRixNQUFJLFFBQVEsWUFBQSxDQUFDOztBQUViLFNBQU87QUFDTCxtQkFBZSxFQUFFLDJCQUFZO0FBQzNCLFVBQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzFDLFVBQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQzs7QUFFNUIsVUFBSSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFDaEMsSUFBSSxDQUFDLHdCQUF3QixHQUFHLEVBQUUsQ0FBQzs7QUFFckMsVUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7O0FBRWpFLGNBQVEsR0FBRyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUM7QUFDaEMsYUFBTyxLQUFLLENBQUM7S0FDZDs7QUFFRCxxQkFBaUIsRUFBRSw2QkFBWTtBQUM3QixjQUFRLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztLQUM3RDs7QUFFRCx3QkFBb0IsRUFBRSxnQ0FBWTtBQUNoQyxVQUFJLFFBQVEsRUFDVixRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztLQUNoRTtHQUNGLENBQUM7Q0FDSDs7Ozs7QUM5QkQsSUFBTSxLQUFLLEdBQUcsRUFBRSxDQUFDOztBQUVqQixLQUFLLENBQUMsZ0JBQWdCLEdBQUcsVUFBVSxPQUFPLEVBQUUsTUFBTSxFQUFFO0FBQ2xELE1BQUksQ0FBQyxNQUFNLEVBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO0FBQ3BFLE1BQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUNoQixNQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsRUFBRSxPQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUNyRCxNQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ2hDLFNBQU8sQ0FBQyxPQUFPLENBQUMsVUFBUyxTQUFTLEVBQUU7QUFDbEMsU0FBSyxDQUNGLE1BQU0sQ0FBQyxVQUFTLEdBQUcsRUFBRTtBQUNwQixhQUFPLEdBQUcsS0FBSyxTQUFTLENBQUM7S0FDMUIsQ0FBQyxDQUNELE9BQU8sQ0FBQyxVQUFTLEdBQUcsRUFBRTtBQUNyQixZQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0tBQzNCLENBQUMsQ0FBQztHQUNOLENBQUMsQ0FBQztBQUNILFNBQU8sTUFBTSxDQUFDO0NBQ2YsQ0FBQzs7QUFFRixLQUFLLENBQUMsYUFBYSxHQUFHLFVBQVUsTUFBTSxFQUFFO0FBQ3RDLFNBQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsVUFBQSxHQUFHO1dBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQztHQUFBLENBQUMsQ0FBQztDQUNwRCxDQUFDOztBQUVGLEtBQUssQ0FBQyxhQUFhLEdBQUcsVUFBVSxJQUFJLEVBQUUsSUFBSSxFQUFFO0FBQzFDLFNBQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Q0FDbEQsQ0FBQzs7Ozs7OztBQU9GLEtBQUssQ0FBQyxjQUFjLEdBQUcsVUFBUyxNQUFNLEVBQUU7QUFDdEMsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQ2hCLE1BQU0sUUFBUSxHQUFHLENBQUMsTUFBTSxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztBQUMzRSxVQUFRLENBQUMsT0FBTyxDQUFDLFVBQUEsSUFBSSxFQUFJO0FBQ3ZCLFFBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixRQUFJLElBQUksS0FBSyxZQUFZLElBQUksSUFBSSxLQUFLLFVBQVUsRUFBRTtBQUNoRCxVQUFJLEdBQUcsT0FBTyxDQUFDO0tBQ2hCO0FBQ0QsUUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDaEIsVUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ2pDO0dBQ0YsQ0FBQyxDQUFDO0FBQ0gsU0FBTyxJQUFJLENBQUM7Q0FDYixDQUFDOztBQUVGLEtBQUssQ0FBQyxRQUFRLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDL0IsU0FBTyxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUMsRUFBRSxDQUFDLEtBQUssUUFBUSxHQUFHLEtBQUssQ0FBQztDQUNoRSxDQUFDO0FBQ0YsS0FBSyxDQUFDLFVBQVUsR0FBRyxVQUFVLEdBQUcsRUFBRTtBQUNoQyxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO0FBQzFDLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDMUIsY0FBVSxLQUFLLFFBQUcsSUFBSSxDQUFHO0NBQzFCLENBQUM7O2lCQUVhLEtBQUsiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiaW1wb3J0IHtBY3Rpb24sIEFjdGlvbnN9IGZyb20gJy4vQWN0aW9ucyc7XG5pbXBvcnQgU3RvcmUgZnJvbSAnLi9TdG9yZSc7XG5pbXBvcnQgaGVscGVycyBmcm9tICcuL2hlbHBlcnMnO1xuaW1wb3J0IHtjcmVhdGVWaWV3LCBSb3V0ZXIsIERPTX0gZnJvbSAnLi9ET01IZWxwZXJzJztcblxuY29uc3QgRXhpbSA9IHtBY3Rpb24sIEFjdGlvbnMsIFN0b3JlLCBSb3V0ZXIsIERPTSwgaGVscGVycywgY3JlYXRlVmlld307XG5cbkV4aW0uY3JlYXRlQWN0aW9uID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgcmV0dXJuIG5ldyBBY3Rpb24oYXJncyk7XG59O1xuXG5FeGltLmNyZWF0ZUFjdGlvbnMgPSBmdW5jdGlvbiAoYXJncykge1xuICByZXR1cm4gbmV3IEFjdGlvbnMoYXJncyk7XG59O1xuXG5FeGltLmNyZWF0ZVN0b3JlID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgcmV0dXJuIG5ldyBTdG9yZShhcmdzKTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IEV4aW07XG4iLCJ2YXIgRnJlZXplciA9IHJlcXVpcmUoJy4vc3JjL2ZyZWV6ZXInKTtcbm1vZHVsZS5leHBvcnRzID0gRnJlZXplcjsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgVXRpbHMgPSByZXF1aXJlKCAnLi91dGlscycgKTtcclxuXHJcbi8vI2J1aWxkXHJcblxyXG4vLyBUaGUgcHJvdG90eXBlIG1ldGhvZHMgYXJlIHN0b3JlZCBpbiBhIGRpZmZlcmVudCBvYmplY3RcclxuLy8gYW5kIGFwcGxpZWQgYXMgbm9uIGVudW1lcmFibGUgcHJvcGVydGllcyBsYXRlclxyXG52YXIgZW1pdHRlclByb3RvID0ge1xyXG5cdG9uOiBmdW5jdGlvbiggZXZlbnROYW1lLCBsaXN0ZW5lciwgb25jZSApe1xyXG5cdFx0dmFyIGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1sgZXZlbnROYW1lIF0gfHwgW107XHJcblxyXG5cdFx0bGlzdGVuZXJzLnB1c2goeyBjYWxsYmFjazogbGlzdGVuZXIsIG9uY2U6IG9uY2V9KTtcclxuXHRcdHRoaXMuX2V2ZW50c1sgZXZlbnROYW1lIF0gPSAgbGlzdGVuZXJzO1xyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdG9uY2U6IGZ1bmN0aW9uKCBldmVudE5hbWUsIGxpc3RlbmVyICl7XHJcblx0XHR0aGlzLm9uKCBldmVudE5hbWUsIGxpc3RlbmVyLCB0cnVlICk7XHJcblx0fSxcclxuXHJcblx0b2ZmOiBmdW5jdGlvbiggZXZlbnROYW1lLCBsaXN0ZW5lciApe1xyXG5cdFx0aWYoIHR5cGVvZiBldmVudE5hbWUgPT0gJ3VuZGVmaW5lZCcgKXtcclxuXHRcdFx0dGhpcy5fZXZlbnRzID0ge307XHJcblx0XHR9XHJcblx0XHRlbHNlIGlmKCB0eXBlb2YgbGlzdGVuZXIgPT0gJ3VuZGVmaW5lZCcgKSB7XHJcblx0XHRcdHRoaXMuX2V2ZW50c1sgZXZlbnROYW1lIF0gPSBbXTtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHR2YXIgbGlzdGVuZXJzID0gdGhpcy5fZXZlbnRzWyBldmVudE5hbWUgXSB8fCBbXSxcclxuXHRcdFx0XHRpXHJcblx0XHRcdDtcclxuXHJcblx0XHRcdGZvciAoaSA9IGxpc3RlbmVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG5cdFx0XHRcdGlmKCBsaXN0ZW5lcnNbaV0uY2FsbGJhY2sgPT09IGxpc3RlbmVyIClcclxuXHRcdFx0XHRcdGxpc3RlbmVycy5zcGxpY2UoIGksIDEgKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHRyaWdnZXI6IGZ1bmN0aW9uKCBldmVudE5hbWUgKXtcclxuXHRcdHZhciBhcmdzID0gW10uc2xpY2UuY2FsbCggYXJndW1lbnRzLCAxICksXHJcblx0XHRcdGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1sgZXZlbnROYW1lIF0gfHwgW10sXHJcblx0XHRcdG9uY2VMaXN0ZW5lcnMgPSBbXSxcclxuXHRcdFx0aSwgbGlzdGVuZXJcclxuXHRcdDtcclxuXHJcblx0XHQvLyBDYWxsIGxpc3RlbmVyc1xyXG5cdFx0Zm9yIChpID0gMDsgaSA8IGxpc3RlbmVycy5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRsaXN0ZW5lciA9IGxpc3RlbmVyc1tpXTtcclxuXHJcblx0XHRcdGlmKCBsaXN0ZW5lci5jYWxsYmFjayApXHJcblx0XHRcdFx0bGlzdGVuZXIuY2FsbGJhY2suYXBwbHkoIG51bGwsIGFyZ3MgKTtcclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0Ly8gSWYgdGhlcmUgaXMgbm90IGEgY2FsbGJhY2ssIHJlbW92ZSFcclxuXHRcdFx0XHRsaXN0ZW5lci5vbmNlID0gdHJ1ZTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYoIGxpc3RlbmVyLm9uY2UgKVxyXG5cdFx0XHRcdG9uY2VMaXN0ZW5lcnMucHVzaCggaSApO1xyXG5cdFx0fVxyXG5cclxuXHRcdC8vIFJlbW92ZSBsaXN0ZW5lcnMgbWFya2VkIGFzIG9uY2VcclxuXHRcdGZvciggaSA9IG9uY2VMaXN0ZW5lcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0gKXtcclxuXHRcdFx0bGlzdGVuZXJzLnNwbGljZSggb25jZUxpc3RlbmVyc1tpXSwgMSApO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH1cclxufTtcclxuXHJcbi8vIE1ldGhvZHMgYXJlIG5vdCBlbnVtZXJhYmxlIHNvLCB3aGVuIHRoZSBzdG9yZXMgYXJlXHJcbi8vIGV4dGVuZGVkIHdpdGggdGhlIGVtaXR0ZXIsIHRoZXkgY2FuIGJlIGl0ZXJhdGVkIGFzXHJcbi8vIGhhc2htYXBzXHJcbnZhciBFbWl0dGVyID0gVXRpbHMuY3JlYXRlTm9uRW51bWVyYWJsZSggZW1pdHRlclByb3RvICk7XHJcbi8vI2J1aWxkXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEVtaXR0ZXI7XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBVdGlscyA9IHJlcXVpcmUoICcuL3V0aWxzLmpzJyApLFxyXG5cdEVtaXR0ZXIgPSByZXF1aXJlKCAnLi9lbWl0dGVyJyApLFxyXG5cdE1peGlucyA9IHJlcXVpcmUoICcuL21peGlucycgKSxcclxuXHRGcm96ZW4gPSByZXF1aXJlKCAnLi9mcm96ZW4nIClcclxuO1xyXG5cclxuLy8jYnVpbGRcclxudmFyIEZyZWV6ZXIgPSBmdW5jdGlvbiggaW5pdGlhbFZhbHVlLCBvcHRpb25zICkge1xyXG5cdHZhciBtZSA9IHRoaXMsXHJcblx0XHRtdXRhYmxlID0gKCBvcHRpb25zICYmIG9wdGlvbnMubXV0YWJsZSApIHx8IGZhbHNlLFxyXG5cdFx0bGl2ZSA9ICggb3B0aW9ucyAmJiBvcHRpb25zLmxpdmUgKSB8fCBsaXZlXHJcblx0O1xyXG5cclxuXHQvLyBJbW11dGFibGUgZGF0YVxyXG5cdHZhciBmcm96ZW47XHJcblxyXG5cdHZhciBub3RpZnkgPSBmdW5jdGlvbiBub3RpZnkoIGV2ZW50TmFtZSwgbm9kZSwgb3B0aW9ucyApe1xyXG5cdFx0aWYoIGV2ZW50TmFtZSA9PSAnbGlzdGVuZXInIClcclxuXHRcdFx0cmV0dXJuIEZyb3plbi5jcmVhdGVMaXN0ZW5lciggbm9kZSApO1xyXG5cclxuXHRcdHJldHVybiBGcm96ZW4udXBkYXRlKCBldmVudE5hbWUsIG5vZGUsIG9wdGlvbnMgKTtcclxuXHR9O1xyXG5cclxuXHR2YXIgZnJlZXplID0gZnVuY3Rpb24oKXt9O1xyXG5cdGlmKCAhbXV0YWJsZSApXHJcblx0XHRmcmVlemUgPSBmdW5jdGlvbiggb2JqICl7IE9iamVjdC5mcmVlemUoIG9iaiApOyB9O1xyXG5cclxuXHQvLyBDcmVhdGUgdGhlIGZyb3plbiBvYmplY3RcclxuXHRmcm96ZW4gPSBGcm96ZW4uZnJlZXplKCBpbml0aWFsVmFsdWUsIG5vdGlmeSwgZnJlZXplLCBsaXZlICk7XHJcblxyXG5cdC8vIExpc3RlbiB0byBpdHMgY2hhbmdlcyBpbW1lZGlhdGVseVxyXG5cdHZhciBsaXN0ZW5lciA9IGZyb3plbi5nZXRMaXN0ZW5lcigpO1xyXG5cclxuXHQvLyBVcGRhdGluZyBmbGFnIHRvIHRyaWdnZXIgdGhlIGV2ZW50IG9uIG5leHRUaWNrXHJcblx0dmFyIHVwZGF0aW5nID0gZmFsc2U7XHJcblxyXG5cdGxpc3RlbmVyLm9uKCAnaW1tZWRpYXRlJywgZnVuY3Rpb24oIHByZXZOb2RlLCB1cGRhdGVkICl7XHJcblx0XHRpZiggcHJldk5vZGUgIT0gZnJvemVuIClcclxuXHRcdFx0cmV0dXJuO1xyXG5cclxuXHRcdGZyb3plbiA9IHVwZGF0ZWQ7XHJcblxyXG5cdFx0aWYoIGxpdmUgKVxyXG5cdFx0XHRyZXR1cm4gbWUudHJpZ2dlciggJ3VwZGF0ZScsIHVwZGF0ZWQgKTtcclxuXHJcblx0XHQvLyBUcmlnZ2VyIG9uIG5leHQgdGlja1xyXG5cdFx0aWYoICF1cGRhdGluZyApe1xyXG5cdFx0XHR1cGRhdGluZyA9IHRydWU7XHJcblx0XHRcdFV0aWxzLm5leHRUaWNrKCBmdW5jdGlvbigpe1xyXG5cdFx0XHRcdHVwZGF0aW5nID0gZmFsc2U7XHJcblx0XHRcdFx0bWUudHJpZ2dlciggJ3VwZGF0ZScsIGZyb3plbiApO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHR9KTtcclxuXHJcblx0VXRpbHMuYWRkTkUoIHRoaXMsIHtcclxuXHRcdGdldDogZnVuY3Rpb24oKXtcclxuXHRcdFx0cmV0dXJuIGZyb3plbjtcclxuXHRcdH0sXHJcblx0XHRzZXQ6IGZ1bmN0aW9uKCBub2RlICl7XHJcblx0XHRcdHZhciBuZXdOb2RlID0gbm90aWZ5KCAncmVzZXQnLCBmcm96ZW4sIG5vZGUgKTtcclxuXHRcdFx0bmV3Tm9kZS5fXy5saXN0ZW5lci50cmlnZ2VyKCAnaW1tZWRpYXRlJywgZnJvemVuLCBuZXdOb2RlICk7XHJcblx0XHR9XHJcblx0fSk7XHJcblxyXG5cdFV0aWxzLmFkZE5FKCB0aGlzLCB7IGdldERhdGE6IHRoaXMuZ2V0LCBzZXREYXRhOiB0aGlzLnNldCB9ICk7XHJcblxyXG5cdC8vIFRoZSBldmVudCBzdG9yZVxyXG5cdHRoaXMuX2V2ZW50cyA9IFtdO1xyXG59XHJcblxyXG5GcmVlemVyLnByb3RvdHlwZSA9IFV0aWxzLmNyZWF0ZU5vbkVudW1lcmFibGUoe2NvbnN0cnVjdG9yOiBGcmVlemVyfSwgRW1pdHRlcik7XHJcbi8vI2J1aWxkXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEZyZWV6ZXI7XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBVdGlscyA9IHJlcXVpcmUoICcuL3V0aWxzJyApLFxyXG5cdE1peGlucyA9IHJlcXVpcmUoICcuL21peGlucycpLFxyXG5cdEVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKVxyXG47XHJcblxyXG4vLyNidWlsZFxyXG52YXIgRnJvemVuID0ge1xyXG5cdGZyZWV6ZTogZnVuY3Rpb24oIG5vZGUsIG5vdGlmeSwgZnJlZXplRm4sIGxpdmUgKXtcclxuXHRcdGlmKCBub2RlICYmIG5vZGUuX18gKXtcclxuXHRcdFx0cmV0dXJuIG5vZGU7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0ZnJvemVuLCBtaXhpbiwgY29uc1xyXG5cdFx0O1xyXG5cclxuXHRcdGlmKCBub2RlLmNvbnN0cnVjdG9yID09IEFycmF5ICl7XHJcblx0XHRcdGZyb3plbiA9IHRoaXMuY3JlYXRlQXJyYXkoIG5vZGUubGVuZ3RoICk7XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0ZnJvemVuID0gT2JqZWN0LmNyZWF0ZSggTWl4aW5zLkhhc2ggKTtcclxuXHRcdH1cclxuXHJcblx0XHRVdGlscy5hZGRORSggZnJvemVuLCB7IF9fOiB7XHJcblx0XHRcdGxpc3RlbmVyOiBmYWxzZSxcclxuXHRcdFx0cGFyZW50czogW10sXHJcblx0XHRcdG5vdGlmeTogbm90aWZ5LFxyXG5cdFx0XHRkaXJ0eTogZmFsc2UsXHJcblx0XHRcdGZyZWV6ZUZuOiBmcmVlemVGbixcclxuXHRcdFx0bGl2ZTogbGl2ZSB8fCBmYWxzZVxyXG5cdFx0fX0pO1xyXG5cclxuXHRcdC8vIEZyZWV6ZSBjaGlsZHJlblxyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkLCBrZXkgKXtcclxuXHRcdFx0Y29ucyA9IGNoaWxkICYmIGNoaWxkLmNvbnN0cnVjdG9yO1xyXG5cdFx0XHRpZiggY29ucyA9PSBBcnJheSB8fCBjb25zID09IE9iamVjdCApe1xyXG5cdFx0XHRcdGNoaWxkID0gbWUuZnJlZXplKCBjaGlsZCwgbm90aWZ5LCBmcmVlemVGbiwgbGl2ZSApO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiggY2hpbGQgJiYgY2hpbGQuX18gKXtcclxuXHRcdFx0XHRtZS5hZGRQYXJlbnQoIGNoaWxkLCBmcm96ZW4gKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0ZnJvemVuWyBrZXkgXSA9IGNoaWxkO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0ZnJlZXplRm4oIGZyb3plbiApO1xyXG5cclxuXHRcdHJldHVybiBmcm96ZW47XHJcblx0fSxcclxuXHJcblx0dXBkYXRlOiBmdW5jdGlvbiggdHlwZSwgbm9kZSwgb3B0aW9ucyApe1xyXG5cdFx0aWYoICF0aGlzWyB0eXBlIF0pXHJcblx0XHRcdHJldHVybiBVdGlscy5lcnJvciggJ1Vua25vd24gdXBkYXRlIHR5cGU6ICcgKyB0eXBlICk7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXNbIHR5cGUgXSggbm9kZSwgb3B0aW9ucyApO1xyXG5cdH0sXHJcblxyXG5cdHJlc2V0OiBmdW5jdGlvbiggbm9kZSwgdmFsdWUgKXtcclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdF8gPSBub2RlLl9fLFxyXG5cdFx0XHRmcm96ZW5cclxuXHRcdDtcclxuXHJcblx0XHRpZiggdmFsdWUgJiYgdmFsdWUuX18gKXtcclxuXHRcdFx0ZnJvemVuID0gdmFsdWU7XHJcblx0XHRcdGZyb3plbi5fXy5saXN0ZW5lciA9IHZhbHVlLl9fLmxpc3RlbmVyO1xyXG5cdFx0XHRmcm96ZW4uX18ucGFyZW50cyA9IFtdO1xyXG5cclxuXHRcdFx0Ly8gU2V0IGJhY2sgdGhlIHBhcmVudCBvbiB0aGUgY2hpbGRyZW5cclxuXHRcdFx0Ly8gdGhhdCBoYXZlIGJlZW4gdXBkYXRlZFxyXG5cdFx0XHR0aGlzLmZpeENoaWxkcmVuKCBmcm96ZW4sIG5vZGUgKTtcclxuXHRcdFx0VXRpbHMuZWFjaCggZnJvemVuLCBmdW5jdGlvbiggY2hpbGQgKXtcclxuXHRcdFx0XHRpZiggY2hpbGQgJiYgY2hpbGQuX18gKXtcclxuXHRcdFx0XHRcdG1lLnJlbW92ZVBhcmVudCggbm9kZSApO1xyXG5cdFx0XHRcdFx0bWUuYWRkUGFyZW50KCBjaGlsZCwgZnJvemVuICk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRmcm96ZW4gPSB0aGlzLmZyZWV6ZSggbm9kZSwgXy5ub3RpZnksIF8uZnJlZXplRm4sIF8ubGl2ZSApO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBmcm96ZW47XHJcblx0fSxcclxuXHJcblx0bWVyZ2U6IGZ1bmN0aW9uKCBub2RlLCBhdHRycyApe1xyXG5cdFx0dmFyIF8gPSBub2RlLl9fLFxyXG5cdFx0XHR0cmFucyA9IF8udHJhbnMsXHJcblxyXG5cdFx0XHQvLyBDbG9uZSB0aGUgYXR0cnMgdG8gbm90IG1vZGlmeSB0aGUgYXJndW1lbnRcclxuXHRcdFx0YXR0cnMgPSBVdGlscy5leHRlbmQoIHt9LCBhdHRycylcclxuXHRcdDtcclxuXHJcblx0XHRpZiggdHJhbnMgKXtcclxuXHJcblx0XHRcdGZvciggdmFyIGF0dHIgaW4gYXR0cnMgKVxyXG5cdFx0XHRcdHRyYW5zWyBhdHRyIF0gPSBhdHRyc1sgYXR0ciBdO1xyXG5cdFx0XHRyZXR1cm4gbm9kZTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgbWUgPSB0aGlzLFxyXG5cdFx0XHRmcm96ZW4gPSB0aGlzLmNvcHlNZXRhKCBub2RlICksXHJcblx0XHRcdG5vdGlmeSA9IF8ubm90aWZ5LFxyXG5cdFx0XHR2YWwsIGNvbnMsIGtleSwgaXNGcm96ZW5cclxuXHRcdDtcclxuXHJcblx0XHRVdGlscy5lYWNoKCBub2RlLCBmdW5jdGlvbiggY2hpbGQsIGtleSApe1xyXG5cdFx0XHRpc0Zyb3plbiA9IGNoaWxkICYmIGNoaWxkLl9fO1xyXG5cclxuXHRcdFx0aWYoIGlzRnJvemVuICl7XHJcblx0XHRcdFx0bWUucmVtb3ZlUGFyZW50KCBjaGlsZCwgbm9kZSApO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHR2YWwgPSBhdHRyc1sga2V5IF07XHJcblx0XHRcdGlmKCAhdmFsICl7XHJcblx0XHRcdFx0aWYoIGlzRnJvemVuIClcclxuXHRcdFx0XHRcdG1lLmFkZFBhcmVudCggY2hpbGQsIGZyb3plbiApO1xyXG5cdFx0XHRcdHJldHVybiBmcm96ZW5bIGtleSBdID0gY2hpbGQ7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGNvbnMgPSB2YWwgJiYgdmFsLmNvbnN0cnVjdG9yO1xyXG5cclxuXHRcdFx0aWYoIGNvbnMgPT0gQXJyYXkgfHwgY29ucyA9PSBPYmplY3QgKVxyXG5cdFx0XHRcdHZhbCA9IG1lLmZyZWV6ZSggdmFsLCBub3RpZnksIF8uZnJlZXplRm4sIF8ubGl2ZSApO1xyXG5cclxuXHRcdFx0aWYoIHZhbCAmJiB2YWwuX18gKVxyXG5cdFx0XHRcdG1lLmFkZFBhcmVudCggdmFsLCBmcm96ZW4gKTtcclxuXHJcblx0XHRcdGRlbGV0ZSBhdHRyc1sga2V5IF07XHJcblxyXG5cdFx0XHRmcm96ZW5bIGtleSBdID0gdmFsO1xyXG5cdFx0fSk7XHJcblxyXG5cclxuXHRcdGZvcigga2V5IGluIGF0dHJzICkge1xyXG5cdFx0XHR2YWwgPSBhdHRyc1sga2V5IF07XHJcblx0XHRcdGNvbnMgPSB2YWwgJiYgdmFsLmNvbnN0cnVjdG9yO1xyXG5cclxuXHRcdFx0aWYoIGNvbnMgPT0gQXJyYXkgfHwgY29ucyA9PSBPYmplY3QgKVxyXG5cdFx0XHRcdHZhbCA9IG1lLmZyZWV6ZSggdmFsLCBub3RpZnksIF8uZnJlZXplRm4sIF8ubGl2ZSApO1xyXG5cclxuXHRcdFx0aWYoIHZhbCAmJiB2YWwuX18gKVxyXG5cdFx0XHRcdG1lLmFkZFBhcmVudCggdmFsLCBmcm96ZW4gKTtcclxuXHJcblx0XHRcdGZyb3plblsga2V5IF0gPSB2YWw7XHJcblx0XHR9XHJcblxyXG5cdFx0Xy5mcmVlemVGbiggZnJvemVuICk7XHJcblxyXG5cdFx0dGhpcy5yZWZyZXNoUGFyZW50cyggbm9kZSwgZnJvemVuICk7XHJcblxyXG5cdFx0cmV0dXJuIGZyb3plbjtcclxuXHR9LFxyXG5cclxuXHRyZXBsYWNlOiBmdW5jdGlvbiggbm9kZSwgcmVwbGFjZW1lbnQgKSB7XHJcblxyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0Y29ucyA9IHJlcGxhY2VtZW50ICYmIHJlcGxhY2VtZW50LmNvbnN0cnVjdG9yLFxyXG5cdFx0XHRfID0gbm9kZS5fXyxcclxuXHRcdFx0ZnJvemVuID0gcmVwbGFjZW1lbnRcclxuXHRcdDtcclxuXHJcblx0XHRpZiggY29ucyA9PSBBcnJheSB8fCBjb25zID09IE9iamVjdCApIHtcclxuXHJcblx0XHRcdGZyb3plbiA9IG1lLmZyZWV6ZSggcmVwbGFjZW1lbnQsIF8ubm90aWZ5LCBfLmZyZWV6ZUZuLCBfLmxpdmUgKTtcclxuXHJcblx0XHRcdGZyb3plbi5fXy5wYXJlbnRzID0gXy5wYXJlbnRzO1xyXG5cclxuXHRcdFx0Ly8gQWRkIHRoZSBjdXJyZW50IGxpc3RlbmVyIGlmIGV4aXN0cywgcmVwbGFjaW5nIGFcclxuXHRcdFx0Ly8gcHJldmlvdXMgbGlzdGVuZXIgaW4gdGhlIGZyb3plbiBpZiBleGlzdGVkXHJcblx0XHRcdGlmKCBfLmxpc3RlbmVyIClcclxuXHRcdFx0XHRmcm96ZW4uX18ubGlzdGVuZXIgPSBfLmxpc3RlbmVyO1xyXG5cclxuXHRcdFx0Ly8gU2luY2UgdGhlIHBhcmVudHMgd2lsbCBiZSByZWZyZXNoZWQgZGlyZWN0bHksXHJcblx0XHRcdC8vIFRyaWdnZXIgdGhlIGxpc3RlbmVyIGhlcmVcclxuXHRcdFx0aWYoIGZyb3plbi5fXy5saXN0ZW5lciApXHJcblx0XHRcdFx0dGhpcy50cmlnZ2VyKCBmcm96ZW4sICd1cGRhdGUnLCBmcm96ZW4gKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBSZWZyZXNoIHRoZSBwYXJlbnQgbm9kZXMgZGlyZWN0bHlcclxuXHRcdGlmKCAhXy5wYXJlbnRzLmxlbmd0aCAmJiBfLmxpc3RlbmVyICl7XHJcblx0XHRcdF8ubGlzdGVuZXIudHJpZ2dlciggJ2ltbWVkaWF0ZScsIG5vZGUsIGZyb3plbiApO1xyXG5cdFx0fVxyXG5cdFx0Zm9yICh2YXIgaSA9IF8ucGFyZW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG5cdFx0XHRpZiggaSA9PSAwICl7XHJcblx0XHRcdFx0dGhpcy5yZWZyZXNoKCBfLnBhcmVudHNbaV0sIG5vZGUsIGZyb3plbiwgZmFsc2UgKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNle1xyXG5cclxuXHRcdFx0XHR0aGlzLm1hcmtEaXJ0eSggXy5wYXJlbnRzW2ldLCBbbm9kZSwgZnJvemVuXSApO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gZnJvemVuO1xyXG5cdH0sXHJcblxyXG5cdHJlbW92ZTogZnVuY3Rpb24oIG5vZGUsIGF0dHJzICl7XHJcblx0XHR2YXIgdHJhbnMgPSBub2RlLl9fLnRyYW5zO1xyXG5cdFx0aWYoIHRyYW5zICl7XHJcblx0XHRcdGZvciggdmFyIGwgPSBhdHRycy5sZW5ndGggLSAxOyBsID49IDA7IGwtLSApXHJcblx0XHRcdFx0ZGVsZXRlIHRyYW5zWyBhdHRyc1tsXSBdO1xyXG5cdFx0XHRyZXR1cm4gbm9kZTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgbWUgPSB0aGlzLFxyXG5cdFx0XHRmcm96ZW4gPSB0aGlzLmNvcHlNZXRhKCBub2RlICksXHJcblx0XHRcdGlzRnJvemVuXHJcblx0XHQ7XHJcblxyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkLCBrZXkgKXtcclxuXHRcdFx0aXNGcm96ZW4gPSBjaGlsZCAmJiBjaGlsZC5fXztcclxuXHJcblx0XHRcdGlmKCBpc0Zyb3plbiApe1xyXG5cdFx0XHRcdG1lLnJlbW92ZVBhcmVudCggY2hpbGQsIG5vZGUgKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYoIGF0dHJzLmluZGV4T2YoIGtleSApICE9IC0xICl7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiggaXNGcm96ZW4gKVxyXG5cdFx0XHRcdG1lLmFkZFBhcmVudCggY2hpbGQsIGZyb3plbiApO1xyXG5cclxuXHRcdFx0ZnJvemVuWyBrZXkgXSA9IGNoaWxkO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0bm9kZS5fXy5mcmVlemVGbiggZnJvemVuICk7XHJcblx0XHR0aGlzLnJlZnJlc2hQYXJlbnRzKCBub2RlLCBmcm96ZW4gKTtcclxuXHJcblx0XHRyZXR1cm4gZnJvemVuO1xyXG5cdH0sXHJcblxyXG5cdHNwbGljZTogZnVuY3Rpb24oIG5vZGUsIGFyZ3MgKXtcclxuXHRcdHZhciBfID0gbm9kZS5fXyxcclxuXHRcdFx0dHJhbnMgPSBfLnRyYW5zXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIHRyYW5zICl7XHJcblx0XHRcdHRyYW5zLnNwbGljZS5hcHBseSggdHJhbnMsIGFyZ3MgKTtcclxuXHRcdFx0cmV0dXJuIG5vZGU7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0ZnJvemVuID0gdGhpcy5jb3B5TWV0YSggbm9kZSApLFxyXG5cdFx0XHRpbmRleCA9IGFyZ3NbMF0sXHJcblx0XHRcdGRlbGV0ZUluZGV4ID0gaW5kZXggKyBhcmdzWzFdLFxyXG5cdFx0XHRjb24sIGNoaWxkXHJcblx0XHQ7XHJcblxyXG5cdFx0Ly8gQ2xvbmUgdGhlIGFycmF5XHJcblx0XHRVdGlscy5lYWNoKCBub2RlLCBmdW5jdGlvbiggY2hpbGQsIGkgKXtcclxuXHJcblx0XHRcdGlmKCBjaGlsZCAmJiBjaGlsZC5fXyApe1xyXG5cdFx0XHRcdG1lLnJlbW92ZVBhcmVudCggY2hpbGQsIG5vZGUgKTtcclxuXHJcblx0XHRcdFx0Ly8gU2tpcCB0aGUgbm9kZXMgdG8gZGVsZXRlXHJcblx0XHRcdFx0aWYoIGkgPCBpbmRleCB8fCBpPj0gZGVsZXRlSW5kZXggKVxyXG5cdFx0XHRcdFx0bWUuYWRkUGFyZW50KCBjaGlsZCwgZnJvemVuICk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGZyb3plbltpXSA9IGNoaWxkO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0Ly8gUHJlcGFyZSB0aGUgbmV3IG5vZGVzXHJcblx0XHRpZiggYXJncy5sZW5ndGggPiAxICl7XHJcblx0XHRcdGZvciAodmFyIGkgPSBhcmdzLmxlbmd0aCAtIDE7IGkgPj0gMjsgaS0tKSB7XHJcblx0XHRcdFx0Y2hpbGQgPSBhcmdzW2ldO1xyXG5cdFx0XHRcdGNvbiA9IGNoaWxkICYmIGNoaWxkLmNvbnN0cnVjdG9yO1xyXG5cclxuXHRcdFx0XHRpZiggY29uID09IEFycmF5IHx8IGNvbiA9PSBPYmplY3QgKVxyXG5cdFx0XHRcdFx0Y2hpbGQgPSB0aGlzLmZyZWV6ZSggY2hpbGQsIF8ubm90aWZ5LCBfLmZyZWV6ZUZuLCBfLmxpdmUgKTtcclxuXHJcblx0XHRcdFx0aWYoIGNoaWxkICYmIGNoaWxkLl9fIClcclxuXHRcdFx0XHRcdHRoaXMuYWRkUGFyZW50KCBjaGlsZCwgZnJvemVuICk7XHJcblxyXG5cdFx0XHRcdGFyZ3NbaV0gPSBjaGlsZDtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdC8vIHNwbGljZVxyXG5cdFx0QXJyYXkucHJvdG90eXBlLnNwbGljZS5hcHBseSggZnJvemVuLCBhcmdzICk7XHJcblxyXG5cdFx0bm9kZS5fXy5mcmVlemVGbiggZnJvemVuICk7XHJcblx0XHR0aGlzLnJlZnJlc2hQYXJlbnRzKCBub2RlLCBmcm96ZW4gKTtcclxuXHJcblx0XHRyZXR1cm4gZnJvemVuO1xyXG5cdH0sXHJcblxyXG5cdHRyYW5zYWN0OiBmdW5jdGlvbiggbm9kZSApIHtcclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdHRyYW5zYWN0aW5nID0gbm9kZS5fXy50cmFucyxcclxuXHRcdFx0dHJhbnNcclxuXHRcdDtcclxuXHJcblx0XHRpZiggdHJhbnNhY3RpbmcgKVxyXG5cdFx0XHRyZXR1cm4gdHJhbnNhY3Rpbmc7XHJcblxyXG5cdFx0dHJhbnMgPSBub2RlLmNvbnN0cnVjdG9yID09IEFycmF5ID8gW10gOiB7fTtcclxuXHJcblx0XHRVdGlscy5lYWNoKCBub2RlLCBmdW5jdGlvbiggY2hpbGQsIGtleSApe1xyXG5cdFx0XHR0cmFuc1sga2V5IF0gPSBjaGlsZDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdG5vZGUuX18udHJhbnMgPSB0cmFucztcclxuXHJcblx0XHQvLyBDYWxsIHJ1biBhdXRvbWF0aWNhbGx5IGluIGNhc2VcclxuXHRcdC8vIHRoZSB1c2VyIGZvcmdvdCBhYm91dCBpdFxyXG5cdFx0VXRpbHMubmV4dFRpY2soIGZ1bmN0aW9uKCl7XHJcblx0XHRcdGlmKCBub2RlLl9fLnRyYW5zIClcclxuXHRcdFx0XHRtZS5ydW4oIG5vZGUgKTtcclxuXHRcdH0pO1xyXG5cclxuXHRcdHJldHVybiB0cmFucztcclxuXHR9LFxyXG5cclxuXHRydW46IGZ1bmN0aW9uKCBub2RlICkge1xyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0dHJhbnMgPSBub2RlLl9fLnRyYW5zXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoICF0cmFucyApXHJcblx0XHRcdHJldHVybiBub2RlO1xyXG5cclxuXHRcdC8vIFJlbW92ZSB0aGUgbm9kZSBhcyBhIHBhcmVudFxyXG5cdFx0VXRpbHMuZWFjaCggdHJhbnMsIGZ1bmN0aW9uKCBjaGlsZCwga2V5ICl7XHJcblx0XHRcdGlmKCBjaGlsZCAmJiBjaGlsZC5fXyApe1xyXG5cdFx0XHRcdG1lLnJlbW92ZVBhcmVudCggY2hpbGQsIG5vZGUgKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblxyXG5cdFx0ZGVsZXRlIG5vZGUuX18udHJhbnM7XHJcblxyXG5cdFx0dmFyIHJlc3VsdCA9IHRoaXMucmVwbGFjZSggbm9kZSwgdHJhbnMgKTtcclxuXHRcdHJldHVybiByZXN1bHQ7XHJcblx0fSxcclxuXHJcblx0cmVmcmVzaDogZnVuY3Rpb24oIG5vZGUsIG9sZENoaWxkLCBuZXdDaGlsZCwgcmV0dXJuVXBkYXRlZCApe1xyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0dHJhbnMgPSBub2RlLl9fLnRyYW5zLFxyXG5cdFx0XHRmb3VuZCA9IDBcclxuXHRcdDtcclxuXHJcblx0XHRpZiggdHJhbnMgKXtcclxuXHJcblx0XHRcdFV0aWxzLmVhY2goIHRyYW5zLCBmdW5jdGlvbiggY2hpbGQsIGtleSApe1xyXG5cdFx0XHRcdGlmKCBmb3VuZCApIHJldHVybjtcclxuXHJcblx0XHRcdFx0aWYoIGNoaWxkID09PSBvbGRDaGlsZCApe1xyXG5cclxuXHRcdFx0XHRcdHRyYW5zWyBrZXkgXSA9IG5ld0NoaWxkO1xyXG5cdFx0XHRcdFx0Zm91bmQgPSAxO1xyXG5cclxuXHRcdFx0XHRcdGlmKCBuZXdDaGlsZCAmJiBuZXdDaGlsZC5fXyApXHJcblx0XHRcdFx0XHRcdG1lLmFkZFBhcmVudCggbmV3Q2hpbGQsIG5vZGUgKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cclxuXHRcdFx0cmV0dXJuIG5vZGU7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGZyb3plbiA9IHRoaXMuY29weU1ldGEoIG5vZGUgKSxcclxuXHRcdFx0ZGlydHkgPSBub2RlLl9fLmRpcnR5LFxyXG5cdFx0XHRkaXJ0LCByZXBsYWNlbWVudCwgX19cclxuXHRcdDtcclxuXHJcblx0XHRpZiggZGlydHkgKXtcclxuXHRcdFx0ZGlydCA9IGRpcnR5WzBdLFxyXG5cdFx0XHRyZXBsYWNlbWVudCA9IGRpcnR5WzFdXHJcblx0XHR9XHJcblxyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkLCBrZXkgKXtcclxuXHRcdFx0aWYoIGNoaWxkID09PSBvbGRDaGlsZCApe1xyXG5cdFx0XHRcdGNoaWxkID0gbmV3Q2hpbGQ7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZiggY2hpbGQgPT09IGRpcnQgKXtcclxuXHRcdFx0XHRjaGlsZCA9IHJlcGxhY2VtZW50O1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiggY2hpbGQgJiYgKF9fID0gY2hpbGQuX18pICl7XHJcblxyXG5cdFx0XHRcdC8vIElmIHRoZXJlIGlzIGEgdHJhbnMgaGFwcGVuaW5nIHdlXHJcblx0XHRcdFx0Ly8gZG9uJ3QgdXBkYXRlIGEgZGlydHkgbm9kZSBub3cuIFRoZSB1cGRhdGVcclxuXHRcdFx0XHQvLyB3aWxsIG9jY3VyIG9uIHJ1bi5cclxuXHRcdFx0XHRpZiggIV9fLnRyYW5zICYmIF9fLmRpcnR5ICl7XHJcblx0XHRcdFx0XHRjaGlsZCA9IG1lLnJlZnJlc2goIGNoaWxkLCBfXy5kaXJ0eVswXSwgX18uZGlydHlbMV0sIHRydWUgKTtcclxuXHRcdFx0XHR9XHJcblxyXG5cclxuXHRcdFx0XHRtZS5yZW1vdmVQYXJlbnQoIGNoaWxkLCBub2RlICk7XHJcblx0XHRcdFx0bWUuYWRkUGFyZW50KCBjaGlsZCwgZnJvemVuICk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGZyb3plblsga2V5IF0gPSBjaGlsZDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdG5vZGUuX18uZnJlZXplRm4oIGZyb3plbiApO1xyXG5cclxuXHRcdC8vIElmIHRoZSBub2RlIHdhcyBkaXJ0eSwgY2xlYW4gaXRcclxuXHRcdG5vZGUuX18uZGlydHkgPSBmYWxzZTtcclxuXHJcblx0XHRpZiggcmV0dXJuVXBkYXRlZCApXHJcblx0XHRcdHJldHVybiBmcm96ZW47XHJcblxyXG5cdFx0dGhpcy5yZWZyZXNoUGFyZW50cyggbm9kZSwgZnJvemVuICk7XHJcblx0fSxcclxuXHJcblx0Zml4Q2hpbGRyZW46IGZ1bmN0aW9uKCBub2RlLCBvbGROb2RlICl7XHJcblx0XHR2YXIgbWUgPSB0aGlzO1xyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkICl7XHJcblx0XHRcdGlmKCAhY2hpbGQgfHwgIWNoaWxkLl9fIClcclxuXHRcdFx0XHRyZXR1cm47XHJcblxyXG5cdFx0XHQvLyBJZiB0aGUgY2hpbGQgaXMgbGlua2VkIHRvIHRoZSBub2RlLFxyXG5cdFx0XHQvLyBtYXliZSBpdHMgY2hpbGRyZW4gYXJlIG5vdCBsaW5rZWRcclxuXHRcdFx0aWYoIGNoaWxkLl9fLnBhcmVudHMuaW5kZXhPZiggbm9kZSApICE9IC0xIClcclxuXHRcdFx0XHRyZXR1cm4gbWUuZml4Q2hpbGRyZW4oIGNoaWxkICk7XHJcblxyXG5cdFx0XHQvLyBJZiB0aGUgY2hpbGQgd2Fzbid0IGxpbmtlZCBpdCBpcyBzdXJlXHJcblx0XHRcdC8vIHRoYXQgaXQgd2Fzbid0IG1vZGlmaWVkLiBKdXN0IGxpbmsgaXRcclxuXHRcdFx0Ly8gdG8gdGhlIG5ldyBwYXJlbnRcclxuXHRcdFx0aWYoIGNoaWxkLl9fLnBhcmVudHMubGVuZ3RoID09IDEgKVxyXG5cdFx0XHRcdHJldHVybiBjaGlsZC5fXy5wYXJlbnRzID0gWyBub2RlIF07XHJcblxyXG5cdFx0XHRpZiggb2xkTm9kZSApXHJcblx0XHRcdFx0bWUucmVtb3ZlUGFyZW50KCBjaGlsZCwgb2xkTm9kZSApO1xyXG5cclxuXHRcdFx0bWUuYWRkUGFyZW50KCBjaGlsZCwgbm9kZSApO1xyXG5cdFx0fSk7XHJcblx0fSxcclxuXHJcblx0Y29weU1ldGE6IGZ1bmN0aW9uKCBub2RlICl7XHJcblx0XHR2YXIgbWUgPSB0aGlzLFxyXG5cdFx0XHRmcm96ZW5cclxuXHRcdDtcclxuXHJcblx0XHRpZiggbm9kZS5jb25zdHJ1Y3RvciA9PSBBcnJheSApe1xyXG5cdFx0XHRmcm96ZW4gPSB0aGlzLmNyZWF0ZUFycmF5KCBub2RlLmxlbmd0aCApO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdGZyb3plbiA9IE9iamVjdC5jcmVhdGUoIE1peGlucy5IYXNoICk7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIF8gPSBub2RlLl9fO1xyXG5cclxuXHRcdFV0aWxzLmFkZE5FKCBmcm96ZW4sIHtfXzoge1xyXG5cdFx0XHRub3RpZnk6IF8ubm90aWZ5LFxyXG5cdFx0XHRsaXN0ZW5lcjogXy5saXN0ZW5lcixcclxuXHRcdFx0cGFyZW50czogXy5wYXJlbnRzLnNsaWNlKCAwICksXHJcblx0XHRcdHRyYW5zOiBfLnRyYW5zLFxyXG5cdFx0XHRkaXJ0eTogZmFsc2UsXHJcblx0XHRcdGZyZWV6ZUZuOiBfLmZyZWV6ZUZuXHJcblx0XHR9fSk7XHJcblxyXG5cdFx0cmV0dXJuIGZyb3plbjtcclxuXHR9LFxyXG5cclxuXHRyZWZyZXNoUGFyZW50czogZnVuY3Rpb24oIG9sZENoaWxkLCBuZXdDaGlsZCApe1xyXG5cdFx0dmFyIF8gPSBvbGRDaGlsZC5fXyxcclxuXHRcdFx0aVxyXG5cdFx0O1xyXG5cclxuXHRcdGlmKCBfLmxpc3RlbmVyIClcclxuXHRcdFx0dGhpcy50cmlnZ2VyKCBuZXdDaGlsZCwgJ3VwZGF0ZScsIG5ld0NoaWxkICk7XHJcblxyXG5cdFx0aWYoICFfLnBhcmVudHMubGVuZ3RoICl7XHJcblx0XHRcdGlmKCBfLmxpc3RlbmVyICl7XHJcblx0XHRcdFx0Xy5saXN0ZW5lci50cmlnZ2VyKCAnaW1tZWRpYXRlJywgb2xkQ2hpbGQsIG5ld0NoaWxkICk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRmb3IgKGkgPSBfLnBhcmVudHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuXHRcdFx0XHQvLyBJZiB0aGVyZSBpcyBtb3JlIHRoYW4gb25lIHBhcmVudCwgbWFyayBldmVyeW9uZSBhcyBkaXJ0eVxyXG5cdFx0XHRcdC8vIGJ1dCB0aGUgbGFzdCBpbiB0aGUgaXRlcmF0aW9uLCBhbmQgd2hlbiB0aGUgbGFzdCBpcyByZWZyZXNoZWRcclxuXHRcdFx0XHQvLyBpdCB3aWxsIHVwZGF0ZSB0aGUgZGlydHkgbm9kZXMuXHJcblx0XHRcdFx0aWYoIGkgPT0gMCApXHJcblx0XHRcdFx0XHR0aGlzLnJlZnJlc2goIF8ucGFyZW50c1tpXSwgb2xkQ2hpbGQsIG5ld0NoaWxkLCBmYWxzZSApO1xyXG5cdFx0XHRcdGVsc2V7XHJcblxyXG5cdFx0XHRcdFx0dGhpcy5tYXJrRGlydHkoIF8ucGFyZW50c1tpXSwgW29sZENoaWxkLCBuZXdDaGlsZF0gKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRtYXJrRGlydHk6IGZ1bmN0aW9uKCBub2RlLCBkaXJ0ICl7XHJcblx0XHR2YXIgXyA9IG5vZGUuX18sXHJcblx0XHRcdGlcclxuXHRcdDtcclxuXHRcdF8uZGlydHkgPSBkaXJ0O1xyXG5cclxuXHRcdC8vIElmIHRoZXJlIGlzIGEgdHJhbnNhY3Rpb24gaGFwcGVuaW5nIGluIHRoZSBub2RlXHJcblx0XHQvLyB1cGRhdGUgdGhlIHRyYW5zYWN0aW9uIGRhdGEgaW1tZWRpYXRlbHlcclxuXHRcdGlmKCBfLnRyYW5zIClcclxuXHRcdFx0dGhpcy5yZWZyZXNoKCBub2RlLCBkaXJ0WzBdLCBkaXJ0WzFdICk7XHJcblxyXG5cdFx0Zm9yICggaSA9IF8ucGFyZW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSApIHtcclxuXHJcblx0XHRcdHRoaXMubWFya0RpcnR5KCBfLnBhcmVudHNbaV0sIGRpcnQgKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRyZW1vdmVQYXJlbnQ6IGZ1bmN0aW9uKCBub2RlLCBwYXJlbnQgKXtcclxuXHRcdHZhciBwYXJlbnRzID0gbm9kZS5fXy5wYXJlbnRzLFxyXG5cdFx0XHRpbmRleCA9IHBhcmVudHMuaW5kZXhPZiggcGFyZW50IClcclxuXHRcdDtcclxuXHJcblx0XHRpZiggaW5kZXggIT0gLTEgKXtcclxuXHRcdFx0cGFyZW50cy5zcGxpY2UoIGluZGV4LCAxICk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0YWRkUGFyZW50OiBmdW5jdGlvbiggbm9kZSwgcGFyZW50ICl7XHJcblx0XHR2YXIgcGFyZW50cyA9IG5vZGUuX18ucGFyZW50cyxcclxuXHRcdFx0aW5kZXggPSBwYXJlbnRzLmluZGV4T2YoIHBhcmVudCApXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIGluZGV4ID09IC0xICl7XHJcblx0XHRcdHBhcmVudHNbIHBhcmVudHMubGVuZ3RoIF0gPSBwYXJlbnQ7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0dHJpZ2dlcjogZnVuY3Rpb24oIG5vZGUsIGV2ZW50TmFtZSwgcGFyYW0gKXtcclxuXHRcdHZhciBsaXN0ZW5lciA9IG5vZGUuX18ubGlzdGVuZXIsXHJcblx0XHRcdHRpY2tpbmcgPSBsaXN0ZW5lci50aWNraW5nXHJcblx0XHQ7XHJcblxyXG5cdFx0bGlzdGVuZXIudGlja2luZyA9IHBhcmFtO1xyXG5cdFx0aWYoICF0aWNraW5nICl7XHJcblx0XHRcdFV0aWxzLm5leHRUaWNrKCBmdW5jdGlvbigpe1xyXG5cdFx0XHRcdHZhciB1cGRhdGVkID0gbGlzdGVuZXIudGlja2luZztcclxuXHRcdFx0XHRsaXN0ZW5lci50aWNraW5nID0gZmFsc2U7XHJcblx0XHRcdFx0bGlzdGVuZXIudHJpZ2dlciggZXZlbnROYW1lLCB1cGRhdGVkICk7XHJcblx0XHRcdH0pO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGNyZWF0ZUxpc3RlbmVyOiBmdW5jdGlvbiggZnJvemVuICl7XHJcblx0XHR2YXIgbCA9IGZyb3plbi5fXy5saXN0ZW5lcjtcclxuXHJcblx0XHRpZiggIWwgKSB7XHJcblx0XHRcdGwgPSBPYmplY3QuY3JlYXRlKEVtaXR0ZXIsIHtcclxuXHRcdFx0XHRfZXZlbnRzOiB7XHJcblx0XHRcdFx0XHR2YWx1ZToge30sXHJcblx0XHRcdFx0XHR3cml0YWJsZTogdHJ1ZVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSk7XHJcblxyXG5cdFx0XHRmcm96ZW4uX18ubGlzdGVuZXIgPSBsO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBsO1xyXG5cdH0sXHJcblxyXG5cdGNyZWF0ZUFycmF5OiAoZnVuY3Rpb24oKXtcclxuXHRcdC8vIFNldCBjcmVhdGVBcnJheSBtZXRob2RcclxuXHRcdGlmKCBbXS5fX3Byb3RvX18gKVxyXG5cdFx0XHRyZXR1cm4gZnVuY3Rpb24oIGxlbmd0aCApe1xyXG5cdFx0XHRcdHZhciBhcnIgPSBuZXcgQXJyYXkoIGxlbmd0aCApO1xyXG5cdFx0XHRcdGFyci5fX3Byb3RvX18gPSBNaXhpbnMuTGlzdDtcclxuXHRcdFx0XHRyZXR1cm4gYXJyO1xyXG5cdFx0XHR9XHJcblx0XHRyZXR1cm4gZnVuY3Rpb24oIGxlbmd0aCApe1xyXG5cdFx0XHR2YXIgYXJyID0gbmV3IEFycmF5KCBsZW5ndGggKSxcclxuXHRcdFx0XHRtZXRob2RzID0gTWl4aW5zLmFycmF5TWV0aG9kc1xyXG5cdFx0XHQ7XHJcblx0XHRcdGZvciggdmFyIG0gaW4gbWV0aG9kcyApe1xyXG5cdFx0XHRcdGFyclsgbSBdID0gbWV0aG9kc1sgbSBdO1xyXG5cdFx0XHR9XHJcblx0XHRcdHJldHVybiBhcnI7XHJcblx0XHR9XHJcblx0fSkoKVxyXG59O1xyXG4vLyNidWlsZFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBGcm96ZW47XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBVdGlscyA9IHJlcXVpcmUoICcuL3V0aWxzLmpzJyApO1xyXG5cclxuLy8jYnVpbGRcclxuXHJcbi8qKlxyXG4gKiBDcmVhdGVzIG5vbi1lbnVtZXJhYmxlIHByb3BlcnR5IGRlc2NyaXB0b3JzLCB0byBiZSB1c2VkIGJ5IE9iamVjdC5jcmVhdGUuXHJcbiAqIEBwYXJhbSAge09iamVjdH0gYXR0cnMgUHJvcGVydGllcyB0byBjcmVhdGUgZGVzY3JpcHRvcnNcclxuICogQHJldHVybiB7T2JqZWN0fSAgICAgICBBIGhhc2ggd2l0aCB0aGUgZGVzY3JpcHRvcnMuXHJcbiAqL1xyXG52YXIgY3JlYXRlTkUgPSBmdW5jdGlvbiggYXR0cnMgKXtcclxuXHR2YXIgbmUgPSB7fTtcclxuXHJcblx0Zm9yKCB2YXIga2V5IGluIGF0dHJzICl7XHJcblx0XHRuZVsga2V5IF0gPSB7XHJcblx0XHRcdHdyaXRhYmxlOiB0cnVlLFxyXG5cdFx0XHRjb25maWd1cmFibGU6IHRydWUsXHJcblx0XHRcdGVudW1lcmFibGU6IGZhbHNlLFxyXG5cdFx0XHR2YWx1ZTogYXR0cnNbIGtleV1cclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHJldHVybiBuZTtcclxufVxyXG5cclxudmFyIGNvbW1vbk1ldGhvZHMgPSB7XHJcblx0c2V0OiBmdW5jdGlvbiggYXR0ciwgdmFsdWUgKXtcclxuXHRcdHZhciBhdHRycyA9IGF0dHIsXHJcblx0XHRcdHVwZGF0ZSA9IHRoaXMuX18udHJhbnNcclxuXHRcdDtcclxuXHJcblx0XHRpZiggdHlwZW9mIHZhbHVlICE9ICd1bmRlZmluZWQnICl7XHJcblx0XHRcdGF0dHJzID0ge307XHJcblx0XHRcdGF0dHJzWyBhdHRyIF0gPSB2YWx1ZTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiggIXVwZGF0ZSApe1xyXG5cdFx0XHRmb3IoIHZhciBrZXkgaW4gYXR0cnMgKXtcclxuXHRcdFx0XHR1cGRhdGUgPSB1cGRhdGUgfHwgdGhpc1sga2V5IF0gIT0gYXR0cnNbIGtleSBdO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHQvLyBObyBjaGFuZ2VzLCBqdXN0IHJldHVybiB0aGUgbm9kZVxyXG5cdFx0XHRpZiggIXVwZGF0ZSApXHJcblx0XHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAnbWVyZ2UnLCB0aGlzLCBhdHRycyApO1xyXG5cdH0sXHJcblxyXG5cdHJlc2V0OiBmdW5jdGlvbiggYXR0cnMgKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdyZXBsYWNlJywgdGhpcywgYXR0cnMgKTtcclxuXHR9LFxyXG5cclxuXHRnZXRMaXN0ZW5lcjogZnVuY3Rpb24oKXtcclxuXHRcdHJldHVybiB0aGlzLl9fLm5vdGlmeSggJ2xpc3RlbmVyJywgdGhpcyApO1xyXG5cdH0sXHJcblxyXG5cdHRvSlM6IGZ1bmN0aW9uKCl7XHJcblx0XHR2YXIganM7XHJcblx0XHRpZiggdGhpcy5jb25zdHJ1Y3RvciA9PSBBcnJheSApe1xyXG5cdFx0XHRqcyA9IG5ldyBBcnJheSggdGhpcy5sZW5ndGggKTtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRqcyA9IHt9O1xyXG5cdFx0fVxyXG5cclxuXHRcdFV0aWxzLmVhY2goIHRoaXMsIGZ1bmN0aW9uKCBjaGlsZCwgaSApe1xyXG5cdFx0XHRpZiggY2hpbGQgJiYgY2hpbGQuX18gKVxyXG5cdFx0XHRcdGpzWyBpIF0gPSBjaGlsZC50b0pTKCk7XHJcblx0XHRcdGVsc2VcclxuXHRcdFx0XHRqc1sgaSBdID0gY2hpbGQ7XHJcblx0XHR9KTtcclxuXHJcblx0XHRyZXR1cm4ganM7XHJcblx0fSxcclxuXHJcblx0dHJhbnNhY3Q6IGZ1bmN0aW9uKCl7XHJcblx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICd0cmFuc2FjdCcsIHRoaXMgKTtcclxuXHR9LFxyXG5cdHJ1bjogZnVuY3Rpb24oKXtcclxuXHRcdHJldHVybiB0aGlzLl9fLm5vdGlmeSggJ3J1bicsIHRoaXMgKTtcclxuXHR9XHJcbn07XHJcblxyXG52YXIgYXJyYXlNZXRob2RzID0gVXRpbHMuZXh0ZW5kKHtcclxuXHRwdXNoOiBmdW5jdGlvbiggZWwgKXtcclxuXHRcdHJldHVybiB0aGlzLmFwcGVuZCggW2VsXSApO1xyXG5cdH0sXHJcblxyXG5cdGFwcGVuZDogZnVuY3Rpb24oIGVscyApe1xyXG5cdFx0aWYoIGVscyAmJiBlbHMubGVuZ3RoIClcclxuXHRcdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAnc3BsaWNlJywgdGhpcywgW3RoaXMubGVuZ3RoLCAwXS5jb25jYXQoIGVscyApICk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRwb3A6IGZ1bmN0aW9uKCl7XHJcblx0XHRpZiggIXRoaXMubGVuZ3RoIClcclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAnc3BsaWNlJywgdGhpcywgW3RoaXMubGVuZ3RoIC0xLCAxXSApO1xyXG5cdH0sXHJcblxyXG5cdHVuc2hpZnQ6IGZ1bmN0aW9uKCBlbCApe1xyXG5cdFx0cmV0dXJuIHRoaXMucHJlcGVuZCggW2VsXSApO1xyXG5cdH0sXHJcblxyXG5cdHByZXBlbmQ6IGZ1bmN0aW9uKCBlbHMgKXtcclxuXHRcdGlmKCBlbHMgJiYgZWxzLmxlbmd0aCApXHJcblx0XHRcdHJldHVybiB0aGlzLl9fLm5vdGlmeSggJ3NwbGljZScsIHRoaXMsIFswLCAwXS5jb25jYXQoIGVscyApICk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzaGlmdDogZnVuY3Rpb24oKXtcclxuXHRcdGlmKCAhdGhpcy5sZW5ndGggKVxyXG5cdFx0XHRyZXR1cm4gdGhpcztcclxuXHJcblx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdzcGxpY2UnLCB0aGlzLCBbMCwgMV0gKTtcclxuXHR9LFxyXG5cclxuXHRzcGxpY2U6IGZ1bmN0aW9uKCBpbmRleCwgdG9SZW1vdmUsIHRvQWRkICl7XHJcblx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdzcGxpY2UnLCB0aGlzLCBhcmd1bWVudHMgKTtcclxuXHR9XHJcbn0sIGNvbW1vbk1ldGhvZHMgKTtcclxuXHJcbnZhciBGcm96ZW5BcnJheSA9IE9iamVjdC5jcmVhdGUoIEFycmF5LnByb3RvdHlwZSwgY3JlYXRlTkUoIGFycmF5TWV0aG9kcyApICk7XHJcblxyXG52YXIgTWl4aW5zID0ge1xyXG5cclxuSGFzaDogT2JqZWN0LmNyZWF0ZSggT2JqZWN0LnByb3RvdHlwZSwgY3JlYXRlTkUoIFV0aWxzLmV4dGVuZCh7XHJcblx0cmVtb3ZlOiBmdW5jdGlvbigga2V5cyApe1xyXG5cdFx0dmFyIGZpbHRlcmVkID0gW10sXHJcblx0XHRcdGsgPSBrZXlzXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIGtleXMuY29uc3RydWN0b3IgIT0gQXJyYXkgKVxyXG5cdFx0XHRrID0gWyBrZXlzIF07XHJcblxyXG5cdFx0Zm9yKCB2YXIgaSA9IDAsIGwgPSBrLmxlbmd0aDsgaTxsOyBpKysgKXtcclxuXHRcdFx0aWYoIHRoaXMuaGFzT3duUHJvcGVydHkoIGtbaV0gKSApXHJcblx0XHRcdFx0ZmlsdGVyZWQucHVzaCgga1tpXSApO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmKCBmaWx0ZXJlZC5sZW5ndGggKVxyXG5cdFx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdyZW1vdmUnLCB0aGlzLCBmaWx0ZXJlZCApO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fVxyXG59LCBjb21tb25NZXRob2RzKSkpLFxyXG5cclxuTGlzdDogRnJvemVuQXJyYXksXHJcbmFycmF5TWV0aG9kczogYXJyYXlNZXRob2RzXHJcbn07XHJcbi8vI2J1aWxkXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE1peGluczsiLCIndXNlIHN0cmljdCc7XG5cbi8vI2J1aWxkXG52YXIgZ2xvYmFsID0gKG5ldyBGdW5jdGlvbihcInJldHVybiB0aGlzXCIpKCkpO1xuXG52YXIgVXRpbHMgPSB7XG5cdGV4dGVuZDogZnVuY3Rpb24oIG9iLCBwcm9wcyApe1xuXHRcdGZvciggdmFyIHAgaW4gcHJvcHMgKXtcblx0XHRcdG9iW3BdID0gcHJvcHNbcF07XG5cdFx0fVxuXHRcdHJldHVybiBvYjtcblx0fSxcblxuXHRjcmVhdGVOb25FbnVtZXJhYmxlOiBmdW5jdGlvbiggb2JqLCBwcm90byApe1xuXHRcdHZhciBuZSA9IHt9O1xuXHRcdGZvciggdmFyIGtleSBpbiBvYmogKVxuXHRcdFx0bmVba2V5XSA9IHt2YWx1ZTogb2JqW2tleV0gfTtcblx0XHRyZXR1cm4gT2JqZWN0LmNyZWF0ZSggcHJvdG8gfHwge30sIG5lICk7XG5cdH0sXG5cblx0ZXJyb3I6IGZ1bmN0aW9uKCBtZXNzYWdlICl7XG5cdFx0dmFyIGVyciA9IG5ldyBFcnJvciggbWVzc2FnZSApO1xuXHRcdGlmKCBjb25zb2xlIClcblx0XHRcdHJldHVybiBjb25zb2xlLmVycm9yKCBlcnIgKTtcblx0XHRlbHNlXG5cdFx0XHR0aHJvdyBlcnI7XG5cdH0sXG5cblx0ZWFjaDogZnVuY3Rpb24oIG8sIGNsYmsgKXtcblx0XHR2YXIgaSxsLGtleXM7XG5cdFx0aWYoIG8gJiYgby5jb25zdHJ1Y3RvciA9PSBBcnJheSApe1xuXHRcdFx0Zm9yIChpID0gMCwgbCA9IG8ubGVuZ3RoOyBpIDwgbDsgaSsrKVxuXHRcdFx0XHRjbGJrKCBvW2ldLCBpICk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0a2V5cyA9IE9iamVjdC5rZXlzKCBvICk7XG5cdFx0XHRmb3IoIGkgPSAwLCBsID0ga2V5cy5sZW5ndGg7IGkgPCBsOyBpKysgKVxuXHRcdFx0XHRjbGJrKCBvWyBrZXlzW2ldIF0sIGtleXNbaV0gKTtcblx0XHR9XG5cdH0sXG5cblx0YWRkTkU6IGZ1bmN0aW9uKCBub2RlLCBhdHRycyApe1xuXHRcdGZvciggdmFyIGtleSBpbiBhdHRycyApe1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KCBub2RlLCBrZXksIHtcblx0XHRcdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0XHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZSxcblx0XHRcdFx0d3JpdGFibGU6IHRydWUsXG5cdFx0XHRcdHZhbHVlOiBhdHRyc1sga2V5IF1cblx0XHRcdH0pO1xuXHRcdH1cblx0fSxcblxuXHQvLyBuZXh0VGljayAtIGJ5IHN0YWdhcyAvIHB1YmxpYyBkb21haW5cbiAgXHRuZXh0VGljazogKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBxdWV1ZSA9IFtdLFxuXHRcdFx0ZGlydHkgPSBmYWxzZSxcblx0XHRcdGZuLFxuXHRcdFx0aGFzUG9zdE1lc3NhZ2UgPSAhIWdsb2JhbC5wb3N0TWVzc2FnZSxcblx0XHRcdG1lc3NhZ2VOYW1lID0gJ25leHR0aWNrJyxcblx0XHRcdHRyaWdnZXIgPSAoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gaGFzUG9zdE1lc3NhZ2Vcblx0XHRcdFx0XHQ/IGZ1bmN0aW9uIHRyaWdnZXIgKCkge1xuXHRcdFx0XHRcdGdsb2JhbC5wb3N0TWVzc2FnZShtZXNzYWdlTmFtZSwgJyonKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQ6IGZ1bmN0aW9uIHRyaWdnZXIgKCkge1xuXHRcdFx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyBwcm9jZXNzUXVldWUoKSB9LCAwKTtcblx0XHRcdFx0fTtcblx0XHRcdH0oKSksXG5cdFx0XHRwcm9jZXNzUXVldWUgPSAoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gaGFzUG9zdE1lc3NhZ2Vcblx0XHRcdFx0XHQ/IGZ1bmN0aW9uIHByb2Nlc3NRdWV1ZSAoZXZlbnQpIHtcblx0XHRcdFx0XHRcdGlmIChldmVudC5zb3VyY2UgPT09IGdsb2JhbCAmJiBldmVudC5kYXRhID09PSBtZXNzYWdlTmFtZSkge1xuXHRcdFx0XHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRcdFx0Zmx1c2hRdWV1ZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQ6IGZsdXNoUXVldWU7XG4gICAgICBcdH0pKClcbiAgICAgIDtcblxuICAgICAgZnVuY3Rpb24gZmx1c2hRdWV1ZSAoKSB7XG4gICAgICAgICAgd2hpbGUgKGZuID0gcXVldWUuc2hpZnQoKSkge1xuICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBkaXJ0eSA9IGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBuZXh0VGljayAoZm4pIHtcbiAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICBpZiAoZGlydHkpIHJldHVybjtcbiAgICAgICAgICBkaXJ0eSA9IHRydWU7XG4gICAgICAgICAgdHJpZ2dlcigpO1xuICAgICAgfVxuXG4gICAgICBpZiAoaGFzUG9zdE1lc3NhZ2UpIGdsb2JhbC5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgcHJvY2Vzc1F1ZXVlLCB0cnVlKTtcblxuICAgICAgbmV4dFRpY2sucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZ2xvYmFsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBwcm9jZXNzUXVldWUsIHRydWUpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbmV4dFRpY2s7XG4gIH0pKClcbn07XG4vLyNidWlsZFxuXG5cbm1vZHVsZS5leHBvcnRzID0gVXRpbHM7IiwiZXhwb3J0IGNsYXNzIEFjdGlvbiB7XG4gIGNvbnN0cnVjdG9yKGFyZ3MpIHtcbiAgICBjb25zdCBbc3RvcmUsIHN0b3JlcywgYWxsU3RvcmVzXSA9IFthcmdzLnN0b3JlLCBhcmdzLnN0b3JlcywgW11dO1xuICAgIHRoaXMubmFtZSA9IGFyZ3MubmFtZTtcblxuICAgIGlmIChzdG9yZSkgYWxsU3RvcmVzLnB1c2goc3RvcmUpO1xuICAgIGlmIChzdG9yZXMpIGFsbFN0b3Jlcy5wdXNoLmFwcGx5KGFsbFN0b3Jlcywgc3RvcmVzKTtcblxuICAgIHRoaXMuc3RvcmVzID0gYWxsU3RvcmVzO1xuICB9XG5cbiAgcnVuKC4uLmFyZ3MpIHtcbiAgICBjb25zdCBzdG9yZXNDeWNsZXMgPSB0aGlzLnN0b3Jlcy5tYXAoc3RvcmUgPT5cbiAgICAgIHN0b3JlLnJ1bkN5Y2xlLmFwcGx5KHN0b3JlLCBbdGhpcy5uYW1lXS5jb25jYXQoYXJncykpXG4gICAgKTtcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoc3RvcmVzQ3ljbGVzKTtcbiAgfVxuXG4gIGFkZFN0b3JlKHN0b3JlKSB7XG4gICAgdGhpcy5zdG9yZXMucHVzaChzdG9yZSk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEFjdGlvbnMge1xuICBjb25zdHJ1Y3RvcihhY3Rpb25zKSB7XG4gICAgdGhpcy5hbGwgPSBbXTtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShhY3Rpb25zKSkge1xuICAgICAgYWN0aW9ucy5mb3JFYWNoKChhY3Rpb24gPT4gdGhpcy5hZGRBY3Rpb24oYWN0aW9uKSksIHRoaXMpO1xuICAgIH1cbiAgfVxuXG4gIGFkZEFjdGlvbihpdGVtLCBub092ZXJyaWRlKSB7XG4gICAgY29uc3QgYWN0aW9uID0gbm9PdmVycmlkZSA/IGZhbHNlIDogdGhpcy5kZXRlY3RBY3Rpb24oaXRlbSk7XG4gICAgaWYgKCFub092ZXJyaWRlKSB7XG4gICAgICBsZXQgb2xkID0gdGhpc1thY3Rpb24ubmFtZV07XG4gICAgICBpZiAob2xkKSB0aGlzLnJlbW92ZUFjdGlvbihvbGQpO1xuICAgICAgdGhpcy5hbGwucHVzaChhY3Rpb24pO1xuICAgICAgdGhpc1thY3Rpb24ubmFtZV0gPSBhY3Rpb24ucnVuLmJpbmQoYWN0aW9uKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYWN0aW9uO1xuICB9XG5cbiAgcmVtb3ZlQWN0aW9uKGl0ZW0pIHtcbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmRldGVjdEFjdGlvbihpdGVtLCB0cnVlKTtcbiAgICBjb25zdCBpbmRleCA9IHRoaXMuYWxsLmluZGV4T2YoYWN0aW9uKTtcbiAgICBpZiAoaW5kZXggIT09IC0xKSB0aGlzLmFsbC5zcGxpY2UoaW5kZXgsIDEpO1xuICAgIGRlbGV0ZSB0aGlzW2FjdGlvbi5uYW1lXTtcbiAgfVxuXG4gIGFkZFN0b3JlKHN0b3JlKSB7XG4gICAgdGhpcy5hbGwuZm9yRWFjaChhY3Rpb24gPT4gYWN0aW9uLmFkZFN0b3JlKHN0b3JlKSk7XG4gIH1cblxuICBkZXRlY3RBY3Rpb24oYWN0aW9uLCBpc09sZCkge1xuICAgIGlmIChhY3Rpb24uY29uc3RydWN0b3IgPT09IEFjdGlvbikge1xuICAgICAgcmV0dXJuIGFjdGlvbjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBhY3Rpb24gPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gKGlzT2xkKSA/IHRoaXNbYWN0aW9uXSA6IG5ldyBBY3Rpb24oe25hbWU6IGFjdGlvbn0pO1xuICAgIH1cbiAgfVxufVxuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBfaW50ZXJvcFJlcXVpcmUgPSBmdW5jdGlvbiAob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmpbXCJkZWZhdWx0XCJdIDogb2JqOyB9O1xuXG5leHBvcnRzLmNyZWF0ZVZpZXcgPSBjcmVhdGVWaWV3O1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcblxudmFyIFJlYWN0ID0gX2ludGVyb3BSZXF1aXJlKCh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydSZWFjdCddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnUmVhY3QnXSA6IG51bGwpKTtcblxudmFyIFJlYWN0Um91dGVyID0gX2ludGVyb3BSZXF1aXJlKCh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydSZWFjdFJvdXRlciddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnUmVhY3RSb3V0ZXInXSA6IG51bGwpKTtcblxuZnVuY3Rpb24gZ2V0Um91dGVyKCkge1xuICB2YXIgUm91dGVyID0ge307XG5cbiAgaWYgKHR5cGVvZiBSZWFjdFJvdXRlciAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHZhciByb3V0ZXJFbGVtZW50cyA9IFtcIlJvdXRlXCIsIFwiRGVmYXVsdFJvdXRlXCIsIFwiUm91dGVIYW5kbGVyXCIsIFwiQWN0aXZlSGFuZGxlclwiLCBcIk5vdEZvdW5kUm91dGVcIiwgXCJMaW5rXCIsIFwiUmVkaXJlY3RcIl0sXG4gICAgICAgIHJvdXRlck1peGlucyA9IFtcIk5hdmlnYXRpb25cIiwgXCJTdGF0ZVwiXSxcbiAgICAgICAgcm91dGVyRnVuY3Rpb25zID0gW1wiY3JlYXRlXCIsIFwiY3JlYXRlRGVmYXVsdFJvdXRlXCIsIFwiY3JlYXRlTm90Rm91bmRSb3V0ZVwiLCBcImNyZWF0ZVJlZGlyZWN0XCIsIFwiY3JlYXRlUm91dGVcIiwgXCJjcmVhdGVSb3V0ZXNGcm9tUmVhY3RDaGlsZHJlblwiLCBcInJ1blwiXSxcbiAgICAgICAgcm91dGVyT2JqZWN0cyA9IFtcIkhhc2hMb2NhdGlvblwiLCBcIkhpc3RvcnlcIiwgXCJIaXN0b3J5TG9jYXRpb25cIiwgXCJSZWZyZXNoTG9jYXRpb25cIiwgXCJTdGF0aWNMb2NhdGlvblwiLCBcIlRlc3RMb2NhdGlvblwiLCBcIkltaXRhdGVCcm93c2VyQmVoYXZpb3JcIiwgXCJTY3JvbGxUb1RvcEJlaGF2aW9yXCJdLFxuICAgICAgICBjb3BpZWRJdGVtcyA9IHJvdXRlck1peGlucy5jb25jYXQocm91dGVyRnVuY3Rpb25zKS5jb25jYXQocm91dGVyT2JqZWN0cyk7XG5cbiAgICByb3V0ZXJFbGVtZW50cy5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBSb3V0ZXJbbmFtZV0gPSBSZWFjdC5jcmVhdGVFbGVtZW50LmJpbmQoUmVhY3QsIFJlYWN0Um91dGVyW25hbWVdKTtcbiAgICB9KTtcblxuICAgIGNvcGllZEl0ZW1zLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIFJvdXRlcltuYW1lXSA9IFJlYWN0Um91dGVyW25hbWVdO1xuICAgIH0pO1xuXG4gICAgUm91dGVyLm1vdW50ID0gZnVuY3Rpb24gKHBhdGgpIHtcbiAgICAgIGNvbnNvbGUubG9nKFwiRXhpbS5Sb3V0ZXIubW91bnQgaXMgbm90IGRlZmluZWRcIik7XG4gICAgfTtcblxuICAgIFJvdXRlci5tYXRjaCA9IGZ1bmN0aW9uIChuYW1lLCBoYW5kbGVyLCBhcmdzLCBjaGlsZHJlbikge1xuICAgICAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIGNoaWxkcmVuID0gYXJncztcbiAgICAgICAgYXJncyA9IGhhbmRsZXI7XG5cbiAgICAgICAgdmFyIHNlZ21lbnRzID0gbmFtZS5zcGxpdChcIi1cIik7XG4gICAgICAgIHZhciBmaWxlUGF0aCA9IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKHNlZ21lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICBmaWxlUGF0aCA9IHNlZ21lbnRzLm1hcChmdW5jdGlvbiAobmFtZSwgaSkge1xuICAgICAgICAgICAgaWYgKGkgPiAwKSByZXR1cm4gbmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG5hbWUuc2xpY2UoMSk7XG4gICAgICAgICAgICByZXR1cm4gbmFtZTtcbiAgICAgICAgICB9KS5qb2luKFwiL1wiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBmaWxlUGF0aCA9IG5hbWUgKyBcIi9cIiArIG5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnNsaWNlKDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgaGFuZGxlciA9IFJvdXRlci5tb3VudChmaWxlUGF0aCk7XG4gICAgICB9XG5cbiAgICAgIHZhciBwYXRoID0gdW5kZWZpbmVkLFxuICAgICAgICAgIGtleSA9IHVuZGVmaW5lZCxcbiAgICAgICAgICBkZWYgPSB1bmRlZmluZWQ7XG5cbiAgICAgIGlmIChhcmdzKSB7XG4gICAgICAgIHBhdGggPSBhcmdzLnBhdGg7XG4gICAgICAgIGtleSA9IGFyZ3Mua2V5O1xuICAgICAgICBkZWYgPSBhcmdzW1wiZGVmYXVsdFwiXTtcbiAgICAgIH1cblxuICAgICAgaWYgKGRlZiA9PT0gdHJ1ZSkge1xuICAgICAgICByZXR1cm4gUm91dGVyLkRlZmF1bHRSb3V0ZSh7IG5hbWU6IG5hbWUsIHBhdGg6IHBhdGgsIGhhbmRsZXI6IGhhbmRsZXIsIGtleToga2V5IH0sIGNoaWxkcmVuKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIFJvdXRlci5Sb3V0ZSh7IG5hbWU6IG5hbWUsIHBhdGg6IHBhdGgsIGhhbmRsZXI6IGhhbmRsZXIsIGtleToga2V5IH0sIGNoaWxkcmVuKTtcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIFJvdXRlcjtcbn1cblxuZnVuY3Rpb24gZ2V0RE9NKCkge1xuICB2YXIgRE9NSGVscGVycyA9IHt9O1xuXG4gIGlmICh0eXBlb2YgUmVhY3QgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICB2YXIgdGFnID0gZnVuY3Rpb24gdGFnKG5hbWUpIHtcbiAgICAgIGZvciAodmFyIF9sZW4gPSBhcmd1bWVudHMubGVuZ3RoLCBhcmdzID0gQXJyYXkoX2xlbiA+IDEgPyBfbGVuIC0gMSA6IDApLCBfa2V5ID0gMTsgX2tleSA8IF9sZW47IF9rZXkrKykge1xuICAgICAgICBhcmdzW19rZXkgLSAxXSA9IGFyZ3VtZW50c1tfa2V5XTtcbiAgICAgIH1cblxuICAgICAgdmFyIGF0dHJpYnV0ZXMgPSB1bmRlZmluZWQ7XG4gICAgICB2YXIgZmlyc3QgPSBhcmdzWzBdICYmIGFyZ3NbMF0uY29uc3RydWN0b3I7XG4gICAgICBpZiAoZmlyc3QgPT09IE9iamVjdCkge1xuICAgICAgICBhdHRyaWJ1dGVzID0gYXJncy5zaGlmdCgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXR0cmlidXRlcyA9IHt9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIFJlYWN0LkRPTVtuYW1lXS5hcHBseShSZWFjdC5ET00sIFthdHRyaWJ1dGVzXS5jb25jYXQoYXJncykpO1xuICAgIH07XG5cbiAgICBmb3IgKHZhciB0YWdOYW1lIGluIFJlYWN0LkRPTSkge1xuICAgICAgRE9NSGVscGVyc1t0YWdOYW1lXSA9IHRhZy5iaW5kKHRoaXMsIHRhZ05hbWUpO1xuICAgIH1cblxuICAgIERPTUhlbHBlcnMuc3BhY2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gUmVhY3QuRE9NLnNwYW4oe1xuICAgICAgICBkYW5nZXJvdXNseVNldElubmVySFRNTDoge1xuICAgICAgICAgIF9faHRtbDogXCImbmJzcDtcIlxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9O1xuICB9XG4gIHJldHVybiBET01IZWxwZXJzO1xufVxuXG52YXIgUm91dGVyID0gZ2V0Um91dGVyKCk7XG5leHBvcnRzLlJvdXRlciA9IFJvdXRlcjtcbnZhciBET00gPSBnZXRET00oKTtcblxuZXhwb3J0cy5ET00gPSBET007XG5cbmZ1bmN0aW9uIGNyZWF0ZVZpZXcoY2xhc3NBcmdzKSB7XG4gIHZhciBSZWFjdENsYXNzID0gUmVhY3QuY3JlYXRlQ2xhc3MoY2xhc3NBcmdzKTtcbiAgdmFyIFJlYWN0RWxlbWVudCA9IFJlYWN0LmNyZWF0ZUVsZW1lbnQuYmluZChSZWFjdC5jcmVhdGVFbGVtZW50LCBSZWFjdENsYXNzKTtcbiAgcmV0dXJuIFJlYWN0RWxlbWVudDtcbn1cblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pXG4vLyMgc291cmNlTWFwcGluZ1VSTD1kYXRhOmFwcGxpY2F0aW9uL2pzb247Y2hhcnNldDp1dGYtODtiYXNlNjQsZXlKMlpYSnphVzl1SWpvekxDSnpiM1Z5WTJWeklqcGJJaTlWYzJWeWN5OTJiMnh2WkhsdGVYSXZWMjl5YXk5b1pXeHNlV1ZoYUM5bGVHbHRMM055WXk5RVQwMUlaV3h3WlhKekxtcHpJbDBzSW01aGJXVnpJanBiWFN3aWJXRndjR2x1WjNNaU9pSTdPenM3TzFGQmFVZG5RaXhWUVVGVkxFZEJRVllzVlVGQlZUczdPenM3U1VGcVIyNUNMRXRCUVVzc01rSkJRVTBzVDBGQlR6czdTVUZEYkVJc1YwRkJWeXd5UWtGQlRTeGpRVUZqT3p0QlFVVjBReXhUUVVGVExGTkJRVk1zUjBGQlNUdEJRVU53UWl4TlFVRk5MRTFCUVUwc1IwRkJSeXhGUVVGRkxFTkJRVU03TzBGQlJXeENMRTFCUVVrc1QwRkJUeXhYUVVGWExFdEJRVXNzVjBGQlZ5eEZRVUZGTzBGQlEzUkRMRkZCUVVrc1kwRkJZeXhIUVVGSExFTkJRVU1zVDBGQlR5eEZRVUZGTEdOQlFXTXNSVUZCUlN4alFVRmpMRVZCUVVVc1pVRkJaU3hGUVVGRkxHVkJRV1VzUlVGQlJTeE5RVUZOTEVWQlFVVXNWVUZCVlN4RFFVRkRPMUZCUTNCSUxGbEJRVmtzUjBGQlJ5eERRVUZETEZsQlFWa3NSVUZCUlN4UFFVRlBMRU5CUVVNN1VVRkRkRU1zWlVGQlpTeEhRVUZITEVOQlFVTXNVVUZCVVN4RlFVRkZMRzlDUVVGdlFpeEZRVUZGTEhGQ1FVRnhRaXhGUVVGRkxHZENRVUZuUWl4RlFVRkZMR0ZCUVdFc1JVRkJSU3dyUWtGQkswSXNSVUZCUlN4TFFVRkxMRU5CUVVNN1VVRkRiRW9zWVVGQllTeEhRVUZITEVOQlFVTXNZMEZCWXl4RlFVRkZMRk5CUVZNc1JVRkJSU3hwUWtGQmFVSXNSVUZCUlN4cFFrRkJhVUlzUlVGQlJTeG5Ra0ZCWjBJc1JVRkJSU3hqUVVGakxFVkJRVVVzZDBKQlFYZENMRVZCUVVVc2NVSkJRWEZDTEVOQlFVTTdVVUZEY0Vzc1YwRkJWeXhIUVVGSExGbEJRVmtzUTBGQlF5eE5RVUZOTEVOQlFVTXNaVUZCWlN4RFFVRkRMRU5CUVVNc1RVRkJUU3hEUVVGRExHRkJRV0VzUTBGQlF5eERRVUZET3p0QlFVVjZSU3hyUWtGQll5eERRVUZETEU5QlFVOHNRMEZCUXl4VlFVRlRMRWxCUVVrc1JVRkJSVHRCUVVOd1F5eFpRVUZOTEVOQlFVTXNTVUZCU1N4RFFVRkRMRWRCUVVjc1MwRkJTeXhEUVVGRExHRkJRV0VzUTBGQlF5eEpRVUZKTEVOQlFVTXNTMEZCU3l4RlFVRkZMRmRCUVZjc1EwRkJReXhKUVVGSkxFTkJRVU1zUTBGQlF5eERRVUZETzB0QlEyNUZMRU5CUVVNc1EwRkJRenM3UVVGRlNDeGxRVUZYTEVOQlFVTXNUMEZCVHl4RFFVRkRMRlZCUVZNc1NVRkJTU3hGUVVGRk8wRkJRMnBETEZsQlFVMHNRMEZCUXl4SlFVRkpMRU5CUVVNc1IwRkJSeXhYUVVGWExFTkJRVU1zU1VGQlNTeERRVUZETEVOQlFVTTdTMEZEYkVNc1EwRkJReXhEUVVGRE96dEJRVVZJTEZWQlFVMHNUVUZCVXl4SFFVRkhMRlZCUVZNc1NVRkJTU3hGUVVGRk8wRkJReTlDTEdGQlFVOHNRMEZCUXl4SFFVRkhMRU5CUVVNc2EwTkJRV3RETEVOQlFVTXNRMEZCUXp0TFFVTnFSQ3hEUVVGQk96dEJRVVZFTEZWQlFVMHNUVUZCVXl4SFFVRkhMRlZCUVZNc1NVRkJTU3hGUVVGRkxFOUJRVThzUlVGQlJTeEpRVUZKTEVWQlFVVXNVVUZCVVN4RlFVRkZPMEZCUTNoRUxGVkJRVWtzVDBGQlR5eFBRVUZQTEV0QlFVc3NVVUZCVVN4RlFVRkZPMEZCUXk5Q0xHZENRVUZSTEVkQlFVY3NTVUZCU1N4RFFVRkRPMEZCUTJoQ0xGbEJRVWtzUjBGQlJ5eFBRVUZQTEVOQlFVTTdPMEZCUldZc1dVRkJTU3hSUVVGUkxFZEJRVWNzU1VGQlNTeERRVUZETEV0QlFVc3NRMEZCUXl4SFFVRkhMRU5CUVVNc1EwRkJRenRCUVVNdlFpeFpRVUZKTEZGQlFWRXNXVUZCUVN4RFFVRkRPMEZCUTJJc1dVRkJTU3hSUVVGUkxFTkJRVU1zVFVGQlRTeEhRVUZITEVOQlFVTXNSVUZCUlR0QlFVTjJRaXhyUWtGQlVTeEhRVUZITEZGQlFWRXNRMEZCUXl4SFFVRkhMRU5CUVVNc1ZVRkJVeXhKUVVGSkxFVkJRVVVzUTBGQlF5eEZRVUZETzBGQlEzWkRMR2RDUVVGSkxFTkJRVU1zUjBGQlF5eERRVUZETEVWQlEwd3NUMEZCVHl4SlFVRkpMRU5CUVVNc1RVRkJUU3hEUVVGRExFTkJRVU1zUTBGQlF5eERRVUZETEZkQlFWY3NSVUZCUlN4SFFVRkhMRWxCUVVrc1EwRkJReXhMUVVGTExFTkJRVU1zUTBGQlF5eERRVUZETEVOQlFVRTdRVUZEY2tRc2JVSkJRVThzU1VGQlNTeERRVUZCTzFkQlExb3NRMEZCUXl4RFFVRkRMRWxCUVVrc1EwRkJReXhIUVVGSExFTkJRVU1zUTBGQlF6dFRRVU5rTEUxQlFVMDdRVUZEVEN4clFrRkJVU3hIUVVGSExFbEJRVWtzUjBGQlJ5eEhRVUZITEVkQlFVY3NTVUZCU1N4RFFVRkRMRTFCUVUwc1EwRkJReXhEUVVGRExFTkJRVU1zUTBGQlF5eFhRVUZYTEVWQlFVVXNSMEZCUnl4SlFVRkpMRU5CUVVNc1MwRkJTeXhEUVVGRExFTkJRVU1zUTBGQlF5eERRVUZETzFOQlEzUkZPenRCUVVWRUxHVkJRVThzUjBGQlJ5eE5RVUZOTEVOQlFVTXNTMEZCU3l4RFFVRkRMRkZCUVZFc1EwRkJReXhEUVVGRE8wOUJRMnhET3p0QlFVVkVMRlZCUVVrc1NVRkJTU3haUVVGQk8xVkJRVVVzUjBGQlJ5eFpRVUZCTzFWQlFVVXNSMEZCUnl4WlFVRkJMRU5CUVVNN08wRkJSVzVDTEZWQlFVa3NTVUZCU1N4RlFVRkRPMEZCUTFBc1dVRkJTU3hIUVVGSExFbEJRVWtzUTBGQlF5eEpRVUZKTEVOQlFVTTdRVUZEYWtJc1YwRkJSeXhIUVVGSExFbEJRVWtzUTBGQlF5eEhRVUZITEVOQlFVTTdRVUZEWml4WFFVRkhMRWRCUVVjc1NVRkJTU3hYUVVGUkxFTkJRVU03VDBGRGNFSTdPMEZCUlVRc1ZVRkJTU3hIUVVGSExFdEJRVXNzU1VGQlNTeEZRVUZGTzBGQlEyaENMR1ZCUVU4c1RVRkJUU3hoUVVGblFpeERRVUZETEVWQlFVTXNTVUZCU1N4RlFVRktMRWxCUVVrc1JVRkJSU3hKUVVGSkxFVkJRVW9zU1VGQlNTeEZRVUZGTEU5QlFVOHNSVUZCVUN4UFFVRlBMRVZCUVVVc1IwRkJSeXhGUVVGSUxFZEJRVWNzUlVGQlF5eEZRVUZGTEZGQlFWRXNRMEZCUXl4RFFVRkRPMDlCUTNKRk96dEJRVVZFTEdGQlFVOHNUVUZCVFN4TlFVRlRMRU5CUVVNc1JVRkJReXhKUVVGSkxFVkJRVW9zU1VGQlNTeEZRVUZGTEVsQlFVa3NSVUZCU2l4SlFVRkpMRVZCUVVVc1QwRkJUeXhGUVVGUUxFOUJRVThzUlVGQlJTeEhRVUZITEVWQlFVZ3NSMEZCUnl4RlFVRkRMRVZCUVVVc1VVRkJVU3hEUVVGRExFTkJRVU03UzBGRE9VUXNRMEZCUXp0SFFVTklPenRCUVVWRUxGTkJRVThzVFVGQlRTeERRVUZETzBOQlEyWTdPMEZCUlVRc1UwRkJVeXhOUVVGTkxFZEJRVWs3UVVGRGFrSXNUVUZCVFN4VlFVRlZMRWRCUVVjc1JVRkJSU3hEUVVGRE96dEJRVVYwUWl4TlFVRkpMRTlCUVU4c1MwRkJTeXhMUVVGTExGZEJRVmNzUlVGQlJUdEJRVU5vUXl4UlFVRkpMRWRCUVVjc1IwRkJSeXhoUVVGVkxFbEJRVWtzUlVGQlZ6dDNRMEZCVGl4SlFVRkpPMEZCUVVvc1dVRkJTVHM3TzBGQlF5OUNMRlZCUVVrc1ZVRkJWU3haUVVGQkxFTkJRVU03UVVGRFppeFZRVUZKTEV0QlFVc3NSMEZCUnl4SlFVRkpMRU5CUVVNc1EwRkJReXhEUVVGRExFbEJRVWtzU1VGQlNTeERRVUZETEVOQlFVTXNRMEZCUXl4RFFVRkRMRmRCUVZjc1EwRkJRenRCUVVNelF5eFZRVUZKTEV0QlFVc3NTMEZCU3l4TlFVRk5MRVZCUVVVN1FVRkRjRUlzYTBKQlFWVXNSMEZCUnl4SlFVRkpMRU5CUVVNc1MwRkJTeXhGUVVGRkxFTkJRVU03VDBGRE0wSXNUVUZCVFR0QlFVTk1MR3RDUVVGVkxFZEJRVWNzUlVGQlJTeERRVUZETzA5QlEycENPMEZCUTBRc1lVRkJUeXhMUVVGTExFTkJRVU1zUjBGQlJ5eERRVUZETEVsQlFVa3NRMEZCUXl4RFFVRkRMRXRCUVVzc1EwRkJReXhMUVVGTExFTkJRVU1zUjBGQlJ5eEZRVUZGTEVOQlFVTXNWVUZCVlN4RFFVRkRMRU5CUVVNc1RVRkJUU3hEUVVGRExFbEJRVWtzUTBGQlF5eERRVUZETEVOQlFVTTdTMEZEY0VVc1EwRkJRenM3UVVGRlJpeFRRVUZMTEVsQlFVa3NUMEZCVHl4SlFVRkpMRXRCUVVzc1EwRkJReXhIUVVGSExFVkJRVVU3UVVGRE4wSXNaMEpCUVZVc1EwRkJReXhQUVVGUExFTkJRVU1zUjBGQlJ5eEhRVUZITEVOQlFVTXNTVUZCU1N4RFFVRkRMRWxCUVVrc1JVRkJSU3hQUVVGUExFTkJRVU1zUTBGQlF6dExRVU12UXpzN1FVRkZSQ3hqUVVGVkxFTkJRVU1zUzBGQlN5eEhRVUZITEZsQlFWYzdRVUZETlVJc1lVRkJUeXhMUVVGTExFTkJRVU1zUjBGQlJ5eERRVUZETEVsQlFVa3NRMEZCUXp0QlFVTndRaXdyUWtGQmRVSXNSVUZCUlR0QlFVTjJRaXhuUWtGQlRTeEZRVUZGTEZGQlFWRTdVMEZEYWtJN1QwRkRSaXhEUVVGRExFTkJRVU03UzBGRFNpeERRVUZETzBkQlEwZzdRVUZEUkN4VFFVRlBMRlZCUVZVc1EwRkJRenREUVVOdVFqczdRVUZGVFN4SlFVRk5MRTFCUVUwc1IwRkJSeXhUUVVGVExFVkJRVVVzUTBGQlF6dFJRVUZ5UWl4TlFVRk5MRWRCUVU0c1RVRkJUVHRCUVVOYUxFbEJRVTBzUjBGQlJ5eEhRVUZITEUxQlFVMHNSVUZCUlN4RFFVRkRPenRSUVVGbUxFZEJRVWNzUjBGQlNDeEhRVUZIT3p0QlFVVlVMRk5CUVZNc1ZVRkJWU3hEUVVGRkxGTkJRVk1zUlVGQlJUdEJRVU55UXl4TlFVRkpMRlZCUVZVc1IwRkJSeXhMUVVGTExFTkJRVU1zVjBGQlZ5eERRVUZETEZOQlFWTXNRMEZCUXl4RFFVRkRPMEZCUXpsRExFMUJRVWtzV1VGQldTeEhRVUZITEV0QlFVc3NRMEZCUXl4aFFVRmhMRU5CUVVNc1NVRkJTU3hEUVVGRExFdEJRVXNzUTBGQlF5eGhRVUZoTEVWQlFVVXNWVUZCVlN4RFFVRkRMRU5CUVVNN1FVRkROMFVzVTBGQlR5eFpRVUZaTEVOQlFVTTdRMEZEY2tJaUxDSm1hV3hsSWpvaVoyVnVaWEpoZEdWa0xtcHpJaXdpYzI5MWNtTmxVbTl2ZENJNklpSXNJbk52ZFhKalpYTkRiMjUwWlc1MElqcGJJbWx0Y0c5eWRDQlNaV0ZqZENCbWNtOXRJQ2R5WldGamRDYzdYRzVwYlhCdmNuUWdVbVZoWTNSU2IzVjBaWElnWm5KdmJTQW5jbVZoWTNRdGNtOTFkR1Z5Snp0Y2JseHVablZ1WTNScGIyNGdaMlYwVW05MWRHVnlJQ2dwSUh0Y2JpQWdZMjl1YzNRZ1VtOTFkR1Z5SUQwZ2UzMDdYRzVjYmlBZ2FXWWdLSFI1Y0dWdlppQlNaV0ZqZEZKdmRYUmxjaUFoUFQwZ0ozVnVaR1ZtYVc1bFpDY3BJSHRjYmlBZ0lDQnNaWFFnY205MWRHVnlSV3hsYldWdWRITWdQU0JiSjFKdmRYUmxKeXdnSjBSbFptRjFiSFJTYjNWMFpTY3NJQ2RTYjNWMFpVaGhibVJzWlhJbkxDQW5RV04wYVhabFNHRnVaR3hsY2ljc0lDZE9iM1JHYjNWdVpGSnZkWFJsSnl3Z0oweHBibXNuTENBblVtVmthWEpsWTNRblhTeGNiaUFnSUNCeWIzVjBaWEpOYVhocGJuTWdQU0JiSjA1aGRtbG5ZWFJwYjI0bkxDQW5VM1JoZEdVblhTeGNiaUFnSUNCeWIzVjBaWEpHZFc1amRHbHZibk1nUFNCYkoyTnlaV0YwWlNjc0lDZGpjbVZoZEdWRVpXWmhkV3gwVW05MWRHVW5MQ0FuWTNKbFlYUmxUbTkwUm05MWJtUlNiM1YwWlNjc0lDZGpjbVZoZEdWU1pXUnBjbVZqZENjc0lDZGpjbVZoZEdWU2IzVjBaU2NzSUNkamNtVmhkR1ZTYjNWMFpYTkdjbTl0VW1WaFkzUkRhR2xzWkhKbGJpY3NJQ2R5ZFc0blhTeGNiaUFnSUNCeWIzVjBaWEpQWW1wbFkzUnpJRDBnV3lkSVlYTm9URzlqWVhScGIyNG5MQ0FuU0dsemRHOXllU2NzSUNkSWFYTjBiM0o1VEc5allYUnBiMjRuTENBblVtVm1jbVZ6YUV4dlkyRjBhVzl1Snl3Z0oxTjBZWFJwWTB4dlkyRjBhVzl1Snl3Z0oxUmxjM1JNYjJOaGRHbHZiaWNzSUNkSmJXbDBZWFJsUW5KdmQzTmxja0psYUdGMmFXOXlKeXdnSjFOamNtOXNiRlJ2Vkc5d1FtVm9ZWFpwYjNJblhTeGNiaUFnSUNCamIzQnBaV1JKZEdWdGN5QTlJSEp2ZFhSbGNrMXBlR2x1Y3k1amIyNWpZWFFvY205MWRHVnlSblZ1WTNScGIyNXpLUzVqYjI1allYUW9jbTkxZEdWeVQySnFaV04wY3lrN1hHNWNiaUFnSUNCeWIzVjBaWEpGYkdWdFpXNTBjeTVtYjNKRllXTm9LR1oxYm1OMGFXOXVLRzVoYldVcElIdGNiaUFnSUNBZ0lGSnZkWFJsY2x0dVlXMWxYU0E5SUZKbFlXTjBMbU55WldGMFpVVnNaVzFsYm5RdVltbHVaQ2hTWldGamRDd2dVbVZoWTNSU2IzVjBaWEpiYm1GdFpWMHBPMXh1SUNBZ0lIMHBPMXh1WEc0Z0lDQWdZMjl3YVdWa1NYUmxiWE11Wm05eVJXRmphQ2htZFc1amRHbHZiaWh1WVcxbEtTQjdYRzRnSUNBZ0lDQlNiM1YwWlhKYmJtRnRaVjBnUFNCU1pXRmpkRkp2ZFhSbGNsdHVZVzFsWFR0Y2JpQWdJQ0I5S1R0Y2JseHVJQ0FnSUZKdmRYUmxjbHNuYlc5MWJuUW5YU0E5SUdaMWJtTjBhVzl1S0hCaGRHZ3BJSHRjYmlBZ0lDQWdJR052Ym5OdmJHVXViRzluS0NkRmVHbHRMbEp2ZFhSbGNpNXRiM1Z1ZENCcGN5QnViM1FnWkdWbWFXNWxaQ2NwTzF4dUlDQWdJSDFjYmx4dUlDQWdJRkp2ZFhSbGNsc25iV0YwWTJnblhTQTlJR1oxYm1OMGFXOXVLRzVoYldVc0lHaGhibVJzWlhJc0lHRnlaM01zSUdOb2FXeGtjbVZ1S1NCN1hHNGdJQ0FnSUNCcFppQW9kSGx3Wlc5bUlHaGhibVJzWlhJZ1BUMDlJQ2R2WW1wbFkzUW5LU0I3WEc0Z0lDQWdJQ0FnSUdOb2FXeGtjbVZ1SUQwZ1lYSm5jenRjYmlBZ0lDQWdJQ0FnWVhKbmN5QTlJR2hoYm1Sc1pYSTdYRzVjYmlBZ0lDQWdJQ0FnYkdWMElITmxaMjFsYm5SeklEMGdibUZ0WlM1emNHeHBkQ2duTFNjcE8xeHVJQ0FnSUNBZ0lDQnNaWFFnWm1sc1pWQmhkR2c3WEc0Z0lDQWdJQ0FnSUdsbUlDaHpaV2R0Wlc1MGN5NXNaVzVuZEdnZ1BpQXhLU0I3WEc0Z0lDQWdJQ0FnSUNBZ1ptbHNaVkJoZEdnZ1BTQnpaV2R0Wlc1MGN5NXRZWEFvWm5WdVkzUnBiMjRvYm1GdFpTd2dhU2w3WEc0Z0lDQWdJQ0FnSUNBZ0lDQnBaaUFvYVQ0d0tWeHVJQ0FnSUNBZ0lDQWdJQ0FnSUNCeVpYUjFjbTRnYm1GdFpTNWphR0Z5UVhRb01Da3VkRzlWY0hCbGNrTmhjMlVvS1NBcklHNWhiV1V1YzJ4cFkyVW9NU2xjYmlBZ0lDQWdJQ0FnSUNBZ0lISmxkSFZ5YmlCdVlXMWxYRzRnSUNBZ0lDQWdJQ0FnZlNrdWFtOXBiaWduTHljcE8xeHVJQ0FnSUNBZ0lDQjlJR1ZzYzJVZ2UxeHVJQ0FnSUNBZ0lDQWdJR1pwYkdWUVlYUm9JRDBnYm1GdFpTQXJJQ2N2SnlBcklHNWhiV1V1WTJoaGNrRjBLREFwTG5SdlZYQndaWEpEWVhObEtDa2dLeUJ1WVcxbExuTnNhV05sS0RFcE8xeHVJQ0FnSUNBZ0lDQjlYRzVjYmlBZ0lDQWdJQ0FnYUdGdVpHeGxjaUE5SUZKdmRYUmxjaTV0YjNWdWRDaG1hV3hsVUdGMGFDazdYRzRnSUNBZ0lDQjlYRzVjYmlBZ0lDQWdJR3hsZENCd1lYUm9MQ0JyWlhrc0lHUmxaanRjYmx4dUlDQWdJQ0FnYVdZZ0tHRnlaM01wZTF4dUlDQWdJQ0FnSUNCd1lYUm9JRDBnWVhKbmN5NXdZWFJvTzF4dUlDQWdJQ0FnSUNCclpYa2dQU0JoY21kekxtdGxlVHRjYmlBZ0lDQWdJQ0FnWkdWbUlEMGdZWEpuY3k1a1pXWmhkV3gwTzF4dUlDQWdJQ0FnZlZ4dVhHNGdJQ0FnSUNCcFppQW9aR1ZtSUQwOVBTQjBjblZsS1NCN1hHNGdJQ0FnSUNBZ0lISmxkSFZ5YmlCU2IzVjBaWEpiSjBSbFptRjFiSFJTYjNWMFpTZGRLSHR1WVcxbExDQndZWFJvTENCb1lXNWtiR1Z5TENCclpYbDlMQ0JqYUdsc1pISmxiaWs3WEc0Z0lDQWdJQ0I5WEc1Y2JpQWdJQ0FnSUhKbGRIVnliaUJTYjNWMFpYSmJKMUp2ZFhSbEoxMG9lMjVoYldVc0lIQmhkR2dzSUdoaGJtUnNaWElzSUd0bGVYMHNJR05vYVd4a2NtVnVLVHRjYmlBZ0lDQjlPMXh1SUNCOVhHNWNiaUFnY21WMGRYSnVJRkp2ZFhSbGNqdGNibjFjYmx4dVpuVnVZM1JwYjI0Z1oyVjBSRTlOSUNncElIdGNiaUFnWTI5dWMzUWdSRTlOU0dWc2NHVnljeUE5SUh0OU8xeHVYRzRnSUdsbUlDaDBlWEJsYjJZZ1VtVmhZM1FnSVQwOUlDZDFibVJsWm1sdVpXUW5LU0I3WEc0Z0lDQWdiR1YwSUhSaFp5QTlJR1oxYm1OMGFXOXVJQ2h1WVcxbExDQXVMaTVoY21kektTQjdYRzRnSUNBZ0lDQnNaWFFnWVhSMGNtbGlkWFJsY3p0Y2JpQWdJQ0FnSUd4bGRDQm1hWEp6ZENBOUlHRnlaM05iTUYwZ0ppWWdZWEpuYzFzd1hTNWpiMjV6ZEhKMVkzUnZjanRjYmlBZ0lDQWdJR2xtSUNobWFYSnpkQ0E5UFQwZ1QySnFaV04wS1NCN1hHNGdJQ0FnSUNBZ0lHRjBkSEpwWW5WMFpYTWdQU0JoY21kekxuTm9hV1owS0NrN1hHNGdJQ0FnSUNCOUlHVnNjMlVnZTF4dUlDQWdJQ0FnSUNCaGRIUnlhV0oxZEdWeklEMGdlMzA3WEc0Z0lDQWdJQ0I5WEc0Z0lDQWdJQ0J5WlhSMWNtNGdVbVZoWTNRdVJFOU5XMjVoYldWZExtRndjR3g1S0ZKbFlXTjBMa1JQVFN3Z1cyRjBkSEpwWW5WMFpYTmRMbU52Ym1OaGRDaGhjbWR6S1NrN1hHNGdJQ0FnZlR0Y2JseHVJQ0FnSUdadmNpQW9iR1YwSUhSaFowNWhiV1VnYVc0Z1VtVmhZM1F1UkU5TktTQjdYRzRnSUNBZ0lDQkVUMDFJWld4d1pYSnpXM1JoWjA1aGJXVmRJRDBnZEdGbkxtSnBibVFvZEdocGN5d2dkR0ZuVG1GdFpTazdYRzRnSUNBZ2ZWeHVYRzRnSUNBZ1JFOU5TR1ZzY0dWeWN5NXpjR0ZqWlNBOUlHWjFibU4wYVc5dUtDa2dlMXh1SUNBZ0lDQWdjbVYwZFhKdUlGSmxZV04wTGtSUFRTNXpjR0Z1S0h0Y2JpQWdJQ0FnSUNBZ1pHRnVaMlZ5YjNWemJIbFRaWFJKYm01bGNraFVUVXc2SUh0Y2JpQWdJQ0FnSUNBZ0lDQmZYMmgwYld3NklDY21ibUp6Y0RzblhHNGdJQ0FnSUNBZ0lIMWNiaUFnSUNBZ0lIMHBPMXh1SUNBZ0lIMDdYRzRnSUgxY2JpQWdjbVYwZFhKdUlFUlBUVWhsYkhCbGNuTTdYRzU5WEc1Y2JtVjRjRzl5ZENCamIyNXpkQ0JTYjNWMFpYSWdQU0JuWlhSU2IzVjBaWElvS1R0Y2JtVjRjRzl5ZENCamIyNXpkQ0JFVDAwZ1BTQm5aWFJFVDAwb0tUdGNibHh1Wlhod2IzSjBJR1oxYm1OMGFXOXVJR055WldGMFpWWnBaWGNnS0dOc1lYTnpRWEpuY3lrZ2UxeHVJQ0JzWlhRZ1VtVmhZM1JEYkdGemN5QTlJRkpsWVdOMExtTnlaV0YwWlVOc1lYTnpLR05zWVhOelFYSm5jeWs3WEc0Z0lHeGxkQ0JTWldGamRFVnNaVzFsYm5RZ1BTQlNaV0ZqZEM1amNtVmhkR1ZGYkdWdFpXNTBMbUpwYm1Rb1VtVmhZM1F1WTNKbFlYUmxSV3hsYldWdWRDd2dVbVZoWTNSRGJHRnpjeWs3WEc0Z0lISmxkSFZ5YmlCU1pXRmpkRVZzWlcxbGJuUTdYRzU5WEc0aVhYMD0iLCJpbXBvcnQge0FjdGlvbnN9IGZyb20gJy4vQWN0aW9ucyc7XG5pbXBvcnQgdXRpbHMgZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgRnJlZXplciBmcm9tICdmcmVlemVyLWpzJztcbmltcG9ydCBnZXRDb25uZWN0TWl4aW4gZnJvbSAnLi9taXhpbnMvY29ubmVjdCc7XG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU3RvcmUge1xuICBjb25zdHJ1Y3RvcihhcmdzPXt9KSB7XG4gICAgbGV0IHthY3Rpb25zLCBpbml0aWFsfSA9IGFyZ3M7XG4gICAgbGV0IGluaXQgPSB0eXBlb2YgaW5pdGlhbCA9PT0gJ2Z1bmN0aW9uJyA/IGluaXRpYWwoKSA6IGluaXRpYWw7XG4gICAgbGV0IHN0b3JlID0gbmV3IEZyZWV6ZXIoaW5pdCB8fCB7fSk7XG5cbiAgICB0aGlzLmNvbm5lY3QgPSBmdW5jdGlvbiAoLi4uYXJncykge1xuICAgICAgcmV0dXJuIGdldENvbm5lY3RNaXhpbih0aGlzLCBhcmdzLmNvbmNhdChhcmdzKSk7XG4gICAgfTtcblxuICAgIHRoaXMuaGFuZGxlcnMgPSBhcmdzLmhhbmRsZXJzIHx8IHV0aWxzLmdldFdpdGhvdXRGaWVsZHMoWydhY3Rpb25zJ10sIGFyZ3MpIHx8IHt9O1xuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoYWN0aW9ucykpIHtcbiAgICAgIHRoaXMuYWN0aW9ucyA9IGFjdGlvbnMgPSBuZXcgQWN0aW9ucyhhY3Rpb25zKTtcbiAgICAgIHRoaXMuYWN0aW9ucy5hZGRTdG9yZSh0aGlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBzZXQgPSBmdW5jdGlvbiAoaXRlbSwgdmFsdWUpIHtcbiAgICAgIHN0b3JlLmdldCgpLnNldChpdGVtLCB2YWx1ZSk7XG4gICAgfTtcblxuICAgIGNvbnN0IGdldCA9IGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICBpZiAoaXRlbSlcbiAgICAgICAgcmV0dXJuIHN0b3JlLmdldCgpLnRvSlMoKVtpdGVtXTtcbiAgICAgIHJldHVybiBzdG9yZS5nZXQoKTtcbiAgICB9O1xuXG4gICAgY29uc3QgcmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLnNldChpbml0KTtcbiAgICB9O1xuXG4gICAgdGhpcy5zZXQgPSBzZXQ7XG4gICAgdGhpcy5nZXQgPSBnZXQ7XG4gICAgdGhpcy5yZXNldCA9IHJlc2V0O1xuICAgIHRoaXMuc3RvcmUgPSBzdG9yZTtcblxuICAgIHRoaXMuc3RhdGVQcm90byA9IHtzZXQsIGdldCwgcmVzZXQsIGFjdGlvbnN9O1xuICAgIC8vdGhpcy5nZXR0ZXIgPSBuZXcgR2V0dGVyKHRoaXMpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgYWRkQWN0aW9uKGl0ZW0pIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShpdGVtKSkge1xuICAgICAgdGhpcy5hY3Rpb25zID0gdGhpcy5hY3Rpb25zLmNvbmNhdCh0aGlzLmFjdGlvbnMpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnKSB7XG4gICAgICB0aGlzLmFjdGlvbnMucHVzaChpdGVtKTtcbiAgICB9XG4gIH1cblxuICByZW1vdmVBY3Rpb24oaXRlbSkge1xuICAgIHZhciBhY3Rpb247XG4gICAgaWYgKHR5cGVvZiBpdGVtID09PSAnc3RyaW5nJykge1xuICAgICAgYWN0aW9uID0gdGhpcy5maW5kQnlOYW1lKCdhY3Rpb25zJywgJ25hbWUnLCBpdGVtKTtcbiAgICAgIGlmIChhY3Rpb24pIGFjdGlvbi5yZW1vdmVTdG9yZSh0aGlzKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBpdGVtID09PSAnb2JqZWN0Jykge1xuICAgICAgYWN0aW9uID0gaXRlbTtcbiAgICAgIGxldCBpbmRleCA9IHRoaXMuYWN0aW9ucy5pbmRleE9mKGFjdGlvbik7XG4gICAgICBpZiAoaW5kZXggIT09IC0xKSB7XG4gICAgICAgIGFjdGlvbi5yZW1vdmVTdG9yZSh0aGlzKTtcbiAgICAgICAgdGhpcy5hY3Rpb25zID0gdGhpcy5hY3Rpb25zLnNwbGljZShpbmRleCwgMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0QWN0aW9uQ3ljbGUoYWN0aW9uTmFtZSwgcHJlZml4PSdvbicpIHtcbiAgICBjb25zdCBjYXBpdGFsaXplZCA9IHV0aWxzLmNhcGl0YWxpemUoYWN0aW9uTmFtZSk7XG4gICAgY29uc3QgZnVsbEFjdGlvbk5hbWUgPSBgJHtwcmVmaXh9JHtjYXBpdGFsaXplZH1gO1xuICAgIGNvbnN0IGhhbmRsZXIgPSB0aGlzLmhhbmRsZXJzW2Z1bGxBY3Rpb25OYW1lXSB8fCB0aGlzLmhhbmRsZXJzW2FjdGlvbk5hbWVdO1xuICAgIGlmICghaGFuZGxlcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBObyBoYW5kbGVycyBmb3IgJHthY3Rpb25OYW1lfSBhY3Rpb24gZGVmaW5lZCBpbiBjdXJyZW50IHN0b3JlYCk7XG4gICAgfVxuXG4gICAgbGV0IGFjdGlvbnM7XG4gICAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnb2JqZWN0Jykge1xuICAgICAgYWN0aW9ucyA9IGhhbmRsZXI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgYWN0aW9ucyA9IHtvbjogaGFuZGxlcn07XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtoYW5kbGVyfSBtdXN0IGJlIGFuIG9iamVjdCBvciBmdW5jdGlvbmApO1xuICAgIH1cbiAgICByZXR1cm4gYWN0aW9ucztcbiAgfVxuXG4gIC8vIDEuIHdpbGwoaW5pdGlhbCkgPT4gd2lsbFJlc3VsdFxuICAvLyAyLiB3aGlsZSh0cnVlKVxuICAvLyAzLiBvbih3aWxsUmVzdWx0IHx8IGluaXRpYWwpID0+IG9uUmVzdWx0XG4gIC8vIDQuIHdoaWxlKGZhbHNlKVxuICAvLyA1LiBkaWQob25SZXN1bHQpXG4gIHJ1bkN5Y2xlKGFjdGlvbk5hbWUsIC4uLmFyZ3MpIHtcbiAgICAvLyBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHJlc29sdmUodHJ1ZSkpXG4gICAgY29uc3QgY3ljbGUgPSB0aGlzLmdldEFjdGlvbkN5Y2xlKGFjdGlvbk5hbWUpO1xuICAgIGxldCBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgbGV0IHdpbGwgPSBjeWNsZS53aWxsLCB3aGlsZV8gPSBjeWNsZS53aGlsZSwgb25fID0gY3ljbGUub247XG4gICAgbGV0IGRpZCA9IGN5Y2xlLmRpZCwgZGlkTm90ID0gY3ljbGUuZGlkTm90O1xuXG4gICAgLy8gTG9jYWwgc3RhdGUgZm9yIHRoaXMgY3ljbGUuXG4gICAgbGV0IHN0YXRlID0gT2JqZWN0LmNyZWF0ZSh0aGlzLnN0YXRlUHJvdG8pO1xuXG4gICAgLy8gUHJlLWNoZWNrICYgcHJlcGFyYXRpb25zLlxuICAgIGlmICh3aWxsKSBwcm9taXNlID0gcHJvbWlzZS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB3aWxsLmFwcGx5KHN0YXRlLCBhcmdzKTtcbiAgICB9KTtcblxuICAgIC8vIFN0YXJ0IHdoaWxlKCkuXG4gICAgaWYgKHdoaWxlXykgcHJvbWlzZSA9IHByb21pc2UudGhlbigod2lsbFJlc3VsdCkgPT4ge1xuICAgICAgd2hpbGVfLmNhbGwoc3RhdGUsIHRydWUpO1xuICAgICAgcmV0dXJuIHdpbGxSZXN1bHQ7XG4gICAgfSk7XG5cbiAgICAvLyBBY3R1YWwgZXhlY3V0aW9uLlxuICAgIHByb21pc2UgPSBwcm9taXNlLnRoZW4oKHdpbGxSZXN1bHQpID0+IHtcbiAgICAgIGlmICh3aWxsUmVzdWx0ID09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG9uXy5hcHBseShzdGF0ZSwgYXJncyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gb25fLmNhbGwoc3RhdGUsIHdpbGxSZXN1bHQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gU3RvcCB3aGlsZSgpLlxuICAgIGlmICh3aGlsZV8pIHByb21pc2UgPSBwcm9taXNlLnRoZW4oKG9uUmVzdWx0KSA9PiB7XG4gICAgICB3aGlsZV8uY2FsbChzdGF0ZSwgZmFsc2UpO1xuICAgICAgcmV0dXJuIG9uUmVzdWx0O1xuICAgIH0pO1xuXG4gICAgLy8gRm9yIGRpZCBhbmQgZGlkTm90IHN0YXRlIGlzIGZyZWV6ZWQuXG4gICAgcHJvbWlzZSA9IHByb21pc2UudGhlbigob25SZXN1bHQpID0+IHtcbiAgICAgIE9iamVjdC5mcmVlemUoc3RhdGUpO1xuICAgICAgcmV0dXJuIG9uUmVzdWx0O1xuICAgIH0pO1xuXG4gICAgLy8gSGFuZGxlIHRoZSByZXN1bHQuXG4gICAgaWYgKGRpZCkgcHJvbWlzZSA9IHByb21pc2UudGhlbihvblJlc3VsdCA9PiB7XG4gICAgICByZXR1cm4gZGlkLmNhbGwoc3RhdGUsIG9uUmVzdWx0KTtcbiAgICB9KTtcblxuICAgIHByb21pc2UuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaWYgKHdoaWxlXykgd2hpbGVfLmNhbGwodGhpcywgc3RhdGUsIGZhbHNlKTtcbiAgICAgIGlmIChkaWROb3QpIHtcbiAgICAgICAgZGlkTm90LmNhbGwoc3RhdGUsIGVycm9yKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cbn1cbiIsImV4cG9ydCBkZWZhdWx0IHtcbiAgY3g6IGZ1bmN0aW9uIChjbGFzc05hbWVzKSB7XG4gICAgaWYgKHR5cGVvZiBjbGFzc05hbWVzID09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LmtleXMoY2xhc3NOYW1lcykuZmlsdGVyKGZ1bmN0aW9uKGNsYXNzTmFtZSkge1xuICAgICAgICByZXR1cm4gY2xhc3NOYW1lc1tjbGFzc05hbWVdO1xuICAgICAgfSkuam9pbignICcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLmpvaW4uY2FsbChhcmd1bWVudHMsICcgJyk7XG4gICAgfVxuICB9XG59O1xuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZ2V0Q29ubmVjdE1peGluIChzdG9yZSkge1xuICBsZXQgY2hhbmdlQ2FsbGJhY2sgPSBmdW5jdGlvbiAoc3RhdGUpIHtcbiAgICB0aGlzLnNldFN0YXRlKHN0YXRlLnRvSlMoKSk7XG4gIH07XG5cbiAgbGV0IGxpc3RlbmVyO1xuXG4gIHJldHVybiB7XG4gICAgZ2V0SW5pdGlhbFN0YXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICBjb25zdCBmcm96ZW4gPSBzdG9yZS5zdG9yZS5nZXQoYXJndW1lbnRzKTtcbiAgICAgIGNvbnN0IHN0YXRlID0gZnJvemVuLnRvSlMoKTtcblxuICAgICAgaWYgKCF0aGlzLmJvdW5kRXhpbUNoYW5nZUNhbGxiYWNrcylcbiAgICAgICAgdGhpcy5ib3VuZEV4aW1DaGFuZ2VDYWxsYmFja3MgPSB7fTtcblxuICAgICAgdGhpcy5ib3VuZEV4aW1DaGFuZ2VDYWxsYmFja3Nbc3RvcmVdID0gY2hhbmdlQ2FsbGJhY2suYmluZCh0aGlzKTtcblxuICAgICAgbGlzdGVuZXIgPSBmcm96ZW4uZ2V0TGlzdGVuZXIoKTtcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9LFxuXG4gICAgY29tcG9uZW50RGlkTW91bnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGxpc3RlbmVyLm9uKCd1cGRhdGUnLCB0aGlzLmJvdW5kRXhpbUNoYW5nZUNhbGxiYWNrc1tzdG9yZV0pO1xuICAgIH0sXG5cbiAgICBjb21wb25lbnRXaWxsVW5tb3VudDogZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKGxpc3RlbmVyKVxuICAgICAgICBsaXN0ZW5lci5vZmYoJ3VwZGF0ZScsIHRoaXMuYm91bmRFeGltQ2hhbmdlQ2FsbGJhY2tzW3N0b3JlXSk7XG4gICAgfVxuICB9O1xufVxuIiwiY29uc3QgdXRpbHMgPSB7fTtcblxudXRpbHMuZ2V0V2l0aG91dEZpZWxkcyA9IGZ1bmN0aW9uIChvdXRjYXN0LCB0YXJnZXQpIHtcbiAgaWYgKCF0YXJnZXQpIHRocm93IG5ldyBFcnJvcignVHlwZUVycm9yOiB0YXJnZXQgaXMgbm90IGFuIG9iamVjdC4nKTtcbiAgdmFyIHJlc3VsdCA9IHt9O1xuICBpZiAodHlwZW9mIG91dGNhc3QgPT09ICdzdHJpbmcnKSBvdXRjYXN0ID0gW291dGNhc3RdO1xuICB2YXIgdEtleXMgPSBPYmplY3Qua2V5cyh0YXJnZXQpO1xuICBvdXRjYXN0LmZvckVhY2goZnVuY3Rpb24oZmllbGROYW1lKSB7XG4gICAgdEtleXNcbiAgICAgIC5maWx0ZXIoZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHJldHVybiBrZXkgIT09IGZpZWxkTmFtZTtcbiAgICAgIH0pXG4gICAgICAuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgcmVzdWx0W2tleV0gPSB0YXJnZXRba2V5XTtcbiAgICAgIH0pO1xuICB9KTtcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbnV0aWxzLm9iamVjdFRvQXJyYXkgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmplY3QpLm1hcChrZXkgPT4gb2JqZWN0W2tleV0pO1xufTtcblxudXRpbHMuY2xhc3NXaXRoQXJncyA9IGZ1bmN0aW9uIChJdGVtLCBhcmdzKSB7XG4gIHJldHVybiBJdGVtLmJpbmQuYXBwbHkoSXRlbSxbSXRlbV0uY29uY2F0KGFyZ3MpKTtcbn07XG5cbi8vIDEuIHdpbGxcbi8vIDIuIHdoaWxlKHRydWUpXG4vLyAzLiBvblxuLy8gNC4gd2hpbGUoZmFsc2UpXG4vLyA1LiBkaWQgb3IgZGlkTm90XG51dGlscy5tYXBBY3Rpb25OYW1lcyA9IGZ1bmN0aW9uKG9iamVjdCkge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGNvbnN0IHByZWZpeGVzID0gWyd3aWxsJywgJ3doaWxlU3RhcnQnLCAnb24nLCAnd2hpbGVFbmQnLCAnZGlkJywgJ2RpZE5vdCddO1xuICBwcmVmaXhlcy5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgIGxldCBuYW1lID0gaXRlbTtcbiAgICBpZiAoaXRlbSA9PT0gJ3doaWxlU3RhcnQnIHx8IGl0ZW0gPT09ICd3aGlsZUVuZCcpIHtcbiAgICAgIG5hbWUgPSAnd2hpbGUnO1xuICAgIH1cbiAgICBpZiAob2JqZWN0W25hbWVdKSB7XG4gICAgICBsaXN0LnB1c2goW2l0ZW0sIG9iamVjdFtuYW1lXV0pO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBsaXN0O1xufTtcblxudXRpbHMuaXNPYmplY3QgPSBmdW5jdGlvbiAodGFyZykge1xuICByZXR1cm4gdGFyZyA/IHRhcmcudG9TdHJpbmcoKS5zbGljZSg4LDE0KSA9PT0gJ09iamVjdCcgOiBmYWxzZTtcbn07XG51dGlscy5jYXBpdGFsaXplID0gZnVuY3Rpb24gKHN0cikge1xuICBjb25zdCBmaXJzdCA9IHN0ci5jaGFyQXQoMCkudG9VcHBlckNhc2UoKTtcbiAgY29uc3QgcmVzdCA9IHN0ci5zbGljZSgxKTtcbiAgcmV0dXJuIGAke2ZpcnN0fSR7cmVzdH1gO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgdXRpbHM7XG4iXX0=
