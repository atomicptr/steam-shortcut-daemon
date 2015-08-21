var squirrel = {};

squirrel.handleEvents = function(arguments) {
    var squirrelCommand = arguments.filter(function(arg) {
        return arg.indexOf("squirrel") > -1;
    })[0]; // There is usually just one, if there are more ignore the rest

    switch(squirrelCommand) {
        case "--squirrel-install":
        case "--squirrel-updated":
        case "--squirrel-uninstall":
        case "--squirrel-obsolete":
            return true;
    }

    return false;
}

module.exports = squirrel;
