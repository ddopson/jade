
/*!
 * Jade - utils
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Convert interpolation in the given string to JavaScript.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

var interpolate = exports.interpolate = function(str, coffee) {
  return str.replace(/(__BACKSLASH__)?([#!]){(.*?)}/g, function(str, escape, flag, code) {
    code = code
      .replace(/\\'/g, "'")
      .replace(/__BACKSLASH__/g, '\\');

    if (escape) {
      return str.slice("__BACKSLASH__".length);
    } else {
      var content = "";
      if ('!' == flag) {
        content += "' + (";
      } else {
        if (coffee) {
          content += "' + __jade.escape(";
        } else {
          content += "' + escape(";
        }
      }
      if (coffee) {
        content += "(" + code + ") ? ''";
      } else {
        content += "(interp = " + code + ") == null ? '' : interp";
      }
      content += ") + '";
      return content;
    }
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

