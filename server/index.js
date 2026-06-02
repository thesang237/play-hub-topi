import express from "express";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const PORT = Number(process.env.PORT || 8787);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`Invalid PORT value "${process.env.PORT}". Use a number from 1 to 65535.`);
  process.exit(1);
}

const rooms = new Map();

const demoVideos = [
  {
    videoId: "jfKfPfyJRdk",
    title: "lofi hip hop radio - beats to relax/study to",
    channelTitle: "Lofi Girl",
    thumbnail: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg"
  },
  {
    videoId: "5qap5aO4i9A",
    title: "lofi hip hop radio - beats to sleep/chill to",
    channelTitle: "Lofi Girl",
    thumbnail: "https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg"
  },
  {
    videoId: "hHW1oY26kxQ",
    title: "Nujabes - Feather",
    channelTitle: "Hydeout Productions",
    thumbnail: "https://i.ytimg.com/vi/hHW1oY26kxQ/hqdefault.jpg"
  },
  {
    videoId: "FGBhQbmPwH8",
    title: "Daft Punk - One More Time",
    channelTitle: "Daft Punk",
    thumbnail: "https://i.ytimg.com/vi/FGBhQbmPwH8/hqdefault.jpg"
  },
  {
    videoId: "DWcJFNfaw9c",
    title: "Bonobo - Kerala",
    channelTitle: "Bonobo",
    thumbnail: "https://i.ytimg.com/vi/DWcJFNfaw9c/hqdefault.jpg"
  },
  {
    videoId: "2Vv-BfVoq4g",
    title: "Ed Sheeran - Perfect",
    channelTitle: "Ed Sheeran",
    thumbnail: "https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg"
  }
];

app.use(express.json());

app.get("/api/youtube/search", async (req, res) => {
  const query = String(req.query.q || "").trim();

  if (!query) {
    res.json({ source: "demo", items: demoVideos.slice(0, 4) });
    return;
  }

  const directVideoId = parseYouTubeId(query);
  if (directVideoId) {
    res.json({
      source: "url",
      items: [
        {
          videoId: directVideoId,
          title: "YouTube video from link",
          channelTitle: "Pasted URL",
          thumbnail: `https://i.ytimg.com/vi/${directVideoId}/hqdefault.jpg`
        }
      ]
    });
    return;
  }

  if (process.env.YOUTUBE_API_KEY) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("type", "video");
      url.searchParams.set("maxResults", "8");
      url.searchParams.set("q", query);
      url.searchParams.set("key", process.env.YOUTUBE_API_KEY);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`YouTube API responded ${response.status}`);
      }

      const data = await response.json();
      res.json({
        source: "youtube",
        items: data.items.map((item) => ({
          videoId: item.id.videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url
        }))
      });
      return;
    } catch (error) {
      console.error(error);
    }
  }

  const normalized = query.toLowerCase();
  const matches = demoVideos.filter((video) => {
    return `${video.title} ${video.channelTitle}`.toLowerCase().includes(normalized);
  });

  res.json({ source: "demo", items: matches.length ? matches : demoVideos });
});

app.use(express.static(path.join(__dirname, "../dist")));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

