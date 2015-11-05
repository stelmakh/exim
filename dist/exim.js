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

},{"./Actions":8,"./DOMHelpers":9,"./Store":10,"./helpers":12}],2:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9ET01IZWxwZXJzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O1FBd0RnQixVQUFVLEdBQVYsVUFBVTs7Ozs7SUF4RG5CLEtBQUssMkJBQU0sT0FBTzs7SUFDbEIsV0FBVywyQkFBTSxjQUFjOztBQUV0QyxTQUFTLFNBQVMsR0FBSTtBQUNwQixNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFDbEIsTUFBSSxPQUFPLFdBQVcsS0FBSyxXQUFXLEVBQUU7QUFDdEMsUUFBSSxjQUFjLEdBQUcsQ0FBQyxPQUFPLEVBQUUsY0FBYyxFQUFFLGNBQWMsRUFBRSxlQUFlLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxVQUFVLENBQUM7UUFDcEgsWUFBWSxHQUFHLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQztRQUN0QyxlQUFlLEdBQUcsQ0FBQyxRQUFRLEVBQUUsb0JBQW9CLEVBQUUscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQUUsYUFBYSxFQUFFLCtCQUErQixFQUFFLEtBQUssQ0FBQztRQUNsSixhQUFhLEdBQUcsQ0FBQyxjQUFjLEVBQUUsU0FBUyxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSx3QkFBd0IsRUFBRSxxQkFBcUIsQ0FBQztRQUNwSyxXQUFXLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7O0FBRXpFLGtCQUFjLENBQUMsT0FBTyxDQUFDLFVBQVMsSUFBSSxFQUFFO0FBQ3BDLFlBQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7S0FDbkUsQ0FBQyxDQUFDOztBQUVILGVBQVcsQ0FBQyxPQUFPLENBQUMsVUFBUyxJQUFJLEVBQUU7QUFDakMsWUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUNsQyxDQUFDLENBQUM7R0FDSjtBQUNELFNBQU8sTUFBTSxDQUFDO0NBQ2Y7O0FBRUQsU0FBUyxNQUFNLEdBQUk7QUFDakIsTUFBTSxVQUFVLEdBQUcsRUFBRSxDQUFDOztBQUV0QixNQUFJLE9BQU8sS0FBSyxLQUFLLFdBQVcsRUFBRTtBQUNoQyxRQUFJLEdBQUcsR0FBRyxhQUFVLElBQUksRUFBVzt3Q0FBTixJQUFJO0FBQUosWUFBSTs7O0FBQy9CLFVBQUksVUFBVSxZQUFBLENBQUM7QUFDZixVQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQztBQUMzQyxVQUFJLEtBQUssS0FBSyxNQUFNLEVBQUU7QUFDcEIsa0JBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7T0FDM0IsTUFBTTtBQUNMLGtCQUFVLEdBQUcsRUFBRSxDQUFDO09BQ2pCO0FBQ0QsYUFBTyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7S0FDcEUsQ0FBQzs7QUFFRixTQUFLLElBQUksT0FBTyxJQUFJLEtBQUssQ0FBQyxHQUFHLEVBQUU7QUFDN0IsZ0JBQVUsQ0FBQyxPQUFPLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztLQUMvQzs7QUFFRCxjQUFVLENBQUMsS0FBSyxHQUFHLFlBQVc7QUFDNUIsYUFBTyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQztBQUNwQiwrQkFBdUIsRUFBRTtBQUN2QixnQkFBTSxFQUFFLFFBQVE7U0FDakI7T0FDRixDQUFDLENBQUM7S0FDSixDQUFDO0dBQ0g7QUFDRCxTQUFPLFVBQVUsQ0FBQztDQUNuQjs7QUFFTSxJQUFNLE1BQU0sR0FBRyxTQUFTLEVBQUUsQ0FBQztRQUFyQixNQUFNLEdBQU4sTUFBTTtBQUNaLElBQU0sR0FBRyxHQUFHLE1BQU0sRUFBRSxDQUFDOztRQUFmLEdBQUcsR0FBSCxHQUFHOztBQUVULFNBQVMsVUFBVSxDQUFFLFNBQVMsRUFBRTtBQUNyQyxNQUFJLFVBQVUsR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzlDLE1BQUksWUFBWSxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDN0UsU0FBTyxZQUFZLENBQUM7Q0FDckIiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBSZWFjdCBmcm9tICdyZWFjdCc7XG5pbXBvcnQgUmVhY3RSb3V0ZXIgZnJvbSAncmVhY3Qtcm91dGVyJztcblxuZnVuY3Rpb24gZ2V0Um91dGVyICgpIHtcbiAgY29uc3QgUm91dGVyID0ge307XG4gIGlmICh0eXBlb2YgUmVhY3RSb3V0ZXIgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbGV0IHJvdXRlckVsZW1lbnRzID0gWydSb3V0ZScsICdEZWZhdWx0Um91dGUnLCAnUm91dGVIYW5kbGVyJywgJ0FjdGl2ZUhhbmRsZXInLCAnTm90Rm91bmRSb3V0ZScsICdMaW5rJywgJ1JlZGlyZWN0J10sXG4gICAgcm91dGVyTWl4aW5zID0gWydOYXZpZ2F0aW9uJywgJ1N0YXRlJ10sXG4gICAgcm91dGVyRnVuY3Rpb25zID0gWydjcmVhdGUnLCAnY3JlYXRlRGVmYXVsdFJvdXRlJywgJ2NyZWF0ZU5vdEZvdW5kUm91dGUnLCAnY3JlYXRlUmVkaXJlY3QnLCAnY3JlYXRlUm91dGUnLCAnY3JlYXRlUm91dGVzRnJvbVJlYWN0Q2hpbGRyZW4nLCAncnVuJ10sXG4gICAgcm91dGVyT2JqZWN0cyA9IFsnSGFzaExvY2F0aW9uJywgJ0hpc3RvcnknLCAnSGlzdG9yeUxvY2F0aW9uJywgJ1JlZnJlc2hMb2NhdGlvbicsICdTdGF0aWNMb2NhdGlvbicsICdUZXN0TG9jYXRpb24nLCAnSW1pdGF0ZUJyb3dzZXJCZWhhdmlvcicsICdTY3JvbGxUb1RvcEJlaGF2aW9yJ10sXG4gICAgY29waWVkSXRlbXMgPSByb3V0ZXJNaXhpbnMuY29uY2F0KHJvdXRlckZ1bmN0aW9ucykuY29uY2F0KHJvdXRlck9iamVjdHMpO1xuXG4gICAgcm91dGVyRWxlbWVudHMuZm9yRWFjaChmdW5jdGlvbihuYW1lKSB7XG4gICAgICBSb3V0ZXJbbmFtZV0gPSBSZWFjdC5jcmVhdGVFbGVtZW50LmJpbmQoUmVhY3QsIFJlYWN0Um91dGVyW25hbWVdKTtcbiAgICB9KTtcblxuICAgIGNvcGllZEl0ZW1zLmZvckVhY2goZnVuY3Rpb24obmFtZSkge1xuICAgICAgUm91dGVyW25hbWVdID0gUmVhY3RSb3V0ZXJbbmFtZV07XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIFJvdXRlcjtcbn1cblxuZnVuY3Rpb24gZ2V0RE9NICgpIHtcbiAgY29uc3QgRE9NSGVscGVycyA9IHt9O1xuXG4gIGlmICh0eXBlb2YgUmVhY3QgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbGV0IHRhZyA9IGZ1bmN0aW9uIChuYW1lLCAuLi5hcmdzKSB7XG4gICAgICBsZXQgYXR0cmlidXRlcztcbiAgICAgIGxldCBmaXJzdCA9IGFyZ3NbMF0gJiYgYXJnc1swXS5jb25zdHJ1Y3RvcjtcbiAgICAgIGlmIChmaXJzdCA9PT0gT2JqZWN0KSB7XG4gICAgICAgIGF0dHJpYnV0ZXMgPSBhcmdzLnNoaWZ0KCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhdHRyaWJ1dGVzID0ge307XG4gICAgICB9XG4gICAgICByZXR1cm4gUmVhY3QuRE9NW25hbWVdLmFwcGx5KFJlYWN0LkRPTSwgW2F0dHJpYnV0ZXNdLmNvbmNhdChhcmdzKSk7XG4gICAgfTtcblxuICAgIGZvciAobGV0IHRhZ05hbWUgaW4gUmVhY3QuRE9NKSB7XG4gICAgICBET01IZWxwZXJzW3RhZ05hbWVdID0gdGFnLmJpbmQodGhpcywgdGFnTmFtZSk7XG4gICAgfVxuXG4gICAgRE9NSGVscGVycy5zcGFjZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIFJlYWN0LkRPTS5zcGFuKHtcbiAgICAgICAgZGFuZ2Vyb3VzbHlTZXRJbm5lckhUTUw6IHtcbiAgICAgICAgICBfX2h0bWw6ICcmbmJzcDsnXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH07XG4gIH1cbiAgcmV0dXJuIERPTUhlbHBlcnM7XG59XG5cbmV4cG9ydCBjb25zdCBSb3V0ZXIgPSBnZXRSb3V0ZXIoKTtcbmV4cG9ydCBjb25zdCBET00gPSBnZXRET00oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVZpZXcgKGNsYXNzQXJncykge1xuICBsZXQgUmVhY3RDbGFzcyA9IFJlYWN0LmNyZWF0ZUNsYXNzKGNsYXNzQXJncyk7XG4gIGxldCBSZWFjdEVsZW1lbnQgPSBSZWFjdC5jcmVhdGVFbGVtZW50LmJpbmQoUmVhY3QuY3JlYXRlRWxlbWVudCwgUmVhY3RDbGFzcyk7XG4gIHJldHVybiBSZWFjdEVsZW1lbnQ7XG59XG4iXX0=
},{}],10:[function(require,module,exports){
"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var Actions = require("./Actions").Actions;

var utils = _interopRequire(require("./utils"));

var Freezer = _interopRequire(require("freezer-js"));

var getConnectMixin = _interopRequire(require("./mixins/connect"));

var GlobalStore = _interopRequire(require("./globalStore"));

var Store = (function () {
  function Store() {
    var args = arguments[0] === undefined ? {} : arguments[0];

    _classCallCheck(this, Store);

    var path = args.path;
    var actions = args.actions;
    var initial = args.initial;

    var init = typeof initial === "function" ? initial() : initial;
    var store = GlobalStore.init(path, init || {});

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
      GlobalStore.set(path, item, value);
    };

    var get = function get(item) {
      if (item) {
        return GlobalStore.get(path, item);
      }return GlobalStore.get(path);
    };

    var reset = function reset() {
      this.set(init);
    };

    this.path = path;
    this.set = set;
    this.get = get;
    this.reset = reset;
    this.store = GlobalStore.getStore();

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

},{"./Actions":8,"./globalStore":11,"./mixins/connect":13,"./utils":14,"freezer-js":2}],11:[function(require,module,exports){
"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var Freezer = _interopRequire(require("freezer-js"));

var freezer;

var GlobalStore = (function () {
  function GlobalStore() {
    _classCallCheck(this, GlobalStore);
  }

  _createClass(GlobalStore, null, {
    getStore: {
      value: function getStore() {
        if (!freezer) {
          freezer = new Freezer({});
        }
        return freezer;
      }
    },
    getState: {
      value: function getState() {
        return this.getStore().get();
      }
    },
    init: {
      value: (function (_init) {
        var _initWrapper = function init(_x, _x2) {
          return _init.apply(this, arguments);
        };

        _initWrapper.toString = function () {
          return _init.toString();
        };

        return _initWrapper;
      })(function (substore, init) {
        var store = this.getState();
        var values = store[substore];

        if (values) return values;
        return store.set(substore, init || {})[substore];
      })
    },
    get: {
      value: function get(substore, name) {
        var store = this.getState();
        if (!name) {
          return store[substore].toJS();
        }return store[substore] ? store[substore].toJS()[name] : {};
      }
    },
    set: {
      value: function set(substore, name, value) {
        var store = this.getState();
        var values = store[substore];

        if (values) values.set(name, value);

        return this.get(substore);
      }
    }
  });

  return GlobalStore;
})();

module.exports = GlobalStore;

},{"freezer-js":2}],12:[function(require,module,exports){
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

},{}],13:[function(require,module,exports){
"use strict";

module.exports = getConnectMixin;

function getConnectMixin(store) {
  var listener = undefined;

  return {
    getInitialState: function getInitialState() {
      var frozen = store.store.get(arguments);
      var state = frozen.toJS()[store.path];

      var changeCallback = function changeCallback(state) {
        this.setState(state.toJS()[store.path]);
      };

      if (!this.boundEximChangeCallbacks) this.boundEximChangeCallbacks = {};

      this.boundEximChangeCallbacks[store.path] = changeCallback.bind(this);

      listener = frozen.getListener();
      return state;
    },

    componentDidMount: function componentDidMount() {
      listener.on("update", this.boundEximChangeCallbacks[store.path]);
    },

    componentWillUnmount: function componentWillUnmount() {
      if (listener) listener.off("update", this.boundEximChangeCallbacks[store.path]);
    }
  };
}

},{}],14:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvdm9sb2R5bXlyL1dvcmsvaGVsbHllYWgvZXhpbS9zcmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZnJlZXplci1qcy9mcmVlemVyLmpzIiwibm9kZV9tb2R1bGVzL2ZyZWV6ZXItanMvc3JjL2VtaXR0ZXIuanMiLCJub2RlX21vZHVsZXMvZnJlZXplci1qcy9zcmMvZnJlZXplci5qcyIsIm5vZGVfbW9kdWxlcy9mcmVlemVyLWpzL3NyYy9mcm96ZW4uanMiLCJub2RlX21vZHVsZXMvZnJlZXplci1qcy9zcmMvbWl4aW5zLmpzIiwibm9kZV9tb2R1bGVzL2ZyZWV6ZXItanMvc3JjL3V0aWxzLmpzIiwiL1VzZXJzL3ZvbG9keW15ci9Xb3JrL2hlbGx5ZWFoL2V4aW0vc3JjL0FjdGlvbnMuanMiLCJzcmMvRE9NSGVscGVycy5qcyIsIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9TdG9yZS5qcyIsIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9nbG9iYWxTdG9yZS5qcyIsIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9oZWxwZXJzLmpzIiwiL1VzZXJzL3ZvbG9keW15ci9Xb3JrL2hlbGx5ZWFoL2V4aW0vc3JjL21peGlucy9jb25uZWN0LmpzIiwiL1VzZXJzL3ZvbG9keW15ci9Xb3JrL2hlbGx5ZWFoL2V4aW0vc3JjL3V0aWxzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozt1QkNBOEIsV0FBVzs7SUFBakMsTUFBTSxZQUFOLE1BQU07SUFBRSxPQUFPLFlBQVAsT0FBTzs7SUFDaEIsS0FBSywyQkFBTSxTQUFTOztJQUNwQixPQUFPLDJCQUFNLFdBQVc7OzBCQUNPLGNBQWM7O0lBQTVDLFVBQVUsZUFBVixVQUFVO0lBQUUsTUFBTSxlQUFOLE1BQU07SUFBRSxHQUFHLGVBQUgsR0FBRzs7QUFFL0IsSUFBTSxJQUFJLEdBQUcsRUFBQyxNQUFNLEVBQU4sTUFBTSxFQUFFLE9BQU8sRUFBUCxPQUFPLEVBQUUsS0FBSyxFQUFMLEtBQUssRUFBRSxNQUFNLEVBQU4sTUFBTSxFQUFFLEdBQUcsRUFBSCxHQUFHLEVBQUUsT0FBTyxFQUFQLE9BQU8sRUFBRSxVQUFVLEVBQVYsVUFBVSxFQUFDLENBQUM7O0FBRXhFLElBQUksQ0FBQyxZQUFZLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDbEMsU0FBTyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUN6QixDQUFDOztBQUVGLElBQUksQ0FBQyxhQUFhLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDbkMsU0FBTyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUMxQixDQUFDOztBQUVGLElBQUksQ0FBQyxXQUFXLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDakMsU0FBTyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUN4QixDQUFDOztpQkFFYSxJQUFJOzs7QUNuQm5CO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqa0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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VUFBSSxHQUFHLE9BQU8sQ0FBQztLQUNoQjtBQUNELFFBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFO0FBQ2hCLFVBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUNqQztHQUNGLENBQUMsQ0FBQztBQUNILFNBQU8sSUFBSSxDQUFDO0NBQ2IsQ0FBQzs7QUFFRixLQUFLLENBQUMsUUFBUSxHQUFHLFVBQVUsSUFBSSxFQUFFO0FBQy9CLFNBQU8sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxLQUFLLFFBQVEsR0FBRyxLQUFLLENBQUM7Q0FDaEUsQ0FBQztBQUNGLEtBQUssQ0FBQyxVQUFVLEdBQUcsVUFBVSxHQUFHLEVBQUU7QUFDaEMsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztBQUMxQyxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzFCLGNBQVUsS0FBSyxRQUFHLElBQUksQ0FBRztDQUMxQixDQUFDOztpQkFFYSxLQUFLIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImltcG9ydCB7QWN0aW9uLCBBY3Rpb25zfSBmcm9tICcuL0FjdGlvbnMnO1xuaW1wb3J0IFN0b3JlIGZyb20gJy4vU3RvcmUnO1xuaW1wb3J0IGhlbHBlcnMgZnJvbSAnLi9oZWxwZXJzJztcbmltcG9ydCB7Y3JlYXRlVmlldywgUm91dGVyLCBET019IGZyb20gJy4vRE9NSGVscGVycyc7XG5cbmNvbnN0IEV4aW0gPSB7QWN0aW9uLCBBY3Rpb25zLCBTdG9yZSwgUm91dGVyLCBET00sIGhlbHBlcnMsIGNyZWF0ZVZpZXd9O1xuXG5FeGltLmNyZWF0ZUFjdGlvbiA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gIHJldHVybiBuZXcgQWN0aW9uKGFyZ3MpO1xufTtcblxuRXhpbS5jcmVhdGVBY3Rpb25zID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgcmV0dXJuIG5ldyBBY3Rpb25zKGFyZ3MpO1xufTtcblxuRXhpbS5jcmVhdGVTdG9yZSA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gIHJldHVybiBuZXcgU3RvcmUoYXJncyk7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBFeGltO1xuIiwidmFyIEZyZWV6ZXIgPSByZXF1aXJlKCcuL3NyYy9mcmVlemVyJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEZyZWV6ZXI7IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIFV0aWxzID0gcmVxdWlyZSggJy4vdXRpbHMnICk7XHJcblxyXG4vLyNidWlsZFxyXG5cclxuLy8gVGhlIHByb3RvdHlwZSBtZXRob2RzIGFyZSBzdG9yZWQgaW4gYSBkaWZmZXJlbnQgb2JqZWN0XHJcbi8vIGFuZCBhcHBsaWVkIGFzIG5vbiBlbnVtZXJhYmxlIHByb3BlcnRpZXMgbGF0ZXJcclxudmFyIGVtaXR0ZXJQcm90byA9IHtcclxuXHRvbjogZnVuY3Rpb24oIGV2ZW50TmFtZSwgbGlzdGVuZXIsIG9uY2UgKXtcclxuXHRcdHZhciBsaXN0ZW5lcnMgPSB0aGlzLl9ldmVudHNbIGV2ZW50TmFtZSBdIHx8IFtdO1xyXG5cclxuXHRcdGxpc3RlbmVycy5wdXNoKHsgY2FsbGJhY2s6IGxpc3RlbmVyLCBvbmNlOiBvbmNlfSk7XHJcblx0XHR0aGlzLl9ldmVudHNbIGV2ZW50TmFtZSBdID0gIGxpc3RlbmVycztcclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRvbmNlOiBmdW5jdGlvbiggZXZlbnROYW1lLCBsaXN0ZW5lciApe1xyXG5cdFx0dGhpcy5vbiggZXZlbnROYW1lLCBsaXN0ZW5lciwgdHJ1ZSApO1xyXG5cdH0sXHJcblxyXG5cdG9mZjogZnVuY3Rpb24oIGV2ZW50TmFtZSwgbGlzdGVuZXIgKXtcclxuXHRcdGlmKCB0eXBlb2YgZXZlbnROYW1lID09ICd1bmRlZmluZWQnICl7XHJcblx0XHRcdHRoaXMuX2V2ZW50cyA9IHt9O1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSBpZiggdHlwZW9mIGxpc3RlbmVyID09ICd1bmRlZmluZWQnICkge1xyXG5cdFx0XHR0aGlzLl9ldmVudHNbIGV2ZW50TmFtZSBdID0gW107XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0dmFyIGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1sgZXZlbnROYW1lIF0gfHwgW10sXHJcblx0XHRcdFx0aVxyXG5cdFx0XHQ7XHJcblxyXG5cdFx0XHRmb3IgKGkgPSBsaXN0ZW5lcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuXHRcdFx0XHRpZiggbGlzdGVuZXJzW2ldLmNhbGxiYWNrID09PSBsaXN0ZW5lciApXHJcblx0XHRcdFx0XHRsaXN0ZW5lcnMuc3BsaWNlKCBpLCAxICk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHR0cmlnZ2VyOiBmdW5jdGlvbiggZXZlbnROYW1lICl7XHJcblx0XHR2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoIGFyZ3VtZW50cywgMSApLFxyXG5cdFx0XHRsaXN0ZW5lcnMgPSB0aGlzLl9ldmVudHNbIGV2ZW50TmFtZSBdIHx8IFtdLFxyXG5cdFx0XHRvbmNlTGlzdGVuZXJzID0gW10sXHJcblx0XHRcdGksIGxpc3RlbmVyXHJcblx0XHQ7XHJcblxyXG5cdFx0Ly8gQ2FsbCBsaXN0ZW5lcnNcclxuXHRcdGZvciAoaSA9IDA7IGkgPCBsaXN0ZW5lcnMubGVuZ3RoOyBpKyspIHtcclxuXHRcdFx0bGlzdGVuZXIgPSBsaXN0ZW5lcnNbaV07XHJcblxyXG5cdFx0XHRpZiggbGlzdGVuZXIuY2FsbGJhY2sgKVxyXG5cdFx0XHRcdGxpc3RlbmVyLmNhbGxiYWNrLmFwcGx5KCBudWxsLCBhcmdzICk7XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdC8vIElmIHRoZXJlIGlzIG5vdCBhIGNhbGxiYWNrLCByZW1vdmUhXHJcblx0XHRcdFx0bGlzdGVuZXIub25jZSA9IHRydWU7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGlmKCBsaXN0ZW5lci5vbmNlIClcclxuXHRcdFx0XHRvbmNlTGlzdGVuZXJzLnB1c2goIGkgKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBSZW1vdmUgbGlzdGVuZXJzIG1hcmtlZCBhcyBvbmNlXHJcblx0XHRmb3IoIGkgPSBvbmNlTGlzdGVuZXJzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tICl7XHJcblx0XHRcdGxpc3RlbmVycy5zcGxpY2UoIG9uY2VMaXN0ZW5lcnNbaV0sIDEgKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9XHJcbn07XHJcblxyXG4vLyBNZXRob2RzIGFyZSBub3QgZW51bWVyYWJsZSBzbywgd2hlbiB0aGUgc3RvcmVzIGFyZVxyXG4vLyBleHRlbmRlZCB3aXRoIHRoZSBlbWl0dGVyLCB0aGV5IGNhbiBiZSBpdGVyYXRlZCBhc1xyXG4vLyBoYXNobWFwc1xyXG52YXIgRW1pdHRlciA9IFV0aWxzLmNyZWF0ZU5vbkVudW1lcmFibGUoIGVtaXR0ZXJQcm90byApO1xyXG4vLyNidWlsZFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBFbWl0dGVyO1xyXG4iLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgVXRpbHMgPSByZXF1aXJlKCAnLi91dGlscy5qcycgKSxcclxuXHRFbWl0dGVyID0gcmVxdWlyZSggJy4vZW1pdHRlcicgKSxcclxuXHRNaXhpbnMgPSByZXF1aXJlKCAnLi9taXhpbnMnICksXHJcblx0RnJvemVuID0gcmVxdWlyZSggJy4vZnJvemVuJyApXHJcbjtcclxuXHJcbi8vI2J1aWxkXHJcbnZhciBGcmVlemVyID0gZnVuY3Rpb24oIGluaXRpYWxWYWx1ZSwgb3B0aW9ucyApIHtcclxuXHR2YXIgbWUgPSB0aGlzLFxyXG5cdFx0bXV0YWJsZSA9ICggb3B0aW9ucyAmJiBvcHRpb25zLm11dGFibGUgKSB8fCBmYWxzZSxcclxuXHRcdGxpdmUgPSAoIG9wdGlvbnMgJiYgb3B0aW9ucy5saXZlICkgfHwgbGl2ZVxyXG5cdDtcclxuXHJcblx0Ly8gSW1tdXRhYmxlIGRhdGFcclxuXHR2YXIgZnJvemVuO1xyXG5cclxuXHR2YXIgbm90aWZ5ID0gZnVuY3Rpb24gbm90aWZ5KCBldmVudE5hbWUsIG5vZGUsIG9wdGlvbnMgKXtcclxuXHRcdGlmKCBldmVudE5hbWUgPT0gJ2xpc3RlbmVyJyApXHJcblx0XHRcdHJldHVybiBGcm96ZW4uY3JlYXRlTGlzdGVuZXIoIG5vZGUgKTtcclxuXHJcblx0XHRyZXR1cm4gRnJvemVuLnVwZGF0ZSggZXZlbnROYW1lLCBub2RlLCBvcHRpb25zICk7XHJcblx0fTtcclxuXHJcblx0dmFyIGZyZWV6ZSA9IGZ1bmN0aW9uKCl7fTtcclxuXHRpZiggIW11dGFibGUgKVxyXG5cdFx0ZnJlZXplID0gZnVuY3Rpb24oIG9iaiApeyBPYmplY3QuZnJlZXplKCBvYmogKTsgfTtcclxuXHJcblx0Ly8gQ3JlYXRlIHRoZSBmcm96ZW4gb2JqZWN0XHJcblx0ZnJvemVuID0gRnJvemVuLmZyZWV6ZSggaW5pdGlhbFZhbHVlLCBub3RpZnksIGZyZWV6ZSwgbGl2ZSApO1xyXG5cclxuXHQvLyBMaXN0ZW4gdG8gaXRzIGNoYW5nZXMgaW1tZWRpYXRlbHlcclxuXHR2YXIgbGlzdGVuZXIgPSBmcm96ZW4uZ2V0TGlzdGVuZXIoKTtcclxuXHJcblx0Ly8gVXBkYXRpbmcgZmxhZyB0byB0cmlnZ2VyIHRoZSBldmVudCBvbiBuZXh0VGlja1xyXG5cdHZhciB1cGRhdGluZyA9IGZhbHNlO1xyXG5cclxuXHRsaXN0ZW5lci5vbiggJ2ltbWVkaWF0ZScsIGZ1bmN0aW9uKCBwcmV2Tm9kZSwgdXBkYXRlZCApe1xyXG5cdFx0aWYoIHByZXZOb2RlICE9IGZyb3plbiApXHJcblx0XHRcdHJldHVybjtcclxuXHJcblx0XHRmcm96ZW4gPSB1cGRhdGVkO1xyXG5cclxuXHRcdGlmKCBsaXZlIClcclxuXHRcdFx0cmV0dXJuIG1lLnRyaWdnZXIoICd1cGRhdGUnLCB1cGRhdGVkICk7XHJcblxyXG5cdFx0Ly8gVHJpZ2dlciBvbiBuZXh0IHRpY2tcclxuXHRcdGlmKCAhdXBkYXRpbmcgKXtcclxuXHRcdFx0dXBkYXRpbmcgPSB0cnVlO1xyXG5cdFx0XHRVdGlscy5uZXh0VGljayggZnVuY3Rpb24oKXtcclxuXHRcdFx0XHR1cGRhdGluZyA9IGZhbHNlO1xyXG5cdFx0XHRcdG1lLnRyaWdnZXIoICd1cGRhdGUnLCBmcm96ZW4gKTtcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0fSk7XHJcblxyXG5cdFV0aWxzLmFkZE5FKCB0aGlzLCB7XHJcblx0XHRnZXQ6IGZ1bmN0aW9uKCl7XHJcblx0XHRcdHJldHVybiBmcm96ZW47XHJcblx0XHR9LFxyXG5cdFx0c2V0OiBmdW5jdGlvbiggbm9kZSApe1xyXG5cdFx0XHR2YXIgbmV3Tm9kZSA9IG5vdGlmeSggJ3Jlc2V0JywgZnJvemVuLCBub2RlICk7XHJcblx0XHRcdG5ld05vZGUuX18ubGlzdGVuZXIudHJpZ2dlciggJ2ltbWVkaWF0ZScsIGZyb3plbiwgbmV3Tm9kZSApO1xyXG5cdFx0fVxyXG5cdH0pO1xyXG5cclxuXHRVdGlscy5hZGRORSggdGhpcywgeyBnZXREYXRhOiB0aGlzLmdldCwgc2V0RGF0YTogdGhpcy5zZXQgfSApO1xyXG5cclxuXHQvLyBUaGUgZXZlbnQgc3RvcmVcclxuXHR0aGlzLl9ldmVudHMgPSBbXTtcclxufVxyXG5cclxuRnJlZXplci5wcm90b3R5cGUgPSBVdGlscy5jcmVhdGVOb25FbnVtZXJhYmxlKHtjb25zdHJ1Y3RvcjogRnJlZXplcn0sIEVtaXR0ZXIpO1xyXG4vLyNidWlsZFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBGcmVlemVyO1xyXG4iLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgVXRpbHMgPSByZXF1aXJlKCAnLi91dGlscycgKSxcclxuXHRNaXhpbnMgPSByZXF1aXJlKCAnLi9taXhpbnMnKSxcclxuXHRFbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJylcclxuO1xyXG5cclxuLy8jYnVpbGRcclxudmFyIEZyb3plbiA9IHtcclxuXHRmcmVlemU6IGZ1bmN0aW9uKCBub2RlLCBub3RpZnksIGZyZWV6ZUZuLCBsaXZlICl7XHJcblx0XHRpZiggbm9kZSAmJiBub2RlLl9fICl7XHJcblx0XHRcdHJldHVybiBub2RlO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdGZyb3plbiwgbWl4aW4sIGNvbnNcclxuXHRcdDtcclxuXHJcblx0XHRpZiggbm9kZS5jb25zdHJ1Y3RvciA9PSBBcnJheSApe1xyXG5cdFx0XHRmcm96ZW4gPSB0aGlzLmNyZWF0ZUFycmF5KCBub2RlLmxlbmd0aCApO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdGZyb3plbiA9IE9iamVjdC5jcmVhdGUoIE1peGlucy5IYXNoICk7XHJcblx0XHR9XHJcblxyXG5cdFx0VXRpbHMuYWRkTkUoIGZyb3plbiwgeyBfXzoge1xyXG5cdFx0XHRsaXN0ZW5lcjogZmFsc2UsXHJcblx0XHRcdHBhcmVudHM6IFtdLFxyXG5cdFx0XHRub3RpZnk6IG5vdGlmeSxcclxuXHRcdFx0ZGlydHk6IGZhbHNlLFxyXG5cdFx0XHRmcmVlemVGbjogZnJlZXplRm4sXHJcblx0XHRcdGxpdmU6IGxpdmUgfHwgZmFsc2VcclxuXHRcdH19KTtcclxuXHJcblx0XHQvLyBGcmVlemUgY2hpbGRyZW5cclxuXHRcdFV0aWxzLmVhY2goIG5vZGUsIGZ1bmN0aW9uKCBjaGlsZCwga2V5ICl7XHJcblx0XHRcdGNvbnMgPSBjaGlsZCAmJiBjaGlsZC5jb25zdHJ1Y3RvcjtcclxuXHRcdFx0aWYoIGNvbnMgPT0gQXJyYXkgfHwgY29ucyA9PSBPYmplY3QgKXtcclxuXHRcdFx0XHRjaGlsZCA9IG1lLmZyZWV6ZSggY2hpbGQsIG5vdGlmeSwgZnJlZXplRm4sIGxpdmUgKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYoIGNoaWxkICYmIGNoaWxkLl9fICl7XHJcblx0XHRcdFx0bWUuYWRkUGFyZW50KCBjaGlsZCwgZnJvemVuICk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGZyb3plblsga2V5IF0gPSBjaGlsZDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdGZyZWV6ZUZuKCBmcm96ZW4gKTtcclxuXHJcblx0XHRyZXR1cm4gZnJvemVuO1xyXG5cdH0sXHJcblxyXG5cdHVwZGF0ZTogZnVuY3Rpb24oIHR5cGUsIG5vZGUsIG9wdGlvbnMgKXtcclxuXHRcdGlmKCAhdGhpc1sgdHlwZSBdKVxyXG5cdFx0XHRyZXR1cm4gVXRpbHMuZXJyb3IoICdVbmtub3duIHVwZGF0ZSB0eXBlOiAnICsgdHlwZSApO1xyXG5cclxuXHRcdHJldHVybiB0aGlzWyB0eXBlIF0oIG5vZGUsIG9wdGlvbnMgKTtcclxuXHR9LFxyXG5cclxuXHRyZXNldDogZnVuY3Rpb24oIG5vZGUsIHZhbHVlICl7XHJcblx0XHR2YXIgbWUgPSB0aGlzLFxyXG5cdFx0XHRfID0gbm9kZS5fXyxcclxuXHRcdFx0ZnJvemVuXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIHZhbHVlICYmIHZhbHVlLl9fICl7XHJcblx0XHRcdGZyb3plbiA9IHZhbHVlO1xyXG5cdFx0XHRmcm96ZW4uX18ubGlzdGVuZXIgPSB2YWx1ZS5fXy5saXN0ZW5lcjtcclxuXHRcdFx0ZnJvemVuLl9fLnBhcmVudHMgPSBbXTtcclxuXHJcblx0XHRcdC8vIFNldCBiYWNrIHRoZSBwYXJlbnQgb24gdGhlIGNoaWxkcmVuXHJcblx0XHRcdC8vIHRoYXQgaGF2ZSBiZWVuIHVwZGF0ZWRcclxuXHRcdFx0dGhpcy5maXhDaGlsZHJlbiggZnJvemVuLCBub2RlICk7XHJcblx0XHRcdFV0aWxzLmVhY2goIGZyb3plbiwgZnVuY3Rpb24oIGNoaWxkICl7XHJcblx0XHRcdFx0aWYoIGNoaWxkICYmIGNoaWxkLl9fICl7XHJcblx0XHRcdFx0XHRtZS5yZW1vdmVQYXJlbnQoIG5vZGUgKTtcclxuXHRcdFx0XHRcdG1lLmFkZFBhcmVudCggY2hpbGQsIGZyb3plbiApO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0ZnJvemVuID0gdGhpcy5mcmVlemUoIG5vZGUsIF8ubm90aWZ5LCBfLmZyZWV6ZUZuLCBfLmxpdmUgKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gZnJvemVuO1xyXG5cdH0sXHJcblxyXG5cdG1lcmdlOiBmdW5jdGlvbiggbm9kZSwgYXR0cnMgKXtcclxuXHRcdHZhciBfID0gbm9kZS5fXyxcclxuXHRcdFx0dHJhbnMgPSBfLnRyYW5zLFxyXG5cclxuXHRcdFx0Ly8gQ2xvbmUgdGhlIGF0dHJzIHRvIG5vdCBtb2RpZnkgdGhlIGFyZ3VtZW50XHJcblx0XHRcdGF0dHJzID0gVXRpbHMuZXh0ZW5kKCB7fSwgYXR0cnMpXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIHRyYW5zICl7XHJcblxyXG5cdFx0XHRmb3IoIHZhciBhdHRyIGluIGF0dHJzIClcclxuXHRcdFx0XHR0cmFuc1sgYXR0ciBdID0gYXR0cnNbIGF0dHIgXTtcclxuXHRcdFx0cmV0dXJuIG5vZGU7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0ZnJvemVuID0gdGhpcy5jb3B5TWV0YSggbm9kZSApLFxyXG5cdFx0XHRub3RpZnkgPSBfLm5vdGlmeSxcclxuXHRcdFx0dmFsLCBjb25zLCBrZXksIGlzRnJvemVuXHJcblx0XHQ7XHJcblxyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkLCBrZXkgKXtcclxuXHRcdFx0aXNGcm96ZW4gPSBjaGlsZCAmJiBjaGlsZC5fXztcclxuXHJcblx0XHRcdGlmKCBpc0Zyb3plbiApe1xyXG5cdFx0XHRcdG1lLnJlbW92ZVBhcmVudCggY2hpbGQsIG5vZGUgKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0dmFsID0gYXR0cnNbIGtleSBdO1xyXG5cdFx0XHRpZiggIXZhbCApe1xyXG5cdFx0XHRcdGlmKCBpc0Zyb3plbiApXHJcblx0XHRcdFx0XHRtZS5hZGRQYXJlbnQoIGNoaWxkLCBmcm96ZW4gKTtcclxuXHRcdFx0XHRyZXR1cm4gZnJvemVuWyBrZXkgXSA9IGNoaWxkO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRjb25zID0gdmFsICYmIHZhbC5jb25zdHJ1Y3RvcjtcclxuXHJcblx0XHRcdGlmKCBjb25zID09IEFycmF5IHx8IGNvbnMgPT0gT2JqZWN0IClcclxuXHRcdFx0XHR2YWwgPSBtZS5mcmVlemUoIHZhbCwgbm90aWZ5LCBfLmZyZWV6ZUZuLCBfLmxpdmUgKTtcclxuXHJcblx0XHRcdGlmKCB2YWwgJiYgdmFsLl9fIClcclxuXHRcdFx0XHRtZS5hZGRQYXJlbnQoIHZhbCwgZnJvemVuICk7XHJcblxyXG5cdFx0XHRkZWxldGUgYXR0cnNbIGtleSBdO1xyXG5cclxuXHRcdFx0ZnJvemVuWyBrZXkgXSA9IHZhbDtcclxuXHRcdH0pO1xyXG5cclxuXHJcblx0XHRmb3IoIGtleSBpbiBhdHRycyApIHtcclxuXHRcdFx0dmFsID0gYXR0cnNbIGtleSBdO1xyXG5cdFx0XHRjb25zID0gdmFsICYmIHZhbC5jb25zdHJ1Y3RvcjtcclxuXHJcblx0XHRcdGlmKCBjb25zID09IEFycmF5IHx8IGNvbnMgPT0gT2JqZWN0IClcclxuXHRcdFx0XHR2YWwgPSBtZS5mcmVlemUoIHZhbCwgbm90aWZ5LCBfLmZyZWV6ZUZuLCBfLmxpdmUgKTtcclxuXHJcblx0XHRcdGlmKCB2YWwgJiYgdmFsLl9fIClcclxuXHRcdFx0XHRtZS5hZGRQYXJlbnQoIHZhbCwgZnJvemVuICk7XHJcblxyXG5cdFx0XHRmcm96ZW5bIGtleSBdID0gdmFsO1xyXG5cdFx0fVxyXG5cclxuXHRcdF8uZnJlZXplRm4oIGZyb3plbiApO1xyXG5cclxuXHRcdHRoaXMucmVmcmVzaFBhcmVudHMoIG5vZGUsIGZyb3plbiApO1xyXG5cclxuXHRcdHJldHVybiBmcm96ZW47XHJcblx0fSxcclxuXHJcblx0cmVwbGFjZTogZnVuY3Rpb24oIG5vZGUsIHJlcGxhY2VtZW50ICkge1xyXG5cclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdGNvbnMgPSByZXBsYWNlbWVudCAmJiByZXBsYWNlbWVudC5jb25zdHJ1Y3RvcixcclxuXHRcdFx0XyA9IG5vZGUuX18sXHJcblx0XHRcdGZyb3plbiA9IHJlcGxhY2VtZW50XHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIGNvbnMgPT0gQXJyYXkgfHwgY29ucyA9PSBPYmplY3QgKSB7XHJcblxyXG5cdFx0XHRmcm96ZW4gPSBtZS5mcmVlemUoIHJlcGxhY2VtZW50LCBfLm5vdGlmeSwgXy5mcmVlemVGbiwgXy5saXZlICk7XHJcblxyXG5cdFx0XHRmcm96ZW4uX18ucGFyZW50cyA9IF8ucGFyZW50cztcclxuXHJcblx0XHRcdC8vIEFkZCB0aGUgY3VycmVudCBsaXN0ZW5lciBpZiBleGlzdHMsIHJlcGxhY2luZyBhXHJcblx0XHRcdC8vIHByZXZpb3VzIGxpc3RlbmVyIGluIHRoZSBmcm96ZW4gaWYgZXhpc3RlZFxyXG5cdFx0XHRpZiggXy5saXN0ZW5lciApXHJcblx0XHRcdFx0ZnJvemVuLl9fLmxpc3RlbmVyID0gXy5saXN0ZW5lcjtcclxuXHJcblx0XHRcdC8vIFNpbmNlIHRoZSBwYXJlbnRzIHdpbGwgYmUgcmVmcmVzaGVkIGRpcmVjdGx5LFxyXG5cdFx0XHQvLyBUcmlnZ2VyIHRoZSBsaXN0ZW5lciBoZXJlXHJcblx0XHRcdGlmKCBmcm96ZW4uX18ubGlzdGVuZXIgKVxyXG5cdFx0XHRcdHRoaXMudHJpZ2dlciggZnJvemVuLCAndXBkYXRlJywgZnJvemVuICk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gUmVmcmVzaCB0aGUgcGFyZW50IG5vZGVzIGRpcmVjdGx5XHJcblx0XHRpZiggIV8ucGFyZW50cy5sZW5ndGggJiYgXy5saXN0ZW5lciApe1xyXG5cdFx0XHRfLmxpc3RlbmVyLnRyaWdnZXIoICdpbW1lZGlhdGUnLCBub2RlLCBmcm96ZW4gKTtcclxuXHRcdH1cclxuXHRcdGZvciAodmFyIGkgPSBfLnBhcmVudHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuXHRcdFx0aWYoIGkgPT0gMCApe1xyXG5cdFx0XHRcdHRoaXMucmVmcmVzaCggXy5wYXJlbnRzW2ldLCBub2RlLCBmcm96ZW4sIGZhbHNlICk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZXtcclxuXHJcblx0XHRcdFx0dGhpcy5tYXJrRGlydHkoIF8ucGFyZW50c1tpXSwgW25vZGUsIGZyb3plbl0gKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIGZyb3plbjtcclxuXHR9LFxyXG5cclxuXHRyZW1vdmU6IGZ1bmN0aW9uKCBub2RlLCBhdHRycyApe1xyXG5cdFx0dmFyIHRyYW5zID0gbm9kZS5fXy50cmFucztcclxuXHRcdGlmKCB0cmFucyApe1xyXG5cdFx0XHRmb3IoIHZhciBsID0gYXR0cnMubGVuZ3RoIC0gMTsgbCA+PSAwOyBsLS0gKVxyXG5cdFx0XHRcdGRlbGV0ZSB0cmFuc1sgYXR0cnNbbF0gXTtcclxuXHRcdFx0cmV0dXJuIG5vZGU7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0ZnJvemVuID0gdGhpcy5jb3B5TWV0YSggbm9kZSApLFxyXG5cdFx0XHRpc0Zyb3plblxyXG5cdFx0O1xyXG5cclxuXHRcdFV0aWxzLmVhY2goIG5vZGUsIGZ1bmN0aW9uKCBjaGlsZCwga2V5ICl7XHJcblx0XHRcdGlzRnJvemVuID0gY2hpbGQgJiYgY2hpbGQuX187XHJcblxyXG5cdFx0XHRpZiggaXNGcm96ZW4gKXtcclxuXHRcdFx0XHRtZS5yZW1vdmVQYXJlbnQoIGNoaWxkLCBub2RlICk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGlmKCBhdHRycy5pbmRleE9mKCBrZXkgKSAhPSAtMSApe1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYoIGlzRnJvemVuIClcclxuXHRcdFx0XHRtZS5hZGRQYXJlbnQoIGNoaWxkLCBmcm96ZW4gKTtcclxuXHJcblx0XHRcdGZyb3plblsga2V5IF0gPSBjaGlsZDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdG5vZGUuX18uZnJlZXplRm4oIGZyb3plbiApO1xyXG5cdFx0dGhpcy5yZWZyZXNoUGFyZW50cyggbm9kZSwgZnJvemVuICk7XHJcblxyXG5cdFx0cmV0dXJuIGZyb3plbjtcclxuXHR9LFxyXG5cclxuXHRzcGxpY2U6IGZ1bmN0aW9uKCBub2RlLCBhcmdzICl7XHJcblx0XHR2YXIgXyA9IG5vZGUuX18sXHJcblx0XHRcdHRyYW5zID0gXy50cmFuc1xyXG5cdFx0O1xyXG5cclxuXHRcdGlmKCB0cmFucyApe1xyXG5cdFx0XHR0cmFucy5zcGxpY2UuYXBwbHkoIHRyYW5zLCBhcmdzICk7XHJcblx0XHRcdHJldHVybiBub2RlO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdGZyb3plbiA9IHRoaXMuY29weU1ldGEoIG5vZGUgKSxcclxuXHRcdFx0aW5kZXggPSBhcmdzWzBdLFxyXG5cdFx0XHRkZWxldGVJbmRleCA9IGluZGV4ICsgYXJnc1sxXSxcclxuXHRcdFx0Y29uLCBjaGlsZFxyXG5cdFx0O1xyXG5cclxuXHRcdC8vIENsb25lIHRoZSBhcnJheVxyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkLCBpICl7XHJcblxyXG5cdFx0XHRpZiggY2hpbGQgJiYgY2hpbGQuX18gKXtcclxuXHRcdFx0XHRtZS5yZW1vdmVQYXJlbnQoIGNoaWxkLCBub2RlICk7XHJcblxyXG5cdFx0XHRcdC8vIFNraXAgdGhlIG5vZGVzIHRvIGRlbGV0ZVxyXG5cdFx0XHRcdGlmKCBpIDwgaW5kZXggfHwgaT49IGRlbGV0ZUluZGV4IClcclxuXHRcdFx0XHRcdG1lLmFkZFBhcmVudCggY2hpbGQsIGZyb3plbiApO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRmcm96ZW5baV0gPSBjaGlsZDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdC8vIFByZXBhcmUgdGhlIG5ldyBub2Rlc1xyXG5cdFx0aWYoIGFyZ3MubGVuZ3RoID4gMSApe1xyXG5cdFx0XHRmb3IgKHZhciBpID0gYXJncy5sZW5ndGggLSAxOyBpID49IDI7IGktLSkge1xyXG5cdFx0XHRcdGNoaWxkID0gYXJnc1tpXTtcclxuXHRcdFx0XHRjb24gPSBjaGlsZCAmJiBjaGlsZC5jb25zdHJ1Y3RvcjtcclxuXHJcblx0XHRcdFx0aWYoIGNvbiA9PSBBcnJheSB8fCBjb24gPT0gT2JqZWN0IClcclxuXHRcdFx0XHRcdGNoaWxkID0gdGhpcy5mcmVlemUoIGNoaWxkLCBfLm5vdGlmeSwgXy5mcmVlemVGbiwgXy5saXZlICk7XHJcblxyXG5cdFx0XHRcdGlmKCBjaGlsZCAmJiBjaGlsZC5fXyApXHJcblx0XHRcdFx0XHR0aGlzLmFkZFBhcmVudCggY2hpbGQsIGZyb3plbiApO1xyXG5cclxuXHRcdFx0XHRhcmdzW2ldID0gY2hpbGQ7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHQvLyBzcGxpY2VcclxuXHRcdEFycmF5LnByb3RvdHlwZS5zcGxpY2UuYXBwbHkoIGZyb3plbiwgYXJncyApO1xyXG5cclxuXHRcdG5vZGUuX18uZnJlZXplRm4oIGZyb3plbiApO1xyXG5cdFx0dGhpcy5yZWZyZXNoUGFyZW50cyggbm9kZSwgZnJvemVuICk7XHJcblxyXG5cdFx0cmV0dXJuIGZyb3plbjtcclxuXHR9LFxyXG5cclxuXHR0cmFuc2FjdDogZnVuY3Rpb24oIG5vZGUgKSB7XHJcblx0XHR2YXIgbWUgPSB0aGlzLFxyXG5cdFx0XHR0cmFuc2FjdGluZyA9IG5vZGUuX18udHJhbnMsXHJcblx0XHRcdHRyYW5zXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIHRyYW5zYWN0aW5nIClcclxuXHRcdFx0cmV0dXJuIHRyYW5zYWN0aW5nO1xyXG5cclxuXHRcdHRyYW5zID0gbm9kZS5jb25zdHJ1Y3RvciA9PSBBcnJheSA/IFtdIDoge307XHJcblxyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkLCBrZXkgKXtcclxuXHRcdFx0dHJhbnNbIGtleSBdID0gY2hpbGQ7XHJcblx0XHR9KTtcclxuXHJcblx0XHRub2RlLl9fLnRyYW5zID0gdHJhbnM7XHJcblxyXG5cdFx0Ly8gQ2FsbCBydW4gYXV0b21hdGljYWxseSBpbiBjYXNlXHJcblx0XHQvLyB0aGUgdXNlciBmb3Jnb3QgYWJvdXQgaXRcclxuXHRcdFV0aWxzLm5leHRUaWNrKCBmdW5jdGlvbigpe1xyXG5cdFx0XHRpZiggbm9kZS5fXy50cmFucyApXHJcblx0XHRcdFx0bWUucnVuKCBub2RlICk7XHJcblx0XHR9KTtcclxuXHJcblx0XHRyZXR1cm4gdHJhbnM7XHJcblx0fSxcclxuXHJcblx0cnVuOiBmdW5jdGlvbiggbm9kZSApIHtcclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdHRyYW5zID0gbm9kZS5fXy50cmFuc1xyXG5cdFx0O1xyXG5cclxuXHRcdGlmKCAhdHJhbnMgKVxyXG5cdFx0XHRyZXR1cm4gbm9kZTtcclxuXHJcblx0XHQvLyBSZW1vdmUgdGhlIG5vZGUgYXMgYSBwYXJlbnRcclxuXHRcdFV0aWxzLmVhY2goIHRyYW5zLCBmdW5jdGlvbiggY2hpbGQsIGtleSApe1xyXG5cdFx0XHRpZiggY2hpbGQgJiYgY2hpbGQuX18gKXtcclxuXHRcdFx0XHRtZS5yZW1vdmVQYXJlbnQoIGNoaWxkLCBub2RlICk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cclxuXHRcdGRlbGV0ZSBub2RlLl9fLnRyYW5zO1xyXG5cclxuXHRcdHZhciByZXN1bHQgPSB0aGlzLnJlcGxhY2UoIG5vZGUsIHRyYW5zICk7XHJcblx0XHRyZXR1cm4gcmVzdWx0O1xyXG5cdH0sXHJcblxyXG5cdHJlZnJlc2g6IGZ1bmN0aW9uKCBub2RlLCBvbGRDaGlsZCwgbmV3Q2hpbGQsIHJldHVyblVwZGF0ZWQgKXtcclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdHRyYW5zID0gbm9kZS5fXy50cmFucyxcclxuXHRcdFx0Zm91bmQgPSAwXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIHRyYW5zICl7XHJcblxyXG5cdFx0XHRVdGlscy5lYWNoKCB0cmFucywgZnVuY3Rpb24oIGNoaWxkLCBrZXkgKXtcclxuXHRcdFx0XHRpZiggZm91bmQgKSByZXR1cm47XHJcblxyXG5cdFx0XHRcdGlmKCBjaGlsZCA9PT0gb2xkQ2hpbGQgKXtcclxuXHJcblx0XHRcdFx0XHR0cmFuc1sga2V5IF0gPSBuZXdDaGlsZDtcclxuXHRcdFx0XHRcdGZvdW5kID0gMTtcclxuXHJcblx0XHRcdFx0XHRpZiggbmV3Q2hpbGQgJiYgbmV3Q2hpbGQuX18gKVxyXG5cdFx0XHRcdFx0XHRtZS5hZGRQYXJlbnQoIG5ld0NoaWxkLCBub2RlICk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9KTtcclxuXHJcblx0XHRcdHJldHVybiBub2RlO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBmcm96ZW4gPSB0aGlzLmNvcHlNZXRhKCBub2RlICksXHJcblx0XHRcdGRpcnR5ID0gbm9kZS5fXy5kaXJ0eSxcclxuXHRcdFx0ZGlydCwgcmVwbGFjZW1lbnQsIF9fXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIGRpcnR5ICl7XHJcblx0XHRcdGRpcnQgPSBkaXJ0eVswXSxcclxuXHRcdFx0cmVwbGFjZW1lbnQgPSBkaXJ0eVsxXVxyXG5cdFx0fVxyXG5cclxuXHRcdFV0aWxzLmVhY2goIG5vZGUsIGZ1bmN0aW9uKCBjaGlsZCwga2V5ICl7XHJcblx0XHRcdGlmKCBjaGlsZCA9PT0gb2xkQ2hpbGQgKXtcclxuXHRcdFx0XHRjaGlsZCA9IG5ld0NoaWxkO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYoIGNoaWxkID09PSBkaXJ0ICl7XHJcblx0XHRcdFx0Y2hpbGQgPSByZXBsYWNlbWVudDtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYoIGNoaWxkICYmIChfXyA9IGNoaWxkLl9fKSApe1xyXG5cclxuXHRcdFx0XHQvLyBJZiB0aGVyZSBpcyBhIHRyYW5zIGhhcHBlbmluZyB3ZVxyXG5cdFx0XHRcdC8vIGRvbid0IHVwZGF0ZSBhIGRpcnR5IG5vZGUgbm93LiBUaGUgdXBkYXRlXHJcblx0XHRcdFx0Ly8gd2lsbCBvY2N1ciBvbiBydW4uXHJcblx0XHRcdFx0aWYoICFfXy50cmFucyAmJiBfXy5kaXJ0eSApe1xyXG5cdFx0XHRcdFx0Y2hpbGQgPSBtZS5yZWZyZXNoKCBjaGlsZCwgX18uZGlydHlbMF0sIF9fLmRpcnR5WzFdLCB0cnVlICk7XHJcblx0XHRcdFx0fVxyXG5cclxuXHJcblx0XHRcdFx0bWUucmVtb3ZlUGFyZW50KCBjaGlsZCwgbm9kZSApO1xyXG5cdFx0XHRcdG1lLmFkZFBhcmVudCggY2hpbGQsIGZyb3plbiApO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRmcm96ZW5bIGtleSBdID0gY2hpbGQ7XHJcblx0XHR9KTtcclxuXHJcblx0XHRub2RlLl9fLmZyZWV6ZUZuKCBmcm96ZW4gKTtcclxuXHJcblx0XHQvLyBJZiB0aGUgbm9kZSB3YXMgZGlydHksIGNsZWFuIGl0XHJcblx0XHRub2RlLl9fLmRpcnR5ID0gZmFsc2U7XHJcblxyXG5cdFx0aWYoIHJldHVyblVwZGF0ZWQgKVxyXG5cdFx0XHRyZXR1cm4gZnJvemVuO1xyXG5cclxuXHRcdHRoaXMucmVmcmVzaFBhcmVudHMoIG5vZGUsIGZyb3plbiApO1xyXG5cdH0sXHJcblxyXG5cdGZpeENoaWxkcmVuOiBmdW5jdGlvbiggbm9kZSwgb2xkTm9kZSApe1xyXG5cdFx0dmFyIG1lID0gdGhpcztcclxuXHRcdFV0aWxzLmVhY2goIG5vZGUsIGZ1bmN0aW9uKCBjaGlsZCApe1xyXG5cdFx0XHRpZiggIWNoaWxkIHx8ICFjaGlsZC5fXyApXHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cclxuXHRcdFx0Ly8gSWYgdGhlIGNoaWxkIGlzIGxpbmtlZCB0byB0aGUgbm9kZSxcclxuXHRcdFx0Ly8gbWF5YmUgaXRzIGNoaWxkcmVuIGFyZSBub3QgbGlua2VkXHJcblx0XHRcdGlmKCBjaGlsZC5fXy5wYXJlbnRzLmluZGV4T2YoIG5vZGUgKSAhPSAtMSApXHJcblx0XHRcdFx0cmV0dXJuIG1lLmZpeENoaWxkcmVuKCBjaGlsZCApO1xyXG5cclxuXHRcdFx0Ly8gSWYgdGhlIGNoaWxkIHdhc24ndCBsaW5rZWQgaXQgaXMgc3VyZVxyXG5cdFx0XHQvLyB0aGF0IGl0IHdhc24ndCBtb2RpZmllZC4gSnVzdCBsaW5rIGl0XHJcblx0XHRcdC8vIHRvIHRoZSBuZXcgcGFyZW50XHJcblx0XHRcdGlmKCBjaGlsZC5fXy5wYXJlbnRzLmxlbmd0aCA9PSAxIClcclxuXHRcdFx0XHRyZXR1cm4gY2hpbGQuX18ucGFyZW50cyA9IFsgbm9kZSBdO1xyXG5cclxuXHRcdFx0aWYoIG9sZE5vZGUgKVxyXG5cdFx0XHRcdG1lLnJlbW92ZVBhcmVudCggY2hpbGQsIG9sZE5vZGUgKTtcclxuXHJcblx0XHRcdG1lLmFkZFBhcmVudCggY2hpbGQsIG5vZGUgKTtcclxuXHRcdH0pO1xyXG5cdH0sXHJcblxyXG5cdGNvcHlNZXRhOiBmdW5jdGlvbiggbm9kZSApe1xyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0ZnJvemVuXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIG5vZGUuY29uc3RydWN0b3IgPT0gQXJyYXkgKXtcclxuXHRcdFx0ZnJvemVuID0gdGhpcy5jcmVhdGVBcnJheSggbm9kZS5sZW5ndGggKTtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRmcm96ZW4gPSBPYmplY3QuY3JlYXRlKCBNaXhpbnMuSGFzaCApO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBfID0gbm9kZS5fXztcclxuXHJcblx0XHRVdGlscy5hZGRORSggZnJvemVuLCB7X186IHtcclxuXHRcdFx0bm90aWZ5OiBfLm5vdGlmeSxcclxuXHRcdFx0bGlzdGVuZXI6IF8ubGlzdGVuZXIsXHJcblx0XHRcdHBhcmVudHM6IF8ucGFyZW50cy5zbGljZSggMCApLFxyXG5cdFx0XHR0cmFuczogXy50cmFucyxcclxuXHRcdFx0ZGlydHk6IGZhbHNlLFxyXG5cdFx0XHRmcmVlemVGbjogXy5mcmVlemVGblxyXG5cdFx0fX0pO1xyXG5cclxuXHRcdHJldHVybiBmcm96ZW47XHJcblx0fSxcclxuXHJcblx0cmVmcmVzaFBhcmVudHM6IGZ1bmN0aW9uKCBvbGRDaGlsZCwgbmV3Q2hpbGQgKXtcclxuXHRcdHZhciBfID0gb2xkQ2hpbGQuX18sXHJcblx0XHRcdGlcclxuXHRcdDtcclxuXHJcblx0XHRpZiggXy5saXN0ZW5lciApXHJcblx0XHRcdHRoaXMudHJpZ2dlciggbmV3Q2hpbGQsICd1cGRhdGUnLCBuZXdDaGlsZCApO1xyXG5cclxuXHRcdGlmKCAhXy5wYXJlbnRzLmxlbmd0aCApe1xyXG5cdFx0XHRpZiggXy5saXN0ZW5lciApe1xyXG5cdFx0XHRcdF8ubGlzdGVuZXIudHJpZ2dlciggJ2ltbWVkaWF0ZScsIG9sZENoaWxkLCBuZXdDaGlsZCApO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0Zm9yIChpID0gXy5wYXJlbnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcblx0XHRcdFx0Ly8gSWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBwYXJlbnQsIG1hcmsgZXZlcnlvbmUgYXMgZGlydHlcclxuXHRcdFx0XHQvLyBidXQgdGhlIGxhc3QgaW4gdGhlIGl0ZXJhdGlvbiwgYW5kIHdoZW4gdGhlIGxhc3QgaXMgcmVmcmVzaGVkXHJcblx0XHRcdFx0Ly8gaXQgd2lsbCB1cGRhdGUgdGhlIGRpcnR5IG5vZGVzLlxyXG5cdFx0XHRcdGlmKCBpID09IDAgKVxyXG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoKCBfLnBhcmVudHNbaV0sIG9sZENoaWxkLCBuZXdDaGlsZCwgZmFsc2UgKTtcclxuXHRcdFx0XHRlbHNle1xyXG5cclxuXHRcdFx0XHRcdHRoaXMubWFya0RpcnR5KCBfLnBhcmVudHNbaV0sIFtvbGRDaGlsZCwgbmV3Q2hpbGRdICk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0bWFya0RpcnR5OiBmdW5jdGlvbiggbm9kZSwgZGlydCApe1xyXG5cdFx0dmFyIF8gPSBub2RlLl9fLFxyXG5cdFx0XHRpXHJcblx0XHQ7XHJcblx0XHRfLmRpcnR5ID0gZGlydDtcclxuXHJcblx0XHQvLyBJZiB0aGVyZSBpcyBhIHRyYW5zYWN0aW9uIGhhcHBlbmluZyBpbiB0aGUgbm9kZVxyXG5cdFx0Ly8gdXBkYXRlIHRoZSB0cmFuc2FjdGlvbiBkYXRhIGltbWVkaWF0ZWx5XHJcblx0XHRpZiggXy50cmFucyApXHJcblx0XHRcdHRoaXMucmVmcmVzaCggbm9kZSwgZGlydFswXSwgZGlydFsxXSApO1xyXG5cclxuXHRcdGZvciAoIGkgPSBfLnBhcmVudHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0gKSB7XHJcblxyXG5cdFx0XHR0aGlzLm1hcmtEaXJ0eSggXy5wYXJlbnRzW2ldLCBkaXJ0ICk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlUGFyZW50OiBmdW5jdGlvbiggbm9kZSwgcGFyZW50ICl7XHJcblx0XHR2YXIgcGFyZW50cyA9IG5vZGUuX18ucGFyZW50cyxcclxuXHRcdFx0aW5kZXggPSBwYXJlbnRzLmluZGV4T2YoIHBhcmVudCApXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIGluZGV4ICE9IC0xICl7XHJcblx0XHRcdHBhcmVudHMuc3BsaWNlKCBpbmRleCwgMSApO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGFkZFBhcmVudDogZnVuY3Rpb24oIG5vZGUsIHBhcmVudCApe1xyXG5cdFx0dmFyIHBhcmVudHMgPSBub2RlLl9fLnBhcmVudHMsXHJcblx0XHRcdGluZGV4ID0gcGFyZW50cy5pbmRleE9mKCBwYXJlbnQgKVxyXG5cdFx0O1xyXG5cclxuXHRcdGlmKCBpbmRleCA9PSAtMSApe1xyXG5cdFx0XHRwYXJlbnRzWyBwYXJlbnRzLmxlbmd0aCBdID0gcGFyZW50O1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdHRyaWdnZXI6IGZ1bmN0aW9uKCBub2RlLCBldmVudE5hbWUsIHBhcmFtICl7XHJcblx0XHR2YXIgbGlzdGVuZXIgPSBub2RlLl9fLmxpc3RlbmVyLFxyXG5cdFx0XHR0aWNraW5nID0gbGlzdGVuZXIudGlja2luZ1xyXG5cdFx0O1xyXG5cclxuXHRcdGxpc3RlbmVyLnRpY2tpbmcgPSBwYXJhbTtcclxuXHRcdGlmKCAhdGlja2luZyApe1xyXG5cdFx0XHRVdGlscy5uZXh0VGljayggZnVuY3Rpb24oKXtcclxuXHRcdFx0XHR2YXIgdXBkYXRlZCA9IGxpc3RlbmVyLnRpY2tpbmc7XHJcblx0XHRcdFx0bGlzdGVuZXIudGlja2luZyA9IGZhbHNlO1xyXG5cdFx0XHRcdGxpc3RlbmVyLnRyaWdnZXIoIGV2ZW50TmFtZSwgdXBkYXRlZCApO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRjcmVhdGVMaXN0ZW5lcjogZnVuY3Rpb24oIGZyb3plbiApe1xyXG5cdFx0dmFyIGwgPSBmcm96ZW4uX18ubGlzdGVuZXI7XHJcblxyXG5cdFx0aWYoICFsICkge1xyXG5cdFx0XHRsID0gT2JqZWN0LmNyZWF0ZShFbWl0dGVyLCB7XHJcblx0XHRcdFx0X2V2ZW50czoge1xyXG5cdFx0XHRcdFx0dmFsdWU6IHt9LFxyXG5cdFx0XHRcdFx0d3JpdGFibGU6IHRydWVcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cclxuXHRcdFx0ZnJvemVuLl9fLmxpc3RlbmVyID0gbDtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gbDtcclxuXHR9LFxyXG5cclxuXHRjcmVhdGVBcnJheTogKGZ1bmN0aW9uKCl7XHJcblx0XHQvLyBTZXQgY3JlYXRlQXJyYXkgbWV0aG9kXHJcblx0XHRpZiggW10uX19wcm90b19fIClcclxuXHRcdFx0cmV0dXJuIGZ1bmN0aW9uKCBsZW5ndGggKXtcclxuXHRcdFx0XHR2YXIgYXJyID0gbmV3IEFycmF5KCBsZW5ndGggKTtcclxuXHRcdFx0XHRhcnIuX19wcm90b19fID0gTWl4aW5zLkxpc3Q7XHJcblx0XHRcdFx0cmV0dXJuIGFycjtcclxuXHRcdFx0fVxyXG5cdFx0cmV0dXJuIGZ1bmN0aW9uKCBsZW5ndGggKXtcclxuXHRcdFx0dmFyIGFyciA9IG5ldyBBcnJheSggbGVuZ3RoICksXHJcblx0XHRcdFx0bWV0aG9kcyA9IE1peGlucy5hcnJheU1ldGhvZHNcclxuXHRcdFx0O1xyXG5cdFx0XHRmb3IoIHZhciBtIGluIG1ldGhvZHMgKXtcclxuXHRcdFx0XHRhcnJbIG0gXSA9IG1ldGhvZHNbIG0gXTtcclxuXHRcdFx0fVxyXG5cdFx0XHRyZXR1cm4gYXJyO1xyXG5cdFx0fVxyXG5cdH0pKClcclxufTtcclxuLy8jYnVpbGRcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRnJvemVuO1xyXG4iLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgVXRpbHMgPSByZXF1aXJlKCAnLi91dGlscy5qcycgKTtcclxuXHJcbi8vI2J1aWxkXHJcblxyXG4vKipcclxuICogQ3JlYXRlcyBub24tZW51bWVyYWJsZSBwcm9wZXJ0eSBkZXNjcmlwdG9ycywgdG8gYmUgdXNlZCBieSBPYmplY3QuY3JlYXRlLlxyXG4gKiBAcGFyYW0gIHtPYmplY3R9IGF0dHJzIFByb3BlcnRpZXMgdG8gY3JlYXRlIGRlc2NyaXB0b3JzXHJcbiAqIEByZXR1cm4ge09iamVjdH0gICAgICAgQSBoYXNoIHdpdGggdGhlIGRlc2NyaXB0b3JzLlxyXG4gKi9cclxudmFyIGNyZWF0ZU5FID0gZnVuY3Rpb24oIGF0dHJzICl7XHJcblx0dmFyIG5lID0ge307XHJcblxyXG5cdGZvciggdmFyIGtleSBpbiBhdHRycyApe1xyXG5cdFx0bmVbIGtleSBdID0ge1xyXG5cdFx0XHR3cml0YWJsZTogdHJ1ZSxcclxuXHRcdFx0Y29uZmlndXJhYmxlOiB0cnVlLFxyXG5cdFx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcclxuXHRcdFx0dmFsdWU6IGF0dHJzWyBrZXldXHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gbmU7XHJcbn1cclxuXHJcbnZhciBjb21tb25NZXRob2RzID0ge1xyXG5cdHNldDogZnVuY3Rpb24oIGF0dHIsIHZhbHVlICl7XHJcblx0XHR2YXIgYXR0cnMgPSBhdHRyLFxyXG5cdFx0XHR1cGRhdGUgPSB0aGlzLl9fLnRyYW5zXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIHR5cGVvZiB2YWx1ZSAhPSAndW5kZWZpbmVkJyApe1xyXG5cdFx0XHRhdHRycyA9IHt9O1xyXG5cdFx0XHRhdHRyc1sgYXR0ciBdID0gdmFsdWU7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYoICF1cGRhdGUgKXtcclxuXHRcdFx0Zm9yKCB2YXIga2V5IGluIGF0dHJzICl7XHJcblx0XHRcdFx0dXBkYXRlID0gdXBkYXRlIHx8IHRoaXNbIGtleSBdICE9IGF0dHJzWyBrZXkgXTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0Ly8gTm8gY2hhbmdlcywganVzdCByZXR1cm4gdGhlIG5vZGVcclxuXHRcdFx0aWYoICF1cGRhdGUgKVxyXG5cdFx0XHRcdHJldHVybiB0aGlzO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzLl9fLm5vdGlmeSggJ21lcmdlJywgdGhpcywgYXR0cnMgKTtcclxuXHR9LFxyXG5cclxuXHRyZXNldDogZnVuY3Rpb24oIGF0dHJzICkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAncmVwbGFjZScsIHRoaXMsIGF0dHJzICk7XHJcblx0fSxcclxuXHJcblx0Z2V0TGlzdGVuZXI6IGZ1bmN0aW9uKCl7XHJcblx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdsaXN0ZW5lcicsIHRoaXMgKTtcclxuXHR9LFxyXG5cclxuXHR0b0pTOiBmdW5jdGlvbigpe1xyXG5cdFx0dmFyIGpzO1xyXG5cdFx0aWYoIHRoaXMuY29uc3RydWN0b3IgPT0gQXJyYXkgKXtcclxuXHRcdFx0anMgPSBuZXcgQXJyYXkoIHRoaXMubGVuZ3RoICk7XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0anMgPSB7fTtcclxuXHRcdH1cclxuXHJcblx0XHRVdGlscy5lYWNoKCB0aGlzLCBmdW5jdGlvbiggY2hpbGQsIGkgKXtcclxuXHRcdFx0aWYoIGNoaWxkICYmIGNoaWxkLl9fIClcclxuXHRcdFx0XHRqc1sgaSBdID0gY2hpbGQudG9KUygpO1xyXG5cdFx0XHRlbHNlXHJcblx0XHRcdFx0anNbIGkgXSA9IGNoaWxkO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0cmV0dXJuIGpzO1xyXG5cdH0sXHJcblxyXG5cdHRyYW5zYWN0OiBmdW5jdGlvbigpe1xyXG5cdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAndHJhbnNhY3QnLCB0aGlzICk7XHJcblx0fSxcclxuXHRydW46IGZ1bmN0aW9uKCl7XHJcblx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdydW4nLCB0aGlzICk7XHJcblx0fVxyXG59O1xyXG5cclxudmFyIGFycmF5TWV0aG9kcyA9IFV0aWxzLmV4dGVuZCh7XHJcblx0cHVzaDogZnVuY3Rpb24oIGVsICl7XHJcblx0XHRyZXR1cm4gdGhpcy5hcHBlbmQoIFtlbF0gKTtcclxuXHR9LFxyXG5cclxuXHRhcHBlbmQ6IGZ1bmN0aW9uKCBlbHMgKXtcclxuXHRcdGlmKCBlbHMgJiYgZWxzLmxlbmd0aCApXHJcblx0XHRcdHJldHVybiB0aGlzLl9fLm5vdGlmeSggJ3NwbGljZScsIHRoaXMsIFt0aGlzLmxlbmd0aCwgMF0uY29uY2F0KCBlbHMgKSApO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cG9wOiBmdW5jdGlvbigpe1xyXG5cdFx0aWYoICF0aGlzLmxlbmd0aCApXHJcblx0XHRcdHJldHVybiB0aGlzO1xyXG5cclxuXHRcdHJldHVybiB0aGlzLl9fLm5vdGlmeSggJ3NwbGljZScsIHRoaXMsIFt0aGlzLmxlbmd0aCAtMSwgMV0gKTtcclxuXHR9LFxyXG5cclxuXHR1bnNoaWZ0OiBmdW5jdGlvbiggZWwgKXtcclxuXHRcdHJldHVybiB0aGlzLnByZXBlbmQoIFtlbF0gKTtcclxuXHR9LFxyXG5cclxuXHRwcmVwZW5kOiBmdW5jdGlvbiggZWxzICl7XHJcblx0XHRpZiggZWxzICYmIGVscy5sZW5ndGggKVxyXG5cdFx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdzcGxpY2UnLCB0aGlzLCBbMCwgMF0uY29uY2F0KCBlbHMgKSApO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0c2hpZnQ6IGZ1bmN0aW9uKCl7XHJcblx0XHRpZiggIXRoaXMubGVuZ3RoIClcclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAnc3BsaWNlJywgdGhpcywgWzAsIDFdICk7XHJcblx0fSxcclxuXHJcblx0c3BsaWNlOiBmdW5jdGlvbiggaW5kZXgsIHRvUmVtb3ZlLCB0b0FkZCApe1xyXG5cdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAnc3BsaWNlJywgdGhpcywgYXJndW1lbnRzICk7XHJcblx0fVxyXG59LCBjb21tb25NZXRob2RzICk7XHJcblxyXG52YXIgRnJvemVuQXJyYXkgPSBPYmplY3QuY3JlYXRlKCBBcnJheS5wcm90b3R5cGUsIGNyZWF0ZU5FKCBhcnJheU1ldGhvZHMgKSApO1xyXG5cclxudmFyIE1peGlucyA9IHtcclxuXHJcbkhhc2g6IE9iamVjdC5jcmVhdGUoIE9iamVjdC5wcm90b3R5cGUsIGNyZWF0ZU5FKCBVdGlscy5leHRlbmQoe1xyXG5cdHJlbW92ZTogZnVuY3Rpb24oIGtleXMgKXtcclxuXHRcdHZhciBmaWx0ZXJlZCA9IFtdLFxyXG5cdFx0XHRrID0ga2V5c1xyXG5cdFx0O1xyXG5cclxuXHRcdGlmKCBrZXlzLmNvbnN0cnVjdG9yICE9IEFycmF5IClcclxuXHRcdFx0ayA9IFsga2V5cyBdO1xyXG5cclxuXHRcdGZvciggdmFyIGkgPSAwLCBsID0gay5sZW5ndGg7IGk8bDsgaSsrICl7XHJcblx0XHRcdGlmKCB0aGlzLmhhc093blByb3BlcnR5KCBrW2ldICkgKVxyXG5cdFx0XHRcdGZpbHRlcmVkLnB1c2goIGtbaV0gKTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiggZmlsdGVyZWQubGVuZ3RoIClcclxuXHRcdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAncmVtb3ZlJywgdGhpcywgZmlsdGVyZWQgKTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH1cclxufSwgY29tbW9uTWV0aG9kcykpKSxcclxuXHJcbkxpc3Q6IEZyb3plbkFycmF5LFxyXG5hcnJheU1ldGhvZHM6IGFycmF5TWV0aG9kc1xyXG59O1xyXG4vLyNidWlsZFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBNaXhpbnM7IiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyNidWlsZFxudmFyIGdsb2JhbCA9IChuZXcgRnVuY3Rpb24oXCJyZXR1cm4gdGhpc1wiKSgpKTtcblxudmFyIFV0aWxzID0ge1xuXHRleHRlbmQ6IGZ1bmN0aW9uKCBvYiwgcHJvcHMgKXtcblx0XHRmb3IoIHZhciBwIGluIHByb3BzICl7XG5cdFx0XHRvYltwXSA9IHByb3BzW3BdO1xuXHRcdH1cblx0XHRyZXR1cm4gb2I7XG5cdH0sXG5cblx0Y3JlYXRlTm9uRW51bWVyYWJsZTogZnVuY3Rpb24oIG9iaiwgcHJvdG8gKXtcblx0XHR2YXIgbmUgPSB7fTtcblx0XHRmb3IoIHZhciBrZXkgaW4gb2JqIClcblx0XHRcdG5lW2tleV0gPSB7dmFsdWU6IG9ialtrZXldIH07XG5cdFx0cmV0dXJuIE9iamVjdC5jcmVhdGUoIHByb3RvIHx8IHt9LCBuZSApO1xuXHR9LFxuXG5cdGVycm9yOiBmdW5jdGlvbiggbWVzc2FnZSApe1xuXHRcdHZhciBlcnIgPSBuZXcgRXJyb3IoIG1lc3NhZ2UgKTtcblx0XHRpZiggY29uc29sZSApXG5cdFx0XHRyZXR1cm4gY29uc29sZS5lcnJvciggZXJyICk7XG5cdFx0ZWxzZVxuXHRcdFx0dGhyb3cgZXJyO1xuXHR9LFxuXG5cdGVhY2g6IGZ1bmN0aW9uKCBvLCBjbGJrICl7XG5cdFx0dmFyIGksbCxrZXlzO1xuXHRcdGlmKCBvICYmIG8uY29uc3RydWN0b3IgPT0gQXJyYXkgKXtcblx0XHRcdGZvciAoaSA9IDAsIGwgPSBvLmxlbmd0aDsgaSA8IGw7IGkrKylcblx0XHRcdFx0Y2xiayggb1tpXSwgaSApO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGtleXMgPSBPYmplY3Qua2V5cyggbyApO1xuXHRcdFx0Zm9yKCBpID0gMCwgbCA9IGtleXMubGVuZ3RoOyBpIDwgbDsgaSsrIClcblx0XHRcdFx0Y2xiayggb1sga2V5c1tpXSBdLCBrZXlzW2ldICk7XG5cdFx0fVxuXHR9LFxuXG5cdGFkZE5FOiBmdW5jdGlvbiggbm9kZSwgYXR0cnMgKXtcblx0XHRmb3IoIHZhciBrZXkgaW4gYXR0cnMgKXtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSggbm9kZSwga2V5LCB7XG5cdFx0XHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdFx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0XHRcdHdyaXRhYmxlOiB0cnVlLFxuXHRcdFx0XHR2YWx1ZTogYXR0cnNbIGtleSBdXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0sXG5cblx0Ly8gbmV4dFRpY2sgLSBieSBzdGFnYXMgLyBwdWJsaWMgZG9tYWluXG4gIFx0bmV4dFRpY2s6IChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgcXVldWUgPSBbXSxcblx0XHRcdGRpcnR5ID0gZmFsc2UsXG5cdFx0XHRmbixcblx0XHRcdGhhc1Bvc3RNZXNzYWdlID0gISFnbG9iYWwucG9zdE1lc3NhZ2UsXG5cdFx0XHRtZXNzYWdlTmFtZSA9ICduZXh0dGljaycsXG5cdFx0XHR0cmlnZ2VyID0gKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhhc1Bvc3RNZXNzYWdlXG5cdFx0XHRcdFx0PyBmdW5jdGlvbiB0cmlnZ2VyICgpIHtcblx0XHRcdFx0XHRnbG9iYWwucG9zdE1lc3NhZ2UobWVzc2FnZU5hbWUsICcqJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0OiBmdW5jdGlvbiB0cmlnZ2VyICgpIHtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcHJvY2Vzc1F1ZXVlKCkgfSwgMCk7XG5cdFx0XHRcdH07XG5cdFx0XHR9KCkpLFxuXHRcdFx0cHJvY2Vzc1F1ZXVlID0gKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhhc1Bvc3RNZXNzYWdlXG5cdFx0XHRcdFx0PyBmdW5jdGlvbiBwcm9jZXNzUXVldWUgKGV2ZW50KSB7XG5cdFx0XHRcdFx0XHRpZiAoZXZlbnQuc291cmNlID09PSBnbG9iYWwgJiYgZXZlbnQuZGF0YSA9PT0gbWVzc2FnZU5hbWUpIHtcblx0XHRcdFx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0XHRcdGZsdXNoUXVldWUoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0OiBmbHVzaFF1ZXVlO1xuICAgICAgXHR9KSgpXG4gICAgICA7XG5cbiAgICAgIGZ1bmN0aW9uIGZsdXNoUXVldWUgKCkge1xuICAgICAgICAgIHdoaWxlIChmbiA9IHF1ZXVlLnNoaWZ0KCkpIHtcbiAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgZGlydHkgPSBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gbmV4dFRpY2sgKGZuKSB7XG4gICAgICAgICAgcXVldWUucHVzaChmbik7XG4gICAgICAgICAgaWYgKGRpcnR5KSByZXR1cm47XG4gICAgICAgICAgZGlydHkgPSB0cnVlO1xuICAgICAgICAgIHRyaWdnZXIoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGhhc1Bvc3RNZXNzYWdlKSBnbG9iYWwuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIHByb2Nlc3NRdWV1ZSwgdHJ1ZSk7XG5cbiAgICAgIG5leHRUaWNrLnJlbW92ZUxpc3RlbmVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGdsb2JhbC5yZW1vdmVFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgcHJvY2Vzc1F1ZXVlLCB0cnVlKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5leHRUaWNrO1xuICB9KSgpXG59O1xuLy8jYnVpbGRcblxuXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzOyIsImV4cG9ydCBjbGFzcyBBY3Rpb24ge1xuICBjb25zdHJ1Y3RvcihhcmdzKSB7XG4gICAgY29uc3QgW3N0b3JlLCBzdG9yZXMsIGFsbFN0b3Jlc10gPSBbYXJncy5zdG9yZSwgYXJncy5zdG9yZXMsIFtdXTtcbiAgICB0aGlzLm5hbWUgPSBhcmdzLm5hbWU7XG5cbiAgICBpZiAoc3RvcmUpIGFsbFN0b3Jlcy5wdXNoKHN0b3JlKTtcbiAgICBpZiAoc3RvcmVzKSBhbGxTdG9yZXMucHVzaC5hcHBseShhbGxTdG9yZXMsIHN0b3Jlcyk7XG5cbiAgICB0aGlzLnN0b3JlcyA9IGFsbFN0b3JlcztcbiAgfVxuXG4gIHJ1biguLi5hcmdzKSB7XG4gICAgY29uc3Qgc3RvcmVzQ3ljbGVzID0gdGhpcy5zdG9yZXMubWFwKHN0b3JlID0+XG4gICAgICBzdG9yZS5ydW5DeWNsZS5hcHBseShzdG9yZSwgW3RoaXMubmFtZV0uY29uY2F0KGFyZ3MpKVxuICAgICk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHN0b3Jlc0N5Y2xlcyk7XG4gIH1cblxuICBhZGRTdG9yZShzdG9yZSkge1xuICAgIHRoaXMuc3RvcmVzLnB1c2goc3RvcmUpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBBY3Rpb25zIHtcbiAgY29uc3RydWN0b3IoYWN0aW9ucykge1xuICAgIHRoaXMuYWxsID0gW107XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoYWN0aW9ucykpIHtcbiAgICAgIGFjdGlvbnMuZm9yRWFjaCgoYWN0aW9uID0+IHRoaXMuYWRkQWN0aW9uKGFjdGlvbikpLCB0aGlzKTtcbiAgICB9XG4gIH1cblxuICBhZGRBY3Rpb24oaXRlbSwgbm9PdmVycmlkZSkge1xuICAgIGNvbnN0IGFjdGlvbiA9IG5vT3ZlcnJpZGUgPyBmYWxzZSA6IHRoaXMuZGV0ZWN0QWN0aW9uKGl0ZW0pO1xuICAgIGlmICghbm9PdmVycmlkZSkge1xuICAgICAgbGV0IG9sZCA9IHRoaXNbYWN0aW9uLm5hbWVdO1xuICAgICAgaWYgKG9sZCkgdGhpcy5yZW1vdmVBY3Rpb24ob2xkKTtcbiAgICAgIHRoaXMuYWxsLnB1c2goYWN0aW9uKTtcbiAgICAgIHRoaXNbYWN0aW9uLm5hbWVdID0gYWN0aW9uLnJ1bi5iaW5kKGFjdGlvbik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFjdGlvbjtcbiAgfVxuXG4gIHJlbW92ZUFjdGlvbihpdGVtKSB7XG4gICAgY29uc3QgYWN0aW9uID0gdGhpcy5kZXRlY3RBY3Rpb24oaXRlbSwgdHJ1ZSk7XG4gICAgY29uc3QgaW5kZXggPSB0aGlzLmFsbC5pbmRleE9mKGFjdGlvbik7XG4gICAgaWYgKGluZGV4ICE9PSAtMSkgdGhpcy5hbGwuc3BsaWNlKGluZGV4LCAxKTtcbiAgICBkZWxldGUgdGhpc1thY3Rpb24ubmFtZV07XG4gIH1cblxuICBhZGRTdG9yZShzdG9yZSkge1xuICAgIHRoaXMuYWxsLmZvckVhY2goYWN0aW9uID0+IGFjdGlvbi5hZGRTdG9yZShzdG9yZSkpO1xuICB9XG5cbiAgZGV0ZWN0QWN0aW9uKGFjdGlvbiwgaXNPbGQpIHtcbiAgICBpZiAoYWN0aW9uLmNvbnN0cnVjdG9yID09PSBBY3Rpb24pIHtcbiAgICAgIHJldHVybiBhY3Rpb247XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgYWN0aW9uID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIChpc09sZCkgPyB0aGlzW2FjdGlvbl0gOiBuZXcgQWN0aW9uKHtuYW1lOiBhY3Rpb259KTtcbiAgICB9XG4gIH1cbn1cbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcblwidXNlIHN0cmljdFwiO1xuXG52YXIgX2ludGVyb3BSZXF1aXJlID0gZnVuY3Rpb24gKG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqW1wiZGVmYXVsdFwiXSA6IG9iajsgfTtcblxuZXhwb3J0cy5jcmVhdGVWaWV3ID0gY3JlYXRlVmlldztcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5cbnZhciBSZWFjdCA9IF9pbnRlcm9wUmVxdWlyZSgodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snUmVhY3QnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ1JlYWN0J10gOiBudWxsKSk7XG5cbnZhciBSZWFjdFJvdXRlciA9IF9pbnRlcm9wUmVxdWlyZSgodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snUmVhY3RSb3V0ZXInXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ1JlYWN0Um91dGVyJ10gOiBudWxsKSk7XG5cbmZ1bmN0aW9uIGdldFJvdXRlcigpIHtcbiAgdmFyIFJvdXRlciA9IHt9O1xuICBpZiAodHlwZW9mIFJlYWN0Um91dGVyICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgdmFyIHJvdXRlckVsZW1lbnRzID0gW1wiUm91dGVcIiwgXCJEZWZhdWx0Um91dGVcIiwgXCJSb3V0ZUhhbmRsZXJcIiwgXCJBY3RpdmVIYW5kbGVyXCIsIFwiTm90Rm91bmRSb3V0ZVwiLCBcIkxpbmtcIiwgXCJSZWRpcmVjdFwiXSxcbiAgICAgICAgcm91dGVyTWl4aW5zID0gW1wiTmF2aWdhdGlvblwiLCBcIlN0YXRlXCJdLFxuICAgICAgICByb3V0ZXJGdW5jdGlvbnMgPSBbXCJjcmVhdGVcIiwgXCJjcmVhdGVEZWZhdWx0Um91dGVcIiwgXCJjcmVhdGVOb3RGb3VuZFJvdXRlXCIsIFwiY3JlYXRlUmVkaXJlY3RcIiwgXCJjcmVhdGVSb3V0ZVwiLCBcImNyZWF0ZVJvdXRlc0Zyb21SZWFjdENoaWxkcmVuXCIsIFwicnVuXCJdLFxuICAgICAgICByb3V0ZXJPYmplY3RzID0gW1wiSGFzaExvY2F0aW9uXCIsIFwiSGlzdG9yeVwiLCBcIkhpc3RvcnlMb2NhdGlvblwiLCBcIlJlZnJlc2hMb2NhdGlvblwiLCBcIlN0YXRpY0xvY2F0aW9uXCIsIFwiVGVzdExvY2F0aW9uXCIsIFwiSW1pdGF0ZUJyb3dzZXJCZWhhdmlvclwiLCBcIlNjcm9sbFRvVG9wQmVoYXZpb3JcIl0sXG4gICAgICAgIGNvcGllZEl0ZW1zID0gcm91dGVyTWl4aW5zLmNvbmNhdChyb3V0ZXJGdW5jdGlvbnMpLmNvbmNhdChyb3V0ZXJPYmplY3RzKTtcblxuICAgIHJvdXRlckVsZW1lbnRzLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIFJvdXRlcltuYW1lXSA9IFJlYWN0LmNyZWF0ZUVsZW1lbnQuYmluZChSZWFjdCwgUmVhY3RSb3V0ZXJbbmFtZV0pO1xuICAgIH0pO1xuXG4gICAgY29waWVkSXRlbXMuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgUm91dGVyW25hbWVdID0gUmVhY3RSb3V0ZXJbbmFtZV07XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIFJvdXRlcjtcbn1cblxuZnVuY3Rpb24gZ2V0RE9NKCkge1xuICB2YXIgRE9NSGVscGVycyA9IHt9O1xuXG4gIGlmICh0eXBlb2YgUmVhY3QgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICB2YXIgdGFnID0gZnVuY3Rpb24gdGFnKG5hbWUpIHtcbiAgICAgIGZvciAodmFyIF9sZW4gPSBhcmd1bWVudHMubGVuZ3RoLCBhcmdzID0gQXJyYXkoX2xlbiA+IDEgPyBfbGVuIC0gMSA6IDApLCBfa2V5ID0gMTsgX2tleSA8IF9sZW47IF9rZXkrKykge1xuICAgICAgICBhcmdzW19rZXkgLSAxXSA9IGFyZ3VtZW50c1tfa2V5XTtcbiAgICAgIH1cblxuICAgICAgdmFyIGF0dHJpYnV0ZXMgPSB1bmRlZmluZWQ7XG4gICAgICB2YXIgZmlyc3QgPSBhcmdzWzBdICYmIGFyZ3NbMF0uY29uc3RydWN0b3I7XG4gICAgICBpZiAoZmlyc3QgPT09IE9iamVjdCkge1xuICAgICAgICBhdHRyaWJ1dGVzID0gYXJncy5zaGlmdCgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXR0cmlidXRlcyA9IHt9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIFJlYWN0LkRPTVtuYW1lXS5hcHBseShSZWFjdC5ET00sIFthdHRyaWJ1dGVzXS5jb25jYXQoYXJncykpO1xuICAgIH07XG5cbiAgICBmb3IgKHZhciB0YWdOYW1lIGluIFJlYWN0LkRPTSkge1xuICAgICAgRE9NSGVscGVyc1t0YWdOYW1lXSA9IHRhZy5iaW5kKHRoaXMsIHRhZ05hbWUpO1xuICAgIH1cblxuICAgIERPTUhlbHBlcnMuc3BhY2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gUmVhY3QuRE9NLnNwYW4oe1xuICAgICAgICBkYW5nZXJvdXNseVNldElubmVySFRNTDoge1xuICAgICAgICAgIF9faHRtbDogXCImbmJzcDtcIlxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9O1xuICB9XG4gIHJldHVybiBET01IZWxwZXJzO1xufVxuXG52YXIgUm91dGVyID0gZ2V0Um91dGVyKCk7XG5leHBvcnRzLlJvdXRlciA9IFJvdXRlcjtcbnZhciBET00gPSBnZXRET00oKTtcblxuZXhwb3J0cy5ET00gPSBET007XG5cbmZ1bmN0aW9uIGNyZWF0ZVZpZXcoY2xhc3NBcmdzKSB7XG4gIHZhciBSZWFjdENsYXNzID0gUmVhY3QuY3JlYXRlQ2xhc3MoY2xhc3NBcmdzKTtcbiAgdmFyIFJlYWN0RWxlbWVudCA9IFJlYWN0LmNyZWF0ZUVsZW1lbnQuYmluZChSZWFjdC5jcmVhdGVFbGVtZW50LCBSZWFjdENsYXNzKTtcbiAgcmV0dXJuIFJlYWN0RWxlbWVudDtcbn1cblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pXG4vLyMgc291cmNlTWFwcGluZ1VSTD1kYXRhOmFwcGxpY2F0aW9uL2pzb247Y2hhcnNldDp1dGYtODtiYXNlNjQsZXlKMlpYSnphVzl1SWpvekxDSnpiM1Z5WTJWeklqcGJJaTlWYzJWeWN5OTJiMnh2WkhsdGVYSXZWMjl5YXk5b1pXeHNlV1ZoYUM5bGVHbHRMM055WXk5RVQwMUlaV3h3WlhKekxtcHpJbDBzSW01aGJXVnpJanBiWFN3aWJXRndjR2x1WjNNaU9pSTdPenM3TzFGQmQwUm5RaXhWUVVGVkxFZEJRVllzVlVGQlZUczdPenM3U1VGNFJHNUNMRXRCUVVzc01rSkJRVTBzVDBGQlR6czdTVUZEYkVJc1YwRkJWeXd5UWtGQlRTeGpRVUZqT3p0QlFVVjBReXhUUVVGVExGTkJRVk1zUjBGQlNUdEJRVU53UWl4TlFVRk5MRTFCUVUwc1IwRkJSeXhGUVVGRkxFTkJRVU03UVVGRGJFSXNUVUZCU1N4UFFVRlBMRmRCUVZjc1MwRkJTeXhYUVVGWExFVkJRVVU3UVVGRGRFTXNVVUZCU1N4alFVRmpMRWRCUVVjc1EwRkJReXhQUVVGUExFVkJRVVVzWTBGQll5eEZRVUZGTEdOQlFXTXNSVUZCUlN4bFFVRmxMRVZCUVVVc1pVRkJaU3hGUVVGRkxFMUJRVTBzUlVGQlJTeFZRVUZWTEVOQlFVTTdVVUZEY0Vnc1dVRkJXU3hIUVVGSExFTkJRVU1zV1VGQldTeEZRVUZGTEU5QlFVOHNRMEZCUXp0UlFVTjBReXhsUVVGbExFZEJRVWNzUTBGQlF5eFJRVUZSTEVWQlFVVXNiMEpCUVc5Q0xFVkJRVVVzY1VKQlFYRkNMRVZCUVVVc1owSkJRV2RDTEVWQlFVVXNZVUZCWVN4RlFVRkZMQ3RDUVVFclFpeEZRVUZGTEV0QlFVc3NRMEZCUXp0UlFVTnNTaXhoUVVGaExFZEJRVWNzUTBGQlF5eGpRVUZqTEVWQlFVVXNVMEZCVXl4RlFVRkZMR2xDUVVGcFFpeEZRVUZGTEdsQ1FVRnBRaXhGUVVGRkxHZENRVUZuUWl4RlFVRkZMR05CUVdNc1JVRkJSU3gzUWtGQmQwSXNSVUZCUlN4eFFrRkJjVUlzUTBGQlF6dFJRVU53U3l4WFFVRlhMRWRCUVVjc1dVRkJXU3hEUVVGRExFMUJRVTBzUTBGQlF5eGxRVUZsTEVOQlFVTXNRMEZCUXl4TlFVRk5MRU5CUVVNc1lVRkJZU3hEUVVGRExFTkJRVU03TzBGQlJYcEZMR3RDUVVGakxFTkJRVU1zVDBGQlR5eERRVUZETEZWQlFWTXNTVUZCU1N4RlFVRkZPMEZCUTNCRExGbEJRVTBzUTBGQlF5eEpRVUZKTEVOQlFVTXNSMEZCUnl4TFFVRkxMRU5CUVVNc1lVRkJZU3hEUVVGRExFbEJRVWtzUTBGQlF5eExRVUZMTEVWQlFVVXNWMEZCVnl4RFFVRkRMRWxCUVVrc1EwRkJReXhEUVVGRExFTkJRVU03UzBGRGJrVXNRMEZCUXl4RFFVRkRPenRCUVVWSUxHVkJRVmNzUTBGQlF5eFBRVUZQTEVOQlFVTXNWVUZCVXl4SlFVRkpMRVZCUVVVN1FVRkRha01zV1VGQlRTeERRVUZETEVsQlFVa3NRMEZCUXl4SFFVRkhMRmRCUVZjc1EwRkJReXhKUVVGSkxFTkJRVU1zUTBGQlF6dExRVU5zUXl4RFFVRkRMRU5CUVVNN1IwRkRTanRCUVVORUxGTkJRVThzVFVGQlRTeERRVUZETzBOQlEyWTdPMEZCUlVRc1UwRkJVeXhOUVVGTkxFZEJRVWs3UVVGRGFrSXNUVUZCVFN4VlFVRlZMRWRCUVVjc1JVRkJSU3hEUVVGRE96dEJRVVYwUWl4TlFVRkpMRTlCUVU4c1MwRkJTeXhMUVVGTExGZEJRVmNzUlVGQlJUdEJRVU5vUXl4UlFVRkpMRWRCUVVjc1IwRkJSeXhoUVVGVkxFbEJRVWtzUlVGQlZ6dDNRMEZCVGl4SlFVRkpPMEZCUVVvc1dVRkJTVHM3TzBGQlF5OUNMRlZCUVVrc1ZVRkJWU3haUVVGQkxFTkJRVU03UVVGRFppeFZRVUZKTEV0QlFVc3NSMEZCUnl4SlFVRkpMRU5CUVVNc1EwRkJReXhEUVVGRExFbEJRVWtzU1VGQlNTeERRVUZETEVOQlFVTXNRMEZCUXl4RFFVRkRMRmRCUVZjc1EwRkJRenRCUVVNelF5eFZRVUZKTEV0QlFVc3NTMEZCU3l4TlFVRk5MRVZCUVVVN1FVRkRjRUlzYTBKQlFWVXNSMEZCUnl4SlFVRkpMRU5CUVVNc1MwRkJTeXhGUVVGRkxFTkJRVU03VDBGRE0wSXNUVUZCVFR0QlFVTk1MR3RDUVVGVkxFZEJRVWNzUlVGQlJTeERRVUZETzA5QlEycENPMEZCUTBRc1lVRkJUeXhMUVVGTExFTkJRVU1zUjBGQlJ5eERRVUZETEVsQlFVa3NRMEZCUXl4RFFVRkRMRXRCUVVzc1EwRkJReXhMUVVGTExFTkJRVU1zUjBGQlJ5eEZRVUZGTEVOQlFVTXNWVUZCVlN4RFFVRkRMRU5CUVVNc1RVRkJUU3hEUVVGRExFbEJRVWtzUTBGQlF5eERRVUZETEVOQlFVTTdTMEZEY0VVc1EwRkJRenM3UVVGRlJpeFRRVUZMTEVsQlFVa3NUMEZCVHl4SlFVRkpMRXRCUVVzc1EwRkJReXhIUVVGSExFVkJRVVU3UVVGRE4wSXNaMEpCUVZVc1EwRkJReXhQUVVGUExFTkJRVU1zUjBGQlJ5eEhRVUZITEVOQlFVTXNTVUZCU1N4RFFVRkRMRWxCUVVrc1JVRkJSU3hQUVVGUExFTkJRVU1zUTBGQlF6dExRVU12UXpzN1FVRkZSQ3hqUVVGVkxFTkJRVU1zUzBGQlN5eEhRVUZITEZsQlFWYzdRVUZETlVJc1lVRkJUeXhMUVVGTExFTkJRVU1zUjBGQlJ5eERRVUZETEVsQlFVa3NRMEZCUXp0QlFVTndRaXdyUWtGQmRVSXNSVUZCUlR0QlFVTjJRaXhuUWtGQlRTeEZRVUZGTEZGQlFWRTdVMEZEYWtJN1QwRkRSaXhEUVVGRExFTkJRVU03UzBGRFNpeERRVUZETzBkQlEwZzdRVUZEUkN4VFFVRlBMRlZCUVZVc1EwRkJRenREUVVOdVFqczdRVUZGVFN4SlFVRk5MRTFCUVUwc1IwRkJSeXhUUVVGVExFVkJRVVVzUTBGQlF6dFJRVUZ5UWl4TlFVRk5MRWRCUVU0c1RVRkJUVHRCUVVOYUxFbEJRVTBzUjBGQlJ5eEhRVUZITEUxQlFVMHNSVUZCUlN4RFFVRkRPenRSUVVGbUxFZEJRVWNzUjBGQlNDeEhRVUZIT3p0QlFVVlVMRk5CUVZNc1ZVRkJWU3hEUVVGRkxGTkJRVk1zUlVGQlJUdEJRVU55UXl4TlFVRkpMRlZCUVZVc1IwRkJSeXhMUVVGTExFTkJRVU1zVjBGQlZ5eERRVUZETEZOQlFWTXNRMEZCUXl4RFFVRkRPMEZCUXpsRExFMUJRVWtzV1VGQldTeEhRVUZITEV0QlFVc3NRMEZCUXl4aFFVRmhMRU5CUVVNc1NVRkJTU3hEUVVGRExFdEJRVXNzUTBGQlF5eGhRVUZoTEVWQlFVVXNWVUZCVlN4RFFVRkRMRU5CUVVNN1FVRkROMFVzVTBGQlR5eFpRVUZaTEVOQlFVTTdRMEZEY2tJaUxDSm1hV3hsSWpvaVoyVnVaWEpoZEdWa0xtcHpJaXdpYzI5MWNtTmxVbTl2ZENJNklpSXNJbk52ZFhKalpYTkRiMjUwWlc1MElqcGJJbWx0Y0c5eWRDQlNaV0ZqZENCbWNtOXRJQ2R5WldGamRDYzdYRzVwYlhCdmNuUWdVbVZoWTNSU2IzVjBaWElnWm5KdmJTQW5jbVZoWTNRdGNtOTFkR1Z5Snp0Y2JseHVablZ1WTNScGIyNGdaMlYwVW05MWRHVnlJQ2dwSUh0Y2JpQWdZMjl1YzNRZ1VtOTFkR1Z5SUQwZ2UzMDdYRzRnSUdsbUlDaDBlWEJsYjJZZ1VtVmhZM1JTYjNWMFpYSWdJVDA5SUNkMWJtUmxabWx1WldRbktTQjdYRzRnSUNBZ2JHVjBJSEp2ZFhSbGNrVnNaVzFsYm5SeklEMGdXeWRTYjNWMFpTY3NJQ2RFWldaaGRXeDBVbTkxZEdVbkxDQW5VbTkxZEdWSVlXNWtiR1Z5Snl3Z0owRmpkR2wyWlVoaGJtUnNaWEluTENBblRtOTBSbTkxYm1SU2IzVjBaU2NzSUNkTWFXNXJKeXdnSjFKbFpHbHlaV04wSjEwc1hHNGdJQ0FnY205MWRHVnlUV2w0YVc1eklEMGdXeWRPWVhacFoyRjBhVzl1Snl3Z0oxTjBZWFJsSjEwc1hHNGdJQ0FnY205MWRHVnlSblZ1WTNScGIyNXpJRDBnV3lkamNtVmhkR1VuTENBblkzSmxZWFJsUkdWbVlYVnNkRkp2ZFhSbEp5d2dKMk55WldGMFpVNXZkRVp2ZFc1a1VtOTFkR1VuTENBblkzSmxZWFJsVW1Wa2FYSmxZM1FuTENBblkzSmxZWFJsVW05MWRHVW5MQ0FuWTNKbFlYUmxVbTkxZEdWelJuSnZiVkpsWVdOMFEyaHBiR1J5Wlc0bkxDQW5jblZ1SjEwc1hHNGdJQ0FnY205MWRHVnlUMkpxWldOMGN5QTlJRnNuU0dGemFFeHZZMkYwYVc5dUp5d2dKMGhwYzNSdmNua25MQ0FuU0dsemRHOXllVXh2WTJGMGFXOXVKeXdnSjFKbFpuSmxjMmhNYjJOaGRHbHZiaWNzSUNkVGRHRjBhV05NYjJOaGRHbHZiaWNzSUNkVVpYTjBURzlqWVhScGIyNG5MQ0FuU1cxcGRHRjBaVUp5YjNkelpYSkNaV2hoZG1sdmNpY3NJQ2RUWTNKdmJHeFViMVJ2Y0VKbGFHRjJhVzl5SjEwc1hHNGdJQ0FnWTI5d2FXVmtTWFJsYlhNZ1BTQnliM1YwWlhKTmFYaHBibk11WTI5dVkyRjBLSEp2ZFhSbGNrWjFibU4wYVc5dWN5a3VZMjl1WTJGMEtISnZkWFJsY2s5aWFtVmpkSE1wTzF4dVhHNGdJQ0FnY205MWRHVnlSV3hsYldWdWRITXVabTl5UldGamFDaG1kVzVqZEdsdmJpaHVZVzFsS1NCN1hHNGdJQ0FnSUNCU2IzVjBaWEpiYm1GdFpWMGdQU0JTWldGamRDNWpjbVZoZEdWRmJHVnRaVzUwTG1KcGJtUW9VbVZoWTNRc0lGSmxZV04wVW05MWRHVnlXMjVoYldWZEtUdGNiaUFnSUNCOUtUdGNibHh1SUNBZ0lHTnZjR2xsWkVsMFpXMXpMbVp2Y2tWaFkyZ29ablZ1WTNScGIyNG9ibUZ0WlNrZ2UxeHVJQ0FnSUNBZ1VtOTFkR1Z5VzI1aGJXVmRJRDBnVW1WaFkzUlNiM1YwWlhKYmJtRnRaVjA3WEc0Z0lDQWdmU2s3WEc0Z0lIMWNiaUFnY21WMGRYSnVJRkp2ZFhSbGNqdGNibjFjYmx4dVpuVnVZM1JwYjI0Z1oyVjBSRTlOSUNncElIdGNiaUFnWTI5dWMzUWdSRTlOU0dWc2NHVnljeUE5SUh0OU8xeHVYRzRnSUdsbUlDaDBlWEJsYjJZZ1VtVmhZM1FnSVQwOUlDZDFibVJsWm1sdVpXUW5LU0I3WEc0Z0lDQWdiR1YwSUhSaFp5QTlJR1oxYm1OMGFXOXVJQ2h1WVcxbExDQXVMaTVoY21kektTQjdYRzRnSUNBZ0lDQnNaWFFnWVhSMGNtbGlkWFJsY3p0Y2JpQWdJQ0FnSUd4bGRDQm1hWEp6ZENBOUlHRnlaM05iTUYwZ0ppWWdZWEpuYzFzd1hTNWpiMjV6ZEhKMVkzUnZjanRjYmlBZ0lDQWdJR2xtSUNobWFYSnpkQ0E5UFQwZ1QySnFaV04wS1NCN1hHNGdJQ0FnSUNBZ0lHRjBkSEpwWW5WMFpYTWdQU0JoY21kekxuTm9hV1owS0NrN1hHNGdJQ0FnSUNCOUlHVnNjMlVnZTF4dUlDQWdJQ0FnSUNCaGRIUnlhV0oxZEdWeklEMGdlMzA3WEc0Z0lDQWdJQ0I5WEc0Z0lDQWdJQ0J5WlhSMWNtNGdVbVZoWTNRdVJFOU5XMjVoYldWZExtRndjR3g1S0ZKbFlXTjBMa1JQVFN3Z1cyRjBkSEpwWW5WMFpYTmRMbU52Ym1OaGRDaGhjbWR6S1NrN1hHNGdJQ0FnZlR0Y2JseHVJQ0FnSUdadmNpQW9iR1YwSUhSaFowNWhiV1VnYVc0Z1VtVmhZM1F1UkU5TktTQjdYRzRnSUNBZ0lDQkVUMDFJWld4d1pYSnpXM1JoWjA1aGJXVmRJRDBnZEdGbkxtSnBibVFvZEdocGN5d2dkR0ZuVG1GdFpTazdYRzRnSUNBZ2ZWeHVYRzRnSUNBZ1JFOU5TR1ZzY0dWeWN5NXpjR0ZqWlNBOUlHWjFibU4wYVc5dUtDa2dlMXh1SUNBZ0lDQWdjbVYwZFhKdUlGSmxZV04wTGtSUFRTNXpjR0Z1S0h0Y2JpQWdJQ0FnSUNBZ1pHRnVaMlZ5YjNWemJIbFRaWFJKYm01bGNraFVUVXc2SUh0Y2JpQWdJQ0FnSUNBZ0lDQmZYMmgwYld3NklDY21ibUp6Y0RzblhHNGdJQ0FnSUNBZ0lIMWNiaUFnSUNBZ0lIMHBPMXh1SUNBZ0lIMDdYRzRnSUgxY2JpQWdjbVYwZFhKdUlFUlBUVWhsYkhCbGNuTTdYRzU5WEc1Y2JtVjRjRzl5ZENCamIyNXpkQ0JTYjNWMFpYSWdQU0JuWlhSU2IzVjBaWElvS1R0Y2JtVjRjRzl5ZENCamIyNXpkQ0JFVDAwZ1BTQm5aWFJFVDAwb0tUdGNibHh1Wlhod2IzSjBJR1oxYm1OMGFXOXVJR055WldGMFpWWnBaWGNnS0dOc1lYTnpRWEpuY3lrZ2UxeHVJQ0JzWlhRZ1VtVmhZM1JEYkdGemN5QTlJRkpsWVdOMExtTnlaV0YwWlVOc1lYTnpLR05zWVhOelFYSm5jeWs3WEc0Z0lHeGxkQ0JTWldGamRFVnNaVzFsYm5RZ1BTQlNaV0ZqZEM1amNtVmhkR1ZGYkdWdFpXNTBMbUpwYm1Rb1VtVmhZM1F1WTNKbFlYUmxSV3hsYldWdWRDd2dVbVZoWTNSRGJHRnpjeWs3WEc0Z0lISmxkSFZ5YmlCU1pXRmpkRVZzWlcxbGJuUTdYRzU5WEc0aVhYMD0iLCJpbXBvcnQge0FjdGlvbnN9IGZyb20gJy4vQWN0aW9ucyc7XG5pbXBvcnQgdXRpbHMgZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgRnJlZXplciBmcm9tICdmcmVlemVyLWpzJztcbmltcG9ydCBnZXRDb25uZWN0TWl4aW4gZnJvbSAnLi9taXhpbnMvY29ubmVjdCc7XG5pbXBvcnQgR2xvYmFsU3RvcmUgZnJvbSAnLi9nbG9iYWxTdG9yZSc7XG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU3RvcmUge1xuICBjb25zdHJ1Y3RvcihhcmdzPXt9KSB7XG4gICAgbGV0IHtwYXRoLCBhY3Rpb25zLCBpbml0aWFsfSA9IGFyZ3M7XG4gICAgbGV0IGluaXQgPSB0eXBlb2YgaW5pdGlhbCA9PT0gJ2Z1bmN0aW9uJyA/IGluaXRpYWwoKSA6IGluaXRpYWw7XG4gICAgbGV0IHN0b3JlID0gR2xvYmFsU3RvcmUuaW5pdChwYXRoLCBpbml0IHx8IHt9KTtcblxuICAgIHRoaXMuY29ubmVjdCA9IGZ1bmN0aW9uICguLi5hcmdzKSB7XG4gICAgICByZXR1cm4gZ2V0Q29ubmVjdE1peGluKHRoaXMsIGFyZ3MuY29uY2F0KGFyZ3MpKTtcbiAgICB9O1xuXG4gICAgdGhpcy5oYW5kbGVycyA9IGFyZ3MuaGFuZGxlcnMgfHwgdXRpbHMuZ2V0V2l0aG91dEZpZWxkcyhbJ2FjdGlvbnMnXSwgYXJncykgfHwge307XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShhY3Rpb25zKSkge1xuICAgICAgdGhpcy5hY3Rpb25zID0gYWN0aW9ucyA9IG5ldyBBY3Rpb25zKGFjdGlvbnMpO1xuICAgICAgdGhpcy5hY3Rpb25zLmFkZFN0b3JlKHRoaXMpO1xuICAgIH1cblxuICAgIGNvbnN0IHNldCA9IGZ1bmN0aW9uIChpdGVtLCB2YWx1ZSkge1xuICAgICAgR2xvYmFsU3RvcmUuc2V0KHBhdGgsIGl0ZW0sIHZhbHVlKTtcbiAgICB9O1xuXG4gICAgY29uc3QgZ2V0ID0gZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgIGlmIChpdGVtKVxuICAgICAgICByZXR1cm4gR2xvYmFsU3RvcmUuZ2V0KHBhdGgsIGl0ZW0pO1xuICAgICAgcmV0dXJuIEdsb2JhbFN0b3JlLmdldChwYXRoKTtcbiAgICB9O1xuXG4gICAgY29uc3QgcmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLnNldChpbml0KTtcbiAgICB9O1xuXG4gICAgdGhpcy5wYXRoID0gcGF0aDtcbiAgICB0aGlzLnNldCA9IHNldDtcbiAgICB0aGlzLmdldCA9IGdldDtcbiAgICB0aGlzLnJlc2V0ID0gcmVzZXQ7XG4gICAgdGhpcy5zdG9yZSA9IEdsb2JhbFN0b3JlLmdldFN0b3JlKCk7XG5cbiAgICB0aGlzLnN0YXRlUHJvdG8gPSB7c2V0LCBnZXQsIHJlc2V0LCBhY3Rpb25zfTtcbiAgICAvL3RoaXMuZ2V0dGVyID0gbmV3IEdldHRlcih0aGlzKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGFkZEFjdGlvbihpdGVtKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoaXRlbSkpIHtcbiAgICAgIHRoaXMuYWN0aW9ucyA9IHRoaXMuYWN0aW9ucy5jb25jYXQodGhpcy5hY3Rpb25zKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBpdGVtID09PSAnb2JqZWN0Jykge1xuICAgICAgdGhpcy5hY3Rpb25zLnB1c2goaXRlbSk7XG4gICAgfVxuICB9XG5cbiAgcmVtb3ZlQWN0aW9uKGl0ZW0pIHtcbiAgICB2YXIgYWN0aW9uO1xuICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGFjdGlvbiA9IHRoaXMuZmluZEJ5TmFtZSgnYWN0aW9ucycsICduYW1lJywgaXRlbSk7XG4gICAgICBpZiAoYWN0aW9uKSBhY3Rpb24ucmVtb3ZlU3RvcmUodGhpcyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGFjdGlvbiA9IGl0ZW07XG4gICAgICBsZXQgaW5kZXggPSB0aGlzLmFjdGlvbnMuaW5kZXhPZihhY3Rpb24pO1xuICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xuICAgICAgICBhY3Rpb24ucmVtb3ZlU3RvcmUodGhpcyk7XG4gICAgICAgIHRoaXMuYWN0aW9ucyA9IHRoaXMuYWN0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldEFjdGlvbkN5Y2xlKGFjdGlvbk5hbWUsIHByZWZpeD0nb24nKSB7XG4gICAgY29uc3QgY2FwaXRhbGl6ZWQgPSB1dGlscy5jYXBpdGFsaXplKGFjdGlvbk5hbWUpO1xuICAgIGNvbnN0IGZ1bGxBY3Rpb25OYW1lID0gYCR7cHJlZml4fSR7Y2FwaXRhbGl6ZWR9YDtcbiAgICBjb25zdCBoYW5kbGVyID0gdGhpcy5oYW5kbGVyc1tmdWxsQWN0aW9uTmFtZV0gfHwgdGhpcy5oYW5kbGVyc1thY3Rpb25OYW1lXTtcbiAgICBpZiAoIWhhbmRsZXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gaGFuZGxlcnMgZm9yICR7YWN0aW9uTmFtZX0gYWN0aW9uIGRlZmluZWQgaW4gY3VycmVudCBzdG9yZWApO1xuICAgIH1cblxuICAgIGxldCBhY3Rpb25zO1xuICAgIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGFjdGlvbnMgPSBoYW5kbGVyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGFjdGlvbnMgPSB7b246IGhhbmRsZXJ9O1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7aGFuZGxlcn0gbXVzdCBiZSBhbiBvYmplY3Qgb3IgZnVuY3Rpb25gKTtcbiAgICB9XG4gICAgcmV0dXJuIGFjdGlvbnM7XG4gIH1cblxuICAvLyAxLiB3aWxsKGluaXRpYWwpID0+IHdpbGxSZXN1bHRcbiAgLy8gMi4gd2hpbGUodHJ1ZSlcbiAgLy8gMy4gb24od2lsbFJlc3VsdCB8fCBpbml0aWFsKSA9PiBvblJlc3VsdFxuICAvLyA0LiB3aGlsZShmYWxzZSlcbiAgLy8gNS4gZGlkKG9uUmVzdWx0KVxuICBydW5DeWNsZShhY3Rpb25OYW1lLCAuLi5hcmdzKSB7XG4gICAgLy8gbmV3IFByb21pc2UocmVzb2x2ZSA9PiByZXNvbHZlKHRydWUpKVxuICAgIGNvbnN0IGN5Y2xlID0gdGhpcy5nZXRBY3Rpb25DeWNsZShhY3Rpb25OYW1lKTtcbiAgICBsZXQgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIGxldCB3aWxsID0gY3ljbGUud2lsbCwgd2hpbGVfID0gY3ljbGUud2hpbGUsIG9uXyA9IGN5Y2xlLm9uO1xuICAgIGxldCBkaWQgPSBjeWNsZS5kaWQsIGRpZE5vdCA9IGN5Y2xlLmRpZE5vdDtcblxuICAgIC8vIExvY2FsIHN0YXRlIGZvciB0aGlzIGN5Y2xlLlxuICAgIGxldCBzdGF0ZSA9IE9iamVjdC5jcmVhdGUodGhpcy5zdGF0ZVByb3RvKTtcblxuICAgIC8vIFByZS1jaGVjayAmIHByZXBhcmF0aW9ucy5cbiAgICBpZiAod2lsbCkgcHJvbWlzZSA9IHByb21pc2UudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gd2lsbC5hcHBseShzdGF0ZSwgYXJncyk7XG4gICAgfSk7XG5cbiAgICAvLyBTdGFydCB3aGlsZSgpLlxuICAgIGlmICh3aGlsZV8pIHByb21pc2UgPSBwcm9taXNlLnRoZW4oKHdpbGxSZXN1bHQpID0+IHtcbiAgICAgIHdoaWxlXy5jYWxsKHN0YXRlLCB0cnVlKTtcbiAgICAgIHJldHVybiB3aWxsUmVzdWx0O1xuICAgIH0pO1xuXG4gICAgLy8gQWN0dWFsIGV4ZWN1dGlvbi5cbiAgICBwcm9taXNlID0gcHJvbWlzZS50aGVuKCh3aWxsUmVzdWx0KSA9PiB7XG4gICAgICBpZiAod2lsbFJlc3VsdCA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBvbl8uYXBwbHkoc3RhdGUsIGFyZ3MpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG9uXy5jYWxsKHN0YXRlLCB3aWxsUmVzdWx0KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFN0b3Agd2hpbGUoKS5cbiAgICBpZiAod2hpbGVfKSBwcm9taXNlID0gcHJvbWlzZS50aGVuKChvblJlc3VsdCkgPT4ge1xuICAgICAgd2hpbGVfLmNhbGwoc3RhdGUsIGZhbHNlKTtcbiAgICAgIHJldHVybiBvblJlc3VsdDtcbiAgICB9KTtcblxuICAgIC8vIEZvciBkaWQgYW5kIGRpZE5vdCBzdGF0ZSBpcyBmcmVlemVkLlxuICAgIHByb21pc2UgPSBwcm9taXNlLnRoZW4oKG9uUmVzdWx0KSA9PiB7XG4gICAgICBPYmplY3QuZnJlZXplKHN0YXRlKTtcbiAgICAgIHJldHVybiBvblJlc3VsdDtcbiAgICB9KTtcblxuICAgIC8vIEhhbmRsZSB0aGUgcmVzdWx0LlxuICAgIGlmIChkaWQpIHByb21pc2UgPSBwcm9taXNlLnRoZW4ob25SZXN1bHQgPT4ge1xuICAgICAgcmV0dXJuIGRpZC5jYWxsKHN0YXRlLCBvblJlc3VsdCk7XG4gICAgfSk7XG5cbiAgICBwcm9taXNlLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmICh3aGlsZV8pIHdoaWxlXy5jYWxsKHRoaXMsIHN0YXRlLCBmYWxzZSk7XG4gICAgICBpZiAoZGlkTm90KSB7XG4gICAgICAgIGRpZE5vdC5jYWxsKHN0YXRlLCBlcnJvcik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG59XG4iLCJpbXBvcnQgRnJlZXplciBmcm9tICdmcmVlemVyLWpzJztcblxudmFyIGZyZWV6ZXI7XG5leHBvcnQgZGVmYXVsdCBjbGFzcyBHbG9iYWxTdG9yZSB7XG4gIHN0YXRpYyBnZXRTdG9yZSgpIHtcbiAgICBpZiAoIWZyZWV6ZXIpIHtcbiAgICAgIGZyZWV6ZXIgPSBuZXcgRnJlZXplcih7fSk7XG4gICAgfVxuICAgIHJldHVybiBmcmVlemVyO1xuICB9XG5cbiAgc3RhdGljIGdldFN0YXRlKCkge1xuICAgIHJldHVybiB0aGlzLmdldFN0b3JlKCkuZ2V0KCk7XG4gIH1cblxuICBzdGF0aWMgaW5pdChzdWJzdG9yZSwgaW5pdCkge1xuICAgIGxldCBzdG9yZSA9IHRoaXMuZ2V0U3RhdGUoKTtcbiAgICBsZXQgdmFsdWVzID0gc3RvcmVbc3Vic3RvcmVdO1xuXG4gICAgaWYgKHZhbHVlcylcbiAgICAgIHJldHVybiB2YWx1ZXM7XG4gICAgcmV0dXJuIHN0b3JlLnNldChzdWJzdG9yZSwgaW5pdCB8fCB7fSlbc3Vic3RvcmVdO1xuICB9XG5cbiAgc3RhdGljIGdldChzdWJzdG9yZSwgbmFtZSkge1xuICAgIGxldCBzdG9yZSA9IHRoaXMuZ2V0U3RhdGUoKTtcbiAgICBpZiAoIW5hbWUpXG4gICAgICByZXR1cm4gc3RvcmVbc3Vic3RvcmVdLnRvSlMoKTtcbiAgICByZXR1cm4gc3RvcmVbc3Vic3RvcmVdID8gc3RvcmVbc3Vic3RvcmVdLnRvSlMoKVtuYW1lXSA6IHt9O1xuICB9XG5cbiAgc3RhdGljIHNldChzdWJzdG9yZSwgbmFtZSwgdmFsdWUpIHtcbiAgICBsZXQgc3RvcmUgPSB0aGlzLmdldFN0YXRlKCk7XG4gICAgbGV0IHZhbHVlcyA9IHN0b3JlW3N1YnN0b3JlXTtcblxuICAgIGlmICh2YWx1ZXMpXG4gICAgICB2YWx1ZXMuc2V0KG5hbWUsIHZhbHVlKTtcblxuICAgIHJldHVybiB0aGlzLmdldChzdWJzdG9yZSk7XG4gIH1cbn1cbiIsImV4cG9ydCBkZWZhdWx0IHtcbiAgY3g6IGZ1bmN0aW9uIChjbGFzc05hbWVzKSB7XG4gICAgaWYgKHR5cGVvZiBjbGFzc05hbWVzID09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LmtleXMoY2xhc3NOYW1lcykuZmlsdGVyKGZ1bmN0aW9uKGNsYXNzTmFtZSkge1xuICAgICAgICByZXR1cm4gY2xhc3NOYW1lc1tjbGFzc05hbWVdO1xuICAgICAgfSkuam9pbignICcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLmpvaW4uY2FsbChhcmd1bWVudHMsICcgJyk7XG4gICAgfVxuICB9XG59O1xuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZ2V0Q29ubmVjdE1peGluIChzdG9yZSkge1xuICBsZXQgbGlzdGVuZXI7XG5cbiAgcmV0dXJuIHtcbiAgICBnZXRJbml0aWFsU3RhdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGNvbnN0IGZyb3plbiA9IHN0b3JlLnN0b3JlLmdldChhcmd1bWVudHMpO1xuICAgICAgY29uc3Qgc3RhdGUgPSBmcm96ZW4udG9KUygpW3N0b3JlLnBhdGhdO1xuXG4gICAgICBsZXQgY2hhbmdlQ2FsbGJhY2sgPSBmdW5jdGlvbiAoc3RhdGUpIHtcbiAgICAgICAgdGhpcy5zZXRTdGF0ZShzdGF0ZS50b0pTKClbc3RvcmUucGF0aF0pO1xuICAgICAgfTtcblxuICAgICAgaWYgKCF0aGlzLmJvdW5kRXhpbUNoYW5nZUNhbGxiYWNrcylcbiAgICAgICAgdGhpcy5ib3VuZEV4aW1DaGFuZ2VDYWxsYmFja3MgPSB7fTtcblxuICAgICAgdGhpcy5ib3VuZEV4aW1DaGFuZ2VDYWxsYmFja3Nbc3RvcmUucGF0aF0gPSBjaGFuZ2VDYWxsYmFjay5iaW5kKHRoaXMpO1xuXG4gICAgICBsaXN0ZW5lciA9IGZyb3plbi5nZXRMaXN0ZW5lcigpO1xuICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH0sXG5cbiAgICBjb21wb25lbnREaWRNb3VudDogZnVuY3Rpb24gKCkge1xuICAgICAgbGlzdGVuZXIub24oJ3VwZGF0ZScsIHRoaXMuYm91bmRFeGltQ2hhbmdlQ2FsbGJhY2tzW3N0b3JlLnBhdGhdKTtcbiAgICB9LFxuXG4gICAgY29tcG9uZW50V2lsbFVubW91bnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmIChsaXN0ZW5lcilcbiAgICAgICAgbGlzdGVuZXIub2ZmKCd1cGRhdGUnLCB0aGlzLmJvdW5kRXhpbUNoYW5nZUNhbGxiYWNrc1tzdG9yZS5wYXRoXSk7XG4gICAgfVxuICB9O1xufVxuIiwiY29uc3QgdXRpbHMgPSB7fTtcblxudXRpbHMuZ2V0V2l0aG91dEZpZWxkcyA9IGZ1bmN0aW9uIChvdXRjYXN0LCB0YXJnZXQpIHtcbiAgaWYgKCF0YXJnZXQpIHRocm93IG5ldyBFcnJvcignVHlwZUVycm9yOiB0YXJnZXQgaXMgbm90IGFuIG9iamVjdC4nKTtcbiAgdmFyIHJlc3VsdCA9IHt9O1xuICBpZiAodHlwZW9mIG91dGNhc3QgPT09ICdzdHJpbmcnKSBvdXRjYXN0ID0gW291dGNhc3RdO1xuICB2YXIgdEtleXMgPSBPYmplY3Qua2V5cyh0YXJnZXQpO1xuICBvdXRjYXN0LmZvckVhY2goZnVuY3Rpb24oZmllbGROYW1lKSB7XG4gICAgdEtleXNcbiAgICAgIC5maWx0ZXIoZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHJldHVybiBrZXkgIT09IGZpZWxkTmFtZTtcbiAgICAgIH0pXG4gICAgICAuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgcmVzdWx0W2tleV0gPSB0YXJnZXRba2V5XTtcbiAgICAgIH0pO1xuICB9KTtcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbnV0aWxzLm9iamVjdFRvQXJyYXkgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmplY3QpLm1hcChrZXkgPT4gb2JqZWN0W2tleV0pO1xufTtcblxudXRpbHMuY2xhc3NXaXRoQXJncyA9IGZ1bmN0aW9uIChJdGVtLCBhcmdzKSB7XG4gIHJldHVybiBJdGVtLmJpbmQuYXBwbHkoSXRlbSxbSXRlbV0uY29uY2F0KGFyZ3MpKTtcbn07XG5cbi8vIDEuIHdpbGxcbi8vIDIuIHdoaWxlKHRydWUpXG4vLyAzLiBvblxuLy8gNC4gd2hpbGUoZmFsc2UpXG4vLyA1LiBkaWQgb3IgZGlkTm90XG51dGlscy5tYXBBY3Rpb25OYW1lcyA9IGZ1bmN0aW9uKG9iamVjdCkge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGNvbnN0IHByZWZpeGVzID0gWyd3aWxsJywgJ3doaWxlU3RhcnQnLCAnb24nLCAnd2hpbGVFbmQnLCAnZGlkJywgJ2RpZE5vdCddO1xuICBwcmVmaXhlcy5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgIGxldCBuYW1lID0gaXRlbTtcbiAgICBpZiAoaXRlbSA9PT0gJ3doaWxlU3RhcnQnIHx8IGl0ZW0gPT09ICd3aGlsZUVuZCcpIHtcbiAgICAgIG5hbWUgPSAnd2hpbGUnO1xuICAgIH1cbiAgICBpZiAob2JqZWN0W25hbWVdKSB7XG4gICAgICBsaXN0LnB1c2goW2l0ZW0sIG9iamVjdFtuYW1lXV0pO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBsaXN0O1xufTtcblxudXRpbHMuaXNPYmplY3QgPSBmdW5jdGlvbiAodGFyZykge1xuICByZXR1cm4gdGFyZyA/IHRhcmcudG9TdHJpbmcoKS5zbGljZSg4LDE0KSA9PT0gJ09iamVjdCcgOiBmYWxzZTtcbn07XG51dGlscy5jYXBpdGFsaXplID0gZnVuY3Rpb24gKHN0cikge1xuICBjb25zdCBmaXJzdCA9IHN0ci5jaGFyQXQoMCkudG9VcHBlckNhc2UoKTtcbiAgY29uc3QgcmVzdCA9IHN0ci5zbGljZSgxKTtcbiAgcmV0dXJuIGAke2ZpcnN0fSR7cmVzdH1gO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgdXRpbHM7XG4iXX0=
