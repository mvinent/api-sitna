﻿var gulp = require('gulp'),
    del = require('del'),
    //jshint = require('gulp-jshint'),
    replace = require('gulp-replace'),
    concat = require('gulp-concat'),
    //convertEncoding = require('gulp-convert-encoding'),
    minify = require('gulp-minify'),
    cleanCSS = require('gulp-clean-css'),
    dust = require('dustjs-linkedin'),
    handlebars = require('handlebars'),
    zip = require('gulp-zip'),
    jsonlint = require("gulp-jsonlint"),
    mocha = require('gulp-mocha'),
    //mochaPhantomJS = require('gulp-mocha-phantomjs'),
    casperJs = require('gulp-casperjs'),
    jsdoc = require('gulp-jsdoc3'),
    filter = require('gulp-filter'),
    webpack = require('webpack-stream'),
    ncp = require('ncp'),
    fs = require('fs');
var execSync = require('child_process').execSync;

////////// Gestión de errores ////////
//var plumber = require('gulp-plumber');
//var gutil = require('gulp-util');

//var gulp_src = gulp.src;
//gulp.src = function () {
//    return gulp_src.apply(gulp, arguments)
//        .pipe(plumber(function (error) {
//            // Output an error message
//            gutil.log(gutil.colors.red('Error (' + error.plugin + '): ' + error.message));
//            // emit the end event, to properly end the task
//            this.emit('end');
//        })
//        );
//};
////////////////////////////////


var sitnaBuild = {
    targetPath: 'build/',
    preSrc: [
        'node_modules/dustjs-linkedin/dist/dust-full.js',
        'node_modules/dustjs-helpers/dist/dust-helpers.js',
        'lib/dust/dustjs-i18n.js',
        'lib/dust/dust.overrides.js',
        'lib/jsnlog/jsnlog.min.js',
        'node_modules/handlebars/dist/handlebars.runtime.min.js',
        'node_modules/jszip/dist/jszip.js'
    ],
    postSrc: [
        'TC/ui/autocomplete.js',
        'lib/draggabilly/draggabilly.pkgd.min.js',
        'node_modules/sortablejs/Sortable.min.js',
        'lib/qrcode/qrcode.min.js',
        'lib/jsonpack/jsonpack.min.js',
        'node_modules/ua-parser-js/dist/ua-parser.min.js',
        'node_modules/proj4/dist/proj4.js',
        'TC/tool/Proxification.js',
        'TC/Map.js',
        'TC/Util.js',
        'tcmap.js',
        'lib/handlebars/helpers.js',
        'node_modules/localforage/dist/localforage.min.js',
        'TC/Layer.js',
        'TC/Control.js',
        'TC/Feature.js',
        'TC/feature/Point.js',
        'TC/feature/**/*.js',
        'TC/filter.js',
        'TC/control/MapContents.js',
        'TC/control/MapInfo.js',
        'TC/control/TOC.js',
        'TC/control/WorkLayerManager.js',
        'TC/control/Click.js',
        'TC/control/FeatureInfoCommons.js',
        'TC/control/Scale.js',
        'TC/control/SWCacheClient.js',
        'TC/control/Measure.js',
        'TC/control/ProjectionSelector.js',
        'TC/control/Container.js',
        'TC/control/TabContainer.js',
        'TC/ol/**/*.js',
        'TC/control/**/*.js',
        'TC/layer/**/*.js',
        'TC/Geometry.js'
    ],
    sitnaSrc: [
        'sitna.js'
    ],

    unsetDebug: function (stream) {
        return stream.pipe(replace("TC.isDebug = true;", "TC.isDebug = false;"));
    },

    setVersionDate: function (stream) {
        return stream.pipe(replace(/TC.version = '(\d+\.\d+\.\d+)';/, function (match, p1) {
            return "TC.version = '" + p1 + " [" + (new Date()).toLocaleString() + "]';";
        }));
    },

    replaceTemplates: function (stream) {
        return stream
            .pipe(replace(/(\w+)\.template = TC\.apiLocation \+ \"TC\/templates\/(.+)\.html\";/g, function (match, p1, p2) {
                return p1 + ".template = " + sitnaBuild.templateFunctions[p2 + '.html'].replace("\"________\"", p1 + ".CLASS");
            }))
            .pipe(replace(/(\w+)\.template\[(.+)\] = TC\.apiLocation \+ \"TC\/templates\/(.+)\.html\";/g, function (match, p1, p2, p3) {
                return p1 + ".template[" + p2 + "] = " + sitnaBuild.templateFunctions[p3 + '.html'].replace("\"________\"", p2);
            }));
    },

    replaceTemplates_hbs: function (stream) {
        return stream
            .pipe(replace(/(\w+)\.template = TC\.apiLocation \+ \"TC\/templates\/(.+)\.hbs\";/g, function (match, p1, p2) {
                return p1 + ".template = " + sitnaBuild.templateFunctions[p2 + '.hbs'].replace("\"________\"", p1 + ".CLASS");
            }))
            .pipe(replace(/(\w+)\.template\[(.+)\] = TC\.apiLocation \+ \"TC\/templates\/(.+)\.hbs\";/g, function (match, p1, p2, p3) {
                return p1 + ".template[" + p2 + "] = " + sitnaBuild.templateFunctions[p3 + '.hbs'].replace("\"________\"", p2);
            }));
    },

    compiledTask: function () {
        const olSitnaJS = ['lib/ol/build/ol-sitna.min.js'];
        const src = sitnaBuild.preSrc.concat(olSitnaJS, sitnaBuild.postSrc, sitnaBuild.sitnaSrc);
        return sitnaBuild.setVersionDate(gulp.src(src).pipe(filter(sitnaBuild.projectFiles.concat(olSitnaJS))))
            .pipe(concat('sitna.ol.debug.js'))
            .pipe(gulp.dest(sitnaBuild.targetPath));
    },

    onDemandTask: function (src, dest) {
        var stream = sitnaBuild.setVersionDate(gulp.src(src, { sourcemaps: true }))
            .pipe(filter(sitnaBuild.projectFiles))
            .pipe(gulp.dest(dest));
        return sitnaBuild.replaceTemplates(sitnaBuild.unsetDebug(stream))
            .pipe(minify({
                ext: {
                    min: '.min.js'
                },
                noSource: true,
                compress: { sequences: false },
                output: { ascii_only: true }
            }))
            .pipe(gulp.dest(dest, { sourcemaps: './maps' }));
    },
};

