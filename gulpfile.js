var gulp = require('gulp');


gulp.task('html', function(){
  return gulp.src('assets/html/*.html')
    .pipe(gulp.dest('build/html'))
});
