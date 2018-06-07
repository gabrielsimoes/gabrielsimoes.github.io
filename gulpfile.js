var gulp = require('gulp');
var ghpages = require('gh-pages');

gulp.task('html', function(){
  return gulp.src('assets/html/*.html')
    .pipe(gulp.dest('dist/'))
});

gulp.task('deploy', function(callback) {
  ghpages.publish('dist/', {
      branch: 'master',
  }, callback);
});