function buildCsprojFilter(cb) {
    fs.readFile('./API.csproj', 'utf8', (err, data) => {
        if (err) throw err;
        sitnaBuild.projectFiles = data
            .split('\n')
            .filter(l => l.includes('<Content '))
            .map(l => l.match(/Include=\"(.+)"/)[1])
            .map(l => l.replace(/\\/g, '/'));
        cb();
    });
};

function copyLibraries(cb) {
    let counter = 0;
    const copyDir = function (src, dest) {
        sitnaBuild.projectFiles.push(src + '**/*');
        sitnaBuild.projectFiles.push(dest + '**/*');
        counter++;
        ncp(src, dest, function (err) {
            if (err) {
                return console.error(err);
            }
            counter--;
            if (!counter) {
                cb();
            }
        });
    };
    const copyFile = function (src, dest) {
        fs.copyFileSync(src, dest);
        sitnaBuild.projectFiles.push(src);
        sitnaBuild.projectFiles.push(dest);
    };
    copyFile('node_modules/dustjs-linkedin/dist/dust-full.js', 'lib/dust/dust-full.js');
    copyFile('node_modules/dustjs-linkedin/dist/dust-full.min.js', 'lib/dust/dust-full.min.js');
    copyFile('node_modules/dustjs-helpers/dist/dust-helpers.js', 'lib/dust/dust-helpers.js');
    copyFile('node_modules/dustjs-helpers/dist/dust-helpers.min.js', 'lib/dust/dust-helpers.min.js');
    copyFile('node_modules/handlebars/dist/handlebars.js', 'lib/handlebars/handlebars.js');
    copyFile('node_modules/handlebars/dist/handlebars.min.js', 'lib/handlebars/handlebars.min.js');
    copyFile('node_modules/handlebars/dist/handlebars.runtime.js', 'lib/handlebars/handlebars.runtime.js');
    copyFile('node_modules/handlebars/dist/handlebars.runtime.min.js', 'lib/handlebars/handlebars.runtime.min.js');
    if (!fs.existsSync('lib/sortable')) {
        fs.mkdirSync('lib/sortable');
    }
    copyFile('node_modules/sortablejs/Sortable.js', 'lib/sortable/Sortable.js');
    copyFile('node_modules/sortablejs/Sortable.min.js', 'lib/sortable/Sortable.min.js');
    copyFile('node_modules/jszip/dist/jszip.js', 'lib/jszip/jszip.js');
    copyDir('node_modules/localforage/dist/', 'lib/localforage/');
    copyDir('node_modules/proj4/dist/', 'lib/proj4js/');
    copyDir('node_modules/draggabilly/dist/', 'lib/draggabilly/');
    copyDir('node_modules/ua-parser-js/dist/', 'lib/ua-parser/');
};

