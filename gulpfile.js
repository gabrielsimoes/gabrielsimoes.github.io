'use strict';

var absolutify = require('absolutify')
var autoprefixer = require('gulp-autoprefixer');
var csso = require('gulp-csso');
var del = require('del');
var env = require('gulp-environment');
var frontmatter = require('front-matter');
var fs = require('fs');
var gulp = require('gulp');
var ghpages = require('gh-pages');
var hljs = require('highlight.js');
var imagemin = require('gulp-imagemin');
var md = require('markdown-it')({
  html: true,
  linkify: true,
  typographer: true,
  highlight: function (str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return '<pre><code class="language-' + lang + ' hljs">' +
                 hljs.highlight(lang, str, true).value +
                 '</code></pre>';
        } catch (__) {
          // ignore error.
        }
      }

      return '<pre><code class="language-' + lang + ' hljs">' + md.utils.escapeHtml(str) + '</code></pre>';
    }
  })
  .use(require('@iktakahiro/markdown-it-katex'))
  .use(require('markdown-it-task-lists'))
  .use(require('markdown-it-attrs'))
  .use(require('markdown-it-footnote'))
  .use(require('markdown-it-anchor'), {
    permalink: true,
    permalinkClass: 'anchor',
    permalinkSymbol: '¶',
    permalinkBefore: true,
    slugify: function(name) {
      var hash = String(name);
      hash = hash.toLowerCase().replace(/\s/g, "-");
      hash = hash.replace(/[^a-z0-9\u4e00-\u9fa5äüö\-]/g, "");
      hash = hash.replace(/(-)+/g, "-");
      hash = hash.replace(/:-/g, "-");
      return hash;
    }
  });
var plumber = require('gulp-plumber');
var PluginError = require('plugin-error');
var pug = require('pug');
var RSS = require('rss');
var sass = require('gulp-sass');
var sourcemaps = require('gulp-sourcemaps');
var through = require('through2');
var uglify = require('gulp-uglify');
var Vinyl = require('vinyl');
var webserver = require('gulp-webserver');
var yaml = require('js-yaml');

function getData(includeBooksAndTalks) {
  var data = yaml.safeLoad(fs.readFileSync('notes/info.yaml'));

  if (includeBooksAndTalks) {
    data.books = yaml.safeLoad(fs.readFileSync('notes/books.yaml'));
    data.talks = yaml.safeLoad(fs.readFileSync('notes/talks.yaml'));
  }

  data.lastupdate = new Date();

  return data;
}

function url(...paths) {
  return paths.join('/').replace(/([^:]\/)\/+/g, '$1');
}

function processPages(data) {
  if (!data) data = {};
  data.articles = [];

  var articleFn = pug.compileFile('src/pug/article.pug');

  var baseUrl = url('https://' + data.site + '/');
  var feed = new RSS({
    title: data.name + ' at ' + data.site,
    description: data.sitedescription,
    feed_url: url(baseUrl, 'atom.xml'),
    site_url: baseUrl,
    image_url: url(baseUrl, 'me-rss.jpg').toString(),
    language: 'en-us'
  });

  return through.obj(function(file, enc, callback) {
    if (file.isNull()) {
      this.push(file);
      return callback();
    }

    if (file.isStream()) {
      this.emit('error', new PluginError('generatePages', 'Streams are not supported.'));
      return callback();
    }

    if (file.extname == '.pug') {
      data.articles.sort(function(a, b) {
        if (a.date != b.date) return b.date.getTime() - a.date.getTime();
        else if (a.title != b.title) return a.title > b.title ? -1 : 1;
        else return 0;
      });

      let locals = Object.assign(Object.create(data), { filename: file.path });

      file.contents = new Buffer(pug.render(file.contents, locals));
      file.extname = '.html';
    } else if (file.extname == '.md') {
      let matter = frontmatter(String(file.contents));
      let content = md.render(matter.body);
      let locals = Object.assign(Object.create(data), { content: content }, matter.attributes);

      file.contents = new Buffer(articleFn(locals));
      file.extname = '.html';

      let article = Object.assign(matter.attributes, {
        url: url('/', file.relative),
      });

      data.articles.push(article);

      feed.item(Object.assign(article, {
        author: data.name,
        description: absolutify(content, baseUrl),
        url: url(baseUrl, file.relative)
      }));
    } else {
      this.emit('error', new PluginError('generatePages', 'Unsupported file extension.'));
      return callback();
    }

    this.push(file);
    callback();
  }, function(callback) {
    this.push(new Vinyl({
      cwd: '/',
      base: '/',
      path: '/atom.xml',
      contents: new Buffer(feed.xml())
    }));

    callback();
  });
}

gulp.task('pages', function() {
  var data = getData(true);

  return gulp.src([
    'notes/*/**/*.md',
    '!notes/personal/**/*',
    '!notes/personal',
    'src/pug/{index,blog,archive,reading-watching-list}.pug'
  ]).pipe(plumber())
    .pipe(processPages(data))
    .pipe(gulp.dest('dist/'));
});

gulp.task('pages-images', function() {
  return gulp.src([
    'notes/*/**/*.{jpeg,jpg,png,gif,svg}',
    '!notes/personal/**/*',
    '!notes/personal'
  ]).pipe(plumber())
    .pipe(imagemin())
    .pipe(gulp.dest('dist/'));
});

gulp.task('js', function() {
  return gulp.src('src/js/script.js')
    .pipe(plumber())
    .pipe(uglify())
    .pipe(gulp.dest('dist/'));
});

gulp.task('css', function() {
  return gulp.src('src/scss/style.scss')
    .pipe(plumber())
    .pipe(env.if.not.production(sourcemaps.init()))
    .pipe(sass().on('error', sass.logError))
    .pipe(autoprefixer({
      browsers: [
        'ie >= 10',
        'ie_mob >= 10',
        'ff >= 30',
        'chrome >= 34',
        'safari >= 7',
        'opera >= 23',
        'ios >= 7',
        'android >= 4.4',
        'bb >= 10'
      ]
    }))
    .pipe(env.if.production(csso()))
    .pipe(env.if.not.production(sourcemaps.write()))
    .pipe(gulp.dest('dist/'));
});

gulp.task('images', function() {
  return gulp.src('src/img/*')
    .pipe(gulp.dest('dist/'));
});

// TODO: gulp.task('cv', function() {
//   var data = getData(false);
// });

gulp.task('build-source', gulp.parallel('pages', 'js', 'css'))

gulp.task('build-images', gulp.parallel('pages-images', 'images'))

gulp.task('build', gulp.parallel('build-source', 'build-images'));

gulp.task('watch-source', function() {
  gulp.watch([
    'src/**/*',
    'notes/**/*'
  ], gulp.parallel('build-source'));
});

gulp.task('watch-images', function() {
  gulp.watch([
    'src/img/*',
    'notes/**/*.{jpeg,jpg,png,gif,svg}',
  ], gulp.parallel('build-images'));
})

gulp.task('watch', gulp.parallel('watch-source', 'watch-images'))

gulp.task('server', function() {
  return gulp.src('dist/')
    .pipe(webserver({
      host: '0.0.0.0',
      port: '8080',
      // livereload: true
    }));
});

gulp.task('dev', gulp.parallel('watch', 'server'));

gulp.task('clean', function() {
  return del('dist/');
});

gulp.task('deploy', function(callback) {
  ghpages.publish('dist/', {
    branch: 'master',
    message: 'Update ' + new Date().toISOString()
  }, callback);
});
