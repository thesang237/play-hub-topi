import React from "react";
import ReactDOM from "react-dom/client";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Clipboard,
  Headphones,
  Link,
  ListMusic,
  LogIn,
  Pause,
  Play,
  Plus,
  Search,
  Share2,
  SkipForward,
  Trash2,
  UsersRound,
  Youtube
} from "lucide-react";
import "./styles.css";

type Member = {
  id: string;
  nickname: string;
  online: boolean;
};

type VideoSearchResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
};

type QueueItem = VideoSearchResult & {
  id: string;
  addedBy: {
    id: string;
    nickname: string;
  };
  addedAt: number;
};

type ActivityItem = {
  id: string;
  message: string;
  createdAt: number;
};

type PlaybackState = {
  videoId: string;
  status: "playing" | "paused";
  positionSeconds: number;
  playbackRate: number;
  updatedAt: number;
  updatedBy: string;
};

type RoomState = {
  id: string;
  members: Member[];
  queue: QueueItem[];
  activity: ActivityItem[];
  playback: PlaybackState;
};

type PlayerApi = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaybackRate: () => number;
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  setPlaybackRate: (suggestedRate: number) => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          videoId?: string;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (event: { target: PlayerApi }) => void;
            onStateChange?: (event: { data: number; target: PlayerApi }) => void;
          };
        }
      ) => PlayerApi;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const memberKey = "play-hub-member";
const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

function App() {
  const initialRoomId = getRoomIdFromPath();
  const [roomId, setRoomId] = React.useState(initialRoomId);
  const [member, setMember] = React.useState<Member | null>(() => getStoredMember());
  const [nicknameInput, setNicknameInput] = React.useState("");
  const [roomState, setRoomState] = React.useState<RoomState | null>(null);
  const [socket, setSocket] = React.useState<WebSocket | null>(null);
  const [connection, setConnection] = React.useState<"idle" | "connecting" | "online" | "offline">("idle");
  const [connectionIssue, setConnectionIssue] = React.useState("");

  React.useEffect(() => {
    if (!roomId || !member) return;

    setConnection("connecting");
    setConnectionIssue("");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const endpoint = `${protocol}://${window.location.host}/ws`;
    const ws = new WebSocket(endpoint);

    ws.addEventListener("open", () => {
      setConnection("online");
      setConnectionIssue("");
      ws.send(JSON.stringify({ type: "join", roomId, member }));
    });

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "room:state") {
        setRoomState(message.state);
      }
    });

    ws.addEventListener("error", () => {
      setConnectionIssue(`Could not connect to ${endpoint}`);
    });
    ws.addEventListener("close", () => setConnection("offline"));
    setSocket(ws);

    return () => ws.close();
  }, [roomId, member]);

  const createRoom = () => {
    const nextRoomId = makeRoomId();
    window.history.pushState({}, "", `/room/${nextRoomId}`);
    setRoomId(nextRoomId);
  };

  const joinRoom = (event: React.FormEvent) => {
    event.preventDefault();
    if (!roomId) {
      createRoom();
      return;
    }
    const nickname = nicknameInput.trim().slice(0, 28);
    if (!nickname) return;

    const nextMember = {
      id: crypto.randomUUID(),
      nickname,
      online: true
    };
    window.localStorage.setItem(memberKey, JSON.stringify(nextMember));
    setMember(nextMember);
  };

  const resetNickname = () => {
    window.localStorage.removeItem(memberKey);
    setRoomState(null);
    setMember(null);
    setConnection("idle");
    socket?.close();
  };

  if (!roomId) {
    return <CreateRoom onCreate={createRoom} />;
  }

  if (!member) {
    return (
      <JoinRoom
        roomId={roomId}
        nicknameInput={nicknameInput}
        onNicknameInput={setNicknameInput}
        onJoin={joinRoom}
      />
    );
  }

  return (
    <Room
      connection={connection}
      member={member}
      roomId={roomId}
      roomState={roomState}
      socket={socket}
      connectionIssue={connectionIssue}
      onResetNickname={resetNickname}
    />
  );
}

function CreateRoom({ onCreate }: { onCreate: () => void }) {
  return (
    <main className="gate gateCreate">
      <div className="brandMark">
        <Headphones size={24} />
      </div>
      <section className="gatePanel">
        <p className="eyebrow">Shared listening rooms</p>
        <h1>Build the queue together.</h1>
        <p className="gateCopy">
          Create a no-login room, invite friends, search YouTube, and keep one shared playlist moving in sync.
        </p>
        <button className="primaryAction" onClick={onCreate}>
          <Plus size={18} />
          Create room
        </button>
      </section>
    </main>
  );
}

