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
        return GlobalStore.get(path).toJS()[item];
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
          return store[substore];
        }return store[substore] ? store[substore][name] : {};
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
      var state = frozen[store.path].toJS();

      var changeCallback = function changeCallback(state) {
        this.setState(state[store.path].toJS());
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvdm9sb2R5bXlyL1dvcmsvaGVsbHllYWgvZXhpbS9zcmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZnJlZXplci1qcy9mcmVlemVyLmpzIiwibm9kZV9tb2R1bGVzL2ZyZWV6ZXItanMvc3JjL2VtaXR0ZXIuanMiLCJub2RlX21vZHVsZXMvZnJlZXplci1qcy9zcmMvZnJlZXplci5qcyIsIm5vZGVfbW9kdWxlcy9mcmVlemVyLWpzL3NyYy9mcm96ZW4uanMiLCJub2RlX21vZHVsZXMvZnJlZXplci1qcy9zcmMvbWl4aW5zLmpzIiwibm9kZV9tb2R1bGVzL2ZyZWV6ZXItanMvc3JjL3V0aWxzLmpzIiwiL1VzZXJzL3ZvbG9keW15ci9Xb3JrL2hlbGx5ZWFoL2V4aW0vc3JjL0FjdGlvbnMuanMiLCJzcmMvRE9NSGVscGVycy5qcyIsIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9TdG9yZS5qcyIsIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9nbG9iYWxTdG9yZS5qcyIsIi9Vc2Vycy92b2xvZHlteXIvV29yay9oZWxseWVhaC9leGltL3NyYy9oZWxwZXJzLmpzIiwiL1VzZXJzL3ZvbG9keW15ci9Xb3JrL2hlbGx5ZWFoL2V4aW0vc3JjL21peGlucy9jb25uZWN0LmpzIiwiL1VzZXJzL3ZvbG9keW15ci9Xb3JrL2hlbGx5ZWFoL2V4aW0vc3JjL3V0aWxzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozt1QkNBOEIsV0FBVzs7SUFBakMsTUFBTSxZQUFOLE1BQU07SUFBRSxPQUFPLFlBQVAsT0FBTzs7SUFDaEIsS0FBSywyQkFBTSxTQUFTOztJQUNwQixPQUFPLDJCQUFNLFdBQVc7OzBCQUNPLGNBQWM7O0lBQTVDLFVBQVUsZUFBVixVQUFVO0lBQUUsTUFBTSxlQUFOLE1BQU07SUFBRSxHQUFHLGVBQUgsR0FBRzs7QUFFL0IsSUFBTSxJQUFJLEdBQUcsRUFBQyxNQUFNLEVBQU4sTUFBTSxFQUFFLE9BQU8sRUFBUCxPQUFPLEVBQUUsS0FBSyxFQUFMLEtBQUssRUFBRSxNQUFNLEVBQU4sTUFBTSxFQUFFLEdBQUcsRUFBSCxHQUFHLEVBQUUsT0FBTyxFQUFQLE9BQU8sRUFBRSxVQUFVLEVBQVYsVUFBVSxFQUFDLENBQUM7O0FBRXhFLElBQUksQ0FBQyxZQUFZLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDbEMsU0FBTyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUN6QixDQUFDOztBQUVGLElBQUksQ0FBQyxhQUFhLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDbkMsU0FBTyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUMxQixDQUFDOztBQUVGLElBQUksQ0FBQyxXQUFXLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDakMsU0FBTyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUN4QixDQUFDOztpQkFFYSxJQUFJOzs7QUNuQm5CO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqa0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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T0FBTyxDQUFDO0tBQ2hCO0FBQ0QsUUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDaEIsVUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ2pDO0dBQ0YsQ0FBQyxDQUFDO0FBQ0gsU0FBTyxJQUFJLENBQUM7Q0FDYixDQUFDOztBQUVGLEtBQUssQ0FBQyxRQUFRLEdBQUcsVUFBVSxJQUFJLEVBQUU7QUFDL0IsU0FBTyxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUMsRUFBRSxDQUFDLEtBQUssUUFBUSxHQUFHLEtBQUssQ0FBQztDQUNoRSxDQUFDO0FBQ0YsS0FBSyxDQUFDLFVBQVUsR0FBRyxVQUFVLEdBQUcsRUFBRTtBQUNoQyxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO0FBQzFDLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDMUIsY0FBVSxLQUFLLFFBQUcsSUFBSSxDQUFHO0NBQzFCLENBQUM7O2lCQUVhLEtBQUsiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiaW1wb3J0IHtBY3Rpb24sIEFjdGlvbnN9IGZyb20gJy4vQWN0aW9ucyc7XG5pbXBvcnQgU3RvcmUgZnJvbSAnLi9TdG9yZSc7XG5pbXBvcnQgaGVscGVycyBmcm9tICcuL2hlbHBlcnMnO1xuaW1wb3J0IHtjcmVhdGVWaWV3LCBSb3V0ZXIsIERPTX0gZnJvbSAnLi9ET01IZWxwZXJzJztcblxuY29uc3QgRXhpbSA9IHtBY3Rpb24sIEFjdGlvbnMsIFN0b3JlLCBSb3V0ZXIsIERPTSwgaGVscGVycywgY3JlYXRlVmlld307XG5cbkV4aW0uY3JlYXRlQWN0aW9uID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgcmV0dXJuIG5ldyBBY3Rpb24oYXJncyk7XG59O1xuXG5FeGltLmNyZWF0ZUFjdGlvbnMgPSBmdW5jdGlvbiAoYXJncykge1xuICByZXR1cm4gbmV3IEFjdGlvbnMoYXJncyk7XG59O1xuXG5FeGltLmNyZWF0ZVN0b3JlID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgcmV0dXJuIG5ldyBTdG9yZShhcmdzKTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IEV4aW07XG4iLCJ2YXIgRnJlZXplciA9IHJlcXVpcmUoJy4vc3JjL2ZyZWV6ZXInKTtcbm1vZHVsZS5leHBvcnRzID0gRnJlZXplcjsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgVXRpbHMgPSByZXF1aXJlKCAnLi91dGlscycgKTtcclxuXHJcbi8vI2J1aWxkXHJcblxyXG4vLyBUaGUgcHJvdG90eXBlIG1ldGhvZHMgYXJlIHN0b3JlZCBpbiBhIGRpZmZlcmVudCBvYmplY3RcclxuLy8gYW5kIGFwcGxpZWQgYXMgbm9uIGVudW1lcmFibGUgcHJvcGVydGllcyBsYXRlclxyXG52YXIgZW1pdHRlclByb3RvID0ge1xyXG5cdG9uOiBmdW5jdGlvbiggZXZlbnROYW1lLCBsaXN0ZW5lciwgb25jZSApe1xyXG5cdFx0dmFyIGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1sgZXZlbnROYW1lIF0gfHwgW107XHJcblxyXG5cdFx0bGlzdGVuZXJzLnB1c2goeyBjYWxsYmFjazogbGlzdGVuZXIsIG9uY2U6IG9uY2V9KTtcclxuXHRcdHRoaXMuX2V2ZW50c1sgZXZlbnROYW1lIF0gPSAgbGlzdGVuZXJzO1xyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdG9uY2U6IGZ1bmN0aW9uKCBldmVudE5hbWUsIGxpc3RlbmVyICl7XHJcblx0XHR0aGlzLm9uKCBldmVudE5hbWUsIGxpc3RlbmVyLCB0cnVlICk7XHJcblx0fSxcclxuXHJcblx0b2ZmOiBmdW5jdGlvbiggZXZlbnROYW1lLCBsaXN0ZW5lciApe1xyXG5cdFx0aWYoIHR5cGVvZiBldmVudE5hbWUgPT0gJ3VuZGVmaW5lZCcgKXtcclxuXHRcdFx0dGhpcy5fZXZlbnRzID0ge307XHJcblx0XHR9XHJcblx0XHRlbHNlIGlmKCB0eXBlb2YgbGlzdGVuZXIgPT0gJ3VuZGVmaW5lZCcgKSB7XHJcblx0XHRcdHRoaXMuX2V2ZW50c1sgZXZlbnROYW1lIF0gPSBbXTtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHR2YXIgbGlzdGVuZXJzID0gdGhpcy5fZXZlbnRzWyBldmVudE5hbWUgXSB8fCBbXSxcclxuXHRcdFx0XHRpXHJcblx0XHRcdDtcclxuXHJcblx0XHRcdGZvciAoaSA9IGxpc3RlbmVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG5cdFx0XHRcdGlmKCBsaXN0ZW5lcnNbaV0uY2FsbGJhY2sgPT09IGxpc3RlbmVyIClcclxuXHRcdFx0XHRcdGxpc3RlbmVycy5zcGxpY2UoIGksIDEgKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHRyaWdnZXI6IGZ1bmN0aW9uKCBldmVudE5hbWUgKXtcclxuXHRcdHZhciBhcmdzID0gW10uc2xpY2UuY2FsbCggYXJndW1lbnRzLCAxICksXHJcblx0XHRcdGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1sgZXZlbnROYW1lIF0gfHwgW10sXHJcblx0XHRcdG9uY2VMaXN0ZW5lcnMgPSBbXSxcclxuXHRcdFx0aSwgbGlzdGVuZXJcclxuXHRcdDtcclxuXHJcblx0XHQvLyBDYWxsIGxpc3RlbmVyc1xyXG5cdFx0Zm9yIChpID0gMDsgaSA8IGxpc3RlbmVycy5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRsaXN0ZW5lciA9IGxpc3RlbmVyc1tpXTtcclxuXHJcblx0XHRcdGlmKCBsaXN0ZW5lci5jYWxsYmFjayApXHJcblx0XHRcdFx0bGlzdGVuZXIuY2FsbGJhY2suYXBwbHkoIG51bGwsIGFyZ3MgKTtcclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0Ly8gSWYgdGhlcmUgaXMgbm90IGEgY2FsbGJhY2ssIHJlbW92ZSFcclxuXHRcdFx0XHRsaXN0ZW5lci5vbmNlID0gdHJ1ZTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYoIGxpc3RlbmVyLm9uY2UgKVxyXG5cdFx0XHRcdG9uY2VMaXN0ZW5lcnMucHVzaCggaSApO1xyXG5cdFx0fVxyXG5cclxuXHRcdC8vIFJlbW92ZSBsaXN0ZW5lcnMgbWFya2VkIGFzIG9uY2VcclxuXHRcdGZvciggaSA9IG9uY2VMaXN0ZW5lcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0gKXtcclxuXHRcdFx0bGlzdGVuZXJzLnNwbGljZSggb25jZUxpc3RlbmVyc1tpXSwgMSApO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH1cclxufTtcclxuXHJcbi8vIE1ldGhvZHMgYXJlIG5vdCBlbnVtZXJhYmxlIHNvLCB3aGVuIHRoZSBzdG9yZXMgYXJlXHJcbi8vIGV4dGVuZGVkIHdpdGggdGhlIGVtaXR0ZXIsIHRoZXkgY2FuIGJlIGl0ZXJhdGVkIGFzXHJcbi8vIGhhc2htYXBzXHJcbnZhciBFbWl0dGVyID0gVXRpbHMuY3JlYXRlTm9uRW51bWVyYWJsZSggZW1pdHRlclByb3RvICk7XHJcbi8vI2J1aWxkXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEVtaXR0ZXI7XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBVdGlscyA9IHJlcXVpcmUoICcuL3V0aWxzLmpzJyApLFxyXG5cdEVtaXR0ZXIgPSByZXF1aXJlKCAnLi9lbWl0dGVyJyApLFxyXG5cdE1peGlucyA9IHJlcXVpcmUoICcuL21peGlucycgKSxcclxuXHRGcm96ZW4gPSByZXF1aXJlKCAnLi9mcm96ZW4nIClcclxuO1xyXG5cclxuLy8jYnVpbGRcclxudmFyIEZyZWV6ZXIgPSBmdW5jdGlvbiggaW5pdGlhbFZhbHVlLCBvcHRpb25zICkge1xyXG5cdHZhciBtZSA9IHRoaXMsXHJcblx0XHRtdXRhYmxlID0gKCBvcHRpb25zICYmIG9wdGlvbnMubXV0YWJsZSApIHx8IGZhbHNlLFxyXG5cdFx0bGl2ZSA9ICggb3B0aW9ucyAmJiBvcHRpb25zLmxpdmUgKSB8fCBsaXZlXHJcblx0O1xyXG5cclxuXHQvLyBJbW11dGFibGUgZGF0YVxyXG5cdHZhciBmcm96ZW47XHJcblxyXG5cdHZhciBub3RpZnkgPSBmdW5jdGlvbiBub3RpZnkoIGV2ZW50TmFtZSwgbm9kZSwgb3B0aW9ucyApe1xyXG5cdFx0aWYoIGV2ZW50TmFtZSA9PSAnbGlzdGVuZXInIClcclxuXHRcdFx0cmV0dXJuIEZyb3plbi5jcmVhdGVMaXN0ZW5lciggbm9kZSApO1xyXG5cclxuXHRcdHJldHVybiBGcm96ZW4udXBkYXRlKCBldmVudE5hbWUsIG5vZGUsIG9wdGlvbnMgKTtcclxuXHR9O1xyXG5cclxuXHR2YXIgZnJlZXplID0gZnVuY3Rpb24oKXt9O1xyXG5cdGlmKCAhbXV0YWJsZSApXHJcblx0XHRmcmVlemUgPSBmdW5jdGlvbiggb2JqICl7IE9iamVjdC5mcmVlemUoIG9iaiApOyB9O1xyXG5cclxuXHQvLyBDcmVhdGUgdGhlIGZyb3plbiBvYmplY3RcclxuXHRmcm96ZW4gPSBGcm96ZW4uZnJlZXplKCBpbml0aWFsVmFsdWUsIG5vdGlmeSwgZnJlZXplLCBsaXZlICk7XHJcblxyXG5cdC8vIExpc3RlbiB0byBpdHMgY2hhbmdlcyBpbW1lZGlhdGVseVxyXG5cdHZhciBsaXN0ZW5lciA9IGZyb3plbi5nZXRMaXN0ZW5lcigpO1xyXG5cclxuXHQvLyBVcGRhdGluZyBmbGFnIHRvIHRyaWdnZXIgdGhlIGV2ZW50IG9uIG5leHRUaWNrXHJcblx0dmFyIHVwZGF0aW5nID0gZmFsc2U7XHJcblxyXG5cdGxpc3RlbmVyLm9uKCAnaW1tZWRpYXRlJywgZnVuY3Rpb24oIHByZXZOb2RlLCB1cGRhdGVkICl7XHJcblx0XHRpZiggcHJldk5vZGUgIT0gZnJvemVuIClcclxuXHRcdFx0cmV0dXJuO1xyXG5cclxuXHRcdGZyb3plbiA9IHVwZGF0ZWQ7XHJcblxyXG5cdFx0aWYoIGxpdmUgKVxyXG5cdFx0XHRyZXR1cm4gbWUudHJpZ2dlciggJ3VwZGF0ZScsIHVwZGF0ZWQgKTtcclxuXHJcblx0XHQvLyBUcmlnZ2VyIG9uIG5leHQgdGlja1xyXG5cdFx0aWYoICF1cGRhdGluZyApe1xyXG5cdFx0XHR1cGRhdGluZyA9IHRydWU7XHJcblx0XHRcdFV0aWxzLm5leHRUaWNrKCBmdW5jdGlvbigpe1xyXG5cdFx0XHRcdHVwZGF0aW5nID0gZmFsc2U7XHJcblx0XHRcdFx0bWUudHJpZ2dlciggJ3VwZGF0ZScsIGZyb3plbiApO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHR9KTtcclxuXHJcblx0VXRpbHMuYWRkTkUoIHRoaXMsIHtcclxuXHRcdGdldDogZnVuY3Rpb24oKXtcclxuXHRcdFx0cmV0dXJuIGZyb3plbjtcclxuXHRcdH0sXHJcblx0XHRzZXQ6IGZ1bmN0aW9uKCBub2RlICl7XHJcblx0XHRcdHZhciBuZXdOb2RlID0gbm90aWZ5KCAncmVzZXQnLCBmcm96ZW4sIG5vZGUgKTtcclxuXHRcdFx0bmV3Tm9kZS5fXy5saXN0ZW5lci50cmlnZ2VyKCAnaW1tZWRpYXRlJywgZnJvemVuLCBuZXdOb2RlICk7XHJcblx0XHR9XHJcblx0fSk7XHJcblxyXG5cdFV0aWxzLmFkZE5FKCB0aGlzLCB7IGdldERhdGE6IHRoaXMuZ2V0LCBzZXREYXRhOiB0aGlzLnNldCB9ICk7XHJcblxyXG5cdC8vIFRoZSBldmVudCBzdG9yZVxyXG5cdHRoaXMuX2V2ZW50cyA9IFtdO1xyXG59XHJcblxyXG5GcmVlemVyLnByb3RvdHlwZSA9IFV0aWxzLmNyZWF0ZU5vbkVudW1lcmFibGUoe2NvbnN0cnVjdG9yOiBGcmVlemVyfSwgRW1pdHRlcik7XHJcbi8vI2J1aWxkXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEZyZWV6ZXI7XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBVdGlscyA9IHJlcXVpcmUoICcuL3V0aWxzJyApLFxyXG5cdE1peGlucyA9IHJlcXVpcmUoICcuL21peGlucycpLFxyXG5cdEVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKVxyXG47XHJcblxyXG4vLyNidWlsZFxyXG52YXIgRnJvemVuID0ge1xyXG5cdGZyZWV6ZTogZnVuY3Rpb24oIG5vZGUsIG5vdGlmeSwgZnJlZXplRm4sIGxpdmUgKXtcclxuXHRcdGlmKCBub2RlICYmIG5vZGUuX18gKXtcclxuXHRcdFx0cmV0dXJuIG5vZGU7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0ZnJvemVuLCBtaXhpbiwgY29uc1xyXG5cdFx0O1xyXG5cclxuXHRcdGlmKCBub2RlLmNvbnN0cnVjdG9yID09IEFycmF5ICl7XHJcblx0XHRcdGZyb3plbiA9IHRoaXMuY3JlYXRlQXJyYXkoIG5vZGUubGVuZ3RoICk7XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0ZnJvemVuID0gT2JqZWN0LmNyZWF0ZSggTWl4aW5zLkhhc2ggKTtcclxuXHRcdH1cclxuXHJcblx0XHRVdGlscy5hZGRORSggZnJvemVuLCB7IF9fOiB7XHJcblx0XHRcdGxpc3RlbmVyOiBmYWxzZSxcclxuXHRcdFx0cGFyZW50czogW10sXHJcblx0XHRcdG5vdGlmeTogbm90aWZ5LFxyXG5cdFx0XHRkaXJ0eTogZmFsc2UsXHJcblx0XHRcdGZyZWV6ZUZuOiBmcmVlemVGbixcclxuXHRcdFx0bGl2ZTogbGl2ZSB8fCBmYWxzZVxyXG5cdFx0fX0pO1xyXG5cclxuXHRcdC8vIEZyZWV6ZSBjaGlsZHJlblxyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkLCBrZXkgKXtcclxuXHRcdFx0Y29ucyA9IGNoaWxkICYmIGNoaWxkLmNvbnN0cnVjdG9yO1xyXG5cdFx0XHRpZiggY29ucyA9PSBBcnJheSB8fCBjb25zID09IE9iamVjdCApe1xyXG5cdFx0XHRcdGNoaWxkID0gbWUuZnJlZXplKCBjaGlsZCwgbm90aWZ5LCBmcmVlemVGbiwgbGl2ZSApO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiggY2hpbGQgJiYgY2hpbGQuX18gKXtcclxuXHRcdFx0XHRtZS5hZGRQYXJlbnQoIGNoaWxkLCBmcm96ZW4gKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0ZnJvemVuWyBrZXkgXSA9IGNoaWxkO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0ZnJlZXplRm4oIGZyb3plbiApO1xyXG5cclxuXHRcdHJldHVybiBmcm96ZW47XHJcblx0fSxcclxuXHJcblx0dXBkYXRlOiBmdW5jdGlvbiggdHlwZSwgbm9kZSwgb3B0aW9ucyApe1xyXG5cdFx0aWYoICF0aGlzWyB0eXBlIF0pXHJcblx0XHRcdHJldHVybiBVdGlscy5lcnJvciggJ1Vua25vd24gdXBkYXRlIHR5cGU6ICcgKyB0eXBlICk7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXNbIHR5cGUgXSggbm9kZSwgb3B0aW9ucyApO1xyXG5cdH0sXHJcblxyXG5cdHJlc2V0OiBmdW5jdGlvbiggbm9kZSwgdmFsdWUgKXtcclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdF8gPSBub2RlLl9fLFxyXG5cdFx0XHRmcm96ZW5cclxuXHRcdDtcclxuXHJcblx0XHRpZiggdmFsdWUgJiYgdmFsdWUuX18gKXtcclxuXHRcdFx0ZnJvemVuID0gdmFsdWU7XHJcblx0XHRcdGZyb3plbi5fXy5saXN0ZW5lciA9IHZhbHVlLl9fLmxpc3RlbmVyO1xyXG5cdFx0XHRmcm96ZW4uX18ucGFyZW50cyA9IFtdO1xyXG5cclxuXHRcdFx0Ly8gU2V0IGJhY2sgdGhlIHBhcmVudCBvbiB0aGUgY2hpbGRyZW5cclxuXHRcdFx0Ly8gdGhhdCBoYXZlIGJlZW4gdXBkYXRlZFxyXG5cdFx0XHR0aGlzLmZpeENoaWxkcmVuKCBmcm96ZW4sIG5vZGUgKTtcclxuXHRcdFx0VXRpbHMuZWFjaCggZnJvemVuLCBmdW5jdGlvbiggY2hpbGQgKXtcclxuXHRcdFx0XHRpZiggY2hpbGQgJiYgY2hpbGQuX18gKXtcclxuXHRcdFx0XHRcdG1lLnJlbW92ZVBhcmVudCggbm9kZSApO1xyXG5cdFx0XHRcdFx0bWUuYWRkUGFyZW50KCBjaGlsZCwgZnJvemVuICk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRmcm96ZW4gPSB0aGlzLmZyZWV6ZSggbm9kZSwgXy5ub3RpZnksIF8uZnJlZXplRm4sIF8ubGl2ZSApO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBmcm96ZW47XHJcblx0fSxcclxuXHJcblx0bWVyZ2U6IGZ1bmN0aW9uKCBub2RlLCBhdHRycyApe1xyXG5cdFx0dmFyIF8gPSBub2RlLl9fLFxyXG5cdFx0XHR0cmFucyA9IF8udHJhbnMsXHJcblxyXG5cdFx0XHQvLyBDbG9uZSB0aGUgYXR0cnMgdG8gbm90IG1vZGlmeSB0aGUgYXJndW1lbnRcclxuXHRcdFx0YXR0cnMgPSBVdGlscy5leHRlbmQoIHt9LCBhdHRycylcclxuXHRcdDtcclxuXHJcblx0XHRpZiggdHJhbnMgKXtcclxuXHJcblx0XHRcdGZvciggdmFyIGF0dHIgaW4gYXR0cnMgKVxyXG5cdFx0XHRcdHRyYW5zWyBhdHRyIF0gPSBhdHRyc1sgYXR0ciBdO1xyXG5cdFx0XHRyZXR1cm4gbm9kZTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgbWUgPSB0aGlzLFxyXG5cdFx0XHRmcm96ZW4gPSB0aGlzLmNvcHlNZXRhKCBub2RlICksXHJcblx0XHRcdG5vdGlmeSA9IF8ubm90aWZ5LFxyXG5cdFx0XHR2YWwsIGNvbnMsIGtleSwgaXNGcm96ZW5cclxuXHRcdDtcclxuXHJcblx0XHRVdGlscy5lYWNoKCBub2RlLCBmdW5jdGlvbiggY2hpbGQsIGtleSApe1xyXG5cdFx0XHRpc0Zyb3plbiA9IGNoaWxkICYmIGNoaWxkLl9fO1xyXG5cclxuXHRcdFx0aWYoIGlzRnJvemVuICl7XHJcblx0XHRcdFx0bWUucmVtb3ZlUGFyZW50KCBjaGlsZCwgbm9kZSApO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHR2YWwgPSBhdHRyc1sga2V5IF07XHJcblx0XHRcdGlmKCAhdmFsICl7XHJcblx0XHRcdFx0aWYoIGlzRnJvemVuIClcclxuXHRcdFx0XHRcdG1lLmFkZFBhcmVudCggY2hpbGQsIGZyb3plbiApO1xyXG5cdFx0XHRcdHJldHVybiBmcm96ZW5bIGtleSBdID0gY2hpbGQ7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGNvbnMgPSB2YWwgJiYgdmFsLmNvbnN0cnVjdG9yO1xyXG5cclxuXHRcdFx0aWYoIGNvbnMgPT0gQXJyYXkgfHwgY29ucyA9PSBPYmplY3QgKVxyXG5cdFx0XHRcdHZhbCA9IG1lLmZyZWV6ZSggdmFsLCBub3RpZnksIF8uZnJlZXplRm4sIF8ubGl2ZSApO1xyXG5cclxuXHRcdFx0aWYoIHZhbCAmJiB2YWwuX18gKVxyXG5cdFx0XHRcdG1lLmFkZFBhcmVudCggdmFsLCBmcm96ZW4gKTtcclxuXHJcblx0XHRcdGRlbGV0ZSBhdHRyc1sga2V5IF07XHJcblxyXG5cdFx0XHRmcm96ZW5bIGtleSBdID0gdmFsO1xyXG5cdFx0fSk7XHJcblxyXG5cclxuXHRcdGZvcigga2V5IGluIGF0dHJzICkge1xyXG5cdFx0XHR2YWwgPSBhdHRyc1sga2V5IF07XHJcblx0XHRcdGNvbnMgPSB2YWwgJiYgdmFsLmNvbnN0cnVjdG9yO1xyXG5cclxuXHRcdFx0aWYoIGNvbnMgPT0gQXJyYXkgfHwgY29ucyA9PSBPYmplY3QgKVxyXG5cdFx0XHRcdHZhbCA9IG1lLmZyZWV6ZSggdmFsLCBub3RpZnksIF8uZnJlZXplRm4sIF8ubGl2ZSApO1xyXG5cclxuXHRcdFx0aWYoIHZhbCAmJiB2YWwuX18gKVxyXG5cdFx0XHRcdG1lLmFkZFBhcmVudCggdmFsLCBmcm96ZW4gKTtcclxuXHJcblx0XHRcdGZyb3plblsga2V5IF0gPSB2YWw7XHJcblx0XHR9XHJcblxyXG5cdFx0Xy5mcmVlemVGbiggZnJvemVuICk7XHJcblxyXG5cdFx0dGhpcy5yZWZyZXNoUGFyZW50cyggbm9kZSwgZnJvemVuICk7XHJcblxyXG5cdFx0cmV0dXJuIGZyb3plbjtcclxuXHR9LFxyXG5cclxuXHRyZXBsYWNlOiBmdW5jdGlvbiggbm9kZSwgcmVwbGFjZW1lbnQgKSB7XHJcblxyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0Y29ucyA9IHJlcGxhY2VtZW50ICYmIHJlcGxhY2VtZW50LmNvbnN0cnVjdG9yLFxyXG5cdFx0XHRfID0gbm9kZS5fXyxcclxuXHRcdFx0ZnJvemVuID0gcmVwbGFjZW1lbnRcclxuXHRcdDtcclxuXHJcblx0XHRpZiggY29ucyA9PSBBcnJheSB8fCBjb25zID09IE9iamVjdCApIHtcclxuXHJcblx0XHRcdGZyb3plbiA9IG1lLmZyZWV6ZSggcmVwbGFjZW1lbnQsIF8ubm90aWZ5LCBfLmZyZWV6ZUZuLCBfLmxpdmUgKTtcclxuXHJcblx0XHRcdGZyb3plbi5fXy5wYXJlbnRzID0gXy5wYXJlbnRzO1xyXG5cclxuXHRcdFx0Ly8gQWRkIHRoZSBjdXJyZW50IGxpc3RlbmVyIGlmIGV4aXN0cywgcmVwbGFjaW5nIGFcclxuXHRcdFx0Ly8gcHJldmlvdXMgbGlzdGVuZXIgaW4gdGhlIGZyb3plbiBpZiBleGlzdGVkXHJcblx0XHRcdGlmKCBfLmxpc3RlbmVyIClcclxuXHRcdFx0XHRmcm96ZW4uX18ubGlzdGVuZXIgPSBfLmxpc3RlbmVyO1xyXG5cclxuXHRcdFx0Ly8gU2luY2UgdGhlIHBhcmVudHMgd2lsbCBiZSByZWZyZXNoZWQgZGlyZWN0bHksXHJcblx0XHRcdC8vIFRyaWdnZXIgdGhlIGxpc3RlbmVyIGhlcmVcclxuXHRcdFx0aWYoIGZyb3plbi5fXy5saXN0ZW5lciApXHJcblx0XHRcdFx0dGhpcy50cmlnZ2VyKCBmcm96ZW4sICd1cGRhdGUnLCBmcm96ZW4gKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBSZWZyZXNoIHRoZSBwYXJlbnQgbm9kZXMgZGlyZWN0bHlcclxuXHRcdGlmKCAhXy5wYXJlbnRzLmxlbmd0aCAmJiBfLmxpc3RlbmVyICl7XHJcblx0XHRcdF8ubGlzdGVuZXIudHJpZ2dlciggJ2ltbWVkaWF0ZScsIG5vZGUsIGZyb3plbiApO1xyXG5cdFx0fVxyXG5cdFx0Zm9yICh2YXIgaSA9IF8ucGFyZW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG5cdFx0XHRpZiggaSA9PSAwICl7XHJcblx0XHRcdFx0dGhpcy5yZWZyZXNoKCBfLnBhcmVudHNbaV0sIG5vZGUsIGZyb3plbiwgZmFsc2UgKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNle1xyXG5cclxuXHRcdFx0XHR0aGlzLm1hcmtEaXJ0eSggXy5wYXJlbnRzW2ldLCBbbm9kZSwgZnJvemVuXSApO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gZnJvemVuO1xyXG5cdH0sXHJcblxyXG5cdHJlbW92ZTogZnVuY3Rpb24oIG5vZGUsIGF0dHJzICl7XHJcblx0XHR2YXIgdHJhbnMgPSBub2RlLl9fLnRyYW5zO1xyXG5cdFx0aWYoIHRyYW5zICl7XHJcblx0XHRcdGZvciggdmFyIGwgPSBhdHRycy5sZW5ndGggLSAxOyBsID49IDA7IGwtLSApXHJcblx0XHRcdFx0ZGVsZXRlIHRyYW5zWyBhdHRyc1tsXSBdO1xyXG5cdFx0XHRyZXR1cm4gbm9kZTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgbWUgPSB0aGlzLFxyXG5cdFx0XHRmcm96ZW4gPSB0aGlzLmNvcHlNZXRhKCBub2RlICksXHJcblx0XHRcdGlzRnJvemVuXHJcblx0XHQ7XHJcblxyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkLCBrZXkgKXtcclxuXHRcdFx0aXNGcm96ZW4gPSBjaGlsZCAmJiBjaGlsZC5fXztcclxuXHJcblx0XHRcdGlmKCBpc0Zyb3plbiApe1xyXG5cdFx0XHRcdG1lLnJlbW92ZVBhcmVudCggY2hpbGQsIG5vZGUgKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYoIGF0dHJzLmluZGV4T2YoIGtleSApICE9IC0xICl7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiggaXNGcm96ZW4gKVxyXG5cdFx0XHRcdG1lLmFkZFBhcmVudCggY2hpbGQsIGZyb3plbiApO1xyXG5cclxuXHRcdFx0ZnJvemVuWyBrZXkgXSA9IGNoaWxkO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0bm9kZS5fXy5mcmVlemVGbiggZnJvemVuICk7XHJcblx0XHR0aGlzLnJlZnJlc2hQYXJlbnRzKCBub2RlLCBmcm96ZW4gKTtcclxuXHJcblx0XHRyZXR1cm4gZnJvemVuO1xyXG5cdH0sXHJcblxyXG5cdHNwbGljZTogZnVuY3Rpb24oIG5vZGUsIGFyZ3MgKXtcclxuXHRcdHZhciBfID0gbm9kZS5fXyxcclxuXHRcdFx0dHJhbnMgPSBfLnRyYW5zXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIHRyYW5zICl7XHJcblx0XHRcdHRyYW5zLnNwbGljZS5hcHBseSggdHJhbnMsIGFyZ3MgKTtcclxuXHRcdFx0cmV0dXJuIG5vZGU7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0ZnJvemVuID0gdGhpcy5jb3B5TWV0YSggbm9kZSApLFxyXG5cdFx0XHRpbmRleCA9IGFyZ3NbMF0sXHJcblx0XHRcdGRlbGV0ZUluZGV4ID0gaW5kZXggKyBhcmdzWzFdLFxyXG5cdFx0XHRjb24sIGNoaWxkXHJcblx0XHQ7XHJcblxyXG5cdFx0Ly8gQ2xvbmUgdGhlIGFycmF5XHJcblx0XHRVdGlscy5lYWNoKCBub2RlLCBmdW5jdGlvbiggY2hpbGQsIGkgKXtcclxuXHJcblx0XHRcdGlmKCBjaGlsZCAmJiBjaGlsZC5fXyApe1xyXG5cdFx0XHRcdG1lLnJlbW92ZVBhcmVudCggY2hpbGQsIG5vZGUgKTtcclxuXHJcblx0XHRcdFx0Ly8gU2tpcCB0aGUgbm9kZXMgdG8gZGVsZXRlXHJcblx0XHRcdFx0aWYoIGkgPCBpbmRleCB8fCBpPj0gZGVsZXRlSW5kZXggKVxyXG5cdFx0XHRcdFx0bWUuYWRkUGFyZW50KCBjaGlsZCwgZnJvemVuICk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGZyb3plbltpXSA9IGNoaWxkO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0Ly8gUHJlcGFyZSB0aGUgbmV3IG5vZGVzXHJcblx0XHRpZiggYXJncy5sZW5ndGggPiAxICl7XHJcblx0XHRcdGZvciAodmFyIGkgPSBhcmdzLmxlbmd0aCAtIDE7IGkgPj0gMjsgaS0tKSB7XHJcblx0XHRcdFx0Y2hpbGQgPSBhcmdzW2ldO1xyXG5cdFx0XHRcdGNvbiA9IGNoaWxkICYmIGNoaWxkLmNvbnN0cnVjdG9yO1xyXG5cclxuXHRcdFx0XHRpZiggY29uID09IEFycmF5IHx8IGNvbiA9PSBPYmplY3QgKVxyXG5cdFx0XHRcdFx0Y2hpbGQgPSB0aGlzLmZyZWV6ZSggY2hpbGQsIF8ubm90aWZ5LCBfLmZyZWV6ZUZuLCBfLmxpdmUgKTtcclxuXHJcblx0XHRcdFx0aWYoIGNoaWxkICYmIGNoaWxkLl9fIClcclxuXHRcdFx0XHRcdHRoaXMuYWRkUGFyZW50KCBjaGlsZCwgZnJvemVuICk7XHJcblxyXG5cdFx0XHRcdGFyZ3NbaV0gPSBjaGlsZDtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdC8vIHNwbGljZVxyXG5cdFx0QXJyYXkucHJvdG90eXBlLnNwbGljZS5hcHBseSggZnJvemVuLCBhcmdzICk7XHJcblxyXG5cdFx0bm9kZS5fXy5mcmVlemVGbiggZnJvemVuICk7XHJcblx0XHR0aGlzLnJlZnJlc2hQYXJlbnRzKCBub2RlLCBmcm96ZW4gKTtcclxuXHJcblx0XHRyZXR1cm4gZnJvemVuO1xyXG5cdH0sXHJcblxyXG5cdHRyYW5zYWN0OiBmdW5jdGlvbiggbm9kZSApIHtcclxuXHRcdHZhciBtZSA9IHRoaXMsXHJcblx0XHRcdHRyYW5zYWN0aW5nID0gbm9kZS5fXy50cmFucyxcclxuXHRcdFx0dHJhbnNcclxuXHRcdDtcclxuXHJcblx0XHRpZiggdHJhbnNhY3RpbmcgKVxyXG5cdFx0XHRyZXR1cm4gdHJhbnNhY3Rpbmc7XHJcblxyXG5cdFx0dHJhbnMgPSBub2RlLmNvbnN0cnVjdG9yID09IEFycmF5ID8gW10gOiB7fTtcclxuXHJcblx0XHRVdGlscy5lYWNoKCBub2RlLCBmdW5jdGlvbiggY2hpbGQsIGtleSApe1xyXG5cdFx0XHR0cmFuc1sga2V5IF0gPSBjaGlsZDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdG5vZGUuX18udHJhbnMgPSB0cmFucztcclxuXHJcblx0XHQvLyBDYWxsIHJ1biBhdXRvbWF0aWNhbGx5IGluIGNhc2VcclxuXHRcdC8vIHRoZSB1c2VyIGZvcmdvdCBhYm91dCBpdFxyXG5cdFx0VXRpbHMubmV4dFRpY2soIGZ1bmN0aW9uKCl7XHJcblx0XHRcdGlmKCBub2RlLl9fLnRyYW5zIClcclxuXHRcdFx0XHRtZS5ydW4oIG5vZGUgKTtcclxuXHRcdH0pO1xyXG5cclxuXHRcdHJldHVybiB0cmFucztcclxuXHR9LFxyXG5cclxuXHRydW46IGZ1bmN0aW9uKCBub2RlICkge1xyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0dHJhbnMgPSBub2RlLl9fLnRyYW5zXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoICF0cmFucyApXHJcblx0XHRcdHJldHVybiBub2RlO1xyXG5cclxuXHRcdC8vIFJlbW92ZSB0aGUgbm9kZSBhcyBhIHBhcmVudFxyXG5cdFx0VXRpbHMuZWFjaCggdHJhbnMsIGZ1bmN0aW9uKCBjaGlsZCwga2V5ICl7XHJcblx0XHRcdGlmKCBjaGlsZCAmJiBjaGlsZC5fXyApe1xyXG5cdFx0XHRcdG1lLnJlbW92ZVBhcmVudCggY2hpbGQsIG5vZGUgKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblxyXG5cdFx0ZGVsZXRlIG5vZGUuX18udHJhbnM7XHJcblxyXG5cdFx0dmFyIHJlc3VsdCA9IHRoaXMucmVwbGFjZSggbm9kZSwgdHJhbnMgKTtcclxuXHRcdHJldHVybiByZXN1bHQ7XHJcblx0fSxcclxuXHJcblx0cmVmcmVzaDogZnVuY3Rpb24oIG5vZGUsIG9sZENoaWxkLCBuZXdDaGlsZCwgcmV0dXJuVXBkYXRlZCApe1xyXG5cdFx0dmFyIG1lID0gdGhpcyxcclxuXHRcdFx0dHJhbnMgPSBub2RlLl9fLnRyYW5zLFxyXG5cdFx0XHRmb3VuZCA9IDBcclxuXHRcdDtcclxuXHJcblx0XHRpZiggdHJhbnMgKXtcclxuXHJcblx0XHRcdFV0aWxzLmVhY2goIHRyYW5zLCBmdW5jdGlvbiggY2hpbGQsIGtleSApe1xyXG5cdFx0XHRcdGlmKCBmb3VuZCApIHJldHVybjtcclxuXHJcblx0XHRcdFx0aWYoIGNoaWxkID09PSBvbGRDaGlsZCApe1xyXG5cclxuXHRcdFx0XHRcdHRyYW5zWyBrZXkgXSA9IG5ld0NoaWxkO1xyXG5cdFx0XHRcdFx0Zm91bmQgPSAxO1xyXG5cclxuXHRcdFx0XHRcdGlmKCBuZXdDaGlsZCAmJiBuZXdDaGlsZC5fXyApXHJcblx0XHRcdFx0XHRcdG1lLmFkZFBhcmVudCggbmV3Q2hpbGQsIG5vZGUgKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cclxuXHRcdFx0cmV0dXJuIG5vZGU7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGZyb3plbiA9IHRoaXMuY29weU1ldGEoIG5vZGUgKSxcclxuXHRcdFx0ZGlydHkgPSBub2RlLl9fLmRpcnR5LFxyXG5cdFx0XHRkaXJ0LCByZXBsYWNlbWVudCwgX19cclxuXHRcdDtcclxuXHJcblx0XHRpZiggZGlydHkgKXtcclxuXHRcdFx0ZGlydCA9IGRpcnR5WzBdLFxyXG5cdFx0XHRyZXBsYWNlbWVudCA9IGRpcnR5WzFdXHJcblx0XHR9XHJcblxyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkLCBrZXkgKXtcclxuXHRcdFx0aWYoIGNoaWxkID09PSBvbGRDaGlsZCApe1xyXG5cdFx0XHRcdGNoaWxkID0gbmV3Q2hpbGQ7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZiggY2hpbGQgPT09IGRpcnQgKXtcclxuXHRcdFx0XHRjaGlsZCA9IHJlcGxhY2VtZW50O1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiggY2hpbGQgJiYgKF9fID0gY2hpbGQuX18pICl7XHJcblxyXG5cdFx0XHRcdC8vIElmIHRoZXJlIGlzIGEgdHJhbnMgaGFwcGVuaW5nIHdlXHJcblx0XHRcdFx0Ly8gZG9uJ3QgdXBkYXRlIGEgZGlydHkgbm9kZSBub3cuIFRoZSB1cGRhdGVcclxuXHRcdFx0XHQvLyB3aWxsIG9jY3VyIG9uIHJ1bi5cclxuXHRcdFx0XHRpZiggIV9fLnRyYW5zICYmIF9fLmRpcnR5ICl7XHJcblx0XHRcdFx0XHRjaGlsZCA9IG1lLnJlZnJlc2goIGNoaWxkLCBfXy5kaXJ0eVswXSwgX18uZGlydHlbMV0sIHRydWUgKTtcclxuXHRcdFx0XHR9XHJcblxyXG5cclxuXHRcdFx0XHRtZS5yZW1vdmVQYXJlbnQoIGNoaWxkLCBub2RlICk7XHJcblx0XHRcdFx0bWUuYWRkUGFyZW50KCBjaGlsZCwgZnJvemVuICk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGZyb3plblsga2V5IF0gPSBjaGlsZDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdG5vZGUuX18uZnJlZXplRm4oIGZyb3plbiApO1xyXG5cclxuXHRcdC8vIElmIHRoZSBub2RlIHdhcyBkaXJ0eSwgY2xlYW4gaXRcclxuXHRcdG5vZGUuX18uZGlydHkgPSBmYWxzZTtcclxuXHJcblx0XHRpZiggcmV0dXJuVXBkYXRlZCApXHJcblx0XHRcdHJldHVybiBmcm96ZW47XHJcblxyXG5cdFx0dGhpcy5yZWZyZXNoUGFyZW50cyggbm9kZSwgZnJvemVuICk7XHJcblx0fSxcclxuXHJcblx0Zml4Q2hpbGRyZW46IGZ1bmN0aW9uKCBub2RlLCBvbGROb2RlICl7XHJcblx0XHR2YXIgbWUgPSB0aGlzO1xyXG5cdFx0VXRpbHMuZWFjaCggbm9kZSwgZnVuY3Rpb24oIGNoaWxkICl7XHJcblx0XHRcdGlmKCAhY2hpbGQgfHwgIWNoaWxkLl9fIClcclxuXHRcdFx0XHRyZXR1cm47XHJcblxyXG5cdFx0XHQvLyBJZiB0aGUgY2hpbGQgaXMgbGlua2VkIHRvIHRoZSBub2RlLFxyXG5cdFx0XHQvLyBtYXliZSBpdHMgY2hpbGRyZW4gYXJlIG5vdCBsaW5rZWRcclxuXHRcdFx0aWYoIGNoaWxkLl9fLnBhcmVudHMuaW5kZXhPZiggbm9kZSApICE9IC0xIClcclxuXHRcdFx0XHRyZXR1cm4gbWUuZml4Q2hpbGRyZW4oIGNoaWxkICk7XHJcblxyXG5cdFx0XHQvLyBJZiB0aGUgY2hpbGQgd2Fzbid0IGxpbmtlZCBpdCBpcyBzdXJlXHJcblx0XHRcdC8vIHRoYXQgaXQgd2Fzbid0IG1vZGlmaWVkLiBKdXN0IGxpbmsgaXRcclxuXHRcdFx0Ly8gdG8gdGhlIG5ldyBwYXJlbnRcclxuXHRcdFx0aWYoIGNoaWxkLl9fLnBhcmVudHMubGVuZ3RoID09IDEgKVxyXG5cdFx0XHRcdHJldHVybiBjaGlsZC5fXy5wYXJlbnRzID0gWyBub2RlIF07XHJcblxyXG5cdFx0XHRpZiggb2xkTm9kZSApXHJcblx0XHRcdFx0bWUucmVtb3ZlUGFyZW50KCBjaGlsZCwgb2xkTm9kZSApO1xyXG5cclxuXHRcdFx0bWUuYWRkUGFyZW50KCBjaGlsZCwgbm9kZSApO1xyXG5cdFx0fSk7XHJcblx0fSxcclxuXHJcblx0Y29weU1ldGE6IGZ1bmN0aW9uKCBub2RlICl7XHJcblx0XHR2YXIgbWUgPSB0aGlzLFxyXG5cdFx0XHRmcm96ZW5cclxuXHRcdDtcclxuXHJcblx0XHRpZiggbm9kZS5jb25zdHJ1Y3RvciA9PSBBcnJheSApe1xyXG5cdFx0XHRmcm96ZW4gPSB0aGlzLmNyZWF0ZUFycmF5KCBub2RlLmxlbmd0aCApO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdGZyb3plbiA9IE9iamVjdC5jcmVhdGUoIE1peGlucy5IYXNoICk7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIF8gPSBub2RlLl9fO1xyXG5cclxuXHRcdFV0aWxzLmFkZE5FKCBmcm96ZW4sIHtfXzoge1xyXG5cdFx0XHRub3RpZnk6IF8ubm90aWZ5LFxyXG5cdFx0XHRsaXN0ZW5lcjogXy5saXN0ZW5lcixcclxuXHRcdFx0cGFyZW50czogXy5wYXJlbnRzLnNsaWNlKCAwICksXHJcblx0XHRcdHRyYW5zOiBfLnRyYW5zLFxyXG5cdFx0XHRkaXJ0eTogZmFsc2UsXHJcblx0XHRcdGZyZWV6ZUZuOiBfLmZyZWV6ZUZuXHJcblx0XHR9fSk7XHJcblxyXG5cdFx0cmV0dXJuIGZyb3plbjtcclxuXHR9LFxyXG5cclxuXHRyZWZyZXNoUGFyZW50czogZnVuY3Rpb24oIG9sZENoaWxkLCBuZXdDaGlsZCApe1xyXG5cdFx0dmFyIF8gPSBvbGRDaGlsZC5fXyxcclxuXHRcdFx0aVxyXG5cdFx0O1xyXG5cclxuXHRcdGlmKCBfLmxpc3RlbmVyIClcclxuXHRcdFx0dGhpcy50cmlnZ2VyKCBuZXdDaGlsZCwgJ3VwZGF0ZScsIG5ld0NoaWxkICk7XHJcblxyXG5cdFx0aWYoICFfLnBhcmVudHMubGVuZ3RoICl7XHJcblx0XHRcdGlmKCBfLmxpc3RlbmVyICl7XHJcblx0XHRcdFx0Xy5saXN0ZW5lci50cmlnZ2VyKCAnaW1tZWRpYXRlJywgb2xkQ2hpbGQsIG5ld0NoaWxkICk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRmb3IgKGkgPSBfLnBhcmVudHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuXHRcdFx0XHQvLyBJZiB0aGVyZSBpcyBtb3JlIHRoYW4gb25lIHBhcmVudCwgbWFyayBldmVyeW9uZSBhcyBkaXJ0eVxyXG5cdFx0XHRcdC8vIGJ1dCB0aGUgbGFzdCBpbiB0aGUgaXRlcmF0aW9uLCBhbmQgd2hlbiB0aGUgbGFzdCBpcyByZWZyZXNoZWRcclxuXHRcdFx0XHQvLyBpdCB3aWxsIHVwZGF0ZSB0aGUgZGlydHkgbm9kZXMuXHJcblx0XHRcdFx0aWYoIGkgPT0gMCApXHJcblx0XHRcdFx0XHR0aGlzLnJlZnJlc2goIF8ucGFyZW50c1tpXSwgb2xkQ2hpbGQsIG5ld0NoaWxkLCBmYWxzZSApO1xyXG5cdFx0XHRcdGVsc2V7XHJcblxyXG5cdFx0XHRcdFx0dGhpcy5tYXJrRGlydHkoIF8ucGFyZW50c1tpXSwgW29sZENoaWxkLCBuZXdDaGlsZF0gKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRtYXJrRGlydHk6IGZ1bmN0aW9uKCBub2RlLCBkaXJ0ICl7XHJcblx0XHR2YXIgXyA9IG5vZGUuX18sXHJcblx0XHRcdGlcclxuXHRcdDtcclxuXHRcdF8uZGlydHkgPSBkaXJ0O1xyXG5cclxuXHRcdC8vIElmIHRoZXJlIGlzIGEgdHJhbnNhY3Rpb24gaGFwcGVuaW5nIGluIHRoZSBub2RlXHJcblx0XHQvLyB1cGRhdGUgdGhlIHRyYW5zYWN0aW9uIGRhdGEgaW1tZWRpYXRlbHlcclxuXHRcdGlmKCBfLnRyYW5zIClcclxuXHRcdFx0dGhpcy5yZWZyZXNoKCBub2RlLCBkaXJ0WzBdLCBkaXJ0WzFdICk7XHJcblxyXG5cdFx0Zm9yICggaSA9IF8ucGFyZW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSApIHtcclxuXHJcblx0XHRcdHRoaXMubWFya0RpcnR5KCBfLnBhcmVudHNbaV0sIGRpcnQgKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRyZW1vdmVQYXJlbnQ6IGZ1bmN0aW9uKCBub2RlLCBwYXJlbnQgKXtcclxuXHRcdHZhciBwYXJlbnRzID0gbm9kZS5fXy5wYXJlbnRzLFxyXG5cdFx0XHRpbmRleCA9IHBhcmVudHMuaW5kZXhPZiggcGFyZW50IClcclxuXHRcdDtcclxuXHJcblx0XHRpZiggaW5kZXggIT0gLTEgKXtcclxuXHRcdFx0cGFyZW50cy5zcGxpY2UoIGluZGV4LCAxICk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0YWRkUGFyZW50OiBmdW5jdGlvbiggbm9kZSwgcGFyZW50ICl7XHJcblx0XHR2YXIgcGFyZW50cyA9IG5vZGUuX18ucGFyZW50cyxcclxuXHRcdFx0aW5kZXggPSBwYXJlbnRzLmluZGV4T2YoIHBhcmVudCApXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIGluZGV4ID09IC0xICl7XHJcblx0XHRcdHBhcmVudHNbIHBhcmVudHMubGVuZ3RoIF0gPSBwYXJlbnQ7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0dHJpZ2dlcjogZnVuY3Rpb24oIG5vZGUsIGV2ZW50TmFtZSwgcGFyYW0gKXtcclxuXHRcdHZhciBsaXN0ZW5lciA9IG5vZGUuX18ubGlzdGVuZXIsXHJcblx0XHRcdHRpY2tpbmcgPSBsaXN0ZW5lci50aWNraW5nXHJcblx0XHQ7XHJcblxyXG5cdFx0bGlzdGVuZXIudGlja2luZyA9IHBhcmFtO1xyXG5cdFx0aWYoICF0aWNraW5nICl7XHJcblx0XHRcdFV0aWxzLm5leHRUaWNrKCBmdW5jdGlvbigpe1xyXG5cdFx0XHRcdHZhciB1cGRhdGVkID0gbGlzdGVuZXIudGlja2luZztcclxuXHRcdFx0XHRsaXN0ZW5lci50aWNraW5nID0gZmFsc2U7XHJcblx0XHRcdFx0bGlzdGVuZXIudHJpZ2dlciggZXZlbnROYW1lLCB1cGRhdGVkICk7XHJcblx0XHRcdH0pO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGNyZWF0ZUxpc3RlbmVyOiBmdW5jdGlvbiggZnJvemVuICl7XHJcblx0XHR2YXIgbCA9IGZyb3plbi5fXy5saXN0ZW5lcjtcclxuXHJcblx0XHRpZiggIWwgKSB7XHJcblx0XHRcdGwgPSBPYmplY3QuY3JlYXRlKEVtaXR0ZXIsIHtcclxuXHRcdFx0XHRfZXZlbnRzOiB7XHJcblx0XHRcdFx0XHR2YWx1ZToge30sXHJcblx0XHRcdFx0XHR3cml0YWJsZTogdHJ1ZVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSk7XHJcblxyXG5cdFx0XHRmcm96ZW4uX18ubGlzdGVuZXIgPSBsO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBsO1xyXG5cdH0sXHJcblxyXG5cdGNyZWF0ZUFycmF5OiAoZnVuY3Rpb24oKXtcclxuXHRcdC8vIFNldCBjcmVhdGVBcnJheSBtZXRob2RcclxuXHRcdGlmKCBbXS5fX3Byb3RvX18gKVxyXG5cdFx0XHRyZXR1cm4gZnVuY3Rpb24oIGxlbmd0aCApe1xyXG5cdFx0XHRcdHZhciBhcnIgPSBuZXcgQXJyYXkoIGxlbmd0aCApO1xyXG5cdFx0XHRcdGFyci5fX3Byb3RvX18gPSBNaXhpbnMuTGlzdDtcclxuXHRcdFx0XHRyZXR1cm4gYXJyO1xyXG5cdFx0XHR9XHJcblx0XHRyZXR1cm4gZnVuY3Rpb24oIGxlbmd0aCApe1xyXG5cdFx0XHR2YXIgYXJyID0gbmV3IEFycmF5KCBsZW5ndGggKSxcclxuXHRcdFx0XHRtZXRob2RzID0gTWl4aW5zLmFycmF5TWV0aG9kc1xyXG5cdFx0XHQ7XHJcblx0XHRcdGZvciggdmFyIG0gaW4gbWV0aG9kcyApe1xyXG5cdFx0XHRcdGFyclsgbSBdID0gbWV0aG9kc1sgbSBdO1xyXG5cdFx0XHR9XHJcblx0XHRcdHJldHVybiBhcnI7XHJcblx0XHR9XHJcblx0fSkoKVxyXG59O1xyXG4vLyNidWlsZFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBGcm96ZW47XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBVdGlscyA9IHJlcXVpcmUoICcuL3V0aWxzLmpzJyApO1xyXG5cclxuLy8jYnVpbGRcclxuXHJcbi8qKlxyXG4gKiBDcmVhdGVzIG5vbi1lbnVtZXJhYmxlIHByb3BlcnR5IGRlc2NyaXB0b3JzLCB0byBiZSB1c2VkIGJ5IE9iamVjdC5jcmVhdGUuXHJcbiAqIEBwYXJhbSAge09iamVjdH0gYXR0cnMgUHJvcGVydGllcyB0byBjcmVhdGUgZGVzY3JpcHRvcnNcclxuICogQHJldHVybiB7T2JqZWN0fSAgICAgICBBIGhhc2ggd2l0aCB0aGUgZGVzY3JpcHRvcnMuXHJcbiAqL1xyXG52YXIgY3JlYXRlTkUgPSBmdW5jdGlvbiggYXR0cnMgKXtcclxuXHR2YXIgbmUgPSB7fTtcclxuXHJcblx0Zm9yKCB2YXIga2V5IGluIGF0dHJzICl7XHJcblx0XHRuZVsga2V5IF0gPSB7XHJcblx0XHRcdHdyaXRhYmxlOiB0cnVlLFxyXG5cdFx0XHRjb25maWd1cmFibGU6IHRydWUsXHJcblx0XHRcdGVudW1lcmFibGU6IGZhbHNlLFxyXG5cdFx0XHR2YWx1ZTogYXR0cnNbIGtleV1cclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHJldHVybiBuZTtcclxufVxyXG5cclxudmFyIGNvbW1vbk1ldGhvZHMgPSB7XHJcblx0c2V0OiBmdW5jdGlvbiggYXR0ciwgdmFsdWUgKXtcclxuXHRcdHZhciBhdHRycyA9IGF0dHIsXHJcblx0XHRcdHVwZGF0ZSA9IHRoaXMuX18udHJhbnNcclxuXHRcdDtcclxuXHJcblx0XHRpZiggdHlwZW9mIHZhbHVlICE9ICd1bmRlZmluZWQnICl7XHJcblx0XHRcdGF0dHJzID0ge307XHJcblx0XHRcdGF0dHJzWyBhdHRyIF0gPSB2YWx1ZTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiggIXVwZGF0ZSApe1xyXG5cdFx0XHRmb3IoIHZhciBrZXkgaW4gYXR0cnMgKXtcclxuXHRcdFx0XHR1cGRhdGUgPSB1cGRhdGUgfHwgdGhpc1sga2V5IF0gIT0gYXR0cnNbIGtleSBdO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHQvLyBObyBjaGFuZ2VzLCBqdXN0IHJldHVybiB0aGUgbm9kZVxyXG5cdFx0XHRpZiggIXVwZGF0ZSApXHJcblx0XHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAnbWVyZ2UnLCB0aGlzLCBhdHRycyApO1xyXG5cdH0sXHJcblxyXG5cdHJlc2V0OiBmdW5jdGlvbiggYXR0cnMgKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdyZXBsYWNlJywgdGhpcywgYXR0cnMgKTtcclxuXHR9LFxyXG5cclxuXHRnZXRMaXN0ZW5lcjogZnVuY3Rpb24oKXtcclxuXHRcdHJldHVybiB0aGlzLl9fLm5vdGlmeSggJ2xpc3RlbmVyJywgdGhpcyApO1xyXG5cdH0sXHJcblxyXG5cdHRvSlM6IGZ1bmN0aW9uKCl7XHJcblx0XHR2YXIganM7XHJcblx0XHRpZiggdGhpcy5jb25zdHJ1Y3RvciA9PSBBcnJheSApe1xyXG5cdFx0XHRqcyA9IG5ldyBBcnJheSggdGhpcy5sZW5ndGggKTtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRqcyA9IHt9O1xyXG5cdFx0fVxyXG5cclxuXHRcdFV0aWxzLmVhY2goIHRoaXMsIGZ1bmN0aW9uKCBjaGlsZCwgaSApe1xyXG5cdFx0XHRpZiggY2hpbGQgJiYgY2hpbGQuX18gKVxyXG5cdFx0XHRcdGpzWyBpIF0gPSBjaGlsZC50b0pTKCk7XHJcblx0XHRcdGVsc2VcclxuXHRcdFx0XHRqc1sgaSBdID0gY2hpbGQ7XHJcblx0XHR9KTtcclxuXHJcblx0XHRyZXR1cm4ganM7XHJcblx0fSxcclxuXHJcblx0dHJhbnNhY3Q6IGZ1bmN0aW9uKCl7XHJcblx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICd0cmFuc2FjdCcsIHRoaXMgKTtcclxuXHR9LFxyXG5cdHJ1bjogZnVuY3Rpb24oKXtcclxuXHRcdHJldHVybiB0aGlzLl9fLm5vdGlmeSggJ3J1bicsIHRoaXMgKTtcclxuXHR9XHJcbn07XHJcblxyXG52YXIgYXJyYXlNZXRob2RzID0gVXRpbHMuZXh0ZW5kKHtcclxuXHRwdXNoOiBmdW5jdGlvbiggZWwgKXtcclxuXHRcdHJldHVybiB0aGlzLmFwcGVuZCggW2VsXSApO1xyXG5cdH0sXHJcblxyXG5cdGFwcGVuZDogZnVuY3Rpb24oIGVscyApe1xyXG5cdFx0aWYoIGVscyAmJiBlbHMubGVuZ3RoIClcclxuXHRcdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAnc3BsaWNlJywgdGhpcywgW3RoaXMubGVuZ3RoLCAwXS5jb25jYXQoIGVscyApICk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRwb3A6IGZ1bmN0aW9uKCl7XHJcblx0XHRpZiggIXRoaXMubGVuZ3RoIClcclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuX18ubm90aWZ5KCAnc3BsaWNlJywgdGhpcywgW3RoaXMubGVuZ3RoIC0xLCAxXSApO1xyXG5cdH0sXHJcblxyXG5cdHVuc2hpZnQ6IGZ1bmN0aW9uKCBlbCApe1xyXG5cdFx0cmV0dXJuIHRoaXMucHJlcGVuZCggW2VsXSApO1xyXG5cdH0sXHJcblxyXG5cdHByZXBlbmQ6IGZ1bmN0aW9uKCBlbHMgKXtcclxuXHRcdGlmKCBlbHMgJiYgZWxzLmxlbmd0aCApXHJcblx0XHRcdHJldHVybiB0aGlzLl9fLm5vdGlmeSggJ3NwbGljZScsIHRoaXMsIFswLCAwXS5jb25jYXQoIGVscyApICk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzaGlmdDogZnVuY3Rpb24oKXtcclxuXHRcdGlmKCAhdGhpcy5sZW5ndGggKVxyXG5cdFx0XHRyZXR1cm4gdGhpcztcclxuXHJcblx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdzcGxpY2UnLCB0aGlzLCBbMCwgMV0gKTtcclxuXHR9LFxyXG5cclxuXHRzcGxpY2U6IGZ1bmN0aW9uKCBpbmRleCwgdG9SZW1vdmUsIHRvQWRkICl7XHJcblx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdzcGxpY2UnLCB0aGlzLCBhcmd1bWVudHMgKTtcclxuXHR9XHJcbn0sIGNvbW1vbk1ldGhvZHMgKTtcclxuXHJcbnZhciBGcm96ZW5BcnJheSA9IE9iamVjdC5jcmVhdGUoIEFycmF5LnByb3RvdHlwZSwgY3JlYXRlTkUoIGFycmF5TWV0aG9kcyApICk7XHJcblxyXG52YXIgTWl4aW5zID0ge1xyXG5cclxuSGFzaDogT2JqZWN0LmNyZWF0ZSggT2JqZWN0LnByb3RvdHlwZSwgY3JlYXRlTkUoIFV0aWxzLmV4dGVuZCh7XHJcblx0cmVtb3ZlOiBmdW5jdGlvbigga2V5cyApe1xyXG5cdFx0dmFyIGZpbHRlcmVkID0gW10sXHJcblx0XHRcdGsgPSBrZXlzXHJcblx0XHQ7XHJcblxyXG5cdFx0aWYoIGtleXMuY29uc3RydWN0b3IgIT0gQXJyYXkgKVxyXG5cdFx0XHRrID0gWyBrZXlzIF07XHJcblxyXG5cdFx0Zm9yKCB2YXIgaSA9IDAsIGwgPSBrLmxlbmd0aDsgaTxsOyBpKysgKXtcclxuXHRcdFx0aWYoIHRoaXMuaGFzT3duUHJvcGVydHkoIGtbaV0gKSApXHJcblx0XHRcdFx0ZmlsdGVyZWQucHVzaCgga1tpXSApO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmKCBmaWx0ZXJlZC5sZW5ndGggKVxyXG5cdFx0XHRyZXR1cm4gdGhpcy5fXy5ub3RpZnkoICdyZW1vdmUnLCB0aGlzLCBmaWx0ZXJlZCApO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fVxyXG59LCBjb21tb25NZXRob2RzKSkpLFxyXG5cclxuTGlzdDogRnJvemVuQXJyYXksXHJcbmFycmF5TWV0aG9kczogYXJyYXlNZXRob2RzXHJcbn07XHJcbi8vI2J1aWxkXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE1peGluczsiLCIndXNlIHN0cmljdCc7XG5cbi8vI2J1aWxkXG52YXIgZ2xvYmFsID0gKG5ldyBGdW5jdGlvbihcInJldHVybiB0aGlzXCIpKCkpO1xuXG52YXIgVXRpbHMgPSB7XG5cdGV4dGVuZDogZnVuY3Rpb24oIG9iLCBwcm9wcyApe1xuXHRcdGZvciggdmFyIHAgaW4gcHJvcHMgKXtcblx0XHRcdG9iW3BdID0gcHJvcHNbcF07XG5cdFx0fVxuXHRcdHJldHVybiBvYjtcblx0fSxcblxuXHRjcmVhdGVOb25FbnVtZXJhYmxlOiBmdW5jdGlvbiggb2JqLCBwcm90byApe1xuXHRcdHZhciBuZSA9IHt9O1xuXHRcdGZvciggdmFyIGtleSBpbiBvYmogKVxuXHRcdFx0bmVba2V5XSA9IHt2YWx1ZTogb2JqW2tleV0gfTtcblx0XHRyZXR1cm4gT2JqZWN0LmNyZWF0ZSggcHJvdG8gfHwge30sIG5lICk7XG5cdH0sXG5cblx0ZXJyb3I6IGZ1bmN0aW9uKCBtZXNzYWdlICl7XG5cdFx0dmFyIGVyciA9IG5ldyBFcnJvciggbWVzc2FnZSApO1xuXHRcdGlmKCBjb25zb2xlIClcblx0XHRcdHJldHVybiBjb25zb2xlLmVycm9yKCBlcnIgKTtcblx0XHRlbHNlXG5cdFx0XHR0aHJvdyBlcnI7XG5cdH0sXG5cblx0ZWFjaDogZnVuY3Rpb24oIG8sIGNsYmsgKXtcblx0XHR2YXIgaSxsLGtleXM7XG5cdFx0aWYoIG8gJiYgby5jb25zdHJ1Y3RvciA9PSBBcnJheSApe1xuXHRcdFx0Zm9yIChpID0gMCwgbCA9IG8ubGVuZ3RoOyBpIDwgbDsgaSsrKVxuXHRcdFx0XHRjbGJrKCBvW2ldLCBpICk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0a2V5cyA9IE9iamVjdC5rZXlzKCBvICk7XG5cdFx0XHRmb3IoIGkgPSAwLCBsID0ga2V5cy5sZW5ndGg7IGkgPCBsOyBpKysgKVxuXHRcdFx0XHRjbGJrKCBvWyBrZXlzW2ldIF0sIGtleXNbaV0gKTtcblx0XHR9XG5cdH0sXG5cblx0YWRkTkU6IGZ1bmN0aW9uKCBub2RlLCBhdHRycyApe1xuXHRcdGZvciggdmFyIGtleSBpbiBhdHRycyApe1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KCBub2RlLCBrZXksIHtcblx0XHRcdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0XHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZSxcblx0XHRcdFx0d3JpdGFibGU6IHRydWUsXG5cdFx0XHRcdHZhbHVlOiBhdHRyc1sga2V5IF1cblx0XHRcdH0pO1xuXHRcdH1cblx0fSxcblxuXHQvLyBuZXh0VGljayAtIGJ5IHN0YWdhcyAvIHB1YmxpYyBkb21haW5cbiAgXHRuZXh0VGljazogKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBxdWV1ZSA9IFtdLFxuXHRcdFx0ZGlydHkgPSBmYWxzZSxcblx0XHRcdGZuLFxuXHRcdFx0aGFzUG9zdE1lc3NhZ2UgPSAhIWdsb2JhbC5wb3N0TWVzc2FnZSxcblx0XHRcdG1lc3NhZ2VOYW1lID0gJ25leHR0aWNrJyxcblx0XHRcdHRyaWdnZXIgPSAoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gaGFzUG9zdE1lc3NhZ2Vcblx0XHRcdFx0XHQ/IGZ1bmN0aW9uIHRyaWdnZXIgKCkge1xuXHRcdFx0XHRcdGdsb2JhbC5wb3N0TWVzc2FnZShtZXNzYWdlTmFtZSwgJyonKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQ6IGZ1bmN0aW9uIHRyaWdnZXIgKCkge1xuXHRcdFx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyBwcm9jZXNzUXVldWUoKSB9LCAwKTtcblx0XHRcdFx0fTtcblx0XHRcdH0oKSksXG5cdFx0XHRwcm9jZXNzUXVldWUgPSAoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gaGFzUG9zdE1lc3NhZ2Vcblx0XHRcdFx0XHQ/IGZ1bmN0aW9uIHByb2Nlc3NRdWV1ZSAoZXZlbnQpIHtcblx0XHRcdFx0XHRcdGlmIChldmVudC5zb3VyY2UgPT09IGdsb2JhbCAmJiBldmVudC5kYXRhID09PSBtZXNzYWdlTmFtZSkge1xuXHRcdFx0XHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRcdFx0Zmx1c2hRdWV1ZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQ6IGZsdXNoUXVldWU7XG4gICAgICBcdH0pKClcbiAgICAgIDtcblxuICAgICAgZnVuY3Rpb24gZmx1c2hRdWV1ZSAoKSB7XG4gICAgICAgICAgd2hpbGUgKGZuID0gcXVldWUuc2hpZnQoKSkge1xuICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBkaXJ0eSA9IGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBuZXh0VGljayAoZm4pIHtcbiAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICBpZiAoZGlydHkpIHJldHVybjtcbiAgICAgICAgICBkaXJ0eSA9IHRydWU7XG4gICAgICAgICAgdHJpZ2dlcigpO1xuICAgICAgfVxuXG4gICAgICBpZiAoaGFzUG9zdE1lc3NhZ2UpIGdsb2JhbC5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgcHJvY2Vzc1F1ZXVlLCB0cnVlKTtcblxuICAgICAgbmV4dFRpY2sucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZ2xvYmFsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBwcm9jZXNzUXVldWUsIHRydWUpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbmV4dFRpY2s7XG4gIH0pKClcbn07XG4vLyNidWlsZFxuXG5cbm1vZHVsZS5leHBvcnRzID0gVXRpbHM7IiwiZXhwb3J0IGNsYXNzIEFjdGlvbiB7XG4gIGNvbnN0cnVjdG9yKGFyZ3MpIHtcbiAgICBjb25zdCBbc3RvcmUsIHN0b3JlcywgYWxsU3RvcmVzXSA9IFthcmdzLnN0b3JlLCBhcmdzLnN0b3JlcywgW11dO1xuICAgIHRoaXMubmFtZSA9IGFyZ3MubmFtZTtcblxuICAgIGlmIChzdG9yZSkgYWxsU3RvcmVzLnB1c2goc3RvcmUpO1xuICAgIGlmIChzdG9yZXMpIGFsbFN0b3Jlcy5wdXNoLmFwcGx5KGFsbFN0b3Jlcywgc3RvcmVzKTtcblxuICAgIHRoaXMuc3RvcmVzID0gYWxsU3RvcmVzO1xuICB9XG5cbiAgcnVuKC4uLmFyZ3MpIHtcbiAgICBjb25zdCBzdG9yZXNDeWNsZXMgPSB0aGlzLnN0b3Jlcy5tYXAoc3RvcmUgPT5cbiAgICAgIHN0b3JlLnJ1bkN5Y2xlLmFwcGx5KHN0b3JlLCBbdGhpcy5uYW1lXS5jb25jYXQoYXJncykpXG4gICAgKTtcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoc3RvcmVzQ3ljbGVzKTtcbiAgfVxuXG4gIGFkZFN0b3JlKHN0b3JlKSB7XG4gICAgdGhpcy5zdG9yZXMucHVzaChzdG9yZSk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEFjdGlvbnMge1xuICBjb25zdHJ1Y3RvcihhY3Rpb25zKSB7XG4gICAgdGhpcy5hbGwgPSBbXTtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShhY3Rpb25zKSkge1xuICAgICAgYWN0aW9ucy5mb3JFYWNoKChhY3Rpb24gPT4gdGhpcy5hZGRBY3Rpb24oYWN0aW9uKSksIHRoaXMpO1xuICAgIH1cbiAgfVxuXG4gIGFkZEFjdGlvbihpdGVtLCBub092ZXJyaWRlKSB7XG4gICAgY29uc3QgYWN0aW9uID0gbm9PdmVycmlkZSA/IGZhbHNlIDogdGhpcy5kZXRlY3RBY3Rpb24oaXRlbSk7XG4gICAgaWYgKCFub092ZXJyaWRlKSB7XG4gICAgICBsZXQgb2xkID0gdGhpc1thY3Rpb24ubmFtZV07XG4gICAgICBpZiAob2xkKSB0aGlzLnJlbW92ZUFjdGlvbihvbGQpO1xuICAgICAgdGhpcy5hbGwucHVzaChhY3Rpb24pO1xuICAgICAgdGhpc1thY3Rpb24ubmFtZV0gPSBhY3Rpb24ucnVuLmJpbmQoYWN0aW9uKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYWN0aW9uO1xuICB9XG5cbiAgcmVtb3ZlQWN0aW9uKGl0ZW0pIHtcbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmRldGVjdEFjdGlvbihpdGVtLCB0cnVlKTtcbiAgICBjb25zdCBpbmRleCA9IHRoaXMuYWxsLmluZGV4T2YoYWN0aW9uKTtcbiAgICBpZiAoaW5kZXggIT09IC0xKSB0aGlzLmFsbC5zcGxpY2UoaW5kZXgsIDEpO1xuICAgIGRlbGV0ZSB0aGlzW2FjdGlvbi5uYW1lXTtcbiAgfVxuXG4gIGFkZFN0b3JlKHN0b3JlKSB7XG4gICAgdGhpcy5hbGwuZm9yRWFjaChhY3Rpb24gPT4gYWN0aW9uLmFkZFN0b3JlKHN0b3JlKSk7XG4gIH1cblxuICBkZXRlY3RBY3Rpb24oYWN0aW9uLCBpc09sZCkge1xuICAgIGlmIChhY3Rpb24uY29uc3RydWN0b3IgPT09IEFjdGlvbikge1xuICAgICAgcmV0dXJuIGFjdGlvbjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBhY3Rpb24gPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gKGlzT2xkKSA/IHRoaXNbYWN0aW9uXSA6IG5ldyBBY3Rpb24oe25hbWU6IGFjdGlvbn0pO1xuICAgIH1cbiAgfVxufVxuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBfaW50ZXJvcFJlcXVpcmUgPSBmdW5jdGlvbiAob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmpbXCJkZWZhdWx0XCJdIDogb2JqOyB9O1xuXG5leHBvcnRzLmNyZWF0ZVZpZXcgPSBjcmVhdGVWaWV3O1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcblxudmFyIFJlYWN0ID0gX2ludGVyb3BSZXF1aXJlKCh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydSZWFjdCddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnUmVhY3QnXSA6IG51bGwpKTtcblxudmFyIFJlYWN0Um91dGVyID0gX2ludGVyb3BSZXF1aXJlKCh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydSZWFjdFJvdXRlciddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnUmVhY3RSb3V0ZXInXSA6IG51bGwpKTtcblxuZnVuY3Rpb24gZ2V0Um91dGVyKCkge1xuICB2YXIgUm91dGVyID0ge307XG4gIGlmICh0eXBlb2YgUmVhY3RSb3V0ZXIgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICB2YXIgcm91dGVyRWxlbWVudHMgPSBbXCJSb3V0ZVwiLCBcIkRlZmF1bHRSb3V0ZVwiLCBcIlJvdXRlSGFuZGxlclwiLCBcIkFjdGl2ZUhhbmRsZXJcIiwgXCJOb3RGb3VuZFJvdXRlXCIsIFwiTGlua1wiLCBcIlJlZGlyZWN0XCJdLFxuICAgICAgICByb3V0ZXJNaXhpbnMgPSBbXCJOYXZpZ2F0aW9uXCIsIFwiU3RhdGVcIl0sXG4gICAgICAgIHJvdXRlckZ1bmN0aW9ucyA9IFtcImNyZWF0ZVwiLCBcImNyZWF0ZURlZmF1bHRSb3V0ZVwiLCBcImNyZWF0ZU5vdEZvdW5kUm91dGVcIiwgXCJjcmVhdGVSZWRpcmVjdFwiLCBcImNyZWF0ZVJvdXRlXCIsIFwiY3JlYXRlUm91dGVzRnJvbVJlYWN0Q2hpbGRyZW5cIiwgXCJydW5cIl0sXG4gICAgICAgIHJvdXRlck9iamVjdHMgPSBbXCJIYXNoTG9jYXRpb25cIiwgXCJIaXN0b3J5XCIsIFwiSGlzdG9yeUxvY2F0aW9uXCIsIFwiUmVmcmVzaExvY2F0aW9uXCIsIFwiU3RhdGljTG9jYXRpb25cIiwgXCJUZXN0TG9jYXRpb25cIiwgXCJJbWl0YXRlQnJvd3NlckJlaGF2aW9yXCIsIFwiU2Nyb2xsVG9Ub3BCZWhhdmlvclwiXSxcbiAgICAgICAgY29waWVkSXRlbXMgPSByb3V0ZXJNaXhpbnMuY29uY2F0KHJvdXRlckZ1bmN0aW9ucykuY29uY2F0KHJvdXRlck9iamVjdHMpO1xuXG4gICAgcm91dGVyRWxlbWVudHMuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgUm91dGVyW25hbWVdID0gUmVhY3QuY3JlYXRlRWxlbWVudC5iaW5kKFJlYWN0LCBSZWFjdFJvdXRlcltuYW1lXSk7XG4gICAgfSk7XG5cbiAgICBjb3BpZWRJdGVtcy5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBSb3V0ZXJbbmFtZV0gPSBSZWFjdFJvdXRlcltuYW1lXTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gUm91dGVyO1xufVxuXG5mdW5jdGlvbiBnZXRET00oKSB7XG4gIHZhciBET01IZWxwZXJzID0ge307XG5cbiAgaWYgKHR5cGVvZiBSZWFjdCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHZhciB0YWcgPSBmdW5jdGlvbiB0YWcobmFtZSkge1xuICAgICAgZm9yICh2YXIgX2xlbiA9IGFyZ3VtZW50cy5sZW5ndGgsIGFyZ3MgPSBBcnJheShfbGVuID4gMSA/IF9sZW4gLSAxIDogMCksIF9rZXkgPSAxOyBfa2V5IDwgX2xlbjsgX2tleSsrKSB7XG4gICAgICAgIGFyZ3NbX2tleSAtIDFdID0gYXJndW1lbnRzW19rZXldO1xuICAgICAgfVxuXG4gICAgICB2YXIgYXR0cmlidXRlcyA9IHVuZGVmaW5lZDtcbiAgICAgIHZhciBmaXJzdCA9IGFyZ3NbMF0gJiYgYXJnc1swXS5jb25zdHJ1Y3RvcjtcbiAgICAgIGlmIChmaXJzdCA9PT0gT2JqZWN0KSB7XG4gICAgICAgIGF0dHJpYnV0ZXMgPSBhcmdzLnNoaWZ0KCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhdHRyaWJ1dGVzID0ge307XG4gICAgICB9XG4gICAgICByZXR1cm4gUmVhY3QuRE9NW25hbWVdLmFwcGx5KFJlYWN0LkRPTSwgW2F0dHJpYnV0ZXNdLmNvbmNhdChhcmdzKSk7XG4gICAgfTtcblxuICAgIGZvciAodmFyIHRhZ05hbWUgaW4gUmVhY3QuRE9NKSB7XG4gICAgICBET01IZWxwZXJzW3RhZ05hbWVdID0gdGFnLmJpbmQodGhpcywgdGFnTmFtZSk7XG4gICAgfVxuXG4gICAgRE9NSGVscGVycy5zcGFjZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBSZWFjdC5ET00uc3Bhbih7XG4gICAgICAgIGRhbmdlcm91c2x5U2V0SW5uZXJIVE1MOiB7XG4gICAgICAgICAgX19odG1sOiBcIiZuYnNwO1wiXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH07XG4gIH1cbiAgcmV0dXJuIERPTUhlbHBlcnM7XG59XG5cbnZhciBSb3V0ZXIgPSBnZXRSb3V0ZXIoKTtcbmV4cG9ydHMuUm91dGVyID0gUm91dGVyO1xudmFyIERPTSA9IGdldERPTSgpO1xuXG5leHBvcnRzLkRPTSA9IERPTTtcblxuZnVuY3Rpb24gY3JlYXRlVmlldyhjbGFzc0FyZ3MpIHtcbiAgdmFyIFJlYWN0Q2xhc3MgPSBSZWFjdC5jcmVhdGVDbGFzcyhjbGFzc0FyZ3MpO1xuICB2YXIgUmVhY3RFbGVtZW50ID0gUmVhY3QuY3JlYXRlRWxlbWVudC5iaW5kKFJlYWN0LmNyZWF0ZUVsZW1lbnQsIFJlYWN0Q2xhc3MpO1xuICByZXR1cm4gUmVhY3RFbGVtZW50O1xufVxuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSlcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWRhdGE6YXBwbGljYXRpb24vanNvbjtjaGFyc2V0OnV0Zi04O2Jhc2U2NCxleUoyWlhKemFXOXVJam96TENKemIzVnlZMlZ6SWpwYklpOVZjMlZ5Y3k5MmIyeHZaSGx0ZVhJdlYyOXlheTlvWld4c2VXVmhhQzlsZUdsdEwzTnlZeTlFVDAxSVpXeHdaWEp6TG1weklsMHNJbTVoYldWeklqcGJYU3dpYldGd2NHbHVaM01pT2lJN096czdPMUZCZDBSblFpeFZRVUZWTEVkQlFWWXNWVUZCVlRzN096czdTVUY0Ukc1Q0xFdEJRVXNzTWtKQlFVMHNUMEZCVHpzN1NVRkRiRUlzVjBGQlZ5d3lRa0ZCVFN4alFVRmpPenRCUVVWMFF5eFRRVUZUTEZOQlFWTXNSMEZCU1R0QlFVTndRaXhOUVVGTkxFMUJRVTBzUjBGQlJ5eEZRVUZGTEVOQlFVTTdRVUZEYkVJc1RVRkJTU3hQUVVGUExGZEJRVmNzUzBGQlN5eFhRVUZYTEVWQlFVVTdRVUZEZEVNc1VVRkJTU3hqUVVGakxFZEJRVWNzUTBGQlF5eFBRVUZQTEVWQlFVVXNZMEZCWXl4RlFVRkZMR05CUVdNc1JVRkJSU3hsUVVGbExFVkJRVVVzWlVGQlpTeEZRVUZGTEUxQlFVMHNSVUZCUlN4VlFVRlZMRU5CUVVNN1VVRkRjRWdzV1VGQldTeEhRVUZITEVOQlFVTXNXVUZCV1N4RlFVRkZMRTlCUVU4c1EwRkJRenRSUVVOMFF5eGxRVUZsTEVkQlFVY3NRMEZCUXl4UlFVRlJMRVZCUVVVc2IwSkJRVzlDTEVWQlFVVXNjVUpCUVhGQ0xFVkJRVVVzWjBKQlFXZENMRVZCUVVVc1lVRkJZU3hGUVVGRkxDdENRVUVyUWl4RlFVRkZMRXRCUVVzc1EwRkJRenRSUVVOc1NpeGhRVUZoTEVkQlFVY3NRMEZCUXl4alFVRmpMRVZCUVVVc1UwRkJVeXhGUVVGRkxHbENRVUZwUWl4RlFVRkZMR2xDUVVGcFFpeEZRVUZGTEdkQ1FVRm5RaXhGUVVGRkxHTkJRV01zUlVGQlJTeDNRa0ZCZDBJc1JVRkJSU3h4UWtGQmNVSXNRMEZCUXp0UlFVTndTeXhYUVVGWExFZEJRVWNzV1VGQldTeERRVUZETEUxQlFVMHNRMEZCUXl4bFFVRmxMRU5CUVVNc1EwRkJReXhOUVVGTkxFTkJRVU1zWVVGQllTeERRVUZETEVOQlFVTTdPMEZCUlhwRkxHdENRVUZqTEVOQlFVTXNUMEZCVHl4RFFVRkRMRlZCUVZNc1NVRkJTU3hGUVVGRk8wRkJRM0JETEZsQlFVMHNRMEZCUXl4SlFVRkpMRU5CUVVNc1IwRkJSeXhMUVVGTExFTkJRVU1zWVVGQllTeERRVUZETEVsQlFVa3NRMEZCUXl4TFFVRkxMRVZCUVVVc1YwRkJWeXhEUVVGRExFbEJRVWtzUTBGQlF5eERRVUZETEVOQlFVTTdTMEZEYmtVc1EwRkJReXhEUVVGRE96dEJRVVZJTEdWQlFWY3NRMEZCUXl4UFFVRlBMRU5CUVVNc1ZVRkJVeXhKUVVGSkxFVkJRVVU3UVVGRGFrTXNXVUZCVFN4RFFVRkRMRWxCUVVrc1EwRkJReXhIUVVGSExGZEJRVmNzUTBGQlF5eEpRVUZKTEVOQlFVTXNRMEZCUXp0TFFVTnNReXhEUVVGRExFTkJRVU03UjBGRFNqdEJRVU5FTEZOQlFVOHNUVUZCVFN4RFFVRkRPME5CUTJZN08wRkJSVVFzVTBGQlV5eE5RVUZOTEVkQlFVazdRVUZEYWtJc1RVRkJUU3hWUVVGVkxFZEJRVWNzUlVGQlJTeERRVUZET3p0QlFVVjBRaXhOUVVGSkxFOUJRVThzUzBGQlN5eExRVUZMTEZkQlFWY3NSVUZCUlR0QlFVTm9ReXhSUVVGSkxFZEJRVWNzUjBGQlJ5eGhRVUZWTEVsQlFVa3NSVUZCVnp0M1EwRkJUaXhKUVVGSk8wRkJRVW9zV1VGQlNUczdPMEZCUXk5Q0xGVkJRVWtzVlVGQlZTeFpRVUZCTEVOQlFVTTdRVUZEWml4VlFVRkpMRXRCUVVzc1IwRkJSeXhKUVVGSkxFTkJRVU1zUTBGQlF5eERRVUZETEVsQlFVa3NTVUZCU1N4RFFVRkRMRU5CUVVNc1EwRkJReXhEUVVGRExGZEJRVmNzUTBGQlF6dEJRVU16UXl4VlFVRkpMRXRCUVVzc1MwRkJTeXhOUVVGTkxFVkJRVVU3UVVGRGNFSXNhMEpCUVZVc1IwRkJSeXhKUVVGSkxFTkJRVU1zUzBGQlN5eEZRVUZGTEVOQlFVTTdUMEZETTBJc1RVRkJUVHRCUVVOTUxHdENRVUZWTEVkQlFVY3NSVUZCUlN4RFFVRkRPMDlCUTJwQ08wRkJRMFFzWVVGQlR5eExRVUZMTEVOQlFVTXNSMEZCUnl4RFFVRkRMRWxCUVVrc1EwRkJReXhEUVVGRExFdEJRVXNzUTBGQlF5eExRVUZMTEVOQlFVTXNSMEZCUnl4RlFVRkZMRU5CUVVNc1ZVRkJWU3hEUVVGRExFTkJRVU1zVFVGQlRTeERRVUZETEVsQlFVa3NRMEZCUXl4RFFVRkRMRU5CUVVNN1MwRkRjRVVzUTBGQlF6czdRVUZGUml4VFFVRkxMRWxCUVVrc1QwRkJUeXhKUVVGSkxFdEJRVXNzUTBGQlF5eEhRVUZITEVWQlFVVTdRVUZETjBJc1owSkJRVlVzUTBGQlF5eFBRVUZQTEVOQlFVTXNSMEZCUnl4SFFVRkhMRU5CUVVNc1NVRkJTU3hEUVVGRExFbEJRVWtzUlVGQlJTeFBRVUZQTEVOQlFVTXNRMEZCUXp0TFFVTXZRenM3UVVGRlJDeGpRVUZWTEVOQlFVTXNTMEZCU3l4SFFVRkhMRmxCUVZjN1FVRkROVUlzWVVGQlR5eExRVUZMTEVOQlFVTXNSMEZCUnl4RFFVRkRMRWxCUVVrc1EwRkJRenRCUVVOd1Fpd3JRa0ZCZFVJc1JVRkJSVHRCUVVOMlFpeG5Ra0ZCVFN4RlFVRkZMRkZCUVZFN1UwRkRha0k3VDBGRFJpeERRVUZETEVOQlFVTTdTMEZEU2l4RFFVRkRPMGRCUTBnN1FVRkRSQ3hUUVVGUExGVkJRVlVzUTBGQlF6dERRVU51UWpzN1FVRkZUU3hKUVVGTkxFMUJRVTBzUjBGQlJ5eFRRVUZUTEVWQlFVVXNRMEZCUXp0UlFVRnlRaXhOUVVGTkxFZEJRVTRzVFVGQlRUdEJRVU5hTEVsQlFVMHNSMEZCUnl4SFFVRkhMRTFCUVUwc1JVRkJSU3hEUVVGRE96dFJRVUZtTEVkQlFVY3NSMEZCU0N4SFFVRkhPenRCUVVWVUxGTkJRVk1zVlVGQlZTeERRVUZGTEZOQlFWTXNSVUZCUlR0QlFVTnlReXhOUVVGSkxGVkJRVlVzUjBGQlJ5eExRVUZMTEVOQlFVTXNWMEZCVnl4RFFVRkRMRk5CUVZNc1EwRkJReXhEUVVGRE8wRkJRemxETEUxQlFVa3NXVUZCV1N4SFFVRkhMRXRCUVVzc1EwRkJReXhoUVVGaExFTkJRVU1zU1VGQlNTeERRVUZETEV0QlFVc3NRMEZCUXl4aFFVRmhMRVZCUVVVc1ZVRkJWU3hEUVVGRExFTkJRVU03UVVGRE4wVXNVMEZCVHl4WlFVRlpMRU5CUVVNN1EwRkRja0lpTENKbWFXeGxJam9pWjJWdVpYSmhkR1ZrTG1weklpd2ljMjkxY21ObFVtOXZkQ0k2SWlJc0luTnZkWEpqWlhORGIyNTBaVzUwSWpwYkltbHRjRzl5ZENCU1pXRmpkQ0JtY205dElDZHlaV0ZqZENjN1hHNXBiWEJ2Y25RZ1VtVmhZM1JTYjNWMFpYSWdabkp2YlNBbmNtVmhZM1F0Y205MWRHVnlKenRjYmx4dVpuVnVZM1JwYjI0Z1oyVjBVbTkxZEdWeUlDZ3BJSHRjYmlBZ1kyOXVjM1FnVW05MWRHVnlJRDBnZTMwN1hHNGdJR2xtSUNoMGVYQmxiMllnVW1WaFkzUlNiM1YwWlhJZ0lUMDlJQ2QxYm1SbFptbHVaV1FuS1NCN1hHNGdJQ0FnYkdWMElISnZkWFJsY2tWc1pXMWxiblJ6SUQwZ1d5ZFNiM1YwWlNjc0lDZEVaV1poZFd4MFVtOTFkR1VuTENBblVtOTFkR1ZJWVc1a2JHVnlKeXdnSjBGamRHbDJaVWhoYm1Sc1pYSW5MQ0FuVG05MFJtOTFibVJTYjNWMFpTY3NJQ2RNYVc1ckp5d2dKMUpsWkdseVpXTjBKMTBzWEc0Z0lDQWdjbTkxZEdWeVRXbDRhVzV6SUQwZ1d5ZE9ZWFpwWjJGMGFXOXVKeXdnSjFOMFlYUmxKMTBzWEc0Z0lDQWdjbTkxZEdWeVJuVnVZM1JwYjI1eklEMGdXeWRqY21WaGRHVW5MQ0FuWTNKbFlYUmxSR1ZtWVhWc2RGSnZkWFJsSnl3Z0oyTnlaV0YwWlU1dmRFWnZkVzVrVW05MWRHVW5MQ0FuWTNKbFlYUmxVbVZrYVhKbFkzUW5MQ0FuWTNKbFlYUmxVbTkxZEdVbkxDQW5ZM0psWVhSbFVtOTFkR1Z6Um5KdmJWSmxZV04wUTJocGJHUnlaVzRuTENBbmNuVnVKMTBzWEc0Z0lDQWdjbTkxZEdWeVQySnFaV04wY3lBOUlGc25TR0Z6YUV4dlkyRjBhVzl1Snl3Z0owaHBjM1J2Y25rbkxDQW5TR2x6ZEc5eWVVeHZZMkYwYVc5dUp5d2dKMUpsWm5KbGMyaE1iMk5oZEdsdmJpY3NJQ2RUZEdGMGFXTk1iMk5oZEdsdmJpY3NJQ2RVWlhOMFRHOWpZWFJwYjI0bkxDQW5TVzFwZEdGMFpVSnliM2R6WlhKQ1pXaGhkbWx2Y2ljc0lDZFRZM0p2Ykd4VWIxUnZjRUpsYUdGMmFXOXlKMTBzWEc0Z0lDQWdZMjl3YVdWa1NYUmxiWE1nUFNCeWIzVjBaWEpOYVhocGJuTXVZMjl1WTJGMEtISnZkWFJsY2taMWJtTjBhVzl1Y3lrdVkyOXVZMkYwS0hKdmRYUmxjazlpYW1WamRITXBPMXh1WEc0Z0lDQWdjbTkxZEdWeVJXeGxiV1Z1ZEhNdVptOXlSV0ZqYUNobWRXNWpkR2x2YmlodVlXMWxLU0I3WEc0Z0lDQWdJQ0JTYjNWMFpYSmJibUZ0WlYwZ1BTQlNaV0ZqZEM1amNtVmhkR1ZGYkdWdFpXNTBMbUpwYm1Rb1VtVmhZM1FzSUZKbFlXTjBVbTkxZEdWeVcyNWhiV1ZkS1R0Y2JpQWdJQ0I5S1R0Y2JseHVJQ0FnSUdOdmNHbGxaRWwwWlcxekxtWnZja1ZoWTJnb1puVnVZM1JwYjI0b2JtRnRaU2tnZTF4dUlDQWdJQ0FnVW05MWRHVnlXMjVoYldWZElEMGdVbVZoWTNSU2IzVjBaWEpiYm1GdFpWMDdYRzRnSUNBZ2ZTazdYRzRnSUgxY2JpQWdjbVYwZFhKdUlGSnZkWFJsY2p0Y2JuMWNibHh1Wm5WdVkzUnBiMjRnWjJWMFJFOU5JQ2dwSUh0Y2JpQWdZMjl1YzNRZ1JFOU5TR1ZzY0dWeWN5QTlJSHQ5TzF4dVhHNGdJR2xtSUNoMGVYQmxiMllnVW1WaFkzUWdJVDA5SUNkMWJtUmxabWx1WldRbktTQjdYRzRnSUNBZ2JHVjBJSFJoWnlBOUlHWjFibU4wYVc5dUlDaHVZVzFsTENBdUxpNWhjbWR6S1NCN1hHNGdJQ0FnSUNCc1pYUWdZWFIwY21saWRYUmxjenRjYmlBZ0lDQWdJR3hsZENCbWFYSnpkQ0E5SUdGeVozTmJNRjBnSmlZZ1lYSm5jMXN3WFM1amIyNXpkSEoxWTNSdmNqdGNiaUFnSUNBZ0lHbG1JQ2htYVhKemRDQTlQVDBnVDJKcVpXTjBLU0I3WEc0Z0lDQWdJQ0FnSUdGMGRISnBZblYwWlhNZ1BTQmhjbWR6TG5Ob2FXWjBLQ2s3WEc0Z0lDQWdJQ0I5SUdWc2MyVWdlMXh1SUNBZ0lDQWdJQ0JoZEhSeWFXSjFkR1Z6SUQwZ2UzMDdYRzRnSUNBZ0lDQjlYRzRnSUNBZ0lDQnlaWFIxY200Z1VtVmhZM1F1UkU5TlcyNWhiV1ZkTG1Gd2NHeDVLRkpsWVdOMExrUlBUU3dnVzJGMGRISnBZblYwWlhOZExtTnZibU5oZENoaGNtZHpLU2s3WEc0Z0lDQWdmVHRjYmx4dUlDQWdJR1p2Y2lBb2JHVjBJSFJoWjA1aGJXVWdhVzRnVW1WaFkzUXVSRTlOS1NCN1hHNGdJQ0FnSUNCRVQwMUlaV3h3WlhKelczUmhaMDVoYldWZElEMGdkR0ZuTG1KcGJtUW9kR2hwY3l3Z2RHRm5UbUZ0WlNrN1hHNGdJQ0FnZlZ4dVhHNGdJQ0FnUkU5TlNHVnNjR1Z5Y3k1emNHRmpaU0E5SUdaMWJtTjBhVzl1S0NrZ2UxeHVJQ0FnSUNBZ2NtVjBkWEp1SUZKbFlXTjBMa1JQVFM1emNHRnVLSHRjYmlBZ0lDQWdJQ0FnWkdGdVoyVnliM1Z6YkhsVFpYUkpibTVsY2toVVRVdzZJSHRjYmlBZ0lDQWdJQ0FnSUNCZlgyaDBiV3c2SUNjbWJtSnpjRHNuWEc0Z0lDQWdJQ0FnSUgxY2JpQWdJQ0FnSUgwcE8xeHVJQ0FnSUgwN1hHNGdJSDFjYmlBZ2NtVjBkWEp1SUVSUFRVaGxiSEJsY25NN1hHNTlYRzVjYm1WNGNHOXlkQ0JqYjI1emRDQlNiM1YwWlhJZ1BTQm5aWFJTYjNWMFpYSW9LVHRjYm1WNGNHOXlkQ0JqYjI1emRDQkVUMDBnUFNCblpYUkVUMDBvS1R0Y2JseHVaWGh3YjNKMElHWjFibU4wYVc5dUlHTnlaV0YwWlZacFpYY2dLR05zWVhOelFYSm5jeWtnZTF4dUlDQnNaWFFnVW1WaFkzUkRiR0Z6Y3lBOUlGSmxZV04wTG1OeVpXRjBaVU5zWVhOektHTnNZWE56UVhKbmN5azdYRzRnSUd4bGRDQlNaV0ZqZEVWc1pXMWxiblFnUFNCU1pXRmpkQzVqY21WaGRHVkZiR1Z0Wlc1MExtSnBibVFvVW1WaFkzUXVZM0psWVhSbFJXeGxiV1Z1ZEN3Z1VtVmhZM1JEYkdGemN5azdYRzRnSUhKbGRIVnliaUJTWldGamRFVnNaVzFsYm5RN1hHNTlYRzRpWFgwPSIsImltcG9ydCB7QWN0aW9uc30gZnJvbSAnLi9BY3Rpb25zJztcbmltcG9ydCB1dGlscyBmcm9tICcuL3V0aWxzJztcbmltcG9ydCBGcmVlemVyIGZyb20gJ2ZyZWV6ZXItanMnO1xuaW1wb3J0IGdldENvbm5lY3RNaXhpbiBmcm9tICcuL21peGlucy9jb25uZWN0JztcbmltcG9ydCBHbG9iYWxTdG9yZSBmcm9tICcuL2dsb2JhbFN0b3JlJztcblxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTdG9yZSB7XG4gIGNvbnN0cnVjdG9yKGFyZ3M9e30pIHtcbiAgICBsZXQge3BhdGgsIGFjdGlvbnMsIGluaXRpYWx9ID0gYXJncztcbiAgICBsZXQgaW5pdCA9IHR5cGVvZiBpbml0aWFsID09PSAnZnVuY3Rpb24nID8gaW5pdGlhbCgpIDogaW5pdGlhbDtcbiAgICBsZXQgc3RvcmUgPSBHbG9iYWxTdG9yZS5pbml0KHBhdGgsIGluaXQgfHwge30pO1xuXG4gICAgdGhpcy5jb25uZWN0ID0gZnVuY3Rpb24gKC4uLmFyZ3MpIHtcbiAgICAgIHJldHVybiBnZXRDb25uZWN0TWl4aW4odGhpcywgYXJncy5jb25jYXQoYXJncykpO1xuICAgIH07XG5cbiAgICB0aGlzLmhhbmRsZXJzID0gYXJncy5oYW5kbGVycyB8fCB1dGlscy5nZXRXaXRob3V0RmllbGRzKFsnYWN0aW9ucyddLCBhcmdzKSB8fCB7fTtcblxuICAgIGlmIChBcnJheS5pc0FycmF5KGFjdGlvbnMpKSB7XG4gICAgICB0aGlzLmFjdGlvbnMgPSBhY3Rpb25zID0gbmV3IEFjdGlvbnMoYWN0aW9ucyk7XG4gICAgICB0aGlzLmFjdGlvbnMuYWRkU3RvcmUodGhpcyk7XG4gICAgfVxuXG4gICAgY29uc3Qgc2V0ID0gZnVuY3Rpb24gKGl0ZW0sIHZhbHVlKSB7XG4gICAgICBHbG9iYWxTdG9yZS5zZXQocGF0aCwgaXRlbSwgdmFsdWUpO1xuICAgIH07XG5cbiAgICBjb25zdCBnZXQgPSBmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgaWYgKGl0ZW0pXG4gICAgICAgIHJldHVybiBHbG9iYWxTdG9yZS5nZXQocGF0aCkudG9KUygpW2l0ZW1dO1xuICAgICAgcmV0dXJuIEdsb2JhbFN0b3JlLmdldChwYXRoKTtcbiAgICB9O1xuXG4gICAgY29uc3QgcmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLnNldChpbml0KTtcbiAgICB9O1xuXG4gICAgdGhpcy5wYXRoID0gcGF0aDtcbiAgICB0aGlzLnNldCA9IHNldDtcbiAgICB0aGlzLmdldCA9IGdldDtcbiAgICB0aGlzLnJlc2V0ID0gcmVzZXQ7XG4gICAgdGhpcy5zdG9yZSA9IEdsb2JhbFN0b3JlLmdldFN0b3JlKCk7XG5cbiAgICB0aGlzLnN0YXRlUHJvdG8gPSB7c2V0LCBnZXQsIHJlc2V0LCBhY3Rpb25zfTtcbiAgICAvL3RoaXMuZ2V0dGVyID0gbmV3IEdldHRlcih0aGlzKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGFkZEFjdGlvbihpdGVtKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoaXRlbSkpIHtcbiAgICAgIHRoaXMuYWN0aW9ucyA9IHRoaXMuYWN0aW9ucy5jb25jYXQodGhpcy5hY3Rpb25zKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBpdGVtID09PSAnb2JqZWN0Jykge1xuICAgICAgdGhpcy5hY3Rpb25zLnB1c2goaXRlbSk7XG4gICAgfVxuICB9XG5cbiAgcmVtb3ZlQWN0aW9uKGl0ZW0pIHtcbiAgICB2YXIgYWN0aW9uO1xuICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGFjdGlvbiA9IHRoaXMuZmluZEJ5TmFtZSgnYWN0aW9ucycsICduYW1lJywgaXRlbSk7XG4gICAgICBpZiAoYWN0aW9uKSBhY3Rpb24ucmVtb3ZlU3RvcmUodGhpcyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGFjdGlvbiA9IGl0ZW07XG4gICAgICBsZXQgaW5kZXggPSB0aGlzLmFjdGlvbnMuaW5kZXhPZihhY3Rpb24pO1xuICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xuICAgICAgICBhY3Rpb24ucmVtb3ZlU3RvcmUodGhpcyk7XG4gICAgICAgIHRoaXMuYWN0aW9ucyA9IHRoaXMuYWN0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldEFjdGlvbkN5Y2xlKGFjdGlvbk5hbWUsIHByZWZpeD0nb24nKSB7XG4gICAgY29uc3QgY2FwaXRhbGl6ZWQgPSB1dGlscy5jYXBpdGFsaXplKGFjdGlvbk5hbWUpO1xuICAgIGNvbnN0IGZ1bGxBY3Rpb25OYW1lID0gYCR7cHJlZml4fSR7Y2FwaXRhbGl6ZWR9YDtcbiAgICBjb25zdCBoYW5kbGVyID0gdGhpcy5oYW5kbGVyc1tmdWxsQWN0aW9uTmFtZV0gfHwgdGhpcy5oYW5kbGVyc1thY3Rpb25OYW1lXTtcbiAgICBpZiAoIWhhbmRsZXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gaGFuZGxlcnMgZm9yICR7YWN0aW9uTmFtZX0gYWN0aW9uIGRlZmluZWQgaW4gY3VycmVudCBzdG9yZWApO1xuICAgIH1cblxuICAgIGxldCBhY3Rpb25zO1xuICAgIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGFjdGlvbnMgPSBoYW5kbGVyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGFjdGlvbnMgPSB7b246IGhhbmRsZXJ9O1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7aGFuZGxlcn0gbXVzdCBiZSBhbiBvYmplY3Qgb3IgZnVuY3Rpb25gKTtcbiAgICB9XG4gICAgcmV0dXJuIGFjdGlvbnM7XG4gIH1cblxuICAvLyAxLiB3aWxsKGluaXRpYWwpID0+IHdpbGxSZXN1bHRcbiAgLy8gMi4gd2hpbGUodHJ1ZSlcbiAgLy8gMy4gb24od2lsbFJlc3VsdCB8fCBpbml0aWFsKSA9PiBvblJlc3VsdFxuICAvLyA0LiB3aGlsZShmYWxzZSlcbiAgLy8gNS4gZGlkKG9uUmVzdWx0KVxuICBydW5DeWNsZShhY3Rpb25OYW1lLCAuLi5hcmdzKSB7XG4gICAgLy8gbmV3IFByb21pc2UocmVzb2x2ZSA9PiByZXNvbHZlKHRydWUpKVxuICAgIGNvbnN0IGN5Y2xlID0gdGhpcy5nZXRBY3Rpb25DeWNsZShhY3Rpb25OYW1lKTtcbiAgICBsZXQgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIGxldCB3aWxsID0gY3ljbGUud2lsbCwgd2hpbGVfID0gY3ljbGUud2hpbGUsIG9uXyA9IGN5Y2xlLm9uO1xuICAgIGxldCBkaWQgPSBjeWNsZS5kaWQsIGRpZE5vdCA9IGN5Y2xlLmRpZE5vdDtcblxuICAgIC8vIExvY2FsIHN0YXRlIGZvciB0aGlzIGN5Y2xlLlxuICAgIGxldCBzdGF0ZSA9IE9iamVjdC5jcmVhdGUodGhpcy5zdGF0ZVByb3RvKTtcblxuICAgIC8vIFByZS1jaGVjayAmIHByZXBhcmF0aW9ucy5cbiAgICBpZiAod2lsbCkgcHJvbWlzZSA9IHByb21pc2UudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gd2lsbC5hcHBseShzdGF0ZSwgYXJncyk7XG4gICAgfSk7XG5cbiAgICAvLyBTdGFydCB3aGlsZSgpLlxuICAgIGlmICh3aGlsZV8pIHByb21pc2UgPSBwcm9taXNlLnRoZW4oKHdpbGxSZXN1bHQpID0+IHtcbiAgICAgIHdoaWxlXy5jYWxsKHN0YXRlLCB0cnVlKTtcbiAgICAgIHJldHVybiB3aWxsUmVzdWx0O1xuICAgIH0pO1xuXG4gICAgLy8gQWN0dWFsIGV4ZWN1dGlvbi5cbiAgICBwcm9taXNlID0gcHJvbWlzZS50aGVuKCh3aWxsUmVzdWx0KSA9PiB7XG4gICAgICBpZiAod2lsbFJlc3VsdCA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBvbl8uYXBwbHkoc3RhdGUsIGFyZ3MpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG9uXy5jYWxsKHN0YXRlLCB3aWxsUmVzdWx0KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFN0b3Agd2hpbGUoKS5cbiAgICBpZiAod2hpbGVfKSBwcm9taXNlID0gcHJvbWlzZS50aGVuKChvblJlc3VsdCkgPT4ge1xuICAgICAgd2hpbGVfLmNhbGwoc3RhdGUsIGZhbHNlKTtcbiAgICAgIHJldHVybiBvblJlc3VsdDtcbiAgICB9KTtcblxuICAgIC8vIEZvciBkaWQgYW5kIGRpZE5vdCBzdGF0ZSBpcyBmcmVlemVkLlxuICAgIHByb21pc2UgPSBwcm9taXNlLnRoZW4oKG9uUmVzdWx0KSA9PiB7XG4gICAgICBPYmplY3QuZnJlZXplKHN0YXRlKTtcbiAgICAgIHJldHVybiBvblJlc3VsdDtcbiAgICB9KTtcblxuICAgIC8vIEhhbmRsZSB0aGUgcmVzdWx0LlxuICAgIGlmIChkaWQpIHByb21pc2UgPSBwcm9taXNlLnRoZW4ob25SZXN1bHQgPT4ge1xuICAgICAgcmV0dXJuIGRpZC5jYWxsKHN0YXRlLCBvblJlc3VsdCk7XG4gICAgfSk7XG5cbiAgICBwcm9taXNlLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmICh3aGlsZV8pIHdoaWxlXy5jYWxsKHRoaXMsIHN0YXRlLCBmYWxzZSk7XG4gICAgICBpZiAoZGlkTm90KSB7XG4gICAgICAgIGRpZE5vdC5jYWxsKHN0YXRlLCBlcnJvcik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG59XG4iLCJpbXBvcnQgRnJlZXplciBmcm9tICdmcmVlemVyLWpzJztcblxudmFyIGZyZWV6ZXI7XG5leHBvcnQgZGVmYXVsdCBjbGFzcyBHbG9iYWxTdG9yZSB7XG4gIHN0YXRpYyBnZXRTdG9yZSgpIHtcbiAgICBpZiAoIWZyZWV6ZXIpIHtcbiAgICAgIGZyZWV6ZXIgPSBuZXcgRnJlZXplcih7fSk7XG4gICAgfVxuICAgIHJldHVybiBmcmVlemVyO1xuICB9XG5cbiAgc3RhdGljIGdldFN0YXRlKCkge1xuICAgIHJldHVybiB0aGlzLmdldFN0b3JlKCkuZ2V0KCk7XG4gIH1cblxuICBzdGF0aWMgaW5pdChzdWJzdG9yZSwgaW5pdCkge1xuICAgIGxldCBzdG9yZSA9IHRoaXMuZ2V0U3RhdGUoKTtcbiAgICBsZXQgdmFsdWVzID0gc3RvcmVbc3Vic3RvcmVdO1xuXG4gICAgaWYgKHZhbHVlcylcbiAgICAgIHJldHVybiB2YWx1ZXM7XG4gICAgcmV0dXJuIHN0b3JlLnNldChzdWJzdG9yZSwgaW5pdCB8fCB7fSlbc3Vic3RvcmVdO1xuICB9XG5cbiAgc3RhdGljIGdldChzdWJzdG9yZSwgbmFtZSkge1xuICAgIGxldCBzdG9yZSA9IHRoaXMuZ2V0U3RhdGUoKTtcbiAgICBpZiAoIW5hbWUpXG4gICAgICByZXR1cm4gc3RvcmVbc3Vic3RvcmVdO1xuICAgIHJldHVybiBzdG9yZVtzdWJzdG9yZV0gPyBzdG9yZVtzdWJzdG9yZV1bbmFtZV0gOiB7fTtcbiAgfVxuXG4gIHN0YXRpYyBzZXQoc3Vic3RvcmUsIG5hbWUsIHZhbHVlKSB7XG4gICAgbGV0IHN0b3JlID0gdGhpcy5nZXRTdGF0ZSgpO1xuICAgIGxldCB2YWx1ZXMgPSBzdG9yZVtzdWJzdG9yZV07XG5cbiAgICBpZiAodmFsdWVzKVxuICAgICAgdmFsdWVzLnNldChuYW1lLCB2YWx1ZSk7XG5cbiAgICByZXR1cm4gdGhpcy5nZXQoc3Vic3RvcmUpO1xuICB9XG59XG4iLCJleHBvcnQgZGVmYXVsdCB7XG4gIGN4OiBmdW5jdGlvbiAoY2xhc3NOYW1lcykge1xuICAgIGlmICh0eXBlb2YgY2xhc3NOYW1lcyA9PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKGNsYXNzTmFtZXMpLmZpbHRlcihmdW5jdGlvbihjbGFzc05hbWUpIHtcbiAgICAgICAgcmV0dXJuIGNsYXNzTmFtZXNbY2xhc3NOYW1lXTtcbiAgICAgIH0pLmpvaW4oJyAnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5qb2luLmNhbGwoYXJndW1lbnRzLCAnICcpO1xuICAgIH1cbiAgfVxufTtcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGdldENvbm5lY3RNaXhpbiAoc3RvcmUpIHtcbiAgbGV0IGxpc3RlbmVyO1xuXG4gIHJldHVybiB7XG4gICAgZ2V0SW5pdGlhbFN0YXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICBjb25zdCBmcm96ZW4gPSBzdG9yZS5zdG9yZS5nZXQoYXJndW1lbnRzKTtcbiAgICAgIGNvbnN0IHN0YXRlID0gZnJvemVuW3N0b3JlLnBhdGhdLnRvSlMoKTtcblxuICAgICAgbGV0IGNoYW5nZUNhbGxiYWNrID0gZnVuY3Rpb24gKHN0YXRlKSB7XG4gICAgICAgIHRoaXMuc2V0U3RhdGUoc3RhdGVbc3RvcmUucGF0aF0udG9KUygpKTtcbiAgICAgIH07XG5cbiAgICAgIGlmICghdGhpcy5ib3VuZEV4aW1DaGFuZ2VDYWxsYmFja3MpXG4gICAgICAgIHRoaXMuYm91bmRFeGltQ2hhbmdlQ2FsbGJhY2tzID0ge307XG5cbiAgICAgIHRoaXMuYm91bmRFeGltQ2hhbmdlQ2FsbGJhY2tzW3N0b3JlLnBhdGhdID0gY2hhbmdlQ2FsbGJhY2suYmluZCh0aGlzKTtcblxuICAgICAgbGlzdGVuZXIgPSBmcm96ZW4uZ2V0TGlzdGVuZXIoKTtcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9LFxuXG4gICAgY29tcG9uZW50RGlkTW91bnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGxpc3RlbmVyLm9uKCd1cGRhdGUnLCB0aGlzLmJvdW5kRXhpbUNoYW5nZUNhbGxiYWNrc1tzdG9yZS5wYXRoXSk7XG4gICAgfSxcblxuICAgIGNvbXBvbmVudFdpbGxVbm1vdW50OiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAobGlzdGVuZXIpXG4gICAgICAgIGxpc3RlbmVyLm9mZigndXBkYXRlJywgdGhpcy5ib3VuZEV4aW1DaGFuZ2VDYWxsYmFja3Nbc3RvcmUucGF0aF0pO1xuICAgIH1cbiAgfTtcbn1cbiIsImNvbnN0IHV0aWxzID0ge307XG5cbnV0aWxzLmdldFdpdGhvdXRGaWVsZHMgPSBmdW5jdGlvbiAob3V0Y2FzdCwgdGFyZ2V0KSB7XG4gIGlmICghdGFyZ2V0KSB0aHJvdyBuZXcgRXJyb3IoJ1R5cGVFcnJvcjogdGFyZ2V0IGlzIG5vdCBhbiBvYmplY3QuJyk7XG4gIHZhciByZXN1bHQgPSB7fTtcbiAgaWYgKHR5cGVvZiBvdXRjYXN0ID09PSAnc3RyaW5nJykgb3V0Y2FzdCA9IFtvdXRjYXN0XTtcbiAgdmFyIHRLZXlzID0gT2JqZWN0LmtleXModGFyZ2V0KTtcbiAgb3V0Y2FzdC5mb3JFYWNoKGZ1bmN0aW9uKGZpZWxkTmFtZSkge1xuICAgIHRLZXlzXG4gICAgICAuZmlsdGVyKGZ1bmN0aW9uKGtleSkge1xuICAgICAgICByZXR1cm4ga2V5ICE9PSBmaWVsZE5hbWU7XG4gICAgICB9KVxuICAgICAgLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHJlc3VsdFtrZXldID0gdGFyZ2V0W2tleV07XG4gICAgICB9KTtcbiAgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG51dGlscy5vYmplY3RUb0FycmF5ID0gZnVuY3Rpb24gKG9iamVjdCkge1xuICByZXR1cm4gT2JqZWN0LmtleXMob2JqZWN0KS5tYXAoa2V5ID0+IG9iamVjdFtrZXldKTtcbn07XG5cbnV0aWxzLmNsYXNzV2l0aEFyZ3MgPSBmdW5jdGlvbiAoSXRlbSwgYXJncykge1xuICByZXR1cm4gSXRlbS5iaW5kLmFwcGx5KEl0ZW0sW0l0ZW1dLmNvbmNhdChhcmdzKSk7XG59O1xuXG4vLyAxLiB3aWxsXG4vLyAyLiB3aGlsZSh0cnVlKVxuLy8gMy4gb25cbi8vIDQuIHdoaWxlKGZhbHNlKVxuLy8gNS4gZGlkIG9yIGRpZE5vdFxudXRpbHMubWFwQWN0aW9uTmFtZXMgPSBmdW5jdGlvbihvYmplY3QpIHtcbiAgY29uc3QgbGlzdCA9IFtdO1xuICBjb25zdCBwcmVmaXhlcyA9IFsnd2lsbCcsICd3aGlsZVN0YXJ0JywgJ29uJywgJ3doaWxlRW5kJywgJ2RpZCcsICdkaWROb3QnXTtcbiAgcHJlZml4ZXMuZm9yRWFjaChpdGVtID0+IHtcbiAgICBsZXQgbmFtZSA9IGl0ZW07XG4gICAgaWYgKGl0ZW0gPT09ICd3aGlsZVN0YXJ0JyB8fCBpdGVtID09PSAnd2hpbGVFbmQnKSB7XG4gICAgICBuYW1lID0gJ3doaWxlJztcbiAgICB9XG4gICAgaWYgKG9iamVjdFtuYW1lXSkge1xuICAgICAgbGlzdC5wdXNoKFtpdGVtLCBvYmplY3RbbmFtZV1dKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gbGlzdDtcbn07XG5cbnV0aWxzLmlzT2JqZWN0ID0gZnVuY3Rpb24gKHRhcmcpIHtcbiAgcmV0dXJuIHRhcmcgPyB0YXJnLnRvU3RyaW5nKCkuc2xpY2UoOCwxNCkgPT09ICdPYmplY3QnIDogZmFsc2U7XG59O1xudXRpbHMuY2FwaXRhbGl6ZSA9IGZ1bmN0aW9uIChzdHIpIHtcbiAgY29uc3QgZmlyc3QgPSBzdHIuY2hhckF0KDApLnRvVXBwZXJDYXNlKCk7XG4gIGNvbnN0IHJlc3QgPSBzdHIuc2xpY2UoMSk7XG4gIHJldHVybiBgJHtmaXJzdH0ke3Jlc3R9YDtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IHV0aWxzO1xuIl19
