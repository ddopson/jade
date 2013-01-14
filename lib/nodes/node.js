
/*!
 * Jade - nodes - Node
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Initialize a `Node`.
 *
 * @api public
 */

var Node = module.exports = function Node(){};

/**
 * Clone this node (return itself)
 *
 * @return {Node}
 * @api private
 */

Node.prototype.clone = function(){
  return this;
};

Node.prototype.getType = function(){
  if (! this._type) {
    this._type = this.constructor.name || this.constructor.toString().match(/function ([^(\s]+)()/)[1];
  }
  return this._type;
};

Node.prototype.pretty = function() {
  var type = this.getType();
  var props = []
  for (var key in this) {
    if (this.hasOwnProperty(key)) {
      var value = this[key];
      if (['block', 'nodes'].indexOf(key) == -1) {
        props.push( key + '=' + JSON.stringify(value))
      }
    }
  }
  output =  type + ": " + props.join(', ')
  if(this.block) {
      output += "\n" + this.block.pretty()
  }
  if(this.nodes) {
    output = '{';
    for (var i in this.nodes) {
      var node = this.nodes[i];
      output += "\n" + node.pretty().replace(/^/gm, '  ')
    }
    output += "\n}"
  }
  return output

// args, attrs, block, buffer, call, debug, escape, expr, key, name
// block, nodes
// obj
// str
// val

};