wss.on("connection", (socket) => {
  let roomId = "";
  let memberId = "";

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "join") {
      roomId = message.roomId;
      memberId = message.member.id;
      const room = getRoom(roomId);
      const existingMember = room.members.get(memberId);
      const action = existingMember && !existingMember.online ? "rejoined the room" : "joined the room";
      room.members.set(memberId, { ...message.member, online: true });
      socket.roomId = roomId;
      socket.memberId = memberId;
      addActivity(room, action, message.member);
      broadcastRoom(roomId);
      return;
    }

    const room = rooms.get(roomId);
    if (!room || !memberId) return;

    const actor = room.members.get(memberId);
    if (!actor) return;

    if (message.type === "queue:add") {
      const item = {
        ...message.item,
        id: crypto.randomUUID(),
        addedBy: { id: actor.id, nickname: actor.nickname },
        addedAt: Date.now()
      };
      room.queue.push(item);
      if (!room.playback.videoId) {
        room.playback = playbackFor(item.videoId, "paused", 0, actor.nickname, room.playback.playbackRate);
      }
      addActivity(room, `added "${item.title}"`, actor, {
        video: {
          videoId: item.videoId,
          title: item.title,
          channelTitle: item.channelTitle,
          thumbnail: item.thumbnail
        }
      });
      broadcastRoom(roomId);
    }

    if (message.type === "queue:remove") {
      const index = room.queue.findIndex((item) => item.id === message.itemId);
      if (index >= 0) {
        const [removed] = room.queue.splice(index, 1);
        addActivity(room, `removed "${removed.title}"`, actor);
        if (room.playback.videoId === removed.videoId) {
          const next = room.queue[0];
          room.playback = next
            ? playbackFor(next.videoId, "paused", 0, actor.nickname, room.playback.playbackRate)
            : playbackFor("", "paused", 0, actor.nickname, room.playback.playbackRate);
        }
        broadcastRoom(roomId);
      }
    }

    if (message.type === "queue:reorder") {
      const from = room.queue.findIndex((item) => item.id === message.itemId);
      const to = clamp(Number(message.toIndex), 0, room.queue.length - 1);
      if (from >= 0 && from !== to) {
        const [item] = room.queue.splice(from, 1);
        room.queue.splice(to, 0, item);
        addActivity(room, `moved "${item.title}" to position ${to + 1}`, actor);
        broadcastRoom(roomId);
      }
    }

    if (message.type === "queue:next") {
      const currentIndex = room.queue.findIndex((item) => item.videoId === room.playback.videoId);
      const next = room.queue[currentIndex + 1] || room.queue[0];
      room.playback = next
        ? playbackFor(next.videoId, "playing", 0, actor.nickname, room.playback.playbackRate)
        : playbackFor("", "paused", 0, actor.nickname, room.playback.playbackRate);
      addActivity(room, "skipped to the next video", actor);
      broadcastRoom(roomId);
    }

    if (message.type === "queue:ended") {
      const currentIndex = room.queue.findIndex((item) => item.videoId === room.playback.videoId);
      const next = room.queue[currentIndex + 1] || room.queue[0];

      room.playback = next
        ? playbackFor(next.videoId, "playing", 0, actor.nickname, room.playback.playbackRate)
        : playbackFor(room.playback.videoId, "paused", 0, actor.nickname, room.playback.playbackRate);
      broadcastRoom(roomId);
    }

    if (message.type === "player:update") {
      const nextRate = clamp(Number(message.playbackRate || room.playback.playbackRate || 1), 0.25, 2);
      room.playback = playbackFor(message.videoId, message.status, Number(message.positionSeconds || 0), actor.nickname, nextRate);
      const verb = message.status === "playing" ? "started playback" : "paused playback";
      addActivity(room, verb, actor);
      broadcastRoom(roomId);
    }

    if (message.type === "player:seek") {
      const positionSeconds = Math.max(0, Number(message.positionSeconds || 0));
      room.playback = playbackFor(
        room.playback.videoId,
        room.playback.status,
        positionSeconds,
        actor.nickname,
        room.playback.playbackRate
      );
      addActivity(room, `jumped to ${formatDuration(positionSeconds)}`, actor);
      broadcastRoom(roomId);
    }

    if (message.type === "player:rate") {
      const playbackRate = clamp(Number(message.playbackRate || 1), 0.25, 2);
      const positionSeconds = Number(message.positionSeconds || room.playback.positionSeconds || 0);
      room.playback = playbackFor(room.playback.videoId, room.playback.status, positionSeconds, actor.nickname, playbackRate);
      addActivity(room, `changed speed to ${playbackRate}x`, actor);
      broadcastRoom(roomId);
    }

    if (message.type === "chat:send") {
      const text = String(message.text || "").trim().slice(0, 500);
      if (!text) return;
      addChat(room, actor, text);
      broadcastRoom(roomId);
    }

    if (message.type === "room:rename") {
      const name = String(message.name || "").trim().slice(0, 60);
      room.name = name || "";
      addActivity(room, name ? `renamed the room to "${name}"` : "cleared the room name", actor);
      broadcastRoom(roomId);
    }
  });

  socket.on("close", () => {
    const room = rooms.get(roomId);
    if (!room || !memberId) return;
    room.members.delete(memberId);
    broadcastRoom(roomId);
  });
});

server.on("error", handleServerError);
wss.on("error", handleServerError);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Play Hub server listening on http://127.0.0.1:${PORT}`);
  for (const address of getLanAddresses()) {
    console.log(`Play Hub network URL: http://${address}:${PORT}`);
  }
});

function handleServerError(error) {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the existing process or run with another port, for example: PORT=8790 pnpm dev`
    );
    console.error(`To find the process on macOS: lsof -nP -iTCP:${PORT} -sTCP:LISTEN`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      name: "",
      members: new Map(),
      queue: [],
      activity: [],
      playback: playbackFor("", "paused", 0, "system")
    });
  }
  return rooms.get(roomId);
}

function broadcastRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const payload = JSON.stringify({
    type: "room:state",
    state: {
      id: room.id,
      name: room.name || "",
      members: [...room.members.values()],
      queue: room.queue,
      activity: room.activity,
      playback: room.playback
    }
  });

  for (const client of wss.clients) {
    if (client.readyState === 1 && client.roomId === roomId) {
      client.send(payload);
    }
  }
}

function addActivity(room, message, actor, metadata = {}) {
  room.activity.unshift({
    id: crypto.randomUUID(),
    kind: "activity",
    actor: actor ? { id: actor.id, nickname: actor.nickname } : undefined,
    message: actor ? `${actor.nickname} ${message}` : message,
    ...metadata,
    createdAt: Date.now()
  });
  room.activity = room.activity.slice(0, 80);
}

function addChat(room, actor, text) {
  room.activity.unshift({
    id: crypto.randomUUID(),
    kind: "chat",
    actor: { id: actor.id, nickname: actor.nickname },
    message: `${actor.nickname}: ${text}`,
    text,
    createdAt: Date.now()
  });
  room.activity = room.activity.slice(0, 80);
}

function playbackFor(videoId, status, positionSeconds, updatedBy, playbackRate = 1) {
  return {
    videoId,
    status,
    positionSeconds,
    playbackRate,
    updatedAt: Date.now(),
    updatedBy
  };
}

function parseYouTubeId(input) {
  const match = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] || null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((address) => address && address.family === "IPv4" && !address.internal)
    .map((address) => address.address);
}
