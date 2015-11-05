import React from 'react';
import ReactRouter from 'react-router';

function getRouter () {
  const Router = {};

  if (typeof ReactRouter !== 'undefined') {
    let routerElements = ['Route', 'DefaultRoute', 'RouteHandler', 'ActiveHandler', 'NotFoundRoute', 'Link', 'Redirect'],
    routerMixins = ['Navigation', 'State'],
    routerFunctions = ['create', 'createDefaultRoute', 'createNotFoundRoute', 'createRedirect', 'createRoute', 'createRoutesFromReactChildren', 'run'],
    routerObjects = ['HashLocation', 'History', 'HistoryLocation', 'RefreshLocation', 'StaticLocation', 'TestLocation', 'ImitateBrowserBehavior', 'ScrollToTopBehavior'],
    copiedItems = routerMixins.concat(routerFunctions).concat(routerObjects);

    routerElements.forEach(function(name) {
      Router[name] = React.createElement.bind(React, ReactRouter[name]);
    });

    copiedItems.forEach(function(name) {
      Router[name] = ReactRouter[name];
    });

    Router['mount'] = function(path) {
      console.log('Exim.Router.mount is not defined');
    }

    Router['match'] = function(name, handler, args, children) {
      if (typeof handler === 'object') {
        children = args;
        args = handler;

        let segments = name.split('-');
        let filePath;
        if (segments.length > 1) {
          filePath = segments.map(function(name, i){
            if (i>0)
              return name.charAt(0).toUpperCase() + name.slice(1)
            return name
          }).join('/');
        } else {
          filePath = name + '/' + name.charAt(0).toUpperCase() + name.slice(1);
        }

        handler = Router.mount(filePath);
      }

      let path, key, def;

      if (args){
        path = args.path;
        key = args.key;
        def = args.default;
      }

      if (def === true) {
        return Router['DefaultRoute']({name, path, handler, key}, children);
      }

      return Router['Route']({name, path, handler, key}, children);
    };
  }

  return Router;
}

function getDOM () {
  const DOMHelpers = {};

  if (typeof React !== 'undefined') {
    let tag = function (name, ...args) {
      let attributes;
      let first = args[0] && args[0].constructor;
      if (first === Object) {
        attributes = args.shift();
      } else {
        attributes = {};
      }
      return React.DOM[name].apply(React.DOM, [attributes].concat(args));
    };

    for (let tagName in React.DOM) {
      DOMHelpers[tagName] = tag.bind(this, tagName);
    }

    DOMHelpers.space = function() {
      return React.DOM.span({
        dangerouslySetInnerHTML: {
          __html: '&nbsp;'
        }
      });
    };
  }
  return DOMHelpers;
}

export const Router = getRouter();
export const DOM = getDOM();

export function createView (classArgs) {
  let ReactClass = React.createClass(classArgs);
  let ReactElement = React.createElement.bind(React.createElement, ReactClass);
  return ReactElement;
}
