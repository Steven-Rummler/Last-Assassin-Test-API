const express = require("express");
const bodyParser = require("body-parser");
var cors = require("cors");

const app = express();
app.use(cors());

games = {};

/*
Games = {
    GameCode: {
        Host: string
        Mode: string
        Delay: float
        AttemptCD: float
        KillCD: float
        KillDistance: float
        LagDistance: float
        PlayerList: [strings]
        GameStarted: boolean
        Players: {
            PlayerName: {
                Living: boolean
                Kills: int
                TargetName: string
                Latitude: float
                Longitude: float
                Timestamp: datetime
                Pending Attempts: [
                  {
                    Hunter: string
                    Timestamp: datetime
                  }
                ]
            }, ...
        }
        PlayersAlive: int
        GameOver: boolean
        LastStanding: string
        FinalScores: {
          PlayerName: Kills, ...
        }
    }, ...
}
*/

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: false,
  })
);

app.post("/create", async (req, res) => {
  if (!req.body.Host) {
    return sendError(res, "Host is required.");
  } else {
    const host = req.body.Host;
    const code = makeid(5);
    let game = createGame(host, code);
    return res.send({
      Game: code,
      Mode: game.Mode,
      Delay: game.Delay,
      AttemptCD: game.AttemptCD,
      KillCD: game.KillCD,
      KillDistance: game.KillDistance,
      LagDistance: game.LagDistance,
    });
  }
});

function createGame(host, code) {
  games[code] = {};
  let game = games[code];
  game.GameStarted = false;
  game.Host = host;
  game.PlayerList = [];
  game.PlayerList.push(host);
  game.Mode = "Manual";
  game.Delay = 30;
  game.AttemptCD = 5;
  game.KillCD = 20;
  game.KillDistance = 10;
  game.LagDistance = 3;
  return game;
}

app.post("/host", async (req, res) => {});

app.post("/", async (req, res) => {
  // Logging
  console.log(req.body);

  // Bad Request
  if (!req.body.Game) {
    return sendError(res, "Game code is required.");
  }

  // Logging
  console.log(games);

  // Start Game Request
  if (!req.body.Player) {
    const code = req.body.Game;
    const delay = req.body.Delay;
    return startGame(code, delay, res);
  }

  // In-Game Heartbeat
  if (req.body.Latitude && req.body.Longitude) {
    const code = req.body.Game;
    const name = req.body.Player;
    const lat = req.body.Latitude;
    const long = req.body.Longitude;

    return InGameHeartbeat(code, name, lat, long, res);
  }

  // Lobby Heartbeat
  else {
    const code = req.body.Game;
    const name = req.body.Player;
    return LobbyHeartbeat(code, name, res);
  }
});