function JoinRoom({
  roomId,
  nicknameInput,
  onNicknameInput,
  onJoin
}: {
  roomId: string;
  nicknameInput: string;
  onNicknameInput: (value: string) => void;
  onJoin: (event: React.FormEvent) => void;
}) {
  return (
    <main className="gate">
      <section className="gatePanel joinPanel">
        <p className="eyebrow">Room {roomId}</p>
        <h1>Pick a nickname.</h1>
        <form className="joinForm" onSubmit={onJoin}>
          <input
            autoFocus
            maxLength={28}
            placeholder="Sang, Linh, Alex..."
            value={nicknameInput}
            onChange={(event) => onNicknameInput(event.target.value)}
          />
          <button className="primaryAction" type="submit">
            <LogIn size={18} />
            Join
          </button>
        </form>
      </section>
    </main>
  );
}

function Room({
  connection,
  member,
  roomId,
  roomState,
  socket,
  connectionIssue,
  onResetNickname
}: {
  connection: "idle" | "connecting" | "online" | "offline";
  member: Member;
  roomId: string;
  roomState: RoomState | null;
  socket: WebSocket | null;
  connectionIssue: string;
  onResetNickname: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const queue = roomState?.queue ?? [];
  const playback = roomState?.playback;
  const nowPlaying = queue.find((item) => item.videoId === playback?.videoId) ?? queue[0];

  const send = React.useCallback(
    (message: Record<string, unknown>) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    [socket]
  );

  const inviteUrl = `${window.location.origin}/room/${roomId}`;
  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="roomIdentity">
          <div className="brandMark compact">
            <Headphones size={19} />
          </div>
          <div>
            <p className="eyebrow">Play Hub</p>
            <h1>Room {roomId}</h1>
          </div>
        </div>
        <div className="topActions">
          <span className={`statusPill ${connection}`}>{connection}</span>
          <button className="ghostButton" onClick={copyInvite} title="Copy invite link">
            {copied ? <Clipboard size={17} /> : <Share2 size={17} />}
            {copied ? "Copied" : "Invite"}
          </button>
          <button className="ghostButton" onClick={onResetNickname} title="Change nickname">
            <UsersRound size={17} />
            {member.nickname}
          </button>
        </div>
      </header>
      {connectionIssue ? <div className="connectionBanner">{connectionIssue}</div> : null}

      <section className="stage">
        <PlayerCard playback={playback} nowPlaying={nowPlaying} onSend={send} />
        <aside className="sideRail">
          <Members members={roomState?.members ?? [member]} />
          <ActivityLog activity={roomState?.activity ?? []} />
        </aside>
      </section>

      <section className="workspace">
        <div className="tabStrip">
          <button className="tabButton active">
            <Youtube size={18} />
            YouTube
          </button>
          <button className="tabButton disabled">Apps soon</button>
        </div>
        <div className="workspaceGrid">
          <YouTubeSearch onAdd={(item) => send({ type: "queue:add", item })} />
          <QueuePanel queue={queue} playback={playback} onSend={send} />
        </div>
      </section>
    </main>
  );
}

