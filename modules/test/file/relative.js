
include('helma/unittest');
var fs = require('file');

var tests = [
    ['', '', ''],
    ['.', '', ''],
    ['', '.', ''],
    ['.', '.', ''],
    ['', '..', '../'],
    ['', '../', '../'],
    ['a', 'b', 'b'],
    ['../a', '../b', 'b'],
    ['../a/b', '../a/c', 'c'],
    ['a/b', '..', '../../'],
    ['a/b', 'c', '../c'],
    ['a/b', 'c/d', '../c/d'],
];

tests.forEach(function ([source, target, expected]) {
    var name = '"' + source + '" -> "' + target + '" = "' + expected + '"';
    exports['test ' + name] = function () {
        var actual = fs.relative(source, target);
        assertEqual(expected, actual);
    };
});

if (require.main === module.id) {
    run(exports);
}