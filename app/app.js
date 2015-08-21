var app = require("app");
var fs = require("fs");
var path = require("path");

var shortcuts = require("./vendor/windows-shortcuts.js");
var ini = require("./vendor/ini.js");

if(process.platform != "win32") {
    throw "steam-shortcut-daemon only makes sense with Windows, derp";
    app.quit();
}

function getSteamShortcutFolder() {
    var appdata = process.env["appdata"];

    return path.resolve(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Steam");
}

function createShortcutToUrl(path, url, icon) {
    var target = {
        target: "%WINDIR%/explorer.exe",
        args: url,
        icon: icon.file,
        iconIndex: icon.index
    }

    shortcuts.create(path, target, function(error) {
        if(error) {
            throw err;
        }
    });
}

function checkForChanges() {
    var steamShortcutFolder = getSteamShortcutFolder();

    // read all files in steam shortcut directory
    fs.readdir(steamShortcutFolder, function(err, files) {
        if(err) {
            throw err;
        }

        // check if .lnk file already exists
        files.forEach(function(file) {
            var basename = path.basename(file);

            // found a lnk file, check if the url file still exists, if not delete the .lnk file
            // because this means the user has deleted the game already :)
            if(basename.endsWith(".lnk")) {
                var lnkPath = path.resolve(steamShortcutFolder, file);
                var urlPath = path.resolve(steamShortcutFolder, path.basename(file, ".lnk") + ".url");

                fs.exists(urlPath, function(fileExists) {
                    if(!fileExists) {
                        fs.unlink(lnkPath, function(err) {
                            if(err) {
                                throw err;
                            } else {
                                console.log("deleted " + lnkPath);
                            }
                        });
                    }
                });
            }

            // found a .url file
            if(basename.endsWith(".url")) {
                var urlPath = path.resolve(steamShortcutFolder, file);
                var lnkPath = path.resolve(steamShortcutFolder, path.basename(file, ".url") + ".lnk");

                fs.exists(lnkPath, function(fileExists) {
                    // no .lnk here, create one
                    if(!fileExists) {
                        console.log(lnkPath + " does not exist...");
                        console.log("reading... " + urlPath);

                        var data = fs.readFile(urlPath, function(err, data) {
                            if(err) {
                                throw err;
                            }

                            var content = data.toString();

                            var game = ini.parse(content);

                            var url = game.InternetShortcut.URL;

                            var icon = {
                                file: game.InternetShortcut.IconFile,
                                index: game.InternetShortcut.IconIndex
                            };

                            createShortcutToUrl(lnkPath, url, icon);

                            console.log("created shortcut for " + path.basename(lnkPath, ".lnk"));
                        });
                    }
                });
            }
        });
    });
}

app.on("ready", function() {
    var steamShortcutFolder = getSteamShortcutFolder();

    // check for changes once at startup
    checkForChanges();

    console.log("watching " + steamShortcutFolder + " for changes...");
    fs.watch(steamShortcutFolder, function(event, filename) {
        console.log("event: " + event + " from file: " + filename);

        // this will be called whenever a file is added or removed
        if(event == "rename") {
            checkForChanges();
        }
    })
});