sitnaBuild.templateFunctions = {};
function compileTemplates(cb) {
    const path = 'TC/templates/';
    fs.readdir(path, function (err, files) {
        if (err) {
            return console.error(err);
        }
        files
            .filter(f => f.endsWith('.html'))
            .forEach(function (file) {
                sitnaBuild.templateFunctions[file] = dust
                    .compile(fs.readFileSync(path + file, "utf8"), "________")
                    .toString()
                    .replace("(function(dust)", "function()")
                    .replace("(dust))", "");
            });
        cb();
    });
};

function compileTemplates_hbs(cb) {
    const path = 'TC/templates/';
    fs.readdir(path, function (err, files) {
        if (err) {
            return console.error(err);
        }
        files
            .filter(f => f.endsWith('.hbs'))
            .forEach(function (file) {
                sitnaBuild.templateFunctions[file] = handlebars
                    .precompile(fs.readFileSync(path + file, "utf8"), {
                        knownHelpers: {
                            i18n: true,
                            gt: true,
                            lt: true,
                            eq: true,
                            round: true,
                            lowerCase: true,
                            startsWith: true,
                            numberSeparator: true,
                            countif: true
                        },
                        knownHelpersOnly: true
                    })
                    .replace(/\n/g, "");
        });
        cb();
    });
};

function bundle (cb) {
    sitnaBuild.onDemandTask(['sitna.js'], sitnaBuild.targetPath);
    sitnaBuild.onDemandTask(['tcmap.js'], sitnaBuild.targetPath);
    sitnaBuild.onDemandTask(['TC/**/*.js'], sitnaBuild.targetPath + 'TC/');
    sitnaBuild.compiledTask();
    cb();
};

function minifyBundle(cb) {
    const src = sitnaBuild.targetPath + 'sitna.ol.debug.js';
    const watcher = gulp.watch(src, { events: 'add' }, function () {
        const stream = gulp.src([src], { sourcemaps: true });
        watcher.close();
        cb();
        return sitnaBuild.replaceTemplates(sitnaBuild.unsetDebug(stream))
            .pipe(minify({
                ext: {
                    min: [/(.*)\.debug\.js$/, '$1.min.js']
                },
                noSource: true,
                compress: { sequences: false },
                output: { ascii_only: true }
            })) // sequences = false para evitar error "Maximum call stack size exceeded"
            .pipe(gulp.dest(sitnaBuild.targetPath, { sourcemaps: './maps' }));
    });
};

function resources() {
    return gulp.src([
        '**/*',
        '!App_Start/**/*',
        '!batch/**/*',
        '!build/**/*',
        '!doc/**/*',
        '!examples/**/*.html',
        '!kml/**/*',
        '!images/**/*',
        '!screenshots/**/*',
        '!node_modules/**/*',
        '!obj/**/*',
        '!Properties/**/*',
        '!pruebas/**/*',
        '!TC/**/*.js',
        '!lib/cesium/debug/CesiumSrc.js',
        '!lib/cesium/release/CesiumSrc.js',
        '!TC/**/*.css',
        '!test/**/*',
        '!**/*.cs',
        '!*',
        '!bin/*.pdb', //exclude symbol files
        '!bin/*.dll.config',
        '!bin/*.xml'
    ])
        .pipe(filter(sitnaBuild.projectFiles))
        .pipe(gulp.dest(sitnaBuild.targetPath));
};

function examples() {
    return gulp.src([
        'examples/**/*.html'
    ], { removeBOM: false })
        .pipe(filter(sitnaBuild.projectFiles))
        .pipe(gulp.dest(sitnaBuild.targetPath + 'examples/'));
};

function zipLayout () {
    return gulp.src([
        'TC/layout/responsive/**/*'
    ])
        .pipe(filter(sitnaBuild.projectFiles))
        .pipe(zip('responsive.zip'))
        .pipe(gulp.dest(sitnaBuild.targetPath + 'TC/layout/responsive/'));
};

function baseCss() {
    return gulp.src([
        'TC/**/*.css',
        '!TC/css/control/**/*',
        '!TC/**/style.css'
    ])
        .pipe(filter(sitnaBuild.projectFiles))
        .pipe(cleanCSS({
            level: 0
        }))
        .pipe(gulp.dest(sitnaBuild.targetPath + 'TC/'));
};

function layoutCss() {
    return gulp.src([
        'TC/**/style.css'
    ])
        .pipe(filter(sitnaBuild.projectFiles))
        .pipe(gulp.dest(sitnaBuild.targetPath + 'TC/'));
};

function jsonValidate() {
    return gulp.src("TC/**/*.json")
        .pipe(filter(sitnaBuild.projectFiles))
        .pipe(jsonlint())
        .pipe(jsonlint.reporter())
        .pipe(jsonlint.failOnError());
};

