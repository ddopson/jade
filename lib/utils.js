
/*!
 * Jade - utils
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

var parseJSExpression = require('character-parser').parseMax;

/**
 * Convert interpolation in the given string to JavaScript.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

exports.interpolate = interpolate;
function interpolate(str, coffee){
  return str.replace(/(__BACKSLASH__)?([#!]){(.*)/g, function(str, backslash, flag, code){
    code = code
      .replace(/\\'/g, "'")
      .replace(/__BACKSLASH__/g, '\\');

    if (!backslash) {
      try {
        var range = parseJSExpression(code);
        var content = "";
        if ('!' == flag) {
          content += "' + (";
        } else {
          content += "' + __jade.escape(";
        }
        if (coffee) {
          content += "(" + range.src + ") ? ''";
        } else {
          content += "(interp = " + range.src + ") == null ? '' : interp";
        }
        content += ") + '";
        content += interpolate(code.substr(range.end + 1));
        return content;
      } catch (ex) {
        //didn't match, just return as if escaped
      }
    }
    str = str.slice("__BACKSLASH__".length);
    return str.substr(0, 2) + interpolate(str.substr(2));
  });
};

/**
 * Escape single quotes in `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

var escape = exports.escape = function(str) {
  return str.replace(/'/g, "\\'");
};

/**
 * Interpolate, and escape the given `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

exports.text = function(str, coffee) {
  return interpolate(escape(str), coffee).replace(/\n/g, '\\n');
};

/**
 * Merge `b` into `a`.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {Object}
 * @api public
 */

exports.merge = function(a, b) {
  for (var key in b) a[key] = b[key];
  return a;
};

