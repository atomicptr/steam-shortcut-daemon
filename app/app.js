var app = require("app");
var Menu = require('menu');
var Tray = require('tray');

var fs = require("fs");
var path = require("path");

var shortcuts = require("./vendor/windows-shortcuts.js");
var ini = require("./vendor/ini.js");

var packageJson = require("./package.json");

if(process.platform != "win32") {
    console.error("steam-shortcut-daemon only makes sense with Windows, derp");
    app.quit();
    return;
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

    shortcuts.create(path, target, function(err) {
        if(err) {
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

var tray = null;
var trayMenu = null;

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
    });

    // create a tray menu
    console.log("create the tray menu");
    tray = new Tray(path.resolve(__dirname, "icons", "icon.png"));

    var trayMenu = Menu.buildFromTemplate([
        {
            label: "Quit",
            type: "normal",
            click: function() {
                fs.unwatchFile(steamShortcutFolder);
                app.quit();
            }
        }
    ]);

    tray.setToolTip("Steam Shortcut Daemon");
    tray.setContextMenu(trayMenu);

    // add steam shortcut exe to start-up folder
    var exeName = path.basename(process.execPath);

    if(exeName.startsWith(packageJson.name)) {
        var lnk = path.resolve(process.env["appdata"], "Microsoft", "Windows", "Start Menu", "Programs", "Startup", packageJson.name + ".lnk");

        fs.exists(lnk, function(exists) {
            if(!exists) {
                console.log("Start menu shortcut doesn't exists -> create one...");

                shortcuts.create(lnk, process.execPath);
            }
        });
    }

    app.on("close", function() {
        tray = null;
        trayMenu = null;
    });
});