function bundleOLDebug () {
    return gulp.src('batch/ol-webpack/main.js')
        .pipe(webpack({
            output: {
                filename: 'ol-sitna.js',
                library: 'ol'
            },
            mode: 'development'
        }))
        .pipe(gulp.dest('lib/ol/build'));
};

function bundleOLRelease () {
    return gulp.src('batch/ol-webpack/main.js')
        .pipe(webpack({
            output: {
                filename: 'ol-sitna.min.js',
                library: 'ol'
            },
            mode: 'production'
        }))
        .pipe(gulp.dest('lib/ol/build'));
};

function clean (cb) {
    del([
        sitnaBuild.targetPath + '**/*',
        '!' + sitnaBuild.targetPath
    ], cb);
};

function unitTests (cb) {
    const reportDir = 'test/unit/testResults';
    del(reportDir + '/**/*', function () {
        //var browserStream = mochaPhantomJS({
        //    reporter: 'spec',
        //    dump: reportDir + '/browserTestResults.txt'
        //})
        //browserStream.write({ path: 'http://localhost:56187/test/unit/browser/runner.html' });
        //browserStream.end();

        gulp.src(['test/unit/node/**/*.js'], { read: false })
            .pipe(mocha({
                reporter: 'mochawesome',
                reporterOptions: 'reportDir=' + reportDir + ',reportFilename=nodeTestResults'
            }));
        cb();
    });
};

function e2eTests () {
    return gulp.src('test/endToEnd/test.js').pipe(casperJs());
};

//gulp.task('rasterJSTest', function () {
//    const reportDir = 'test/unit/testResults';

//    //return gulp.src(['test/unit/browser/layer/Raster.js'], { read: false })
//    //            .pipe(mocha({
//    //                reporter: 'mochawesome',
//    //                reporterOptions: 'reportDir=' + reportDir + ',reportFilename=nodeTestResults'
//    //            }));
//    return del(reportDir + '/**/*', function () {
//        var browserStream = mochaPhantomJS({
//            reporter: 'spec',
//            dump: reportDir + '/browserTestResults.txt'
//        })
//        browserStream.write({ path: 'http://localhost:56187/test/unit/browser/runner.html' });
//        browserStream.end();

//        return browserStream;

//    });
//});

function _olddoc (cb) {
    var buildDir = 'build';
    if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir);
    }
    execSync('yuidoc -c ./batch/yuidoc.json --theme sitna --themedir ./batch/yuidoc-theme/sitna --outdir build/olddoc --exclude sitna.js,tcmap.js,build,examples,lib,test,TC .');
    cb();
};

function bundleCesiumDebugMergeTerrain () {
    return gulp.src(['lib/cesium/debug/CesiumSrc.js', 'TC/cesium/mergeTerrainProvider/MergeTerrainProvider.js'])
        .pipe(concat('Cesium.js'))
        .pipe(gulp.dest('lib/cesium/debug'));
};

function bundleCesiumReleaseMergeTerrain () {
    gulp.src(['TC/cesium/mergeTerrainProvider/MergeTerrainProvider.js'])
        .pipe(minify({
            compress: { sequences: false },
            output: { ascii_only: true }
        }))
        .pipe(gulp.dest('TC/cesium/mergeTerrainProvider'));

    return gulp.src(['lib/cesium/release/CesiumSrc.js', 'TC/cesium/mergeTerrainProvider/MergeTerrainProvider-min.js'])
        .pipe(concat('Cesium.js'))
        .pipe(gulp.dest('lib/cesium/release'));
};

function doc (cb) {
    var config = require('./batch/jsdoc/conf.json');
    return gulp.src(['./batch/jsdoc/README.md'], { read: false })
        .pipe(jsdoc(config, cb));
};

const bundleAPI = gulp.series(
    bundle,
    minifyBundle
);

const parallelTasks = gulp.parallel(
    doc,
    resources,
    zipLayout,
    baseCss,
    layoutCss,
    examples,
    bundleAPI
);

exports.clean = clean;
exports.unitTests = unitTests;
exports.e2eTests = e2eTests;
exports.doc = doc;
exports.bundleCesiumDebugMergeTerrain = bundleCesiumDebugMergeTerrain;
exports.bundleCesiumReleaseMergeTerrain = bundleCesiumReleaseMergeTerrain;
exports.noTests = gulp.series(
    clean,
    buildCsprojFilter,
    compileTemplates,
    bundleOLDebug,
    bundleOLRelease,
    jsonValidate,
    copyLibraries,
    parallelTasks
);
exports.default = gulp.series(
    clean,
    buildCsprojFilter,
    compileTemplates,
    bundleOLDebug,
    bundleOLRelease,
    jsonValidate,
    copyLibraries,
    unitTests,
    //e2eTests,
    parallelTasks
);