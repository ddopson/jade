
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

function makeMap(str) {
  array = str.split(',')
  array.contains = function (val) {
    return this.indexOf(val) >= 0;
  }
  return array;
}

var IGNORE_PROPS = makeMap('line,_type,block');
var CODE_PROPS   = makeMap('buffer,escape');
var TAG_PROPS    = makeMap('name');

Node.prototype.pretty = function() {
  var type = this.getType();
  var props = []
  var left = type;
  if (type == 'Code') {
    left += '[' + ((this.buffer) ? ( (this.escape) ? 'buffer-escape' : 'buffer-live') : 'control') + ']';
  } else if (type == 'Tag') {
    if (this.isInline()) {
      props.push("inline");
    } else {
      props.push("block");
    }
    if (this.canInline()) {
      props.push("can_inline")
    }
    var can_inline = this.canInline();
    left += '[' + this.name + ']';
  } else if (type == 'Block') {
    var output = ""
    //output = "{\n";
    for (var i=0,l=this.nodes.length; i<l; i++) {
      var node = this.nodes[i];
      output += node.pretty().replace(/^(?=.)/gm, '  ')
    }
    //output += "}\n"
    return output;
  }

  for (var key in this) {
    if (this.hasOwnProperty(key)) {
      if (IGNORE_PROPS.contains(key)) continue;
      if (type == 'Code' && CODE_PROPS.contains(key)) continue;
      if (type == 'Tag' && TAG_PROPS.contains(key)) continue;
      props.push( key + '=' + JSON.stringify(this[key]))
    }
  }
  var right = props.join(', ');

  var output =  left + ": " + right + "\n"
  if(this.block) {
    output += this.block.pretty()
  }
  if (this.nodes) {
    throw new Error('Pretty sure this does not happen');
  }
  return output

// args, attrs, block, buffer, call, debug, escape, expr, key, name
// block, nodes
// obj
// str
// val

};
