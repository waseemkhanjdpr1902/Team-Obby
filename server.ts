import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { nanoid } from "nanoid";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // Game State
  const players: Record<string, any> = {};
  const teams = {
    red: 0,
    blue: 0,
  };

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join", ({ name, team }) => {
      players[socket.id] = {
        id: socket.id,
        name: name || `Player_${socket.id.slice(0, 4)}`,
        team: team || (teams.red <= teams.blue ? "red" : "blue"),
        x: 50,
        y: 300,
        color: team === "red" ? "#ef4444" : "#3b82f6",
      };
      
      if (players[socket.id].team === "red") teams.red++;
      else teams.blue++;

      socket.emit("init", { id: socket.id, players });
      socket.broadcast.emit("playerJoined", players[socket.id]);
    });

    socket.on("move", (data) => {
      if (players[socket.id]) {
        players[socket.id].x = data.x;
        players[socket.id].y = data.y;
        socket.broadcast.emit("playerMoved", { id: socket.id, x: data.x, y: data.y });
      }
    });

    socket.on("disconnect", () => {
      if (players[socket.id]) {
        const team = players[socket.id].team;
        if (team === "red") teams.red--;
        else teams.blue--;
        delete players[socket.id];
        io.emit("playerLeft", socket.id);
      }
      console.log("User disconnected:", socket.id);
    });

    socket.on("chat", (message) => {
      if (players[socket.id]) {
        io.emit("chatMessage", {
          id: nanoid(),
          sender: players[socket.id].name,
          team: players[socket.id].team,
          text: message,
        });
      }
    });
    
    socket.on("win", (team) => {
        io.emit("gameWon", { team, winner: players[socket.id]?.name });
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
