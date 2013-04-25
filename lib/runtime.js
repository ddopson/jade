
/*!
 * Jade - runtime
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Lame Array.isArray() polyfill for now.
 */

if (!Array.isArray) {
  Array.isArray = function(arr){
    return '[object Array]' == Object.prototype.toString.call(arr);
  };
}

/**
 * Lame Object.keys() polyfill for now.
 */

if (!Object.keys) {
  Object.keys = function(obj){
    var arr = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        arr.push(key);
      }
    }
    return arr;
  }
}

/**
 * Merge two attribute objects giving precedence
 * to values in object `b`. Classes are special-cased
 * allowing for arrays and merging/joining appropriately
 * resulting in a string.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 * @api private
 */

exports.merge = function merge(a, b) {
  var ac = a['class'];
  var bc = b['class'];

  if (ac || bc) {
    ac = ac || [];
    bc = bc || [];
    if (!Array.isArray(ac)) ac = [ac];
    if (!Array.isArray(bc)) bc = [bc];
    ac = ac.filter(nulls);
    bc = bc.filter(nulls);
    a['class'] = ac.concat(bc).join(' ');
  }

  for (var key in b) {
    if (key != 'class') {
      a[key] = b[key];
    }
  }

  return a;
};

/**
 * Filter null `val`s.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function nulls(val) {
  return val != null;
}

/**
 * Render the given attributes object.
 *
 * @param {Object} obj
 * @param {Object} escaped
 * @return {String}
 * @api private
 */

exports.attrs = function attrs(obj, escaped){
  var buf = []
    , terse = obj.terse;

  delete obj.terse;
  var keys = Object.keys(obj)
    , len = keys.length;

  if (len) {
    buf.push('');
    for (var i = 0; i < len; ++i) {
      var key = keys[i]
        , val = obj[key];

      if ('boolean' == typeof val || null == val) {
        if (val) {
          terse
            ? buf.push(key)
            : buf.push(key + '="' + key + '"');
        }
      } else if (0 == key.indexOf('data') && 'string' != typeof val) {
        buf.push(key + "='" + JSON.stringify(val) + "'");
      } else if ('class' == key && Array.isArray(val)) {
        buf.push(key + '="' + exports.escape(val.join(' ')) + '"');
      } else if (escaped && escaped[key]) {
        buf.push(key + '="' + exports.escape(val) + '"');
      } else {
        buf.push(key + '="' + val + '"');
      }
    }
  }

  return buf.join(' ');
};

var _indents = [];
exports.indent = function (level) {
  if (!_indents[level]) {
    _indents[level] = "\n" + Array(level+1).join('  ');
  }
  return _indents[level];
}

exports.domCreateElement = function (el_parent, tag) {
  return el_parent.appendChild(document.createElement(tag));
}

exports.domAppendText = function (el, txt) {
  if (!txt && txt !== 0 && txt !== false) {
    return;
  }
  if (typeof txt == 'string' && txt.match('object DocumentFragment')) {
    throw new Error("YOU DID STRING APPEND");
  }
  el.appendChild(document.createTextNode(txt));
}

exports.domAppendComment = function (el, txt) {
  el.appendChild(document.createCommentNode(txt));
}

exports.domAppendContent = function (el, content, escaped) {
  if (content == null) {
    return;
  } else if (typeof content == 'string') {
    if (content === "") {
      return;
    }
    var wrapper = document.createElement('div');
    wrapper.innerHTML = content;
    for (var i=0,l=wrapper.childNodes.length; i<l; i++) {
      el.appendChild(wrapper.childNodes[i]);
    }
  } else if (content != null) {
    el.appendChild(content);
  }
}

exports.domSetClass = function (el, val) {
  if (typeof val == 'string') {
    if (val === "") {
      return;
    } else if (val.match(' ')) {
      el.classList.add.apply(el.classList, val.split(' '));
    } else {
      el.classList.add(val);
    }
  } else if (Array.isArray(val)) {
    el.classList.add.apply(el.classList, val);
  } else if (val != null) {
    throw new Error("unknown argument type: " + typeof val + " = " + val);
  }
}

exports.domSetDataAttribute = function (el, key, val) {
  if (typeof val == 'string') {
    el.setAttribute(key, val);
  } else {
    el.setAttribute(key, JSON.stringify(val));
  }
}

exports.domSetAttribute = function (el, key, val) {
  switch (val) {
    case true:
      val = key;
      break;
    case false:
    case null:
    case undefined:
      return;
  }
  el.setAttribute(key, val);
}

exports.domSetAttributes = function domSetAttributes(el, attributes) {
  if (typeof attributes == 'undefined') return;
  var keys = Object.keys(attributes)
  var html5 = true
  for (var i = 0, l=keys.length; i < l; i++) {
    var key = keys[i];
    var val = attributes[key];

    if (val === true) {
      if (html5) {
        // w.t.f  html5 is odd.
        el.setAttribute(key, '');
      } else {
        el.setAttribute(key, key);
      }
    } else if (typeof val == 'boolean' || val == null) {
      // do nothing
    } else if (0 == key.indexOf('data') && typeof val != 'string') {
      el.setAttribute(key, JSON.stringify(val));
    } else if (key === 'class') {
      exports.domSetClass(el, val);
    } else {
      el.setAttribute(key, val);
    }
  }
};

/**
 * Escape the given string of `html`.
 *
 * @param {String} html
 * @return {String}
 * @api private
 */

exports.escape = function escape(html){
  return String(html)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

/**
 * Re-throw the given `err` in context to the
 * the jade in `filename` at the given `lineno`.
 *
 * @param {Error} err
 * @param {String} filename
 * @param {String} lineno
 * @api private
 */

exports.rethrow = function rethrow(err, filename, lineno, str){
  if (!str) {
    if (!filename) throw err;
    str = require('fs').readFileSync(filename, 'utf8')
  }

  var context = 3
    , lines = str.split('\n')
    , start = Math.max(lineno - context, 0)
    , end = Math.min(lines.length, lineno + context);

  // Error context
  var context = lines.slice(start, end).map(function(line, i){
    var curr = i + start + 1;
    return (curr == lineno ? '  > ' : '    ')
      + curr
      + '| '
      + line;
  }).join('\n');

  // Alter exception message
  err.path = filename;
  err.message = (filename || 'Jade') + ':' + lineno
    + '\n' + context + '\n\n' + err.message;
  throw err;
};