function PlayerCard({
  playback,
  nowPlaying,
  onSend
}: {
  playback?: PlaybackState;
  nowPlaying?: QueueItem;
  onSend: (message: Record<string, unknown>) => void;
}) {
  const playerRef = React.useRef<PlayerApi | null>(null);
  const playbackRef = React.useRef<PlaybackState | undefined>(playback);
  const desiredStatusRef = React.useRef<PlaybackState["status"]>(playback?.status ?? "paused");
  const lastAppliedRef = React.useRef("");
  const currentVideoRef = React.useRef("");
  const [apiReady, setApiReady] = React.useState(() => Boolean(window.YT?.Player));
  const [playerReady, setPlayerReady] = React.useState(false);
  const [durationSeconds, setDurationSeconds] = React.useState(0);
  const [progressSeconds, setProgressSeconds] = React.useState(0);
  const [isSeeking, setIsSeeking] = React.useState(false);

  React.useEffect(() => {
    playbackRef.current = playback;
    desiredStatusRef.current = playback?.status ?? "paused";
  }, [playback]);

  React.useEffect(() => {
    if (!playerReady) return;

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== "function") return;

      if (!isSeeking) {
        setProgressSeconds(player.getCurrentTime() || 0);
      }

      if (typeof player.getDuration === "function") {
        setDurationSeconds(player.getDuration() || 0);
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [isSeeking, playerReady]);

  React.useEffect(() => {
    if (window.YT?.Player) {
      setApiReady(true);
      return;
    }

    if (!document.querySelector("script[src='https://www.youtube.com/iframe_api']")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }

    window.onYouTubeIframeAPIReady = () => {
      setApiReady(true);
    };
  }, []);

  React.useEffect(() => {
    if (!apiReady || !window.YT || playerRef.current || !document.getElementById("youtube-player")) return;

    playerRef.current = new window.YT.Player("youtube-player", {
      playerVars: {
        controls: 0,
        disablekb: 1,
        enablejsapi: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0
      },
      events: {
        onReady: (event) => {
          playerRef.current = event.target;
          setPlayerReady(true);
        },
        onStateChange: (event) => {
          if (!window.YT || !playbackRef.current?.videoId) return;
          if (event.data === window.YT.PlayerState.ENDED) {
            onSend({ type: "queue:next" });
            return;
          }

          const player = event.target;
          const desiredStatus = desiredStatusRef.current;

          if (event.data === window.YT.PlayerState.PLAYING && desiredStatus !== "playing") {
            window.setTimeout(() => player.pauseVideo(), 0);
          }

          if (event.data === window.YT.PlayerState.PAUSED && desiredStatus !== "paused") {
            window.setTimeout(() => player.playVideo(), 0);
          }
        }
      }
    });
  }, [apiReady, onSend]);

  React.useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || !player || !playback?.videoId || !isYouTubeVideoId(playback.videoId)) return;
    if (
      typeof player.playVideo !== "function" ||
      typeof player.pauseVideo !== "function" ||
      typeof player.seekTo !== "function" ||
      typeof player.loadVideoById !== "function" ||
      typeof player.cueVideoById !== "function" ||
      typeof player.setPlaybackRate !== "function"
    ) {
      return;
    }

    const playbackRate = playback.playbackRate ?? 1;
    const signature = `${playback.videoId}:${playback.status}:${playback.positionSeconds}:${playbackRate}:${playback.updatedAt}`;
    if (lastAppliedRef.current === signature) return;
    lastAppliedRef.current = signature;

    const elapsed = playback.status === "playing" ? ((Date.now() - playback.updatedAt) / 1000) * playbackRate : 0;
    const targetSeconds = Math.max(0, playback.positionSeconds + elapsed);
    player.setPlaybackRate(playbackRate);
    setProgressSeconds(targetSeconds);

    if (currentVideoRef.current !== playback.videoId) {
      currentVideoRef.current = playback.videoId;
      if (playback.status === "playing") {
        player.loadVideoById(playback.videoId, targetSeconds);
      } else {
        player.cueVideoById(playback.videoId, targetSeconds);
      }
    } else {
      const currentSeconds = position();
      if (Math.abs(currentSeconds - targetSeconds) > 1.25) {
        player.seekTo(targetSeconds, true);
      }
    }

    if (playback.status === "playing") {
      player.playVideo();
    } else {
      player.seekTo(targetSeconds, true);
      player.pauseVideo();
    }
  }, [playerReady, playback]);

  const position = () => {
    if (typeof playerRef.current?.getCurrentTime !== "function") return 0;
    return playerRef.current.getCurrentTime();
  };
  const playbackRate = playback?.playbackRate ?? 1;
  const videoId = playback?.videoId || nowPlaying?.videoId || "";
  const hasValidVideoId = isYouTubeVideoId(videoId);

  React.useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const ignoreMediaKey = () => undefined;
    const actions: MediaSessionAction[] = ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward"];

    for (const action of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, ignoreMediaKey);
      } catch {
        // Some browsers do not support every media session action.
      }
    }
  }, []);

  const play = () => {
    if (!hasValidVideoId) return;
    desiredStatusRef.current = "playing";
    if (playerReady && playerRef.current) {
      if (currentVideoRef.current !== videoId) {
        currentVideoRef.current = videoId;
        playerRef.current.loadVideoById(videoId, 0);
      }
      playerRef.current.setPlaybackRate(playbackRate);
      playerRef.current.playVideo();
    }
    onSend({ type: "player:update", videoId, status: "playing", positionSeconds: position(), playbackRate });
  };
  const pause = () => {
    if (!hasValidVideoId) return;
    desiredStatusRef.current = "paused";
    const seconds = position();
    if (playerReady && playerRef.current) {
      playerRef.current.pauseVideo();
    }
    onSend({ type: "player:update", videoId, status: "paused", positionSeconds: seconds, playbackRate });
  };
  const seek = (seconds: number) => {
    if (!hasValidVideoId) return;
    const nextSeconds = Math.max(0, Math.min(seconds, durationSeconds || seconds));
    setProgressSeconds(nextSeconds);
    setIsSeeking(false);
    playerRef.current?.seekTo(nextSeconds, true);
    onSend({ type: "player:seek", positionSeconds: nextSeconds });
  };
  const changeSpeed = (rate: number) => {
    if (!hasValidVideoId) return;
    const seconds = position();
    playerRef.current?.setPlaybackRate(rate);
    onSend({ type: "player:rate", playbackRate: rate, positionSeconds: seconds });
  };

  return (
    <section className="playerCard">
      <div className="videoFrame">
        <div id="youtube-player" className={hasValidVideoId ? "" : "playerHostEmpty"} />
        {hasValidVideoId ? <div className="playerClickShield" aria-hidden="true" /> : null}
        {!hasValidVideoId ? <EmptyPlayer /> : null}
      </div>
      <div className="playerMeta">
        <div>
          <p className="eyebrow">Now playing</p>
          <h2>{nowPlaying?.title ?? "Queue a video to begin"}</h2>
          <p>{nowPlaying ? `Added by ${nowPlaying.addedBy.nickname}` : "Search YouTube below or paste a link."}</p>
        </div>
        <PlayerControls
          durationSeconds={durationSeconds}
          isSeeking={isSeeking}
          onChangeSpeed={changeSpeed}
          onPause={pause}
          onPlay={play}
          onProgressInput={(seconds) => {
            setIsSeeking(true);
            setProgressSeconds(seconds);
          }}
          onSeek={seek}
          onSkip={() => onSend({ type: "queue:next" })}
          playback={playback}
          playbackRate={playbackRate}
          playerReady={playerReady}
          progressSeconds={progressSeconds}
          videoId={hasValidVideoId ? videoId : ""}
        />
      </div>
    </section>
  );
}

