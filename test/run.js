
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

function casesForExt(path, ext) {
  return fs.readdirSync(path).filter(function(file){
    return file.match(ext)
  }).map(function(file){
    return {
      name: file.replace(ext, ''), // .replace(/[-.]/g, ' '),
      jade_path: path + '/' + file,
      html_path: path + '/' + file.replace(ext, '.html'),
    }
  });
}

casesForExt('test/cases', /[.]jade(js)?$/).forEach(function(test){
  it("JadeJS: " + test.name, function(){
    try {
      var str = fs.readFileSync(test.jade_path, 'utf8');
      var html = fs.readFileSync(test.html_path, 'utf8').trim().replace(/\r/g, '');
      var fn = jade.compile(str, { filename: test.jade_path, pretty: true });
      var actual = fn({ title: 'Jade' });
      actual.trim().should.equal(html);
    } catch (e) {
      var ast = jade.parse(str, { filename: test.jade_path, pretty: true});
      var js = jade.compile(str, { filename: test.jade_path, pretty: true, source: true});
      //console.log("\nAST:\n" + lineify(JSON.stringify(ast, true, '  '), test.name + '[AST]:'));
      console.log("\nAST:\n" + lineify(ast.pretty(), test.name + '[AST]:'));
      console.log("\nJavaScript:\n" + lineify(""+js, test.name + '[JS]:'));
      throw e
    }
  })
});

casesForExt('test/cases', /[.]jade(c)?$/).forEach(function(test){
  it("JadeC: " + test.name, function(){
    var str = fs.readFileSync(test.jade_path, 'utf8');
    var html = fs.readFileSync(test.html_path, 'utf8').trim().replace(/\r/g, '');
    var coffee = jade.compile(str, { filename: test.jade_path, pretty: true, coffee: true });
    var n = 0;
    var js
    try {
      js = Coffee.compile(coffee, {bare: true})
      var ctx = vm.Script.createContext()
      var fn = vm.runInContext(js, ctx)
      var rt = jade.runtime;
      var actual = fn({ title: 'Jade', interpolated: 'blah blah' }, rt);
      actual.trim().should.equal(html);
    } catch (e) {
      var ast = jade.parse(str, { filename: test.jade_path, pretty: true, coffee: true });
      console.log("\nAST:\n" + lineify(ast.pretty(), test.name + '[AST]:'));
      console.log("\nCoffeeScript:\n" + lineify(coffee, test.name + '[Coffee]:'));
      console.log("\nJavaScript:\n" + lineify(js, test.name + '[JS]:'));
      throw e
    }
  })
});

var k = 0;
casesForExt('test/cases', /[.]jade(c)?$/).forEach(function(test){
  if (k++ > 20) {
    //return;
  }
  it("RawDomC: " + test.name, function(){
    var str = fs.readFileSync(test.jade_path, 'utf8');
    var html = fs.readFileSync(test.html_path, 'utf8').trim().replace(/\r/g, '');
    var coffee = jade.compile(str, { filename: test.jade_path, coffee: true, rawdom: true });
    var n = 0;
    var js, ctx, fn, rt, nodes, actual;
    var nodeList;
    try {
      js = Coffee.compile(coffee, {bare: true})
      global.document = FakeDocument;
      ctx = vm.Script.createContext({document: FakeDocument})
      fn = vm.runInContext(js, ctx)
      rt = jade.runtime;
      nodes = fn({ title: 'Jade', interpolated: 'blah blah'}, rt);
      actual = nodes.toHtml();

      // Hack, since classList can't represent the difference between 'class' being "undefined" vs "empty string"
      html = html.replace(' class=""', '');

      actual.trim().should.equal(html);
    } catch (e) {
      if(e === 'Fail') {
        console.log("Skipping " + test.jade_path);
        return;
      }
      var ast = jade.parse(str, { filename: test.jade_path, pretty: true, coffee: true });
      var altjs = jade.compile(str, { filename: test.jade_path, pretty: false, source: true, compileDebug: false});
      console.log("\nJade:\n" + lineify(str, test.name + '[Jade]:'));
      console.log("\nAST:\n" + lineify(ast.pretty(), test.name + '[AST]:'));
      console.log("\nCoffeeScript:\n" + lineify(coffee, test.name + '[Coffee]:'));
      console.log("\nJavaScript:\n" + lineify(js, test.name + '[JS]:'));
      console.log("\nNormalJadeOutput:\n" + lineify(altjs, test.name + '[NORM]:'));
      console.log("\nNodeList:\n" + lineify(util.inspect(nodeList, false, 99), test.name + '[NodeList]:'));
      console.log("\nRAW_TXT1: \n" + JSON.stringify(actual));
      console.log("\nRAW_TXT2: \n" + JSON.stringify(html));
      throw e
    } finally {
      delete global.document;
    }
  })
});