function makeid(length) {
  var result = "";
  var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

function setupGame(code, delay) {
  // Basic setup
  let game = games[code];
  game.GameStarted = true;
  let now = new Date();
  game.KillStartTime = new Date(now.getTime() + delay * 1000);
  game.GameOver = false;
  game.Players = {};
  const player_count = game.PlayerList.length;
  game.PlayersAlive = player_count;

  // Pick a random number between 0 and the number of players
  const offset = Math.floor(Math.random() * (player_count - 1)) + 1;

  // Generate the players and give them targets
  for (let i = 0; i < player_count; i++) {
    const player_name = game.PlayerList[i];
    game.Players[player_name] = {};
    let player = game.Players[player_name];
    player.Living = true;
    player.Kills = 0;
    player.Target = game.PlayerList[(i + offset) % player_count];
    player.Latitude = 0;
    player.Longitude = 0;
    player.Timestamp = 0;
    console.log(player);
  }
}

function LobbyHeartbeat(code, name, res) {
  // Confirm valid game
  if (!(code in games)) {
    return sendError(res, "Game does not exist.");
  }
  game = games[code];
  // New player
  if (!game.PlayerList.includes(name)) {
    // New player trying to join game that already started
    if (game.GameStarted) {
      return sendError(res, "Cannot join in-progress game.");
    }
    // New player joining lobby
    else {
      game.PlayerList.push(name);
      return res.send({
        Players: game.PlayerList,
        GameStarted: game.GameStarted,
      });
    }
  }
  // Player in lobby
  else {
    return res.send({
      Players: game.PlayerList,
      GameStarted: game.GameStarted,
    });
  }
}

function startGame(code, delay, res) {
  if (code in games) {
    if (games[code].GameStarted) return sendError(res, "Game already started.");
    else {
      setupGame(code, delay);
      return res.send({ GameStarted: true });
    }
  } else return sendError(res, "Game does not exist.");
}

function InGameHeartbeat(code, name, lat, long, res) {
  // Confirm valid game and player
  if (!(code in games)) return sendError(res, "Game does not exist.");
  let game = games[code];
  if (!game.PlayerList.includes(name))
    return sendError(res, "Player not in game.");
  if (!game.GameStarted) return sendError(res, "Game not yet started.");

  // Logging
  console.log(typeof game.Players);
  for (let [key, value] of Object.entries(game.Players)) {
    console.log(key, value);
  }

  // Get player status
  let players = game.Players;
  let player = players[name];
  const living = player.Living;

  // Check if game is over, if so stop and send game over data
  if (game.GameEnded) {
    return gameOver(game, player, res);
  }

  // Update player data
  player.Latitude = lat;
  player.Longitude = long;
  let timestamp = new Date();
  player.Timestamp = timestamp;

  // Get target data
  let targetName = player.Target;
  let target = players[targetName];
  let targetLat = target.Latitude;
  let targetLong = target.Longitude;
  let targetTimestamp = target.Timestamp;

  // Attempt assassination
  console.log("Timestamp: ", timestamp);
  console.log("Kill Start: ", game.KillStartTime);
  console.log(timestamp > game.KillStartTime);
  if (target.Latitude != 0 && timestamp > game.KillStartTime) {
    // Calculate kill distance based on time since target update
    const targetVulnerableRange = (timestamp - targetTimestamp) / 150;
    const killDistance = 10 + targetVulnerableRange;

    // Calculate distance to target
    const targetDistance = haversine(lat, long, targetLat, targetLong);

    console.log("Player:", lat, long, timestamp);
    console.log("Target:", targetLat, targetLong, targetTimestamp);
    console.log("Target Vulnerable Range:", targetVulnerableRange);
    console.log("Kill Distance:", killDistance);
    console.log("Target Distance:", targetDistance);

    // If successful
    if (targetDistance < killDistance) {
      // Update target status and living player count
      target.Living = false;
      player.Kills += 1;
      game.PlayersAlive -= 1;

      // If no more living players
      if (game.PlayersAlive < 2) {
        // End game, set winner and final scores
        game.GameOver = true;
        let results = {};
        for (let [key, value] of Object.entries(players)) {
          if (value.Living) {
            game.LastStanding = key;
          }
          results[key] = value.Kills;
        }
        game.FinalScores = results;
        return gameOver(game, player, res);
      } else {
        // Assign next target
        player.Target = target.Target;
      }
    }
  }

  target = players[player.Target];
  // Send ongoing game data
  return res.send({
    CurrentlyAlive: living,
    CurrentKills: player.Kills,
    TargetName: player.Target,
    TargetLatitude: target.Latitude,
    TargetLongitude: target.Longitude,
    PlayersAlive: game.PlayersAlive,
  });
}

function gameOver(game, player, res) {
  return res.send({
    CurrentlyAlive: player.Living,
    CurrentKills: player.Kills,
    LastStanding: game.LastStanding,
    FinalScores: game.FinalScores,
  });
}

function haversine(lat1, long1, lat2, long2) {
  const R = 6371e3;
  const latRad1 = (lat1 * Math.PI) / 180;
  const latRad2 = (lat2 * Math.PI) / 180;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLong = ((long2 - long1) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(latRad1) *
      Math.cos(latRad2) *
      Math.sin(deltaLong / 2) *
      Math.sin(deltaLong / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function sendError(res, error) {
  return res.status(400).send({
    Error: error,
  });
}

app.listen(3000, () => console.log("Server listening on port 3000!"));
