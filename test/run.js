
/**
 * Module dependencies.
 */

var jade = require('../')
  , fs = require('fs')
  , Coffee = require('coffee-script')
  , vm = require('vm');

// test cases

function casesForExt(path, ext) {
  return fs.readdirSync(path).filter(function(file){
    return file.match(ext)
  }).map(function(file){
    return {
      name: file.replace(ext, '').replace(/[-.]/g, ' '),
      jade_path: path + '/' + file,
      html_path: path + '/' + file.replace(ext, '.html'),
    }
  });
}

casesForExt('test/cases', /[.]jade$/).forEach(function(test){
  it(test.name, function(){
    var str = fs.readFileSync(test.jade_path, 'utf8');
    var html = fs.readFileSync(test.html_path, 'utf8').trim().replace(/\r/g, '');
    var fn = jade.compile(str, { filename: test.jade_path, pretty: true });
    var actual = fn({ title: 'Jade' });
    actual.trim().should.equal(html);
  })
});


function lineify(str) {
  var n = 0;
  if (!(typeof str == 'string')) return str
  return str.replace(/^/mg, function () { return "" + ++n + "  "});
}

casesForExt('test/coffee_cases', /[.]jadec$/).forEach(function(test){
  it(test.name, function(){
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
      var actual = fn({ title: 'Jade', interpolated: 'blah blah' }, rt.attrs, rt.escape, rt.rethrow, rt.merge);
      actual.trim().should.equal(html);
    } catch (e) {
      console.log("\nCoffeeScript:\n" + lineify(coffee));
      console.log("\nJavaScript:\n" + lineify(js));
      throw e
    }
  })
});
