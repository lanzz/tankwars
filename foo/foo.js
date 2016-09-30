'use strict';

var ApiBuilder = require('claudia-api-builder'),
    api = new ApiBuilder();


const BEARINGS = {
    'top': {x: 0, y: -1},
    'bottom': {x: 0, y: 1},
    'left': {x: -1, y: 0},
    'right': {x: 1, y: 0}
};

function allDefined() {
    return Array.prototype.indexOf.call(arguments, undefined) < 0;
}

function distance(o1, o2) {
    if (!allDefined(o1.x, o1.y, o2.x, o2.y)) {
        // one or both objects have no known location
        return undefined;
    }
    return Math.sqrt(Math.pow(Math.abs(o1.x - o2.x), 2) + Math.pow(Math.abs(o1.y - o2.y), 2));
}

function nearest(tank, entities) {
    var nearest = undefined;
    for (var i = 0; i < entities.length; i++) {
        if (!nearest || (distance(tank, entities[i]) < distance(tank, nearest))) {
            nearest = entities[i];
        }
    }
    return nearest;
}

const TURNS = {
    'top': {
        'top': undefined,
        'right': 'turn-right',
        'bottom': 'turn-right',
        'left': 'turn-left',
    },
    'right': {
        'top': 'turn-left',
        'right': undefined,
        'bottom': 'turn-right',
        'left': 'turn-right',
    },
    'bottom': {
        'top': 'turn-right',
        'right': 'turn-left',
        'bottom': undefined,
        'left': 'turn-right',
    },
    'left': {
        'top': 'turn-right',
        'right': 'turn-right',
        'bottom': 'turn-left',
        'left': undefined,
    }
};

function turnTowards(player, direction) {
    console.log('Need to turn from bearing %s to bearing %s', player.direction, direction);
    var correction = TURNS[player.direction][direction];
    if (correction) {
        console.log('- Course correction:', correction);
    } else {
        console.log('- No course correction');
    }
    return correction;
}

function moveTowards(player, direction) {
    return turnTowards(player, direction) || 'forward';
}

function fireTowards(player, direction) {
    return turnTowards(player, direction) || 'fire';
}

function isInLine(player, object) {
    return allDefined(object.x, object.y) && ((object.x == player.x) || (object.y == player.y));
}

function getBearing(player, object, walls) {
    if (!allDefined(object.x, object.y)) {
        console.log('Enemy position not known:', object);
        return undefined;
    }
    var dx = object.x - player.x,
        dy = object.y - player.y;
    var hbearing = (dx < 0)? 'left': ((dx > 0)? 'right': undefined);
    var vbearing = (dy < 0)? 'top': ((dy > 0)? 'bottom': undefined);
    if (!hbearing && !vbearing) {
        // on top of it
        console.log('Already on top of enemy');
        return undefined;
    }
    if (hbearing && (player.direction != vbearing) && ((player.direction == hbearing) || !vbearing || (Math.random() > .5))) {
        // approach horizontally
        console.log('Approaching horizontally towards %s', hbearing);
        return hbearing;
    } else if (vbearing) {
        // approach vertically
        console.log('Approaching vertically towards %s', vbearing);
        return vbearing;
    } else {
        console.log('Could not calculate bearing');
        return undefined;
    }
}

function isInRange(player, object, range) {
    var d = distance(player, object);
    console.log('Distance: %s [%s]', d, (d <= range)? 'in range': 'out of range');
    return d <= range;
}

function oneAhead(player, direction) {
    var d = BEARINGS[direction || player.direction];
    return {x: player.x + d.x, y: player.y + d.y};
}

function isAgainstWall(player, walls, dir) {
    var pos = oneAhead(player);
    dir = dir || 1;
    pos.x *= dir;
    pos.y *= dir;
    for (var i = 0; i < walls.length; i++) {
        if ((walls[i].x == pos.x) && (walls[i].y == pos.y)) {
            console.log('Wall ahead at [%s, %s]', pos.x, pos.y);
            return true;
        }
    }
    return false;
}

function isAgainstEdge(player, width, height, dir) {
    var pos = oneAhead(player);
    dir = dir || 1;
    pos.x *= dir;
    pos.y *= dir;
    console.log('One ahead is at [%s, %s]', pos.x, pos.y);
    if (pos.x < 0) {
        console.log('Against left edge');
    } else if (pos.y < 0) {
        console.log('Against top edge');
    } else if (pos.x >= width) {
        console.log('Against right edge');
    } else if (pos.y >= height) {
        console.log('Against bottom edge');
    }
    return (pos.x < 0) || (pos.x >= width) || (pos.y < 0) || (pos.y >= height);
}

function loiter(player, walls, width, height) {
    if (!isAgainstEdge(player, width, height) && !isAgainstWall(player, walls) && (Math.random() > .2)) {
        console.log('Loiter ahead');
        return {
            command: 'forward',
            rationale: 'Loiter ahead'
        };
    }
    var turn = (Math.random() >= .5)? 'turn-left': 'turn-right';
    console.log('Loiter:', turn);
    return {
        command: turn,
        rationale: 'Loiter around'
    };
}


var foo = {
    info: function info(request) {
        return {
            name: 'Foo',
            owner: 'Mihail Milushev'
        };
    },
    command: function command(request) {
        var r = request.body;
        console.log('Self:', r.you);
        var enemy = nearest(r.you, r.enemies);
        if (!enemy) {
            console.log('No enemy: loiter');
            return loiter(r.you, r.walls, r.mapWidth, r.mapHeight);
        }
        console.log('Enemy:', enemy);
        var bearing = getBearing(r.you, enemy);
        if (!bearing) {
            console.log('Enemy not in sight: loiter');
            return loiter(r.you, r.walls, r.mapWidth, r.mapHeight);
        }
        console.log('Enemy sighted: bearing %s; delta [%s, %s]; distance %s', bearing, enemy.x - r.you.x, enemy.y - r.you.y, distance(r.you, enemy));
        var turn = turnTowards(r.you, bearing);
        if (turn) {
            var enemyBearing = getBearing(enemy, r.you);
            if ((enemyBearing == enemy.direction) && isInLine(r.you, enemy) && isInRange(r.you, enemy, r.weaponRange)) {
                console.log('Enemy on flank, evasive action!');
                if (!isAgainstWall(r.you, r.walls) && !isAgainstEdge(r.you, r.mapWidth, r.mapHeight)) {
                    return {
                        command: 'forward',
                        rationale: 'Evasive action'
                    };
                } else if (!isAgainstWall(r.you, r.walls, -1) && !isAgainstEdge(r.you, r.mapWidth, r.mapHeight, -1)) {
                    return {
                        command: 'reverse',
                        rationale: 'Evasive action'
                    };
                }
            }
            console.log('Turn towards enemy: %s', turn);
            return {
                command: turn,
                rationale: 'Turn towards enemy; bearing: ' + bearing
            };
        }
        if (isInLine(r.you, enemy) && isInRange(r.you, enemy, r.weaponRange)) {
            console.log('Enemy in range: fire');
            return {
                command: 'fire',
                rationale: 'Enemy in range'
            };
        }
        if (isAgainstWall(r.you, r.walls)) {
            console.log('Wall shielding enemy: fire');
            return {
                command: 'fire',
                rationale: 'Destroy wall to reach enemy'
            };
        }
        console.log('Chase enemy: forward');
        return {
            command: 'forward',
            rationale: 'Chase enemy'
        };
    }
}

api.get('/info', foo.info);
api.post('/command', foo.command);


module.exports = api;
