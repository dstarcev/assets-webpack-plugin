var merge = require('lodash.merge');

var getAssetKind = require('./lib/getAssetKind');
var isHMRUpdate = require('./lib/isHMRUpdate');
var isSourceMap = require('./lib/isSourceMap');

var createQueuedWriter = require('./lib/output/createQueuedWriter');
var createOutputWriter = require('./lib/output/createOutputWriter');

var getHashCode = function (str) {
	var hash = 0, i, chr, len;
	if (str.length == 0) return hash;
	for (i = 0, len = str.length; i < len; i++) {
		chr = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + chr;
		hash |= 0; // Convert to 32bit integer
	}
	return hash;
};

var getServerNumber = function (resourceUrl, serverCount) {
	var hash = Math.abs(getHashCode(resourceUrl));
	var hashPosition = hash / 2147483647;
	return Math.round((serverCount - 1) * hashPosition);
};

function AssetsWebpackPlugin (options) {
  this.options = merge({}, {
    path: '.',
    filename: 'webpack-assets.json',
    prettyPrint: false,
    update: false,
    fullPath: true
  }, options);
  this.writer = createQueuedWriter(createOutputWriter(this.options));
}

AssetsWebpackPlugin.prototype = {

  constructor: AssetsWebpackPlugin,

  apply: function (compiler) {
    var self = this;

    compiler.plugin('after-emit', function (compilation, callback) {

      var options = compiler.options;
      var stats = compilation.getStats().toJson({
        hash: true,
        publicPath: true,
        assets: true,
        chunks: false,
        modules: false,
        source: false,
        errorDetails: false,
        timings: false
      });
            // publicPath with resolved [hash] placeholder

      var assetPath = (stats.publicPath && self.options.fullPath) ? stats.publicPath : '';
            // assetsByChunkName contains a hash with the bundle names and the produced files
            // e.g. { one: 'one-bundle.js', two: 'two-bundle.js' }
            // in some cases (when using a plugin or source maps) it might contain an array of produced files
            // e.g. {
            // main:
            //   [ 'index-bundle-42b6e1ec4fa8c5f0303e.js',
            //     'index-bundle-42b6e1ec4fa8c5f0303e.js.map' ]
            // }
      var assetsByChunkName = stats.assetsByChunkName;

      var output = Object.keys(assetsByChunkName).reduce(function (chunkMap, chunkName) {
        var assets = assetsByChunkName[chunkName];
        if (!Array.isArray(assets)) {
          assets = [assets];
        }
        chunkMap[chunkName] = assets.reduce(function (typeMap, asset) {
          if (isHMRUpdate(options, asset) || isSourceMap(options, asset)) {
            return typeMap;
          }

          var typeName = getAssetKind(options, asset);
		  
		  if (Array.isArray(self.options.hosts) && self.options.hosts.length) {
			var host = self.options.hosts[getServerNumber(asset, self.options.hosts.length)];
			typeMap[typeName] = '//' + host + assetPath + asset;
		  }
		  else {
			typeMap[typeName] = assetPath + asset;
		  }

          return typeMap;
        }, {});

        return chunkMap;
      }, {});

      self.writer(output, function (err) {
        if (err) {
          compilation.errors.push(err);
        }
        callback();
      });

    });
  }
};

module.exports = AssetsWebpackPlugin;
