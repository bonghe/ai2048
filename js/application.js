// Wait till the browser is ready to render the game (avoids glitches)

var game = null;
var model = null;

window.requestAnimationFrame(function () {
  game = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
  game.restart();

  tf.setBackend('cpu');
  console.log('Loading...');
  tf.loadModel('model/model.json').then((result) => {
    model = result;
    var test_in = tf.randomNormal([4, 4, 4, 16]);
    var test_out = model.predict(test_in);
    console.log('Finished!');
    document.getElementsByClassName('game-container')[0].style.WebkitFilter = 'blur(0px)';
  });

});

LocalStorageManager.prototype.setGameState = function (gameState) {}
GameManager.prototype.move_default = GameManager.prototype.move;
GameManager.prototype.addRandomTile_default = GameManager.prototype.addRandomTile;

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    if (this.grid.cellsAvailable()) {
      var value = Math.random() < 0.9 ? 2 : 4;
      var tile = new Tile(this.grid.randomAvailableCell(), value);

      this.grid.insertTile(tile);
    }
  }
};

// Move tiles on the grid in the specified direction
GameManager.prototype.new_move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  return moved;
};


function ActionLock() {
  this.lock = false;
}
ActionLock.prototype.tryLock = function() {
  if (!this.lock){
    this.lock = true;
    return true;
  }
  return false;
}
ActionLock.prototype.unlock = function() {
  this.lock = false;
}
var lock = new ActionLock();

GameManager.prototype.move = function(direction){
  if (lock.tryLock()){
    this.new_move(direction) ? this.addRandomTile() : lock.unlock();
  }
}
GameManager.prototype.addRandomTile = function () {
  var res = search(readState());
  var action = res['action'];
  var input = res['input'];

  model.predict(input).data().then((output) =>{
    var index = 0;
    for (var i = 0; i < action.length; ++i){
      if (output[i] < output[index]){
        index = i;
      }
    }
    var data = action[index];
    console.log('( ' + data.x + ' , ' + data.y + ' )   ' + data.value + '  >  ' + output[index]);
    p = { x: data.y, y: data.x };
    value = data.value;

    var tile = new Tile(p, value);
    this.grid.insertTile(tile);


    if (!game.movesAvailable()) {
      game.over = true; // Game over!
    }

    game.actuate();
    lock.unlock();
  });
}

function readState(){
  var state = [];
  for (var x = 0; x < 4; ++x) {
    for (var y = 0; y < 4; ++y) {
      if (game.grid.cells[y][x] != null) {
        state.push(Math.round(Math.log2(game.grid.cells[y][x].value)))
      } else {
        state.push(0);
      }
    }
  }
  return state;
}

function toTensor(state) {
  data = [];
  for (var x = 0; x < 4; ++x) {
    data.push([]);
    for (var y = 0; y < 4; ++y) {
      data[x].push([]);
      for (var z = 0; z < 16; ++z) {
        if (state[x * 4 + y] == z) {
          data[x][y].push(1);
        }
        else {
          data[x][y].push(0);
        }
      }

    }
  }
  return tf.tensor(data).expandDims(0);
}

function search(state) {
  var action_list = [];
  var tensor_list = [];
  for (var i = 0; i < state.length; ++i) {
    if (state[i] != 0) {
      continue;
    }
    for (var j = 0; j < 2; ++j) {
      action_list.push({ 'x': Math.floor(i / 4), 'y': i % 4, 'value': j * 2 + 2 });
      state[i] = j + 1;
      tensor_list.push(toTensor(state));
      state[i] = 0;
    }
  }
  return {'action' : action_list, 'input' : tf.concat(tensor_list, 0)};
}
