exports.testAssert = require('./ringo/assert');
exports.testBase64 = require('./ringo/base64_test');
exports.testArgs = require('./ringo/args_test');
exports.testArray = require('./core/array_test');
exports.testBuffer = require('./ringo/buffer_test');
exports.testObject = require('./core/object_test');
exports.testEncoding = require('./ringo/encoding_test');
exports.testFileutils = require('./ringo/fileutils_test');
exports.testSkin = require('./ringo/skin_test');
exports.testString = require('./core/string_test');
exports.testUtils = require('./ringo/utils_test');
exports.testFilestore = require('./ringo/storage/filestore_test');
exports.testMemstore = require('./ringo/storage/memstore_test');
exports.testFile = require('./file/all');
exports.testBinary = require('./binary/all');
exports.testRepository = require('./repository/all');
exports.testIo = require('./io_test');
exports.testModules = require('./modules/all');

// start the test runner if we're called directly from command line
if (require.main == module.id) {
    require('ringo/unittest').run(exports);
}
