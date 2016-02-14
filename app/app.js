var app = require("app");
var Menu = require('menu');
var Tray = require('tray');

var fs = require("fs");
var path = require("path");
var spawn = require("child_process").spawn;

var shortcuts = require("./vendor/windows-shortcuts.js");
var ini = require("./vendor/ini.js");
var Logger = require("./vendor/juicy-log.js");

var packageJson = require("./package.json");

var quirl = require("./vendor/quirl.js").init();

var juicy = new Logger();

// log to console
juicy.add(function(type, message, time) {
    var pad = function(num) {
        return num < 10 ? "0" + num : num;
    }

    var messageToPrint = "[" + pad(time.getHours()) + ":" + pad(time.getMinutes()) + "] " + message;

    switch(type) {
        case Logger.type.WARNING: console.warn(messageToPrint); break;
        case Logger.type.ERROR: console.error(messageToPrint); break;
        default: console.log(messageToPrint); break;
    }
});

// log to file
juicy.add(function(type, message, time) {
    var appdata = process.env["appdata"];

    fs.appendFile(path.resolve(appdata, "SteamShortcutDaemon", "SteamShortcutDaemon.log"), "[" + time.getTime() + "] " + message + "\r\n", function(err) {
        if(err) {
            throw err;
        }
    });
});

if(process.platform != "win32") {
    juicy.error(packageJson.name + " only makes sense with Windows, derp");
    app.quit();
    return;
}

function runSquirrel(args, callback) {
    var updateDotExe = path.resolve(process.execPath, "..", "..", "Update.exe");

    fs.exists(updateDotExe, function(fileExists) {
        if(fileExists) {
            var update = spawn(updateDotExe, args);

            update.stdout.on("data", function(data) {
                juicy.log("Squirrel [" + args.join(",") + "]: " + data.toString());
            });

            update.stderr.on("data", function(data) {
                juicy.error("Squirrel Error [" + args.join(",") + "]: " + data.toString());
            });

            update.on("close", callback);
        } else {
            juicy.warn("Update.exe not found, assuming this is a development or portable build. Updating won't work with this!");
        }
    });
}

function checkForUpdate(callback) {
    runSquirrel(["--update", packageJson.updateUrl], callback);
}

function removeOldShortcuts() {
    var startupPath = path.resolve(process.env["appdata"], "Microsoft", "Windows", "Start Menu", "Programs", "Startup", packageJson.name + ".lnk");

    var exists = fs.existsSync(startupPath);

    if(exists) {
        juicy.log("old startup file found, removing it...");
        fs.unlinkSync(startupPath);
    }
}

quirl.on("install", function() {
    removeOldShortcuts();
    app.quit();
});

quirl.on("uninstall", function() {
    removeOldShortcuts();
    app.quit();
});

quirl.on("update", function() {
    app.quit();
});

quirl.on("obsolete", function() {
    removeOldShortcuts();
    app.quit();
});

if(quirl.handleEvents(process.argv)) {
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

function updateShortcutToUrl(path, url, icon) {
    var target = {
        target: "%WINDIR%/explorer.exe",
        args: url,
        icon: icon.file,
        iconIndex: icon.index
    }

    shortcuts.edit(path, target, function(err) {
        if(err) {
            throw err;
        }
    });
}

function readUrl(path, callback) {
    fs.readFile(path, function(err, data) {
        if(err) {
            throw err;
        }

        var content = data.toString();

        var game = ini.parse(content);

        if(!game.InternetShortcut) {
            juicy.error("Couldn't read URL for path: " + path);
            return;
        }

        var url = game.InternetShortcut.URL;

        var icon = {
            file: game.InternetShortcut.IconFile,
            index: game.InternetShortcut.IconIndex
        };

        callback(url, icon);
    });
}

function checkForChanges() {
    var steamShortcutFolder = getSteamShortcutFolder();

    // try to create the directory if it doesn't exist (happens if the user hasn't used any start menu shortcuts until now)
    fs.mkdir(steamShortcutFolder, function(err) {
        if(err && err.code != "EEXIST") { // throws the EEXIST error when the directory already exists, means you can ignore that 99% of the time
            throw err;
        }

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
                                    juicy.log("deleted " + lnkPath);
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
                            juicy.log(lnkPath + " does not exist...");
                            juicy.log("reading... " + urlPath);

                            readUrl(urlPath, function(url, icon) {
                                createShortcutToUrl(lnkPath, url, icon);

                                juicy.log("created shortcut for " + path.basename(lnkPath, ".lnk"));
                            });
                        }
                    });
                }
            });
        });
    });
}

var tray = null;
var trayMenu = null;

app.on("ready", function() {
    // HACK: fixes the tray icon problem
    app.setName(packageJson.name + Math.random(1, 1000));

    var steamShortcutFolder = getSteamShortcutFolder();

    // check for changes once at startup
    checkForChanges();

    juicy.log("watching " + steamShortcutFolder + " for changes...");
    fs.watch(steamShortcutFolder, function(event, filename) {
        juicy.log("event: " + event + " from file: " + filename);

        // this will be called whenever a file is added or removed
        if(event == "rename") {
            checkForChanges();
        } else if(event == "change" && filename.endsWith(".url")) {
            // an .url file changed, update the lnk file
            var urlPath = path.resolve(steamShortcutFolder, filename);
            var lnkPath = path.resolve(steamShortcutFolder, path.basename(filename, ".url") + ".lnk");

            fs.exists(lnkPath, function(exists) {
                if(exists) {
                    readUrl(urlPath, function(url, icon) {
                        updateShortcutToUrl(lnkPath, url, icon);

                        juicy.log("updated shortcut for " + filename);
                    });
                }
            });
        }
    });

    // create a tray menu
    juicy.log("create the tray menu");
    tray = new Tray(path.resolve(__dirname, "icons", "icon.png"));

    var trayMenu = Menu.buildFromTemplate([
        {
            label: "About",
            type: "normal",
            click: function() {
                spawn("explorer.exe", ["http://steam-shortcut-daemon.kasoki.de"]);
            }
        },
        {
            label: "Donate",
            type: "normal",
            click: function() {
                spawn("explorer.exe", ["http://donate.kasoki.de"]);
            }
        },
        {
            label: "App Version: " + packageJson.version,
            type: "normal"
        },
        {
            type: "separator"
        },
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
                juicy.log("Start menu shortcut doesn't exists -> create one...");

                shortcuts.create(lnk, process.execPath);
            }
        });
    }

    // check if there is an updated version of SteamShortcutDaemon available.
    checkForUpdate(function() {
        juicy.log("done - check for updates");
    });

    app.on("close", function() {
        tray = null;
        trayMenu = null;
    });
});