function EmptyPlayer() {
  return (
    <div className="emptyPlayer">
      <Youtube size={44} />
      <span>Waiting for the first track</span>
    </div>
  );
}

function PlayerControls({
  durationSeconds,
  onChangeSpeed,
  onPause,
  onPlay,
  onProgressInput,
  onSeek,
  onSkip,
  playback,
  playbackRate,
  playerReady,
  progressSeconds,
  videoId
}: {
  durationSeconds: number;
  isSeeking: boolean;
  onChangeSpeed: (rate: number) => void;
  onPause: () => void;
  onPlay: () => void;
  onProgressInput: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  onSkip: () => void;
  playback?: PlaybackState;
  playbackRate: number;
  playerReady: boolean;
  progressSeconds: number;
  videoId: string;
}) {
  const disabled = !videoId || !playerReady;
  const max = Math.max(1, Math.floor(durationSeconds || 1));
  const clampedProgress = Math.max(0, Math.min(progressSeconds, max));

  return (
    <div className="playerControls">
      <div className="transportRow">
        <button
          className={`iconButton ${playback?.status === "playing" ? "active" : ""}`}
          disabled={disabled || playback?.status === "playing"}
          onClick={onPlay}
          title={playback?.status === "playing" ? "Playing" : playerReady ? "Play" : "Player loading"}
        >
          <Play size={18} />
        </button>
        <button
          className={`iconButton ${playback?.status === "paused" ? "active" : ""}`}
          disabled={disabled || playback?.status === "paused"}
          onClick={onPause}
          title={playback?.status === "paused" ? "Paused" : playerReady ? "Pause" : "Player loading"}
        >
          <Pause size={18} />
        </button>
        <button className="iconButton" disabled={!videoId} onClick={onSkip} title="Next">
          <SkipForward size={18} />
        </button>
        <label className="speedControl">
          <span>Speed</span>
          <select
            disabled={disabled}
            value={playbackRate}
            onChange={(event) => onChangeSpeed(Number(event.target.value))}
            title="Playback speed"
          >
            {speedOptions.map((speed) => (
              <option key={speed} value={speed}>
                {speed}x
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="progressControl">
        <span>{formatDuration(clampedProgress)}</span>
        <input
          aria-label="Video progress"
          disabled={disabled}
          max={max}
          min={0}
          step={1}
          type="range"
          value={clampedProgress}
          onChange={(event) => onProgressInput(Number(event.target.value))}
          onMouseUp={(event) => onSeek(Number(event.currentTarget.value))}
          onTouchEnd={(event) => onSeek(Number(event.currentTarget.value))}
        />
        <span>{formatDuration(durationSeconds)}</span>
      </div>
    </div>
  );
}

function YouTubeSearch({ onAdd }: { onAdd: (item: VideoSearchResult) => void }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<VideoSearchResult[]>([]);
  const [source, setSource] = React.useState("demo");
  const [loading, setLoading] = React.useState(false);

  const search = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    setResults(data.items);
    setSource(data.source);
    setLoading(false);
  };

  React.useEffect(() => {
    search();
  }, []);

  return (
    <section className="panel searchPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Application</p>
          <h2>YouTube search</h2>
        </div>
        <span className="sourceBadge">{source}</span>
      </div>
      <form className="searchForm" onSubmit={search}>
        <Search size={18} />
        <input
          placeholder="Search videos or paste a YouTube link"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">{loading ? "..." : "Search"}</button>
      </form>
      <div className="resultList">
        {results.map((video) => (
          <article className="videoResult" key={video.videoId}>
            <img alt="" src={video.thumbnail} />
            <div>
              <h3>{decodeHtml(video.title)}</h3>
              <p>{decodeHtml(video.channelTitle)}</p>
            </div>
            <button className="iconButton add" onClick={() => onAdd(video)} title="Add to queue">
              <Plus size={18} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function QueuePanel({
  queue,
  playback,
  onSend
}: {
  queue: QueueItem[];
  playback?: PlaybackState;
  onSend: (message: Record<string, unknown>) => void;
}) {
  return (
    <section className="panel queuePanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Shared playlist</p>
          <h2>Queue</h2>
        </div>
        <ListMusic size={22} />
      </div>
      <div className="queueList">
        {queue.length === 0 ? (
          <p className="emptyText">No videos yet.</p>
        ) : (
          queue.map((item, index) => (
            <article className={`queueItem ${playback?.videoId === item.videoId ? "playing" : ""}`} key={item.id}>
              <span className="queueIndex">{index + 1}</span>
              <img alt="" src={item.thumbnail} />
              <div className="queueText">
                <h3>{decodeHtml(item.title)}</h3>
                <p>Added by {item.addedBy.nickname}</p>
              </div>
              <div className="queueActions">
                <button
                  className="miniButton"
                  disabled={index === 0}
                  onClick={() => onSend({ type: "queue:reorder", itemId: item.id, toIndex: index - 1 })}
                  title="Move up"
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  className="miniButton"
                  disabled={index === queue.length - 1}
                  onClick={() => onSend({ type: "queue:reorder", itemId: item.id, toIndex: index + 1 })}
                  title="Move down"
                >
                  <ArrowDown size={15} />
                </button>
                <button className="miniButton danger" onClick={() => onSend({ type: "queue:remove", itemId: item.id })} title="Remove">
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function Members({ members }: { members: Member[] }) {
  return (
    <section className="railPanel">
      <div className="railTitle">
        <UsersRound size={18} />
        Members
      </div>
      <div className="memberList">
        {members.map((member) => (
          <span className={member.online ? "member online" : "member"} key={member.id}>
            {member.nickname}
          </span>
        ))}
      </div>
    </section>
  );
}

function ActivityLog({ activity }: { activity: ActivityItem[] }) {
  return (
    <section className="railPanel activityPanel">
      <div className="railTitle">
        <Activity size={18} />
        Activity
      </div>
      <div className="activityList">
        {activity.length === 0 ? (
          <p className="emptyText">Room actions will appear here.</p>
        ) : (
          activity.map((item) => (
            <p key={item.id}>
              <span>{formatTime(item.createdAt)}</span>
              {item.message}
            </p>
          ))
        )}
      </div>
    </section>
  );
}

function getRoomIdFromPath() {
  const match = window.location.pathname.match(/^\/room\/([^/]+)/);
  return match?.[1] ?? "";
}

function getStoredMember() {
  try {
    const raw = window.localStorage.getItem(memberKey);
    return raw ? (JSON.parse(raw) as Member) : null;
  } catch {
    return null;
  }
}

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isYouTubeVideoId(value: string) {
  return /^[a-zA-Z0-9_-]{11}$/.test(value);
}

function decodeHtml(value: string) {
  const parser = document.createElement("textarea");
  parser.innerHTML = value;
  return parser.value;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />
);
