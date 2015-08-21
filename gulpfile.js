var gulp = require("gulp");
var electron = require("gulp-electron");
var run = require("gulp-run-electron");
var windowsInstaller = require("electron-windows-installer");
var packageJson = require("./app/package.json");

var path = require("path");

var configs = {
    ELECTRON_VERSION: "v0.31.0",
    PRODUCT_NAME: packageJson.productName,
    APP_NAME: packageJson.name,
    APP_VERSION: packageJson.version,
    DESCRIPTION: packageJson.description,
    ICON_URL_PNG: path.resolve(__dirname, "./app/icons/icon.png"),
    AUTHORS: "kasoki"
};

gulp.task("run", function() {
    gulp.src("app").pipe(run([], {}));
});

gulp.task("copy-shortcut-exe", function(folder) {
    var shortcutExeTarget = path.resolve(__dirname, "build", configs.ELECTRON_VERSION, "win32-x64", "vendor");

    var fs = require("fs");

    fs.mkdirSync(shortcutExeTarget);

    return gulp.src("app/vendor/shortcut.exe").pipe(gulp.dest(shortcutExeTarget));
});

gulp.task("build", function() {
    var electronSettings = electron({
        src: "./app",
        packageJson: packageJson,
        release: "./build",
        cache: "./cache",
        version: configs.ELECTRON_VERSION,
        packaging: false,
        asar: false,
        platforms: ["win32-x64"],
        platformResources: {
            win: {
                "version-string": configs.APP_VERSION,
                "file-version": configs.APP_VERSION,
                "product-version": configs.APP_VERSION,
                icon: "./app/icons/icon.ico"
            }
        }
    });

    return gulp.src("").pipe(electronSettings).pipe(gulp.dest(""));
});

gulp.task("package", ["build", "copy-shortcut-exe"]);

gulp.task("build-installer", [], function(done) {
    windowsInstaller({
        appDirectory: path.resolve(__dirname, "build", configs.ELECTRON_VERSION, "win32-x64"),
        authors: configs.AUTHORS,
        productName: configs.PRODUCT_NAME,
        description: configs.DESCRIPTION,
        version: configs.APP_VERSION,
        iconUrl: configs.ICON_URL_PNG,
        setupIcon: path.resolve(__dirname, "./app/icons/icon.ico")
    });
});
