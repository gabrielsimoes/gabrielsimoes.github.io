'use strict';

var absolutify = require('absolutify')
var autoprefixer = require('gulp-autoprefixer');
var csso = require('gulp-csso');
var del = require('del');
var env = require('gulp-environment');
var Feed = require('feed');
var frontmatter = require('front-matter');
var fs = require('fs');
var gulp = require('gulp');
var ghpages = require('gh-pages');
var hljs = require('highlight.js');
var imagemin = require('gulp-imagemin');
var md = require('markdown-it')({
    html: true,
    xhtmlOut: true,
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
  .use(require('markdown-it-inline-comments'))
  .use(require('markdown-it-anchor'), {
    permalink: true,
    permalinkClass: 'anchor',
    permalinkSymbol: '¶',
    permalinkBefore: true,
    slugify: function (name) {
      var hash = String(name);
      hash = hash.toLowerCase().replace(/\s/g, "-");
      hash = hash.replace(/[^a-z0-9\u4e00-\u9fa5äüö\-]/g, "");
      hash = hash.replace(/(-)+/g, "-");
      hash = hash.replace(/:-/g, "-");
      return hash;
    }
  });
var minify = require('html-minifier').minify;
var plumber = require('gulp-plumber');
var PluginError = require('plugin-error');
var path = require('path');
var pug = require('pug');
var puppeteer = require('puppeteer');
var sass = require('gulp-sass');
var sourcemaps = require('gulp-sourcemaps');
var through = require('through2');
var uglify = require('gulp-uglify');
var Vinyl = require('vinyl');
var webserver = require('gulp-webserver');
var xmlbuilder = require('xmlbuilder');
var yaml = require('js-yaml');

function getData() {
  var data = yaml.safeLoad(fs.readFileSync('notes/info.yaml'));
  // data.books = yaml.safeLoad(fs.readFileSync('notes/books.yaml'));
  // data.talks = yaml.safeLoad(fs.readFileSync('notes/talks.yaml'));
  data.lastupdate = new Date();
  return data;
}

function url(...paths) {
  return paths.join('/').replace(/([^:]\/)\/+/g, '$1').replace(/^\/\//, '\/');
}

function compDateTitle(a, b) {
  if (a.date != b.date) return b.date.getTime() - a.date.getTime();
  else if (a.title != b.title) return a.title > b.title ? -1 : 1;
  else return 0;
}

function processPages(data) {
  if (!data) data = {};
  data.articles = [];

  var articleFn = pug.compileFile('src/pug/article.pug');
  var sorted = false;
  var baseUrl = url('https://' + data.site + '/');

  function sort() {
    if (!sorted) {
      data.articles.sort(compDateTitle);
      sorted = true;
    }
  }

  function processPug(file) {
    sort();

    let locals = Object.assign(Object.create(data), {
      filename: file.path
    });

    file.contents = new Buffer(minify(pug.render(file.contents, locals), {
      collapseWhitespace: true,
      conservativeCollapse: true
    }));
    file.extname = '.html';

    this.push(file);
  }

  function processMarkdown(file) {
    var matter = frontmatter(String(file.contents));

    if (matter.attributes.draft) {
      return;
    }

    var content = md.render(matter.body);
    var stats = fs.statSync(file.path);

    file.extname = '.html';

    var article = Object.assign(matter.attributes, {
      url: url('/', file.relative),
      content: content,
      modified: new Date(stats.mtime)
    });

    var locals = Object.assign(Object.create(data), article);

    file.contents = new Buffer(minify(articleFn(locals), {
      collapseWhitespace: true,
      conservativeCollapse: true
    }));

    data.articles.push(article);

    this.push(file);
  }

  function processFeed() {
    sort();

    var feed = new Feed({
      title: data.name + ' at ' + data.site,
      description: data.sitedescription,
      id: baseUrl,
      link: baseUrl,
      image: url(baseUrl, 'me-rss.jpg'),
      favicon: url(baseUrl, 'favicon.ico'),
      feedLinks: {
        atom: url(baseUrl, 'atom.xml')
      },
      author: {
        name: data.name,
        email: data.email,
        link: baseUrl
      }
    });

    for (let article of data.articles) {
      let item = {
        title: article.title,
        date: article.date,
        id: url(baseUrl, article.url),
        link: url(baseUrl, article.url),
        content: absolutify(article.content, baseUrl)
      };

      if (article.subtitle) item.description = article.subtitle;
      if (article.image) item.image = url(baseUrl, article.image);

      feed.addItem(item);
    }

    this.push(new Vinyl({
      cwd: '/',
      base: '/',
      path: '/atom.xml',
      contents: new Buffer(feed.atom1())
    }));
  }

  return through.obj(function (file, enc, callback) {
    if (file.isNull()) {
      this.push(file);
      return callback();
    }

    if (file.isStream()) {
      this.emit('error', new PluginError('processPages', 'Streams are not supported.'));
      return callback();
    }

    if (file.extname == '.pug') {
      processPug.call(this, file);
    } else if (file.extname == '.md') {
      processMarkdown.call(this, file);
    } else {
      this.emit('error', new PluginError('processPages', 'Unsupported file extension.'));
      return callback();
    }

    callback();
  }, function (callback) {
    processFeed.call(this);
    callback();
  });
}

gulp.task('pages', function () {
  var data = getData();

  return gulp.src([
      'notes/*/**/*.md',
      '!notes/personal/**/*',
      '!notes/personal',
      'src/pug/{index,blog,cv-page}.pug'
    ]).pipe(plumber())
    .pipe(processPages(data))
    .pipe(gulp.dest('dist/'));
});

gulp.task('pages-images', function () {
  return gulp.src([
      'notes/*/**/*.{jpeg,jpg,png,gif,svg}',
      '!notes/personal/**/*',
      '!notes/personal'
    ]).pipe(plumber())
    .pipe(imagemin())
    .pipe(gulp.dest('dist/'));
});

gulp.task('js', function () {
  return gulp.src('src/js/{main,serviceworker}.js')
    .pipe(plumber())
    .pipe(uglify())
    .pipe(gulp.dest('dist/'));
});

gulp.task('css', function () {
  return gulp.src('src/scss/{style,cv}.scss')
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

gulp.task('images', function () {
  return gulp.src('src/img/*')
    .pipe(gulp.dest('dist/'));
});

gulp.task('other', function () {
  return gulp.src('src/other/*')
    .pipe(gulp.dest('dist/'));
});

gulp.task('cv', function (callback) {
  (async () => {
    var browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    var page = await browser.newPage();
    await page.goto('file://' + path.join(__dirname, 'dist/cv-page.html'), {
      waitUntil: ['domcontentloaded', 'networkidle0']
    });
    await page.pdf({
      path: 'dist/cv.pdf',
      format: 'Letter'
    });

    await browser.close();

    callback();
  })();
});

gulp.task('build-source', gulp.series(gulp.parallel('pages', 'js', 'css', 'other'), 'cv'));

gulp.task('build-images', gulp.parallel('pages-images', 'images'));

gulp.task('build', gulp.parallel('build-source', 'build-images'));

gulp.task('watch-source', function () {
  gulp.watch([
    'src/**/*',
    'notes/**/*'
  ], gulp.parallel('build-source'));
});

gulp.task('watch-images', function () {
  gulp.watch([
    'src/img/*',
    'notes/**/*.{jpeg,jpg,png,gif,svg}',
  ], gulp.parallel('build-images'));
})

gulp.task('watch', gulp.parallel('watch-source', 'watch-images'))

gulp.task('server', function () {
  return gulp.src('dist/')
    .pipe(webserver({
      host: '0.0.0.0',
      port: '8080',
      // livereload: true
    }));
});

gulp.task('dev', gulp.parallel('watch', 'server'));

gulp.task('clean', function () {
  return del('dist/');
});

gulp.task('deploy', function (callback) {
  ghpages.publish('dist/', {
    branch: 'master',
    message: 'Update ' + new Date().toISOString()
  }, callback);
});
