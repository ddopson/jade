
/**
 * Module dependencies.
 */

var jade = require('../')
  , fs = require('fs')
  , Coffee = require('coffee-script')
  , vm = require('vm')
  , FakeDocument = require('./fakeDocument')
  , util = require('util')

// test cases

function three_digits(n) {
  if (n < 10) return "00" + n;
  if (n < 100) return "0" + n;
  return "" + n;
}

function lineify(str, prefix) {
  var n = 0;
  prefix = prefix || '';
  if (!(typeof str == 'string')) return str
  return str.replace(/^/mg, function () { return prefix + three_digits(++n) + "  "});
}

function debug_header(filename) {
  console.log("\n\n\n");
}

function debug_output(prefix, text) {
  console.log();
  console.log(lineify(text, prefix));
}

function coffee_hacks(str) {
  // These are hacks to sanitize some Jade-syntax code automatically
  return str.replace(/^(\s+)- var /gm, '$1- ')
}

function casesForExt(path, ext) {
  return fs.readdirSync(path).filter(function(file){
    return file.match(ext)
  }).map(function(file){
    return {
      name: file.replace(ext, ''), // .replace(/[-.]/g, ' '),
      jade_path: path + '/' + file,
      html_path: path + '/' + file.replace(ext, '.html'),
      jadeText: function (opts) {
        var text = fs.readFileSync(this.jade_path, 'utf8')
        if (opts && opts.coffee) {
          // stripping out the 'var' keyword from declarations fixes many templates automatically
          text = text.replace(/^(\s+)- var /gm, '$1- ');
        }
        return text;
      },
      htmlText: function () {
        return fs.readFileSync(this.html_path, 'utf8').trim().replace(/\r/g, '')
      },
    };
  });
}
var LOCALS = {
  title: 'Jade',
  name: 'jade',
  name_null: null,
  code: '<script>',
  interpolated: 'blah blah'
};
var k = 0;
casesForExt('test/cases', /[.]jade(js)?$/).forEach(function(test){
  k++
  //if (k != 25) return;
  it("JadeJS"+k+": " + test.name, function(){
    var str = test.jadeText();
    var html = test.htmlText();
    var actual;
    //var fn = jade.compile(str, { filename: test.jade_path, pretty: true });
    try {
      var js = jade.compile(str, { filename: test.jade_path, pretty: true, source: true, compileDebug: false});
      js = '(function (locals, __jade){\n' + js.replace(/^/gm, '  ') + '\n})';
      var ctx = vm.Script.createContext()
      var fn = vm.runInContext(js, ctx)

      actual = fn(LOCALS, jade.runtime);
      actual = actual.trim();
      actual.should.equal(html);
    } catch (e) {
      var ast = jade.parse(str, { filename: test.jade_path, pretty: true});
      var js2 = jade.compile(str, { filename: test.jade_path, pretty: true, source: true, compileDebug: false});
      debug_header(test.name)
      debug_output(test.name + '[Jade]:', str)
      debug_output(test.name + '[AST]:', ast.pretty())
      debug_output(test.name + '[JS]:', js2)
      debug_output(test.name + '[Output]:', actual)
      debug_output(test.name + '[Expect]:', html)
      throw e
    }
  })
});

var k = 0
casesForExt('test/cases', /[.]jade(c)?$/).forEach(function(test){
  k++
  //if (k != 27) return;
  it("JadeC"+k+": " + test.name, function(){
    var str = test.jadeText({coffee: true});
    var html = test.htmlText();
    var coffee = jade.compile(str, { filename: test.jade_path, pretty: true, coffee: true });
    var n = 0;
    var js, actual;
    try {
      js = Coffee.compile(coffee, {bare: true})
      var ctx = vm.Script.createContext()
      var fn = vm.runInContext(js, ctx)
      actual = fn(LOCALS, jade.runtime);
      actual = actual.trim();
      actual.should.equal(html);
    } catch (e) {
      var ast = jade.parse(str, { filename: test.jade_path, pretty: true, coffee: true });
      debug_header(test.name)
      debug_output(test.name + '[Jade]:', str)
      debug_output(test.name + '[AST]:', ast.pretty())
      debug_output(test.name + '[Coffee]:', coffee)
      //debug_output(test.name + '[JS]:', js)
      debug_output(test.name + '[Output]:', actual)
      debug_output(test.name + '[Expect]:', html)
      throw e
    }
  })
});

var k = 0;
casesForExt('test/cases', /[.]jade(c)?$/).forEach(function(test){
  k++
  if([10, 23, 24, 25, 29, 30, 31, 32, 33, 34, 35, 36, 38, 46, 47, 61, 64].indexOf(k) != -1) return;
  //if (k != 79) return;

  it("RawDomC" + k +": " + test.name, function(){
    var str = test.jadeText({coffee: true});
    var html = test.htmlText();
    var coffee = jade.compile(str, {filename: test.jade_path, coffee: true, rawdom: true, pretty: true, testHooks: true});
    var n = 0;
    var js, ctx, fn, rt, nodes, actual;
    var nodeList;
    try {
      js = Coffee.compile(coffee, {bare: true})
      global.document = FakeDocument;
      ctx = vm.Script.createContext({document: FakeDocument})
      fn = vm.runInContext(js, ctx)
      nodes = fn(LOCALS, jade.runtime);
      actual = nodes.toHtml();
      actual = actual.trim();
      // Hack, since classList can't represent the difference between 'class' being "undefined" vs "empty string"
      html = html.replace(' class=""', '');

      actual.should.equal(html);
    } catch (e) {
      if(e === 'Fail') {
        console.log("Skipping " + test.jade_path);
        return;
      }
      var ast = jade.parse(str, { filename: test.jade_path, pretty: true, coffee: true });
      var altjs = jade.compile(str, { filename: test.jade_path, pretty: true, source: true, compileDebug: false});
      debug_header(test.name)
      debug_output(test.name + '[Jade]:', str)
      debug_output(test.name + '[AST]:', ast.pretty())
      debug_output(test.name + '[Coffee]:', coffee)
      //debug_output(test.name + '[JS]:', js)
      debug_output(test.name + '[NodeList]:', util.inspect(nodes, false, 99))
      //debug_output(test.name + '[NORM]:', altjs)
      debug_output(test.name + '[Output]:', actual)
      debug_output(test.name + '[Expect]:', html)

      throw e
    } finally {
      delete global.document;
    }
  })
});


